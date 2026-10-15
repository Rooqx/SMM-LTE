import { describe, expect, it } from "vitest";
import { extraPostSlots, parseCalendarSlots } from "../src/orchestration/calendar-slots.js";

const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("approved calendar worklist", () => {
  it("turns dated rows into stable slots and ignores flexible ideas", () => {
    const markdown = `# Content Calendar
**Period**: Week of October 21, 2026

| Day | Platform | Pillar | Topic / Angle | Format |
| --- | --- | --- | --- | --- |
| Monday | LinkedIn | Education | How to plan a week | Post |
| Monday | X (Twitter) | Education | A short planning tip | Thread |
| Friday | Instagram | Proof | A customer result | Carousel |
| Open | LinkedIn | Flexible | A launch idea | Post |`;
    expect(parseCalendarSlots(ID, markdown)).toEqual([
      { key: "cal-123e4567e89b42d3a456426614174000-1", localDate: "2026-10-19",
        platform: "linkedin", topic: "How to plan a week", format: "Post" },
      { key: "cal-123e4567e89b42d3a456426614174000-2", localDate: "2026-10-19",
        platform: "x", topic: "A short planning tip", format: "Thread" },
      { key: "cal-123e4567e89b42d3a456426614174000-3", localDate: "2026-10-23",
        platform: "instagram", topic: "A customer result", format: "Carousel" },
    ]);
  });

  it("rejects missing dates and schedules with no committed posts", () => {
    expect(() => parseCalendarSlots(ID, "| Day | Platform | Topic |\n| Monday | X | Idea |"))
      .toThrow("dated");
    expect(() => parseCalendarSlots(ID, "Week of October 21, 2026\n| Day | Platform | Topic |\n| Open | X | Idea |"))
      .toThrow("no dated");
  });

  it("honors explicit row dates and rejects a weekday mismatch", () => {
    const header = "Week of October 21, 2026\n| Day (YYYY-MM-DD) | Platform | Topic |\n| --- | --- | --- |\n";
    expect(parseCalendarSlots(ID, `${header}| Monday 2026-10-26 | X | Follow-up |`)[0]?.localDate)
      .toBe("2026-10-26");
    expect(() => parseCalendarSlots(ID, `${header}| Monday 2026-10-27 | X | Wrong day |`))
      .toThrow("weekday");
    expect(() => parseCalendarSlots(ID, `${header}| Monday 2026-02-30 | X | Invalid date |`))
      .toThrow("weekday");
  });

  it("derives on-demand slots from the owner brief, never the previous week's calendar", () => {
    expect(extraPostSlots(ID, {
      mode: "extra_posts", quantity: 3, platforms: ["linkedin", "x"],
      publicationDate: "2026-10-24", topic: "A product update",
    })).toEqual([
      { key: "extra-123e4567e89b42d3a456426614174000-1", localDate: "2026-10-24",
        platform: "linkedin", topic: "A product update", format: "post" },
      { key: "extra-123e4567e89b42d3a456426614174000-2", localDate: "2026-10-24",
        platform: "x", topic: "A product update", format: "post" },
      { key: "extra-123e4567e89b42d3a456426614174000-3", localDate: "2026-10-24",
        platform: "linkedin", topic: "A product update", format: "post" },
    ]);
    expect(() => extraPostSlots(ID, { quantity: 48, platforms: ["x"],
      publicationDate: "2026-10-24", topic: "Idea" })).toThrow("valid quantity");
  });
});
