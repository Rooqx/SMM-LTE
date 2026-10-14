import { describe, expect, it } from "vitest";
import {
  brandFoundationPresentationSchema,
  contentCalendarPresentationSchema,
  finalPostSchema,
  pendingQuestionSchema,
  postBatchPresentationSchema,
  qcScorecardPresentationSchema,
} from "@/lib/contracts";
import { TODAY_MOMENT_FIXTURES, type TodaySceneKey } from "./today-moments";

describe("Variant B Today moments fixtures", () => {
  const scenes: TodaySceneKey[] = [
    "welcome",
    "question",
    "thinking",
    "review",
    "approved",
    "calendar",
    "production",
    "qc",
    "posts",
    "cycle_complete",
  ];

  it("defines all ten Variant B moments", () => {
    for (const scene of scenes) {
      expect(TODAY_MOMENT_FIXTURES[scene]).toBeDefined();
      expect(TODAY_MOMENT_FIXTURES[scene].meta.scene).toBe(scene);
      expect(TODAY_MOMENT_FIXTURES[scene].timeline.length).toBeGreaterThan(0);
      expect(TODAY_MOMENT_FIXTURES[scene].heading).toBeTruthy();
    }
  });

  it("validates question moment against pendingQuestionSchema", () => {
    const fixture = TODAY_MOMENT_FIXTURES.question;
    expect(fixture.payload?.question).toBeDefined();
    const result = pendingQuestionSchema.safeParse(fixture.payload?.question);
    expect(result.success).toBe(true);
  });

  it("validates review moment against brandFoundationPresentationSchema", () => {
    const fixture = TODAY_MOMENT_FIXTURES.review;
    expect(fixture.payload?.brandFoundation).toBeDefined();
    const result = brandFoundationPresentationSchema.safeParse(
      fixture.payload?.brandFoundation,
    );
    expect(result.success).toBe(true);
  });

  it("validates calendar moment against contentCalendarPresentationSchema", () => {
    const fixture = TODAY_MOMENT_FIXTURES.calendar;
    expect(fixture.payload?.calendar).toBeDefined();
    const result = contentCalendarPresentationSchema.safeParse(
      fixture.payload?.calendar,
    );
    expect(result.success).toBe(true);
  });

  it("validates production moment against postBatchPresentationSchema", () => {
    const fixture = TODAY_MOMENT_FIXTURES.production;
    expect(fixture.payload?.production).toBeDefined();
    const result = postBatchPresentationSchema.safeParse(
      fixture.payload?.production,
    );
    expect(result.success).toBe(true);
  });

  it("validates qc moment against qcScorecardPresentationSchema", () => {
    const fixture = TODAY_MOMENT_FIXTURES.qc;
    expect(fixture.payload?.qcScorecard).toBeDefined();
    const result = qcScorecardPresentationSchema.safeParse(
      fixture.payload?.qcScorecard,
    );
    expect(result.success).toBe(true);
  });

  it("validates posts moment against finalPostSchema", () => {
    const fixture = TODAY_MOMENT_FIXTURES.posts;
    expect(fixture.payload?.posts).toBeDefined();
    for (const post of fixture.payload?.posts ?? []) {
      const result = finalPostSchema.safeParse(post);
      expect(result.success).toBe(true);
    }
  });

  it("validates cycle_complete moment has cycle payload", () => {
    const fixture = TODAY_MOMENT_FIXTURES.cycle_complete;
    expect(fixture.payload?.cycle).toBe(1);
    expect(fixture.actions[0]?.label).toContain("Cycle 2");
  });
});
