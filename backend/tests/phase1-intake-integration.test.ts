import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PromptCompiler } from "../src/skills/prompt-compiler.js";
import { SkillRegistry } from "../src/skills/registry.js";
import { RecipeRegistry } from "../src/orchestration/recipes/catalog.js";
import { MemoryAssembler } from "../src/memory/assembler.js";
import { MockProvider } from "../src/llm/mock-provider.js";
import { compileBrandIntake } from "../src/interview/compiler.js";
import { CURRENT_GUIDED_INTAKE_VERSION, GUIDED_INTAKE_QUESTIONNAIRE_ID } from "../src/interview/definitions.js";
import type { InterviewAnswerRow } from "../src/db/interview-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

function createMockAnswer(
  questionId: string,
  selectedOptionIds: string[],
  selectedOptions: { id: string; label: string; description?: string }[],
  customText?: string,
): InterviewAnswerRow {
  return {
    id: `ans_${questionId}`,
    session_id: "00000000-0000-0000-0000-000000000001",
    workspace_id: "00000000-0000-0000-0000-000000000002",
    question_id: questionId,
    question_version: 1,
    option_set_id: "00000000-0000-0000-0000-000000000003",
    selected_option_ids: selectedOptionIds,
    selected_options: selectedOptions,
    custom_text: customText ?? null,
    answer_source: selectedOptionIds.length > 0
      ? (customText ? "combined" : "option")
      : "custom",
    idempotency_key: `key_${questionId}`,
    request_hash: "hash",
    session_version: 1,
    status: "active",
    supersedes_answer_id: null,
    actor: "user@example.com",
    created_at: new Date(),
    superseded_at: null,
  };
}

