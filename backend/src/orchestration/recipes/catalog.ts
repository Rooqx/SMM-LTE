import { createHash } from "node:crypto";
import { phaseDefinition, type PhaseNumber } from "../../domain/workflow.js";
import type { SkillRegistry } from "../../skills/registry.js";
import type { PhaseRecipe, RecipeStep, SkillClassification } from "./types.js";

const RUNTIME_TOOLS = new Set(["list_approved_artifacts"]);

export const RECIPE_SUITE_ID = "smm-autopilot";
export const RECIPE_SUITE_VERSION = "1.0.0";

const step = (
  key: string,
  skill: string,
  purpose: string,
  options: Partial<Omit<RecipeStep, "key" | "skill" | "purpose" | "ordinal">> = {},
): Omit<RecipeStep, "ordinal"> => ({
  key,
  skill,
  purpose,
  requiredContextKeys: [],
  acceptedIntents: ["continue", "answer", "retry"],
  optionalSkills: [],
  allowedTools: [],
  allowedContextUpdates: [],
  allowedArtifactKinds: [],
  inputContract: "workspace-input-v1",
  outputContract: "skill-execution-v1",
  repeatable: false,
  maxAttempts: 3,
  completion: "The declared output contract is satisfied.",
  ...options,
});

function recipe(
  phase: PhaseNumber,
  purpose: string,
  steps: readonly Omit<RecipeStep, "ordinal">[],
): PhaseRecipe {
  const definition = phaseDefinition(phase);
  return {
    id: `phase-${phase}-${definition.slug}`,
    suiteId: RECIPE_SUITE_ID,
    version: RECIPE_SUITE_VERSION,
    phase,
    purpose,
    approvalGate: definition.approvalGate,
    nextPhase: definition.next,
    steps: steps.map((value, index) => ({ ...value, ordinal: index + 1 })),
  };
}

