import type { FinalPostDraft, SkillExecutionResult } from "../domain/schemas.js";
import type { CalendarSlot } from "./calendar-slots.js";

/** Run input is persisted JSON, so validate it again before trusting a slot plan. */
export function readContentSlots(value: unknown): CalendarSlot[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 47 ||
      value.some((slot) => !slot || typeof slot !== "object" ||
        typeof slot.key !== "string" || !/^(cal|extra)-[a-f0-9]{32}-\d+$/.test(slot.key) ||
        typeof slot.localDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(slot.localDate) ||
        typeof slot.platform !== "string" || !/^[a-z0-9-]{1,40}$/.test(slot.platform) ||
        typeof slot.topic !== "string" || !slot.topic.trim() ||
        typeof slot.format !== "string" || !slot.format.trim())) {
    throw new Error("Run has no valid, pinned content slots");
  }
  if (new Set(value.map((slot) => slot.key)).size !== value.length) {
    throw new Error("Run has duplicate content slot keys");
  }
  return value as CalendarSlot[];
}

/** The model supplies prose; the backend owns slot identity and metadata. */
export function attachScheduledDrafts(
  slots: readonly CalendarSlot[],
  artifacts: SkillExecutionResult["artifacts"],
): SkillExecutionResult["artifacts"] {
  if (artifacts.length !== slots.length || artifacts.some((artifact) => !artifact.content.trim())) {
    throw new Error("Writer must return one nonempty draft for every scheduled slot in this batch");
  }
  return artifacts.map((artifact, index) => {
    const slot = slots[index]!;
    return {
      ...artifact,
      slug: `draft-${slot.key}`,
      metadata: { ...artifact.metadata, contentSlotKey: slot.key,
        localDate: slot.localDate, platform: slot.platform, topic: slot.topic },
    };
  });
}

/** An incomplete calendar can never become an approved final-post batch. */
export function requireCompleteFinalBatch(
  slots: readonly CalendarSlot[],
  posts: readonly FinalPostDraft[],
): void {
  if (posts.length !== slots.length) {
    throw new Error(`Final batch has ${posts.length} posts; the calendar requires ${slots.length}`);
  }
  const expected = new Map(slots.map((slot) => [slot.key, slot]));
  for (const post of posts) {
    const slot = expected.get(post.logicalKey);
    if (!slot || post.localDate !== slot.localDate || post.platform !== slot.platform ||
        post.topic !== slot.topic ||
        !post.content.trim()) {
      throw new Error("Final post does not match a scheduled slot's key, date, platform, and topic");
    }
    expected.delete(post.logicalKey);
  }
  if (expected.size !== 0) throw new Error("Final batch is missing scheduled posts");
}
