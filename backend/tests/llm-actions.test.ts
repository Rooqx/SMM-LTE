import { describe, expect, it } from "vitest";
import {
  actionToSkillExecutionResult,
  LlmActionSchema,
} from "../src/domain/schemas.js";
import {
  actionSchemaFor,
  LLM_ACTION_JSON_SCHEMA,
  parseActionEnvelope,
} from "../src/llm/openai-provider.js";

describe("LLM runtime actions", () => {
  it("accepts a strict adaptive question envelope", () => {
    const action = parseActionEnvelope({
      action: {
        type: "ask_user",
        questionKey: "brand.goal",
        prompt: "What should social media achieve first?",
        purpose: "Prioritize the first plan.",
        options: [
          { id: "leads", label: "Generate leads", description: "Optimize for enquiries." },
          { id: "awareness", label: "Build awareness", description: "Optimize for reach." },
        ],
        selectionMode: "multiple",
        allowCustom: true,
      },
    });

    expect(action.type).toBe("ask_user");
    expect(LLM_ACTION_JSON_SCHEMA).toMatchObject({
      type: "object",
      required: ["action"],
      additionalProperties: false,
    });
  });

  it("rejects unwrapped, extra, and unknown model fields", () => {
    expect(() => parseActionEnvelope({ type: "complete_step", message: "done" })).toThrow();
    expect(() => LlmActionSchema.parse({
      type: "complete_step",
      message: "done",
      advanceToPhase: 6,
    })).toThrow();
  });

  it("removes unauthorized actions from the provider schema", () => {
    const schema = actionSchemaFor(
      ["ask_user", "propose_output", "cannot_continue"],
      ["unsupported_capability", "safety_constraint"],
    );
    const variants = schema.properties.action.anyOf;
    const actionTypes = variants.map((variant) => variant.properties.type.enum[0]);
    const blocker = variants.find(
      (variant) => variant.properties.type.enum[0] === "cannot_continue",
    );

    expect(actionTypes).toEqual(["ask_user", "propose_output", "cannot_continue"]);
    expect(actionTypes).not.toContain("complete_step");
    expect(blocker?.properties.reason.enum).toEqual([
      "unsupported_capability",
      "safety_constraint",
    ]);
    expect(() => actionSchemaFor([])).toThrow("At least one model action");
  });

  it("advertises the same identifier constraints enforced by local validation", () => {
    const schema = actionSchemaFor(["propose_output"]);
    const proposal = schema.properties.action.anyOf[0];
    const post = proposal.properties.finalPosts.items;
    const context = proposal.properties.contextUpdates.items;

    expect(post.properties.logicalKey.pattern).toBe(
      "^[a-z0-9][a-z0-9_.-]{0,159}$",
    );
    expect(post.properties.platform.pattern).toBe(
      "^[a-z0-9][a-z0-9_.-]{0,39}$",
    );
    expect(post.properties.format.pattern).toBe(
      "^[a-z0-9][a-z0-9_.-]{0,79}$",
    );
    expect(context.properties.key.pattern).toBe(
      "^(brand|strategy|calendar|social|analytics)\\.[a-z0-9_.-]+$",
    );
  });

  it("reports safe schema paths without echoing rejected model content", () => {
    const sensitiveValue = "PRIVATE USER COPY";
    expect(() => parseActionEnvelope({
      action: {
        type: "propose_output",
        message: "Ready",
        artifacts: [],
        contextUpdates: [],
        finalPosts: [{
          logicalKey: sensitiveValue,
          sprint: "Sprint 1",
          week: 1,
          localDate: "2026-10-19",
          platform: "LinkedIn",
          campaign: null,
          topic: "Topic",
          pillar: null,
          format: "Long post",
          title: "Title",
          content: "Post",
          pinnedComment: null,
          metadata: {},
        }],
      },
    })).toThrow(/finalPosts\.0\.(logicalKey|platform|format):invalid_format/);

    try {
      parseActionEnvelope({
        action: {
          type: "propose_output",
          message: "Ready",
          artifacts: [],
          contextUpdates: [],
          finalPosts: [{ logicalKey: sensitiveValue }],
        },
      });
    } catch (error) {
      expect(String(error)).not.toContain(sensitiveValue);
    }
  });

  it("drops malformed optional metadata without weakening post validation", () => {
    const action = parseActionEnvelope({
      action: {
        type: "propose_output",
        message: "Ready",
        artifacts: [{
          kind: "post-draft",
          slug: "linkedin-monday",
          title: "LinkedIn Monday",
          content: "Copy-ready draft.",
          metadata: null,
        }],
        contextUpdates: [{
          key: "strategy.post_drafts",
          markdown: "Approved drafts",
          data: ["not", "a", "record"],
        }],
        finalPosts: [{
          logicalKey: "week-one-linkedin-monday",
          sprint: "Sprint 1",
          week: 43,
          localDate: "2026-10-19",
          platform: "linkedin",
          campaign: null,
          topic: "Voice fidelity",
          pillar: "voice-fidelity",
          format: "text",
          title: "Same brief, two drafts",
          content: "Copy-ready content.",
          pinnedComment: null,
          metadata: "invalid",
        }],
      },
    });

    expect(action.type).toBe("propose_output");
    if (action.type === "propose_output") {
      expect(action.artifacts[0]?.metadata).toEqual({});
      expect(action.contextUpdates[0]?.data).toEqual({});
      expect(action.finalPosts?.[0]?.metadata).toEqual({});
    }
  });

  it("keeps reviewable approval output in the stable persistence projection", () => {
    const result = actionToSkillExecutionResult(LlmActionSchema.parse({
      type: "request_approval",
      message: "Please review the strategy.",
      artifacts: [{
        kind: "content-strategy",
        slug: "strategy-v1",
        title: "Content strategy",
        content: "A focused strategy.",
        metadata: {},
      }],
      contextUpdates: [],
    }));

    expect(result.next_action).toBe("request_approval");
    expect(result.artifacts).toHaveLength(1);
    expect(result.final_posts).toEqual([]);
  });

  it("validates structured final-post calendar data before persistence", () => {
    const action = LlmActionSchema.parse({
      type: "request_approval",
      message: "Review the final post.",
      artifacts: [{
        kind: "final-post-batch",
        slug: "week-one",
        title: "Week one",
        content: "One structured post.",
        metadata: {},
      }],
      contextUpdates: [],
      finalPosts: [{
        logicalKey: "week-one-linkedin-monday",
        sprint: "Sprint 1",
        week: 1,
        localDate: "2026-03-09",
        platform: "linkedin",
        campaign: "launch",
        topic: "Launch",
        pillar: "education",
        format: "text",
        title: "Launch lesson",
        content: "Copy-ready content.",
        pinnedComment: null,
        metadata: {},
      }],
    });
    expect(action.type === "request_approval" && action.finalPosts?.[0]?.localDate)
      .toBe("2026-03-09");
    expect(() => LlmActionSchema.parse({
      ...(action as object),
      finalPosts: [{ ...(action as Extract<typeof action, { type: "request_approval" }>).finalPosts?.[0], localDate: "2026-02-30" }],
    })).toThrow(/real ISO calendar date/);
  });

  it("normalizes human formats and snake_case keys in finalPosts", () => {
    const envelope = parseActionEnvelope({
      action: {
        type: "propose_output",
        message: "Formatted post batch",
        artifacts: [{
          kind: "final-post-batch",
          slug: "batch-1",
          title: "Batch 1",
          content: "Done",
        }],
        context_updates: [],
        final_posts: [{
          logical_key: "cal-slot-1",
          sprint: "Sprint 1",
          week: "1",
          local_date: "2026-10-19",
          platform: "Instagram",
          campaign: null,
          topic: "Topic 1",
          pillar: null,
          format: "Meme / Image",
          title: "Post 1",
          content: "Valid post copy here.",
          pinned_comment: null,
        }],
      },
    });

    expect(envelope.type).toBe("propose_output");
    if (envelope.type === "propose_output") {
      expect(envelope.finalPosts).toBeDefined();
      expect(envelope.finalPosts?.[0]?.logicalKey).toBe("cal-slot-1");
      expect(envelope.finalPosts?.[0]?.localDate).toBe("2026-10-19");
      expect(envelope.finalPosts?.[0]?.platform).toBe("instagram");
      expect(envelope.finalPosts?.[0]?.format).toBe("meme-image");
      expect(envelope.finalPosts?.[0]?.week).toBe(1);
    }
  });
});