export const PHASE_RECIPES: readonly PhaseRecipe[] = [
  recipe(1, "Build the approved brand foundation used by every later phase.", [
    step("capture-social-context", "social-media-context-sms", "Capture goals, platforms, audience, and constraints.", {
      allowedContextUpdates: ["social.context"], allowedArtifactKinds: ["social-context"],
    }),
    step("research-niche", "niche-research", "Establish the niche, market language, and opportunity space.", {
      requiredContextKeys: ["social.context"], allowedContextUpdates: ["brand.audience"], allowedArtifactKinds: ["niche-research"],
    }),
    step("research-customers", "customer-research", "Document audience pains, motivations, and buying language.", {
      requiredContextKeys: ["social.context"], allowedContextUpdates: ["brand.audience"], allowedArtifactKinds: ["customer-research"],
    }),
    step("profile-competitors", "competitor-profiling", "Differentiate the brand from relevant competitors.", {
      requiredContextKeys: ["brand.audience"], allowedContextUpdates: ["brand.positioning"], allowedArtifactKinds: ["competitor-profile"],
    }),
    step("build-voice", "voice-builder", "Create the reusable voice and banned-language system.", {
      requiredContextKeys: ["brand.audience", "brand.positioning"], allowedContextUpdates: ["brand.voice"], allowedArtifactKinds: ["voice-guide"],
    }),
    step("optimize-profile", "profile-optimizer", "Turn positioning into platform profile and funnel guidance.", {
      requiredContextKeys: ["brand.voice", "brand.positioning"], allowedContextUpdates: ["brand.profile_funnels"], allowedArtifactKinds: ["profile-blueprint"],
    }),
  ]),
  recipe(2, "Create the approved strategy, platform cadence, and current sprint calendar.", [
    step("define-content-strategy", "content-strategy-sms", "Define pillars, topics, formats, goals, and measurement intent.", {
      requiredContextKeys: ["brand.voice", "brand.audience", "brand.positioning"],
      optionalSkills: ["marketing-plan", "marketing-psychology", "offers"],
      allowedTools: ["list_approved_artifacts"],
      allowedContextUpdates: ["strategy.campaign_backlog"], allowedArtifactKinds: ["content-strategy"],
    }),
    step("define-platform-strategy", "platform-strategy-sms", "Set platform roles, cadence, and native format rules.", {
      requiredContextKeys: ["social.context", "strategy.campaign_backlog"],
      optionalSkills: ["marketing-loops"], allowedContextUpdates: ["strategy.platform_cadence"], allowedArtifactKinds: ["platform-strategy"],
    }),
    step("build-content-matrix", "content-matrix", "Produce the topic, hook, and format matrix.", {
      requiredContextKeys: ["strategy.campaign_backlog", "strategy.platform_cadence"],
      allowedContextUpdates: ["strategy.content_matrix"], allowedArtifactKinds: ["content-matrix"],
    }),
    step("build-sprint-calendar", "content-calendar-sms", "Schedule the approved matrix into the current sprint.", {
      requiredContextKeys: ["strategy.content_matrix", "strategy.platform_cadence"],
      allowedContextUpdates: ["calendar.current_sprint"], allowedArtifactKinds: ["content-calendar"],
    }),
  ]),
  recipe(3, "Generate every required platform-native draft for the approved sprint.", [
    step("write-hooks", "hook-writer-sms", "Generate and select strong hooks for scheduled topics.", {
      requiredContextKeys: ["brand.voice", "strategy.content_matrix", "calendar.current_sprint"],
      optionalSkills: ["hook-generator"], allowedTools: ["list_approved_artifacts"], allowedArtifactKinds: ["hook-batch"], repeatable: true, maxAttempts: 5,
    }),
    step("write-platform-posts", "post-writer-sms", "Write the baseline platform-native post batch.", {
      requiredContextKeys: ["brand.voice", "brand.audience", "calendar.current_sprint"],
      optionalSkills: ["caption-writer-sms", "carousel-writer-sms", "thread-writer-sms", "reels-scripting"],
      allowedTools: ["list_approved_artifacts"],
      allowedArtifactKinds: ["post-draft", "caption-draft", "carousel-draft", "thread-draft", "video-script"], repeatable: true, maxAttempts: 10,
    }),
  ]),
  recipe(4, "Score, correct, format, and prepare a reviewable final-post batch.", [
    step("score-posts", "post-scorer", "Score drafts against voice and proven performance criteria.", {
      requiredContextKeys: ["brand.voice", "calendar.current_sprint"], optionalSkills: ["optimization-advisor-sms"], allowedArtifactKinds: ["post-scorecard"],
    }),
    step("edit-copy", "copy-editing", "Correct clarity, voice, grammar, and platform issues.", {
      requiredContextKeys: ["brand.voice"], allowedArtifactKinds: ["edited-post-batch"], repeatable: true, maxAttempts: 5,
    }),
    step("format-posts", "post-formatter", "Apply final platform formatting.", {
      requiredContextKeys: ["social.context"], optionalSkills: ["pinned-comment"], allowedArtifactKinds: ["final-post-batch", "pinned-comment"],
    }),
  ]),
  recipe(5, "Create approved platform-native derivatives without duplicating the source.", [
    step("repurpose-batch", "content-repurposer-sms", "Transform approved posts into useful derivative formats.", {
      requiredContextKeys: ["brand.voice", "calendar.current_sprint"], optionalSkills: ["newsletter-voice"],
      allowedTools: ["list_approved_artifacts"],
      allowedArtifactKinds: ["repurposed-post-batch", "newsletter-draft"], repeatable: true, maxAttempts: 8,
    }),
  ]),
  recipe(6, "Analyze performance and propose an evidence-based strategy calibration.", [
    step("analyze-performance", "performance-analyzer-sms", "Turn supplied post metrics into prioritized findings.", {
      requiredContextKeys: ["strategy.content_matrix", "calendar.current_sprint"],
      optionalSkills: ["audience-growth-tracker-sms", "analytics-dashboard"], allowedTools: ["list_approved_artifacts"], allowedArtifactKinds: ["performance-report"],
    }),
    step("analyze-patterns", "content-pattern-analyzer-sms", "Find repeatable content patterns across a sufficient sample.", {
      requiredContextKeys: ["brand.voice", "strategy.content_matrix"], optionalSkills: ["ab-testing", "analytics"],
      allowedContextUpdates: ["analytics.performance_patterns", "strategy.campaign_backlog"], allowedArtifactKinds: ["pattern-report", "strategy-calibration"],
    }),
  ]),
] as const;