describe("M9.4: Phase 1 recipe integration with compiled brand intake", () => {
  const registry = new SkillRegistry(REPO_ROOT);
  const recipes = new RecipeRegistry();
  const compiler = new PromptCompiler(REPO_ROOT, 120_000);
  const memoryAssembler = new MemoryAssembler(40_000, 20_000);
  const mockProvider = new MockProvider();

  it("compiles brand intake for a company business and injects it into PromptCompiler", async () => {
    await registry.load();
    recipes.validate(registry);

    const answers: InterviewAnswerRow[] = [
      createMockAnswer("promotion_target", ["company_business"], [{ id: "company_business", label: "A company or business" }]),
      createMockAnswer("business_description", ["software_app"], [{ id: "software_app", label: "Software or an app" }], "We build automated analytics for Shopify store owners."),
      createMockAnswer("audience", ["small_businesses"], [{ id: "small_businesses", label: "Small businesses" }]),
      createMockAnswer("customer_outcome", ["save_time"], [{ id: "save_time", label: "Save time or make something easier" }]),
      createMockAnswer("primary_goal", ["leads"], [{ id: "leads", label: "Generate enquiries or leads" }]),
      createMockAnswer("brand_perception", ["helpful", "expert"], [
        { id: "helpful", label: "Helpful and clear" },
        { id: "expert", label: "Expert and trustworthy" },
      ]),
      createMockAnswer("platform_priorities", ["linkedin", "x"], [
        { id: "linkedin", label: "LinkedIn" },
        { id: "x", label: "X" },
      ]),
      createMockAnswer("call_to_action", ["book_call"], [{ id: "book_call", label: "Book a call or appointment" }]),
      createMockAnswer("publishing_capacity", ["four_five_weekly"], [{ id: "four_five_weekly", label: "Four or five times a week" }]),
      createMockAnswer("founder_visibility", ["sometimes"], [{ id: "sometimes", label: "Visible sometimes" }]),
      createMockAnswer("content_boundaries", ["politics"], [{ id: "politics", label: "Politics or divisive topics" }]),
    ];

    const brandIntake = compileBrandIntake({
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      // This fixture represents an interview pinned before the shorter v1.2 release.
      questionnaireVersion: "1.1.0",
      answers,
    });

    expect(brandIntake.accountOffer.promotionTarget?.id).toBe("company_business");
    expect(brandIntake.accountOffer.businessDescription?.category?.id).toBe("software_app");
    expect(brandIntake.accountOffer.businessDescription?.descriptionText).toBe("We build automated analytics for Shopify store owners.");
    expect(brandIntake.platforms.priorities.map((p) => p.id)).toContain("linkedin");
    expect(brandIntake.platforms.priorities.map((p) => p.id)).toContain("x");
    expect(brandIntake.sourceAnswers).toHaveLength(11);

    const skill = registry.get("social-media-context-sms");
    const phase1Recipe = recipes.get(1);
    const step1 = phase1Recipe.steps[0]!;

    const memory = memoryAssembler.assemble({
      step: step1,
      pinnedContext: [],
      conversation: {
        summary: null,
        messages: [
          {
            ordinal: 1,
            role: "user",
            kind: "message",
            content: "Old chat transcript that is superseded by guided interview",
            data: {},
          },
        ],
      },
    });

    // Compile prompt WITH compiled_intake
    const compiledWithIntake = await compiler.compile({
      skill,
      phase: 1,
      step: step1,
      input: { compiled_intake: brandIntake },
      memory,
      allowedActionTypes: ["ask_user", "propose_output"],
    });

    // Verify developer prompt includes guided intake synthesis directives
    expect(compiledWithIntake.developer).toContain("# Guided brand intake synthesis directives");
    expect(compiledWithIntake.developer).toContain("The user has completed the guided brand intake interview");
    expect(compiledWithIntake.developer).toContain("DO NOT return ask_user to interview the user again");
    expect(compiledWithIntake.developer).toContain("Artifact kind 'social-context'");
    expect(compiledWithIntake.developer).toContain("Context update for key 'social.context'");

    // Verify user prompt includes compiled intake and pruned conversation
    const parsedUserPrompt = JSON.parse(compiledWithIntake.user);
    expect(parsedUserPrompt.input.compiled_intake).toBeDefined();
    expect(parsedUserPrompt.input.compiled_intake.accountOffer.promotionTarget.id).toBe("company_business");
    // Verify conversation was pruned when intake is present
    expect(parsedUserPrompt.conversation.recent_messages).toEqual([]);

    // Compile prompt WITHOUT compiled_intake (legacy path)
    const compiledLegacy = await compiler.compile({
      skill,
      phase: 1,
      step: step1,
      input: {},
      memory,
      allowedActionTypes: ["ask_user", "propose_output"],
    });

    expect(compiledLegacy.developer).not.toContain("# Guided brand intake synthesis directives");
    const parsedLegacyUser = JSON.parse(compiledLegacy.user);
    expect(parsedLegacyUser.conversation.recent_messages).toHaveLength(1);

    // Prompt character count must be bounded
    expect(compiledWithIntake.developer.length).toBeLessThan(120_000);
    expect(compiledWithIntake.user.length).toBeLessThan(120_000);
  });

  it("executes MockProvider with compiled intake and returns valid propose_output with social.context", async () => {
    await registry.load();
    const skill = registry.get("social-media-context-sms");
    const step1 = recipes.get(1).steps[0]!;

    const memory = memoryAssembler.assemble({
      step: step1,
      pinnedContext: [],
      conversation: { summary: null, messages: [] },
    });

    const compiled = await compiler.compile({
      skill,
      phase: 1,
      step: step1,
      input: {
        compiled_intake: {
          version: "1.0.0",
          accountOffer: { offerType: "company", category: "Software", descriptionText: "SaaS App" },
        },
      },
      memory,
      allowedActionTypes: ["ask_user", "propose_output"],
    });

    const execution = await mockProvider.execute({
      developerPrompt: compiled.developer,
      userPrompt: compiled.user,
      allowedActionTypes: ["ask_user", "propose_output"],
      allowedCannotContinueReasons: ["unsupported_capability", "safety_constraint"],
      correlationId: "test:m9.4:execution",
    });

    expect(execution.action.type).toBe("propose_output");
    if (execution.action.type === "propose_output") {
      expect(execution.action.artifacts).toHaveLength(1);
      expect(execution.action.artifacts[0]?.kind).toBe("social-context");
      expect(execution.action.contextUpdates).toHaveLength(1);
      expect(execution.action.contextUpdates[0]?.key).toBe("social.context");
      expect(execution.action.contextUpdates[0]?.data.synthesized_from_intake).toBe(true);
    }
  });

  it("preserves all 6 mandatory Phase 1 recipe steps and permission contracts", async () => {
    await registry.load();
    const phase1Recipe = recipes.get(1);

    expect(phase1Recipe.phase).toBe(1);
    expect(phase1Recipe.approvalGate).toBe("brand_onboarding");
    expect(phase1Recipe.steps).toHaveLength(6);

    const expectedSteps = [
      { key: "capture-social-context", skill: "social-media-context-sms", requires: [], writes: ["social.context"], artifact: "social-context" },
      { key: "research-niche", skill: "niche-research", requires: ["social.context"], writes: ["brand.audience"], artifact: "niche-research" },
      { key: "research-customers", skill: "customer-research", requires: ["social.context"], writes: ["brand.audience"], artifact: "customer-research" },
      { key: "profile-competitors", skill: "competitor-profiling", requires: ["brand.audience"], writes: ["brand.positioning"], artifact: "competitor-profile" },
      { key: "build-voice", skill: "voice-builder", requires: ["brand.audience", "brand.positioning"], writes: ["brand.voice"], artifact: "voice-guide" },
      { key: "optimize-profile", skill: "profile-optimizer", requires: ["brand.voice", "brand.positioning"], writes: ["brand.profile_funnels"], artifact: "profile-blueprint" },
    ];

    expectedSteps.forEach((expected, index) => {
      const actual = phase1Recipe.steps[index]!;
      expect(actual.key).toBe(expected.key);
      expect(actual.skill).toBe(expected.skill);
      expect(actual.requiredContextKeys).toEqual(expected.requires);
      expect(actual.allowedContextUpdates).toEqual(expected.writes);
      expect(actual.allowedArtifactKinds).toContain(expected.artifact);
    });

    // Verify step progression: each step consumes output of preceding step
    const contextProduced = new Set<string>();
    for (const step of phase1Recipe.steps) {
      for (const required of step.requiredContextKeys) {
        expect(contextProduced.has(required)).toBe(true);
      }
      for (const update of step.allowedContextUpdates) {
        contextProduced.add(update);
      }
    }
  });

  it("evaluates compiled intake across multiple sectors without budget violations", async () => {
    await registry.load();
    const sectors = [
      { target: "personal_brand", cat: "creator_personal_brand", desc: "Fitness coach sharing training routines on Instagram and YouTube" },
      { target: "client_business", cat: "professional_service", desc: "Local dental clinic in Austin TX needing patient acquisition" },
      { target: "product_launch", cat: "online_products", desc: "Organic loose leaf matcha tea brand launching direct-to-consumer" },
    ];

    for (const sector of sectors) {
      const answers: InterviewAnswerRow[] = [
        createMockAnswer("promotion_target", [sector.target], [{ id: sector.target, label: sector.target }]),
        createMockAnswer("business_description", [sector.cat], [{ id: sector.cat, label: sector.cat }], sector.desc),
        createMockAnswer("primary_goal", ["leads"], [{ id: "leads", label: "Generate leads" }]),
        createMockAnswer("platform_priorities", ["instagram"], [{ id: "instagram", label: "Instagram" }]),
      ];

      const packet = compileBrandIntake({
        questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
        questionnaireVersion: CURRENT_GUIDED_INTAKE_VERSION,
        answers,
      });

      const skill = registry.get("social-media-context-sms");
      const step1 = recipes.get(1).steps[0]!;
      const memory = memoryAssembler.assemble({
        step: step1,
        pinnedContext: [],
        conversation: { summary: null, messages: [] },
      });

      const compiled = await compiler.compile({
        skill,
        phase: 1,
        step: step1,
        input: { compiled_intake: packet },
        memory,
        allowedActionTypes: ["ask_user", "propose_output"],
      });

      expect(compiled.developer).toContain("# Guided brand intake synthesis directives");
      expect(compiled.user).toContain(sector.desc);
      expect(compiled.snapshot.developerPromptHash).toHaveLength(64);
      expect(compiled.snapshot.userPromptHash).toHaveLength(64);
    }
  });
});
