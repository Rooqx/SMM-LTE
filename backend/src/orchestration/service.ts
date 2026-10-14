import { createHash, randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import { actionToSkillExecutionResult, LlmActionSchema, type LlmAction } from "../domain/schemas.js";
import { conflict, notFound } from "../domain/errors.js";
import { phaseDefinition, type PhaseNumber } from "../domain/workflow.js";
import { PermanentJobError, type JobLease, type QueueAdmissionPolicy } from "../db/jobs.js";
import type { Store } from "../db/store.js";
import type { ReviewStore } from "../db/review-store.js";
import type { WorkflowStore } from "../db/workflow-store.js";
import type { QuestionAnswerValue } from "../db/workflow-store.js";
import type { LlmProvider } from "../llm/provider.js";
import type { LlmActionType } from "../llm/provider.js";
import { PermanentProviderError } from "../llm/errors.js";
import type { MemoryAssembler } from "../memory/assembler.js";
import type { RecipeRegistry } from "./recipes/catalog.js";
import type { PhaseRecipe, RecipeStep } from "./recipes/types.js";
import { RECIPE_SUITE_ID } from "./recipes/catalog.js";
import { PromptBudgetError, type PromptCompiler } from "../skills/prompt-compiler.js";
import type { SkillReleaseStore } from "../skills/release-store.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { PerformanceTracer } from "../observability/performance.js";
import type { InterviewStore } from "../db/interview-store.js";
import type { RunProgressService } from "./progress.js";
import { approvedArtifactDependenciesForStep } from "./artifact-dependencies.js";
import { attachScheduledDrafts, readContentSlots, requireCompleteFinalBatch } from "./content-completeness.js";

export class OrchestrationService {
  constructor(
    readonly config: AppConfig,
    readonly store: Store,
    readonly reviewStore: ReviewStore,
    readonly workflowStore: WorkflowStore,
    readonly registry: SkillRegistry,
    readonly recipes: RecipeRegistry,
    readonly releases: SkillReleaseStore,
    readonly memory: MemoryAssembler,
    readonly tools: ToolRegistry,
    readonly compiler: PromptCompiler,
    readonly llm: LlmProvider,
    readonly performance: PerformanceTracer,
    readonly interviewStore: InterviewStore | null = null,
    readonly runProgress: RunProgressService | null = null,
  ) {}

  #admissionPolicy(): QueueAdmissionPolicy {
    const maximumRate = Math.max(
      this.config.MODEL_INPUT_COST_MICRO_USD_PER_MILLION,
      this.config.MODEL_OUTPUT_COST_MICRO_USD_PER_MILLION,
    );
    return {
      maxActiveJobs: this.config.QUEUE_MAX_ACTIVE_JOBS,
      maxActiveJobsPerOrganization: this.config.QUEUE_MAX_ACTIVE_JOBS_PER_ORGANIZATION,
      maxOrganizationTokensPerDay: this.config.MAX_ORGANIZATION_MODEL_TOKENS_PER_DAY,
      maxTokensPerRun: this.config.MAX_MODEL_TOKENS_PER_RUN,
      maxOrganizationCostMicrousdPerDay:
        this.config.MAX_ORGANIZATION_ESTIMATED_COST_MICRO_USD_PER_DAY,
      maxEstimatedCostMicrousdPerRun:
        Math.ceil(this.config.MAX_MODEL_TOKENS_PER_RUN * maximumRate / 1_000_000),
    };
  }

  /**
   * Capability-scopes structured output before it reaches the model. Local
   * validation remains mandatory because provider schemas are not a trust
   * boundary, but removing impossible actions prevents avoidable retry loops.
   */
  #allowedActionsForStep(run: { complete_phase: boolean; phase: number }, step: RecipeStep, allowQuestion: boolean): LlmActionType[] {
    // Hosted recipe steps use an authorized recovery path: a bounded question,
    // an allowlisted capability, or the contracted deliverable.
    // Exposing cannot_continue here lets weaker providers misclassify an
    // ordinary question as a terminal failure. The runtime still validates
    // cannot_continue from custom providers and optional/internal execution.
    const actions: LlmActionType[] = allowQuestion
      ? ["ask_user", "propose_output"]
      : ["propose_output"];
    const hasDeterministicArtifactDependencies =
      approvedArtifactDependenciesForStep(step.key).length > 0;
    if (step.allowedTools.length > 0 && !hasDeterministicArtifactDependencies) {
      actions.push("request_tool");
    }
    if (step.optionalSkills.length > 0) actions.push("request_optional_skill");
    if (run.complete_phase && phaseDefinition(run.phase).approvalGate !== null) {
      actions.push("request_approval");
    }
    const requiresOutput = step.allowedArtifactKinds.length > 0 ||
      step.allowedContextUpdates.length > 0;
    if (!requiresOutput && !(run.complete_phase && phaseDefinition(run.phase).approvalGate !== null)) {
      actions.push("complete_step");
    }
    return actions;
  }

  async #executeModel(request: Parameters<LlmProvider["execute"]>[0]) {
    const startedAt = performance.now();
    let execution: Awaited<ReturnType<LlmProvider["execute"]>>;
    try {
      execution = await this.llm.execute(request);
      this.performance.record({
        stage: "provider_call",
        correlationId: request.correlationId,
        durationMs: performance.now() - startedAt,
        provider: execution.provider,
        model: execution.model,
      });
    } catch (error) {
      this.performance.record({
        stage: "provider_call",
        correlationId: request.correlationId,
        durationMs: performance.now() - startedAt,
        outcome: "error",
      });
      if (error instanceof PermanentProviderError) throw new PermanentJobError(error.message);
      throw error;
    }
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const inputTokens = execution.usage.inputTokens ?? 0;
    const outputTokens = execution.usage.outputTokens ?? 0;
    const hasPricing = this.config.MODEL_INPUT_COST_MICRO_USD_PER_MILLION > 0 ||
      this.config.MODEL_OUTPUT_COST_MICRO_USD_PER_MILLION > 0;
    const estimatedCostMicrousd = hasPricing
      ? Math.ceil(
          (inputTokens * this.config.MODEL_INPUT_COST_MICRO_USD_PER_MILLION +
           outputTokens * this.config.MODEL_OUTPUT_COST_MICRO_USD_PER_MILLION) / 1_000_000,
        )
      : null;
    return { ...execution, durationMs, estimatedCostMicrousd };
  }

  async enqueue(input: {
    organizationId: string;
    actor: string;
    workspaceId: string;
    skillName: string;
    payload: Record<string, unknown>;
    completePhase: boolean;
    idempotencyKey: string | null;
    correlationId?: string;
    /** Internal pinned recipe selection; HTTP callers cannot provide this. */
    recipe?: PhaseRecipe;
  }) {
    const correlationId = input.correlationId ?? randomUUID();
    const workspace = await this.performance.measure({
      stage: "database_read",
      correlationId,
      workspaceId: input.workspaceId,
    }, () => this.store.getWorkspace(input.workspaceId, input.organizationId));
    if (!workspace) throw notFound("Workspace");

    const skill = this.registry.get(input.skillName);
    if (skill.phase !== workspace.current_phase) {
      throw conflict(
        "skill_phase_mismatch",
        `Skill '${skill.name}' belongs to phase ${skill.phase}; workspace is in phase ${workspace.current_phase}`,
      );
    }
    const classification = this.recipes.classifications.find((item) => item.skill === skill.name);
    if (!classification || classification.kind !== "mandatory") {
      throw conflict("skill_not_executable", `Skill '${skill.name}' is not executable in this release`);
    }
    const recipe = input.recipe ?? this.recipes.get(workspace.current_phase);
    if (recipe.phase !== workspace.current_phase ||
        !recipe.steps.some((step) => step.skill === skill.name)) {
      throw conflict("recipe_skill_mismatch", "The selected skill is not in the active recipe release");
    }
    const bundle = this.registry.bundle();

    return this.performance.measure({
      stage: "enqueue_transaction",
      correlationId,
      workspaceId: workspace.id,
    }, () => this.store.enqueueRun({
      organizationId: input.organizationId,
      actor: input.actor,
      workspaceId: workspace.id,
      expectedPhase: workspace.current_phase,
      skillName: skill.name,
      completePhase: input.completePhase,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      maxAttempts: this.config.WORKER_MAX_ATTEMPTS,
      correlationId,
      admission: this.#admissionPolicy(),
      release: {
        recipeSuiteId: recipe.suiteId,
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        skillBundleVersion: bundle.version,
        skillContentHash: skill.contentHash,
        orchestratorHash: bundle.orchestratorHash,
        bridgeHash: bundle.bridgeHash,
      },
    }));
  }

  /** Selects the next mandatory step; browser callers never choose a skill. */
  async enqueueNext(input: {
    organizationId: string;
    actor: string;
    workspaceId: string;
    idempotencyKey: string;
    correlationId?: string;
  }) {
    const correlationId = input.correlationId ?? randomUUID();
    const workspace = await this.performance.measure({
      stage: "database_read",
      correlationId,
      workspaceId: input.workspaceId,
    }, () => this.store.getWorkspace(input.workspaceId, input.organizationId));
    if (!workspace) throw notFound("Workspace");
    const state = await this.performance.measure({
      stage: "database_read",
      correlationId,
      workspaceId: workspace.id,
    }, () => this.workflowStore.getState(workspace.id, input.organizationId));
    if (!state || state.phase !== workspace.current_phase) {
      throw conflict("phase_changed", "Workspace and durable workflow phase state disagree");
    }
    if (state.pendingQuestion) {
      throw conflict("answer_required", "Answer the pending question before continuing the workflow");
    }
    const currentRecipe = this.recipes.get(workspace.current_phase);
    const recipe = state.recipeVersion === currentRecipe.version
      ? currentRecipe
      : await this.performance.measure({
          stage: "database_read",
          correlationId,
          workspaceId: workspace.id,
        }, () => this.releases.getRecipeForPhase(
          RECIPE_SUITE_ID,
          state.recipeVersion,
          workspace.current_phase,
        ));
    if (!recipe) {
      throw conflict("release_unavailable", "The active workflow recipe release is unavailable");
    }
    const acceptedSkills = await this.performance.measure({
      stage: "database_read",
      correlationId,
      workspaceId: workspace.id,
    }, () => this.store.listAcceptedSkills(
        workspace.id,
        input.organizationId,
        workspace.current_phase,
      ));
    const completedStepKeys = new Set(
      recipe.steps.filter((step) => acceptedSkills.has(step.skill)).map((step) => step.key),
    );
    // Route with the workspace's pinned recipe, not whichever release this
    // process currently advertises after a deployment.
    let next = recipe.steps.find((step) => !completedStepKeys.has(step.key)) ?? null;
    let contentSlots: Awaited<ReturnType<Store["getCalendarWorklist"]>>["slots"] = [];
    if (workspace.current_phase === 3 && completedStepKeys.has("write-hooks")) {
      const worklist = await this.store.getCalendarWorklist(workspace.id, input.organizationId);
      contentSlots = worklist.slots.filter((slot) => !worklist.writtenKeys.has(slot.key));
      if (contentSlots.length === 0) {
        throw conflict("phase_already_complete", "All scheduled posts have already been written");
      }
      // Small bounded batches prevent one truncated model answer from losing a week.
      next = recipe.steps.find((step) => step.key === "write-platform-posts") ?? null;
    }
    if (!next) throw conflict("phase_already_complete", "Every mandatory phase step is complete");
    let payload: Record<string, unknown> = {};
    if (workspace.current_phase >= 2 && workspace.current_phase <= 4) {
      const activeBrief = (await this.store.listContextForExecution(workspace.id))
        .find((context) => context.key === "calendar.active_brief");
      if (activeBrief) payload = { content_request: activeBrief.data };
    }
    if (workspace.current_phase === 3 && next.key === "write-platform-posts") {
      payload = { ...payload, content_slots: contentSlots.slice(0, 3) };
    }
    if (workspace.current_phase === 4) {
      payload = {
        ...payload,
        content_slots: (await this.store.getCalendarWorklist(workspace.id, input.organizationId)).slots,
      };
    }
    if (workspace.current_phase === 1 && next.skill === "social-media-context-sms" && this.interviewStore) {
      const interview = await this.performance.measure({
        stage: "database_read",
        correlationId,
        workspaceId: workspace.id,
      }, () => this.interviewStore!.getState({
        workspaceId: workspace.id,
        organizationId: input.organizationId,
      }));
      if (!interview) {
        throw conflict(
          "interview_required",
          "Start and complete the guided interview before continuing Phase 1 synthesis",
        );
      }
      if (interview && interview.authority === "guided") {
        if (interview.session.status === "in_progress") {
          throw conflict(
            "interview_in_progress",
            "Complete the guided interview before continuing Phase 1 synthesis",
          );
        }
        if (interview.session.status === "completed" && interview.session.compiled_intake) {
          payload = { compiled_intake: interview.session.compiled_intake };
        }
      }
    }
    return this.enqueue({
      ...input,
      correlationId,
      skillName: next.skill,
      payload,
      completePhase: next.ordinal === recipe.steps.length &&
        (workspace.current_phase !== 3 || contentSlots.length <= 3),
      recipe,
    });
  }

  async execute(runId: string, lease: JobLease, correlationId = runId): Promise<void> {
    const started = await this.performance.measure({
      stage: "worker_start_transaction",
      correlationId,
      runId,
    }, () => this.store.beginRun(runId, lease));
    if (started.state === "terminal") return;
    const run = started.run;
    this.performance.record({
      stage: "queue_start_delay",
      correlationId: run.correlation_id,
      runId: run.id,
      workspaceId: run.workspace_id,
      durationMs: Math.max(0, Date.now() - run.created_at.getTime()),
    });
    const currentBundle = this.registry.bundle();
    const releaseInputs = run.skill_bundle_version && run.skill_content_hash
      ? await this.releases.getExecutionInputs(
          run.skill_bundle_version,
          run.skill_name,
          run.skill_content_hash,
        )
      : null;
    if (run.skill_bundle_version && !releaseInputs) {
      throw conflict("release_unavailable", "The run's pinned skill release is unavailable");
    }
    const skill = releaseInputs?.skill ?? this.registry.get(run.skill_name);
    const pinnedRecipe = run.recipe_suite_id && run.recipe_version && run.recipe_id
      ? await this.releases.getRecipe(
          run.recipe_suite_id,
          run.recipe_version,
          run.phase,
          run.recipe_id,
        )
      : null;
    if (run.recipe_version && !pinnedRecipe) {
      throw conflict("release_unavailable", "The run's pinned recipe release is unavailable");
    }
    if (run.orchestrator_hash && run.orchestrator_hash !==
        (releaseInputs ? createHash("sha256").update(releaseInputs.orchestrator).digest("hex") : currentBundle.orchestratorHash)) {
      throw conflict("release_mismatch", "The pinned orchestrator content does not match its hash");
    }
    if (run.bridge_hash && run.bridge_hash !==
        (releaseInputs ? createHash("sha256").update(releaseInputs.bridge).digest("hex") : currentBundle.bridgeHash)) {
      throw conflict("release_mismatch", "The pinned bridge content does not match its hash");
    }
    if (skill.phase !== run.phase) {
      throw conflict(
        "skill_phase_mismatch",
        `Run phase ${run.phase} does not match skill phase ${skill.phase}`,
      );
    }
    const recipeStep = pinnedRecipe
      ? pinnedRecipe.steps.find((step) => step.skill === skill.name)
      : this.recipes.stepForSkill(run.phase, skill.name);
    if (!recipeStep) {
      throw conflict("release_mismatch", "The pinned skill is not a mandatory recipe step");
    }
    const organizationId = await this.store.getOrganizationIdForWorkspace(run.workspace_id);
    const [context, conversation] = await this.performance.measure({
      stage: "context_load",
      correlationId: run.correlation_id,
      runId: run.id,
      workspaceId: run.workspace_id,
    }, () => Promise.all([
      run.recipe_version
        ? this.store.listPinnedContextForRun(run.id)
        : this.store.listContextForExecution(run.workspace_id),
      this.workflowStore.getConversationMemory({
        workspaceId: run.workspace_id,
        organizationId,
        maxMessages: this.config.MEMORY_RECENT_MESSAGES,
      }),
    ]));
    const memory = this.memory.assemble({ step: recipeStep, pinnedContext: context, conversation });
    const revisionSource = await this.reviewStore.getSourceForExecution(run);
    const supplementalResults: Record<string, unknown>[] = revisionSource ? [revisionSource] : [];
    const requiredArtifactKinds = approvedArtifactDependenciesForStep(recipeStep.key);
    if (requiredArtifactKinds.length > 0) {
      const requiredArtifacts = await this.tools.loadApprovedArtifacts({
        workspaceId: run.workspace_id,
        organizationId,
        limit: 20,
        kinds: requiredArtifactKinds,
      });
      if (run.phase === 4 && Array.isArray(run.input.content_slots)) {
        const scheduled = new Set(readContentSlots(run.input.content_slots).map((slot) => slot.key));
        const draftKinds = new Set([
          "post-draft", "caption-draft", "carousel-draft", "thread-draft", "video-script",
        ]);
        requiredArtifacts.items = requiredArtifacts.items.filter((raw) => {
          if (!raw || typeof raw !== "object") return false;
          const artifact = raw as { kind?: string; metadata?: { contentSlotKey?: unknown } };
          return !draftKinds.has(artifact.kind ?? "") ||
            scheduled.has(String(artifact.metadata?.contentSlotKey ?? ""));
        });
        const found = new Set(requiredArtifacts.items
          .filter((raw) => raw && typeof raw === "object" &&
            draftKinds.has(String((raw as { kind?: string }).kind)))
          .map((raw) => String((raw as { metadata?: { contentSlotKey?: unknown } }).metadata?.contentSlotKey)));
        if (found.size !== scheduled.size || requiredArtifacts.contentTruncated) {
          throw conflict("draft_batch_incomplete", "All scheduled drafts must be available before quality control");
        }
      }
      if (recipeStep.key === "write-platform-posts") {
        // The latest hook batch is the one approved in this phase; previous
        // cycles are history, not creative input for this calendar.
        requiredArtifacts.items = requiredArtifacts.items.slice(0, 1);
      }
      supplementalResults.push({
        type: "required_artifacts",
        ...requiredArtifacts,
      });
    }
    const startedAt = Date.now();
    let modelCalls = 0;
    let modelTokens = 0;
    let optionalDepth = 0;
    const state = await this.workflowStore.getState(run.workspace_id, organizationId);
    const priorQuestions = state
      ? await this.workflowStore.countSkillQuestions({
          workspaceId: run.workspace_id,
          organizationId,
          phaseInstanceId: state.phaseInstanceId,
          skillName: run.skill_name,
        })
      : 0;
    // Two targeted clarifications are enough when the required context is
    // already present. The model must then draft from known facts and mark
    // genuinely unknown details instead of trapping the owner in an interview.
    const shortIntake = Boolean(run.input.compiled_intake &&
      typeof run.input.compiled_intake === "object" &&
      (run.input.compiled_intake as { questionnaireVersion?: unknown }).questionnaireVersion === "1.2.0");
    const allowQuestion = (!run.input.compiled_intake || shortIntake) &&
      run.skill_name !== "post-writer-sms" &&
      (memory.missingRequiredContext.length > 0 || priorQuestions < 2);
    const allowedActionTypes = this.#allowedActionsForStep(run, recipeStep, allowQuestion);

    const rejectAction = async (
      stepId: string,
      execution: Awaited<ReturnType<LlmProvider["execute"]>>,
      reason: string,
    ): Promise<never> => {
      await this.store.finishIntermediateStep({
        runId: run.id,
        stepId,
        execution,
        runtimeResult: { rejected: true, reason },
        lease,
      });
      throw new PermanentJobError(reason);
    };

    const compilePrompt = async (
      args: Parameters<PromptCompiler["compile"]>[0],
    ) => {
      const promptStartedAt = performance.now();
      try {
        const compiled = await this.compiler.compile(args);
        this.performance.record({
          stage: "prompt_build",
          correlationId: run.correlation_id,
          runId: run.id,
          workspaceId: run.workspace_id,
          durationMs: performance.now() - promptStartedAt,
          developerPromptChars: compiled.developer.length,
          userPromptChars: compiled.user.length,
        });
        return compiled;
      } catch (error) {
        this.performance.record({
          stage: "prompt_build",
          correlationId: run.correlation_id,
          runId: run.id,
          workspaceId: run.workspace_id,
          durationMs: performance.now() - promptStartedAt,
          outcome: "error",
        });
        if (error instanceof PromptBudgetError) throw new PermanentJobError(error.message);
        throw error;
      }
    };

    const validateModelAction = (rawAction: unknown) => {
      const validationStartedAt = performance.now();
      const result = LlmActionSchema.safeParse(rawAction);
      this.performance.record({
        stage: "output_validation",
        correlationId: run.correlation_id,
        runId: run.id,
        workspaceId: run.workspace_id,
        durationMs: performance.now() - validationStartedAt,
        outcome: result.success ? "ok" : "error",
      });
      return result;
    };

    const recordModelCall = (
      execution: Awaited<ReturnType<LlmProvider["execute"]>>,
    ): string | null => {
      modelCalls += 1;
      modelTokens += execution.usage.totalTokens
        ?? (execution.usage.inputTokens ?? 0) + (execution.usage.outputTokens ?? 0);
      if (modelTokens > this.config.MAX_MODEL_TOKENS_PER_RUN) {
        return `The model exceeded the ${this.config.MAX_MODEL_TOKENS_PER_RUN}-token run limit`;
      }
      if (Date.now() - startedAt > this.config.MAX_RUN_DURATION_MS) {
        return `The run exceeded the ${this.config.MAX_RUN_DURATION_MS}-millisecond duration limit`;
      }
      return null;
    };

    while (modelCalls < this.config.MAX_MODEL_ACTIONS_PER_RUN) {
      if (Date.now() - startedAt > this.config.MAX_RUN_DURATION_MS) {
        throw new PermanentJobError(
          `The run exceeded the ${this.config.MAX_RUN_DURATION_MS}-millisecond duration limit`,
        );
      }
      if (this.runProgress) {
        await this.runProgress.recordStage(this.store.pool, {
          runId: run.id,
          workspaceId: run.workspace_id,
          phase: run.phase,
          skillName: skill.name,
          stage: "generating",
        });
      }
      const compiled = await compilePrompt({
        skill,
        phase: run.phase,
        step: recipeStep,
        input: run.input,
        memory,
        allowedActionTypes,
        supplementalResults,
        ...(releaseInputs
          ? { releaseInstructions: { orchestrator: releaseInputs.orchestrator, bridge: releaseInputs.bridge } }
          : {}),
      });
      const stepId = await this.performance.measure({
        stage: "step_create_transaction",
        correlationId: run.correlation_id,
        runId: run.id,
        workspaceId: run.workspace_id,
      }, () => this.store.createStep({
        runId: run.id,
        skillName: skill.name,
        promptSnapshot: compiled.snapshot,
        payload: { input: run.input, supplementalResults },
        lease,
      }));
      const rawExecution = await this.#executeModel({
        developerPrompt: compiled.developer,
        userPrompt: compiled.user,
        allowedActionTypes,
        allowedCannotContinueReasons: ["unsupported_capability", "safety_constraint"],
        correlationId: `${run.correlation_id.slice(0, 100)}:${modelCalls + 1}`,
      });
      if (this.runProgress) {
        await this.runProgress.recordStage(this.store.pool, {
          runId: run.id,
          workspaceId: run.workspace_id,
          phase: run.phase,
          skillName: skill.name,
          stage: "validating",
        });
      }
      const validatedAction = validateModelAction(rawExecution.action);
      if (!validatedAction.success) {
        throw new PermanentJobError("The model returned an invalid structured action");
      }
      const execution = {
        ...rawExecution,
        // Provider-side structured output is not a trust boundary. Custom
        // providers and tests pass through the same local validation.
        action: validatedAction.data,
      };
      const action = execution.action;
      const budgetViolation = recordModelCall(execution);
      if (budgetViolation) {
        await this.store.finishIntermediateStep({
          runId: run.id,
          stepId,
          execution,
          runtimeResult: { rejected: true, reason: budgetViolation },
          lease,
        });
        throw new PermanentJobError(budgetViolation);
      }

      if (action.type === "request_tool") {
        let toolResult;
        try {
          toolResult = await this.tools.execute({
            request: action,
            allowedTools: recipeStep.allowedTools,
            workspaceId: run.workspace_id,
            organizationId,
          });
        } catch (error) {
          return rejectAction(
            stepId,
            execution,
            error instanceof Error ? error.message : "The requested tool could not be executed",
          );
        }
        await this.store.finishIntermediateStep({
          runId: run.id,
          stepId,
          execution,
          runtimeResult: toolResult,
          lease,
        });
        supplementalResults.push({ type: "tool_result", ...toolResult });
        continue;
      }

      if (action.type === "request_optional_skill") {
        if (optionalDepth >= this.config.MAX_OPTIONAL_SKILL_DEPTH) {
          return rejectAction(stepId, execution, "The optional-skill depth limit was exceeded");
        }
        if (modelCalls >= this.config.MAX_MODEL_ACTIONS_PER_RUN) {
          return rejectAction(
            stepId,
            execution,
            "The model-action limit was exhausted before optional execution",
          );
        }
        let optionalName: string;
        try {
          optionalName = this.recipes.optionalSkillForStep(
            run.phase,
            recipeStep.key,
            action.skill,
          );
        } catch (error) {
          const reason = error instanceof Error ? error.message : "The requested optional skill is not allowed";
          if (modelCalls < this.config.MAX_MODEL_ACTIONS_PER_RUN) {
            await this.store.finishIntermediateStep({
              runId: run.id,
              stepId,
              execution,
              runtimeResult: { rejected: true, reason },
              lease,
            });
            supplementalResults.push({
              rejected_action: action.type,
              error: `${reason}. Allowed optional skills: [${recipeStep.optionalSkills.join(", ")}]. You must return propose_output (with real deliverable content) or ask_user.`,
            });
            continue;
          }
          return rejectAction(stepId, execution, reason);
        }
        const bundleVersion = run.skill_bundle_version ?? currentBundle.version;
        const optionalRelease = await this.releases.getBundleSkill(bundleVersion, optionalName);
        if (!optionalRelease) {
          return rejectAction(
            stepId,
            execution,
            `Optional skill '${optionalName}' is unavailable in the pinned bundle`,
          );
        }
        if (optionalRelease.skill.phase !== run.phase) {
          return rejectAction(
            stepId,
            execution,
            `Optional skill '${optionalName}' does not belong to run phase ${run.phase}`,
          );
        }
        await this.store.finishIntermediateStep({ runId: run.id, stepId, execution, lease });
        optionalDepth += 1;
        const optionalStep: RecipeStep = {
          ...recipeStep,
          skill: optionalName,
          optionalSkills: [],
          allowedTools: [],
        };
        const optionalCompiled = await compilePrompt({
          skill: optionalRelease.skill,
          phase: run.phase,
          step: optionalStep,
          input: action.input,
          memory,
          allowedActionTypes: ["propose_output", "complete_step", "cannot_continue"],
          supplementalResults,
          releaseInstructions: {
            orchestrator: optionalRelease.orchestrator,
            bridge: optionalRelease.bridge,
          },
        });
        const optionalStepId = await this.performance.measure({
          stage: "step_create_transaction",
          correlationId: run.correlation_id,
          runId: run.id,
          workspaceId: run.workspace_id,
        }, () => this.store.createStep({
          runId: run.id,
          skillName: optionalName,
          promptSnapshot: optionalCompiled.snapshot,
          payload: { input: action.input, supplementalResults },
          lease,
        }));
        const rawOptionalExecution = await this.#executeModel({
          developerPrompt: optionalCompiled.developer,
          userPrompt: optionalCompiled.user,
          allowedActionTypes: ["propose_output", "complete_step", "cannot_continue"],
          allowedCannotContinueReasons: [
            "missing_input",
            "unsupported_capability",
            "safety_constraint",
          ],
          correlationId: `${run.correlation_id.slice(0, 100)}:${modelCalls + 1}`,
        });
        const validatedOptionalAction = validateModelAction(rawOptionalExecution.action);
        if (!validatedOptionalAction.success) {
          throw new PermanentJobError("The optional model call returned an invalid structured action");
        }
        const optionalExecution = {
          ...rawOptionalExecution,
          action: validatedOptionalAction.data,
        };
        const optionalBudgetViolation = recordModelCall(optionalExecution);
        if (optionalBudgetViolation) {
          await this.store.finishIntermediateStep({
            runId: run.id,
            stepId: optionalStepId,
            execution: optionalExecution,
            runtimeResult: { rejected: true, reason: optionalBudgetViolation },
            lease,
          });
          throw new PermanentJobError(optionalBudgetViolation);
        }
        if (["request_tool", "request_optional_skill", "ask_user", "request_approval"]
          .includes(optionalExecution.action.type)) {
          return rejectAction(
            optionalStepId,
            optionalExecution,
            `Optional skill '${optionalName}' returned unsupported action '${optionalExecution.action.type}'`,
          );
        }
        await this.store.finishIntermediateStep({
          runId: run.id,
          stepId: optionalStepId,
          execution: optionalExecution,
          lease,
        });
        supplementalResults.push({
          type: "optional_skill_result",
          skill: optionalName,
          action: optionalExecution.action,
        });
        continue;
      }

      try {
        await this.performance.measure({
          stage: "result_commit",
          correlationId: run.correlation_id,
          runId: run.id,
          workspaceId: run.workspace_id,
        }, () => this.#finishTerminalAction({
          run,
          stepId,
          execution,
          action,
          recipeStep,
          memoryMissing: memory.missingRequiredContext,
          lease,
        }));
      } catch (error) {
        // Deterministic model-policy failures still consumed provider tokens.
        // Persist the rejected action and usage before the job is failed.
        if (error instanceof PermanentJobError) {
          await this.store.finishIntermediateStep({
            runId: run.id,
            stepId,
            execution,
            runtimeResult: { rejected: true, reason: error.message },
            lease,
          });
          if (modelCalls < this.config.MAX_MODEL_ACTIONS_PER_RUN) {
            supplementalResults.push({
              rejected_action: action.type,
              error: `${error.message}. If user facts are missing, return ask_user now with the actual question. Otherwise return propose_output with the required artifacts and context updates. Do not describe a question or future action inside complete_step.`,
            });
            continue;
          }
        }
        throw error;
      }
      return;
    }
    throw new PermanentJobError(
      `The model exceeded the ${this.config.MAX_MODEL_ACTIONS_PER_RUN}-action run limit`,
    );
  }

  /** Persists one exact answer and idempotently resumes the same recipe step. */
  async answerQuestion(input: {
    organizationId: string;
    actor: string;
    workspaceId: string;
    questionId: string;
    expectedVersion: number;
    answer: QuestionAnswerValue;
    idempotencyKey: string;
    correlationId?: string;
  }) {
    const correlationId = input.correlationId ?? randomUUID();
    const answer = await this.performance.measure({
      stage: "answer_transaction",
      correlationId,
      workspaceId: input.workspaceId,
    }, () => this.workflowStore.answerQuestion({
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      questionId: input.questionId,
      expectedVersion: input.expectedVersion,
      answer: input.answer,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
    }));
    // If the process stops after the answer commit, replaying the request
    // returns the same answer ID and therefore the same run idempotency key.
    const run = await this.enqueueNext({
      organizationId: input.organizationId,
      actor: input.actor,
      workspaceId: input.workspaceId,
      idempotencyKey: `answer:${answer.answerId}`,
      correlationId,
    });
    return {
      answer,
      run: { id: run.id, status: run.status, phase: run.phase },
    };
  }

  async #finishTerminalAction(input: {
    run: Awaited<ReturnType<Store["enqueueRun"]>>;
    stepId: string;
    execution: Awaited<ReturnType<LlmProvider["execute"]>>;
    action: Exclude<LlmAction, { type: "request_tool" | "request_optional_skill" }>;
    recipeStep: RecipeStep;
    memoryMissing: readonly string[];
    lease: JobLease;
  }): Promise<void> {
    if (input.action.type === "cannot_continue" && input.action.reason === "missing_input") {
      throw new PermanentJobError(
        "Missing user input must be requested with ask_user, not cannot_continue",
      );
    }
    if (input.action.type === "ask_user") {
      await this.store.finishRunAwaitingInput({
        run: input.run,
        stepId: input.stepId,
        execution: input.execution,
        action: input.action,
        result: actionToSkillExecutionResult(input.action),
        lease: input.lease,
      });
      return;
    }
    if (input.action.type === "cannot_continue") {
      await this.store.finishRunBlocked({
        run: input.run,
        stepId: input.stepId,
        execution: input.execution,
        action: input.action,
        result: actionToSkillExecutionResult(input.action),
        lease: input.lease,
      });
      return;
    }
    if (input.action.type === "propose_output" || input.action.type === "request_approval") {
      for (const artifact of input.action.artifacts) {
        if (!input.recipeStep.allowedArtifactKinds.includes(artifact.kind)) {
          throw new PermanentJobError(`Artifact kind '${artifact.kind}' is not allowed for this step`);
        }
      }
      for (const update of input.action.contextUpdates) {
        if (!input.recipeStep.allowedContextUpdates.includes(update.key)) {
          throw new PermanentJobError(`Context key '${update.key}' is not writable by this step`);
        }
      }
      const finalPosts = input.action.finalPosts ?? [];
      if (finalPosts.length > 0 &&
          !input.recipeStep.allowedArtifactKinds.includes("final-post-batch")) {
        throw new PermanentJobError("Structured final posts are not allowed for this step");
      }
      if (finalPosts.length > 0 &&
          !input.action.artifacts.some((artifact) => artifact.kind === "final-post-batch")) {
        throw new PermanentJobError("Structured final posts require a final-post-batch artifact");
      }
    }
    if (input.action.type === "complete_step" && input.memoryMissing.length > 0) {
      throw new PermanentJobError(
        `Step cannot complete with missing context: ${input.memoryMissing.join(", ")}`,
      );
    }
    if (input.action.type === "request_approval" && !input.run.complete_phase) {
      throw new PermanentJobError("Only the final mandatory step may request phase approval");
    }
    if (
      (input.action.type === "propose_output" || input.action.type === "request_approval") &&
      input.action.artifacts.length === 0 &&
      input.action.contextUpdates.length === 0 &&
      (input.action.finalPosts?.length ?? 0) === 0
    ) {
      throw new PermanentJobError("A proposed output must include reviewable content");
    }
    if (
      input.action.type === "complete_step" &&
      (input.recipeStep.allowedArtifactKinds.length > 0 ||
       input.recipeStep.allowedContextUpdates.length > 0)
    ) {
      throw new PermanentJobError("This mandatory step must produce its declared output contract");
    }
    if (
      input.action.type === "complete_step" &&
      input.run.complete_phase &&
      phaseDefinition(input.run.phase).approvalGate !== null
    ) {
      throw new PermanentJobError("A gated phase must finish with reviewable output");
    }
    const result = actionToSkillExecutionResult(input.action);
    if (input.run.phase === 3 && input.run.skill_name === "post-writer-sms") {
      try {
        result.artifacts = attachScheduledDrafts(
          readContentSlots(input.run.input.content_slots), result.artifacts,
        );
      } catch (error) {
        throw new PermanentJobError((error as Error).message);
      }
    }
    if (input.run.phase === 4 && input.run.skill_name === "post-formatter") {
      try {
        requireCompleteFinalBatch(
          readContentSlots(input.run.input.content_slots), result.final_posts ?? [],
        );
      } catch (error) {
        throw new PermanentJobError((error as Error).message);
      }
    }
    const phase = phaseDefinition(input.run.phase);
    await this.store.finishRun({
      run: input.run,
      stepId: input.stepId,
      execution: input.execution,
      result,
      approvalGate: phase.approvalGate,
      automaticNextPhase:
        input.run.complete_phase && phase.approvalGate === null ? phase.next : null,
      nextRecipeVersion: input.run.recipe_version ?? this.recipes.get(phase.next).version,
      lease: input.lease,
    });
    if (input.run.phase === 3 && input.run.skill_name === "post-writer-sms" &&
        !input.run.complete_phase) {
      // Continue production without asking the owner to click once per batch.
      // The finished draft is already committed. If admission is temporarily
      // closed, the workspace remains ready and the normal Continue action
      // safely resumes the first missing slot.
      try {
        await this.enqueueNext({
          organizationId: await this.store.getOrganizationIdForWorkspace(input.run.workspace_id),
          actor: "system:workflow",
          workspaceId: input.run.workspace_id,
          idempotencyKey: `writer:${input.run.id}`,
          correlationId: input.run.correlation_id,
        });
      } catch {
        // The durable worklist, not this best-effort enqueue, owns progress.
      }
    }
  }

  async decide(input: {
    organizationId: string;
    runId: string;
    approved: boolean;
    actor: string;
    note: string | null;
  }) {
    const run = await this.store.getRun(input.runId, input.organizationId);
    if (!run) throw notFound("Run");
    const phase = phaseDefinition(run.phase);
    await this.store.decideRunOutput({
      runId: run.id,
      organizationId: input.organizationId,
      approved: input.approved,
      actor: input.actor,
      note: input.note,
      expectedPhase: run.phase as PhaseNumber,
      nextPhase: phase.next,
      nextRecipeVersion: run.recipe_version ?? this.recipes.get(phase.next).version,
      expectedReviewRevision: run.review_revision,
    });
    return this.store.getRun(input.runId, input.organizationId);
  }

  async requestRevision(input: {
    organizationId: string;
    runId: string;
    actor: string;
    instructions: string;
    expectedReviewRevision: number;
    idempotencyKey: string;
    correlationId?: string;
  }) {
    const run = await this.store.getRun(input.runId, input.organizationId);
    if (!run) throw notFound("Run");
    return this.reviewStore.requestRevision({
      ...input,
      maxAttempts: this.config.WORKER_MAX_ATTEMPTS,
      correlationId: input.correlationId ?? randomUUID(),
      admission: this.#admissionPolicy(),
    });
  }
}