const classified = (
  phase: PhaseNumber,
  kind: SkillClassification["kind"],
  reason: string,
  skills: readonly string[],
): SkillClassification[] => skills.map((skill) => ({ skill, phase, kind, reason }));

export const SKILL_CLASSIFICATIONS: readonly SkillClassification[] = [
  ...classified(1, "mandatory", "Required brand-foundation step.", ["social-media-context-sms", "niche-research", "customer-research", "competitor-profiling", "voice-builder", "profile-optimizer"]),
  ...classified(2, "mandatory", "Required strategy/calendar step.", ["content-strategy-sms", "platform-strategy-sms", "content-matrix", "content-calendar-sms"]),
  ...classified(2, "optional", "Supporting strategy analysis selected only from a step allowlist.", ["marketing-plan", "marketing-loops", "marketing-psychology", "offers"]),
  ...classified(3, "mandatory", "Required creative-production step.", ["hook-writer-sms", "post-writer-sms"]),
  ...classified(3, "optional", "Format-specific creative branch.", ["hook-generator", "caption-writer-sms", "carousel-writer-sms", "thread-writer-sms", "reels-scripting"]),
  ...classified(3, "internal", "Legacy/manual alternative superseded by the SMS recipe path.", ["post-writer", "copywriting"]),
  ...classified(3, "unsupported", "Requires an image/video generation or design connector contract.", ["ad-creative", "gemini-carousel", "gemini-infographic", "graphic-designer", "video"]),
  ...classified(4, "mandatory", "Required quality-control step.", ["post-scorer", "copy-editing", "post-formatter"]),
  ...classified(4, "optional", "Allowed QC enhancement.", ["optimization-advisor-sms", "pinned-comment"]),
  ...classified(4, "internal", "Manual content format, not a QC transition.", ["quote-post"]),
  ...classified(5, "mandatory", "Required repurposing step.", ["content-repurposer-sms"]),
  ...classified(5, "optional", "Newsletter derivative when requested by the recipe.", ["newsletter-voice"]),
  ...classified(5, "internal", "Partnership planning is outside the automatic repurposing path.", ["co-marketing"]),
  ...classified(5, "unsupported", "Requires an image-generation connector contract.", ["youtube-thumbnail"]),
  ...classified(6, "mandatory", "Required performance feedback step.", ["performance-analyzer-sms", "content-pattern-analyzer-sms"]),
  ...classified(6, "optional", "Evidence-dependent analytical branch.", ["audience-growth-tracker-sms", "analytics-dashboard", "ab-testing", "analytics"]),
] as const;

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class RecipeRegistry {
  readonly #byPhase = new Map<PhaseNumber, PhaseRecipe>();
  readonly definitionHashes = new Map<PhaseNumber, string>();

  constructor(
    readonly recipes: readonly PhaseRecipe[] = PHASE_RECIPES,
    readonly classifications: readonly SkillClassification[] = SKILL_CLASSIFICATIONS,
  ) {
    for (const recipe of recipes) {
      this.#byPhase.set(recipe.phase, recipe);
      this.definitionHashes.set(recipe.phase, hash(recipe));
    }
  }

  validate(skills: SkillRegistry): void {
    const discovered = skills.list();
    const classifications = new Map(this.classifications.map((item) => [item.skill, item]));
    if (this.recipes.length !== 6 || this.#byPhase.size !== 6) throw new Error("Exactly six unique phase recipes are required");
    if (classifications.size !== this.classifications.length) throw new Error("Every skill must have exactly one classification");
    for (const skill of discovered) {
      const item = classifications.get(skill.name);
      if (!item) throw new Error(`Skill '${skill.name}' is not classified`);
      if (item.phase !== skill.phase) throw new Error(`Skill '${skill.name}' classification has the wrong phase`);
    }
    for (const item of this.classifications) {
      if (!discovered.some((skill) => skill.name === item.skill)) throw new Error(`Classified skill '${item.skill}' was not discovered`);
    }
    const referencedOptional = new Set<string>();
    const referencedMandatory = new Set<string>();
    const expectedSuiteId = this.recipes[0]?.suiteId;
    const expectedVersion = this.recipes[0]?.version;
    if (!expectedSuiteId || !expectedVersion) throw new Error("At least one recipe is required");
    for (const recipe of this.recipes) {
      const phase = phaseDefinition(recipe.phase);
      if (recipe.suiteId !== expectedSuiteId || recipe.version !== expectedVersion || recipe.nextPhase !== phase.next || recipe.approvalGate !== phase.approvalGate) {
        throw new Error(`Recipe '${recipe.id}' does not match the phase lifecycle`);
      }
      const keys = new Set<string>();
      recipe.steps.forEach((current, index) => {
        if (current.ordinal !== index + 1 || keys.has(current.key)) throw new Error(`Recipe '${recipe.id}' has invalid step ordering`);
        keys.add(current.key);
        const classification = classifications.get(current.skill);
        if (classification?.kind !== "mandatory" || classification.phase !== recipe.phase) throw new Error(`Step '${current.key}' must use a mandatory same-phase skill`);
        if (referencedMandatory.has(current.skill)) throw new Error(`Mandatory skill '${current.skill}' is referenced more than once`);
        referencedMandatory.add(current.skill);
        if (current.maxAttempts < 1 || current.maxAttempts > 20) throw new Error(`Step '${current.key}' has an invalid attempt limit`);
        if (new Set(current.allowedTools).size !== current.allowedTools.length ||
            current.allowedTools.some((tool) => !RUNTIME_TOOLS.has(tool))) {
          throw new Error(`Step '${current.key}' has an invalid tool allowlist`);
        }
        if (new Set(current.optionalSkills).size !== current.optionalSkills.length ||
            new Set(current.allowedContextUpdates).size !== current.allowedContextUpdates.length ||
            new Set(current.allowedArtifactKinds).size !== current.allowedArtifactKinds.length) {
          throw new Error(`Step '${current.key}' has a duplicate permission`);
        }
        for (const optional of current.optionalSkills) {
          const optionalClass = classifications.get(optional);
          if (optionalClass?.kind !== "optional" || optionalClass.phase !== recipe.phase) throw new Error(`Step '${current.key}' exposes illegal optional skill '${optional}'`);
          referencedOptional.add(optional);
        }
      });
    }
    for (const item of this.classifications) {
      if (item.kind === "optional" && !referencedOptional.has(item.skill)) throw new Error(`Optional skill '${item.skill}' is not allowlisted by any step`);
      if (item.kind === "mandatory" && !referencedMandatory.has(item.skill)) throw new Error(`Mandatory skill '${item.skill}' is not referenced by a recipe`);
    }
  }

  get(phase: PhaseNumber): PhaseRecipe {
    const recipe = this.#byPhase.get(phase);
    if (!recipe) throw new Error(`No recipe registered for phase ${phase}`);
    return recipe;
  }

  nextMandatoryStep(phase: PhaseNumber, completedStepKeys: ReadonlySet<string>): RecipeStep | null {
    return this.get(phase).steps.find((candidate) => !completedStepKeys.has(candidate.key)) ?? null;
  }

  stepForSkill(phase: PhaseNumber, skill: string): RecipeStep {
    const current = this.get(phase).steps.find((candidate) => candidate.skill === skill);
    if (!current) throw new Error(`Skill '${skill}' is not a mandatory step in phase ${phase}`);
    return current;
  }

  optionalSkillForStep(phase: PhaseNumber, stepKey: string, requestedSkill: string): string {
    const current = this.get(phase).steps.find((candidate) => candidate.key === stepKey);
    if (!current) throw new Error(`Unknown recipe step '${stepKey}' for phase ${phase}`);
    if (!current.optionalSkills.includes(requestedSkill)) {
      throw new Error(`Skill '${requestedSkill}' is not optional for step '${stepKey}'`);
    }
    return requestedSkill;
  }
}
