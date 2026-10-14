import { describe, expect, it } from "vitest";
import { PHASES, phaseDefinition } from "../src/domain/workflow.js";

describe("workflow definition", () => {
  it("contains every phase and loops analytics back to strategy", () => {
    expect(PHASES.map((phase) => phase.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(phaseDefinition(6).next).toBe(2);
  });

  it("keeps creative production as the only automatic phase transition", () => {
    expect(PHASES.filter((phase) => phase.approvalGate === null).map((phase) => phase.number)).toEqual([
      3,
    ]);
  });
});
