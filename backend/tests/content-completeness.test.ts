import { describe, expect, it } from "vitest";
import { attachScheduledDrafts, readContentSlots, requireCompleteFinalBatch } from "../src/orchestration/content-completeness.js";
import type { CalendarSlot } from "../src/orchestration/calendar-slots.js";
import type { FinalPostDraft, SkillExecutionResult } from "../src/domain/schemas.js";

const slots: CalendarSlot[] = [
  { key: "cal-123e4567e89b42d3a456426614174000-1", localDate: "2026-10-19",
    platform: "linkedin", topic: "Planning", format: "post" },
  { key: "cal-123e4567e89b42d3a456426614174000-2", localDate: "2026-10-19",
    platform: "x", topic: "Planning tip", format: "thread" },
];

const draft = (content: string): SkillExecutionResult["artifacts"][number] => ({
  kind: "post-draft", slug: "model-slug", title: "Draft", content, metadata: {},
});

const post = (slot: CalendarSlot): FinalPostDraft => ({
  logicalKey: slot.key, localDate: slot.localDate, platform: slot.platform,
  sprint: "October week", week: 43, campaign: null, topic: slot.topic,
  pillar: null, format: "post", title: "Final", content: "Useful copy",
  pinnedComment: null, metadata: {},
});

describe("scheduled-content completeness", () => {
  it("assigns backend-owned slot identity to every draft", () => {
    const artifacts = attachScheduledDrafts(slots, [draft("First"), draft("Second")]);
    expect(artifacts.map((artifact) => artifact.slug)).toEqual(slots.map((slot) => `draft-${slot.key}`));
    expect(artifacts[1]?.metadata).toMatchObject({ contentSlotKey: slots[1]?.key, platform: "x" });
    expect(() => attachScheduledDrafts(slots, [draft("Only one")])).toThrow("one nonempty draft");
    expect(() => attachScheduledDrafts(slots, [draft("First"), draft(" ")])).toThrow("one nonempty draft");
  });

  it("requires every exact final slot, including date and platform", () => {
    expect(() => requireCompleteFinalBatch(slots, [post(slots[0]!), post(slots[1]!)]))
      .not.toThrow();
    expect(() => requireCompleteFinalBatch(slots, [post(slots[0]!)]))
      .toThrow("requires 2");
    expect(() => requireCompleteFinalBatch(slots, [post(slots[0]!), post(slots[0]!)]))
      .toThrow("does not match");
    expect(() => requireCompleteFinalBatch(slots, [post(slots[0]!), {
      ...post(slots[1]!), platform: "linkedin",
    }])).toThrow("does not match");
    expect(() => requireCompleteFinalBatch(slots, [post(slots[0]!), {
      ...post(slots[1]!), topic: "Unscheduled idea",
    }])).toThrow("does not match");
  });

  it("rejects malformed persisted slot plans", () => {
    expect(readContentSlots(slots)).toHaveLength(2);
    expect(() => readContentSlots([{ key: "untrusted", platform: "x" }])).toThrow("valid");
    expect(() => readContentSlots([slots[0], slots[0]])).toThrow("duplicate");
  });
});
