import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PromptBudgetError, PromptCompiler } from "../src/skills/prompt-compiler.js";
import { SkillRegistry } from "../src/skills/registry.js";
import { RecipeRegistry } from "../src/orchestration/recipes/catalog.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("prompt compiler", () => {
  it("loads only phase-relevant context and documents legacy aliases", async () => {
    const registry = new SkillRegistry(repositoryRoot);
    await registry.load();
    const skill = registry.get("post-writer-sms");
    const step = new RecipeRegistry().stepForSkill(3, skill.name);
    const compiler = new PromptCompiler(repositoryRoot);
    const prompt = await compiler.compile({
      skill,
      phase: 3,
      step,
      input: { topic: "durable orchestration" },
      memory: {
        context: [
          { key: "brand.voice", markdown: "Direct and practical", data: {}, version: 2 },
        ],
        missingRequiredContext: ["brand.audience", "calendar.current_sprint"],
        summary: null,
        recentMessages: [],
        omittedRecentMessages: 0,
      },
      allowedActionTypes: ["ask_user", "propose_output", "cannot_continue"],
    });

    expect(prompt.developer).not.toContain("Direct and practical");
    expect(prompt.user).toContain("Direct and practical");
    expect(prompt.user).toContain("missing_required_context");
    expect(prompt.developer).toContain("about-me.md maps to brand.audience");
    expect(prompt.developer).toContain("return ask_user rather than hiding the question");
    expect(prompt.user).toContain('"actions": [');
    expect(prompt.snapshot).toMatchObject({
      skillName: "post-writer-sms",
      phase: 3,
      stepKey: "write-platform-posts",
    });
    expect(prompt.snapshot).not.toHaveProperty("developer");
    expect(prompt.snapshot).not.toHaveProperty("user");
  });

  it("fails closed when the complete user prompt exceeds its budget", async () => {
    const registry = new SkillRegistry(repositoryRoot);
    await registry.load();
    const skill = registry.get("post-writer-sms");
    const step = new RecipeRegistry().stepForSkill(3, skill.name);
    const compiler = new PromptCompiler(repositoryRoot, 1_000);

    await expect(compiler.compile({
      skill,
      phase: 3,
      step,
      input: { topic: "x".repeat(2_000) },
      memory: {
        context: [],
        missingRequiredContext: [...step.requiredContextKeys],
        summary: null,
        recentMessages: [],
        omittedRecentMessages: 0,
      },
      allowedActionTypes: ["ask_user", "propose_output", "cannot_continue"],
    })).rejects.toBeInstanceOf(PromptBudgetError);
  });

  it("preserves durable strategy for a recurring content command", async () => {
    const registry = new SkillRegistry(repositoryRoot);
    await registry.load();
    const skill = registry.get("post-writer-sms");
    const step = new RecipeRegistry().stepForSkill(3, skill.name);
    const compiler = new PromptCompiler(repositoryRoot);
    const prompt = await compiler.compile({
      skill,
      phase: 3,
      step,
      input: {
        content_request: {
          mode: "extra_posts",
          topic: "Lagos launch",
          quantity: 3,
        },
      },
      memory: {
        context: [],
        missingRequiredContext: [],
        summary: null,
        recentMessages: [],
        omittedRecentMessages: 0,
      },
      allowedActionTypes: ["propose_output", "cannot_continue"],
    });

    expect(prompt.developer).toContain("Recurring content command directives");
    expect(prompt.developer).toContain("clarification budget for this skill is exhausted");
    expect(prompt.developer).toContain("Do not rewrite the approved strategy");
    expect(prompt.user).toContain('"mode": "extra_posts"');
  });

  it("lets the short intake use a needed follow-up without losing its answer", async () => {
    const registry = new SkillRegistry(repositoryRoot);
    await registry.load();
    const skill = registry.get("social-media-context-sms");
    const step = new RecipeRegistry().stepForSkill(1, skill.name);
    const prompt = await new PromptCompiler(repositoryRoot).compile({
      skill, phase: 1, step,
      input: { compiled_intake: { questionnaireVersion: "1.2.0", status: "complete" } },
      memory: {
        context: [], missingRequiredContext: [], summary: null,
        recentMessages: [{ ordinal: 7, role: "user", kind: "answer",
          content: "LinkedIn is our priority platform", data: {} }],
        omittedRecentMessages: 0,
      },
      allowedActionTypes: ["ask_user", "propose_output"],
    });
    expect(prompt.developer).toContain("Do not re-ask the four confirmed intake answers");
    expect(prompt.developer).not.toContain("all foundational facts have already been gathered");
    expect(JSON.parse(prompt.user).conversation.recent_messages[0].content)
      .toBe("LinkedIn is our priority platform");
    expect(prompt.snapshot.messageOrdinals).toEqual([7]);
  });
});
