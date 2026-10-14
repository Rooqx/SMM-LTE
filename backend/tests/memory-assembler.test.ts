import { describe, expect, it } from "vitest";
import { MemoryAssembler } from "../src/memory/assembler.js";
import type { RecipeStep } from "../src/orchestration/recipes/types.js";
import type { ConversationMessageRow } from "../src/db/workflow-store.js";

const step: RecipeStep = {
  key: "test-step",
  ordinal: 1,
  skill: "test-skill",
  purpose: "Test deterministic memory.",
  requiredContextKeys: ["brand.voice", "brand.audience"],
  acceptedIntents: ["continue"],
  optionalSkills: [],
  allowedTools: [],
  allowedContextUpdates: [],
  allowedArtifactKinds: [],
  inputContract: "workspace-input-v1",
  outputContract: "skill-execution-v1",
  repeatable: false,
  maxAttempts: 1,
  completion: "Done.",
};

function message(ordinal: number, content: string): ConversationMessageRow {
  return {
    id: `message-${ordinal}`,
    conversation_id: "conversation",
    workspace_id: "workspace",
    phase_instance_id: null,
    orchestration_step_id: null,
    ordinal: String(ordinal),
    role: "user",
    kind: "message",
    content,
    data: {},
    actor: "test:user",
    provider: null,
    model: null,
    input_tokens: null,
    output_tokens: null,
    created_at: new Date(0),
  };
}

describe("bounded memory assembler", () => {
  it("selects only required context and explicitly reports missing keys", () => {
    const memory = new MemoryAssembler(10_000, 10_000).assemble({
      step,
      pinnedContext: [
        { key: "brand.voice", markdown: "Direct", data: {}, version: 2 },
        { key: "analytics.private", markdown: "Never include", data: {}, version: 1 },
      ],
      conversation: { summary: null, messages: [] },
    });

    expect(memory.context.map((item) => item.key)).toEqual(["brand.voice"]);
    expect(memory.missingRequiredContext).toEqual(["brand.audience"]);
  });

  it("keeps the newest messages and reports how many were omitted", () => {
    const newestSize = JSON.stringify({
      ordinal: 3,
      role: "user",
      kind: "message",
      content: "newest",
      data: {},
    }).length;
    const memory = new MemoryAssembler(10_000, newestSize + 1).assemble({
      step: { ...step, requiredContextKeys: [] },
      pinnedContext: [],
      conversation: {
        summary: null,
        messages: [message(1, "oldest"), message(2, "middle"), message(3, "newest")],
      },
    });

    expect(memory.recentMessages.map((item) => item.ordinal)).toEqual([3]);
    expect(memory.omittedRecentMessages).toBe(2);
  });

  it("fails instead of silently truncating required constraints", () => {
    expect(() => new MemoryAssembler(10, 1_000).assemble({
      step: { ...step, requiredContextKeys: ["brand.voice"] },
      pinnedContext: [{ key: "brand.voice", markdown: "Long required context", data: {}, version: 1 }],
      conversation: { summary: null, messages: [] },
    })).toThrow(/Required context exceeds/);
  });
});
