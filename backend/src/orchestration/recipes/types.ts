import type { PhaseNumber } from "../../domain/workflow.js";

export type SkillClassificationKind = "mandatory" | "optional" | "internal" | "unsupported";
export type RuntimeToolName = "list_approved_artifacts";

export type SkillClassification = {
  skill: string;
  phase: PhaseNumber;
  kind: SkillClassificationKind;
  reason: string;
};

export type RecipeStep = {
  key: string;
  ordinal: number;
  skill: string;
  purpose: string;
  requiredContextKeys: readonly string[];
  acceptedIntents: readonly ("continue" | "answer" | "retry")[];
  optionalSkills: readonly string[];
  allowedTools: readonly RuntimeToolName[];
  allowedContextUpdates: readonly string[];
  allowedArtifactKinds: readonly string[];
  inputContract: "workspace-input-v1";
  outputContract: "skill-execution-v1";
  repeatable: boolean;
  maxAttempts: number;
  completion: string;
};

export type PhaseRecipe = {
  id: string;
  suiteId: string;
  version: string;
  phase: PhaseNumber;
  purpose: string;
  approvalGate: string | null;
  nextPhase: PhaseNumber;
  steps: readonly RecipeStep[];
};
