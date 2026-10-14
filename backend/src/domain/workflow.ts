export type PhaseNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type PhaseDefinition = {
  number: PhaseNumber;
  slug: string;
  label: string;
  approvalGate: string | null;
  next: PhaseNumber;
};

export const PHASES: readonly PhaseDefinition[] = [
  {
    number: 1,
    slug: "onboarding",
    label: "Discovery and onboarding",
    approvalGate: "brand_onboarding",
    next: 2,
  },
  {
    number: 2,
    slug: "strategy-and-calendar",
    label: "Strategy and calendar",
    approvalGate: "weekly_topics",
    next: 3,
  },
  {
    number: 3,
    slug: "creative-production",
    label: "Creative production",
    approvalGate: null,
    next: 4,
  },
  {
    number: 4,
    slug: "qc-and-scoring",
    label: "Quality control and scoring",
    approvalGate: "final_drafts",
    next: 5,
  },
  {
    number: 5,
    slug: "repurposing",
    label: "Repurposing and distribution",
    approvalGate: "repurposed_batch",
    next: 6,
  },
  {
    number: 6,
    slug: "analytics-and-feedback",
    label: "Analytics and feedback",
    approvalGate: "strategy_calibration",
    next: 2,
  },
] as const;

export function phaseDefinition(phase: number): PhaseDefinition {
  const definition = PHASES.find((candidate) => candidate.number === phase);
  if (!definition) {
    throw new Error(`Unsupported workflow phase: ${phase}`);
  }
  return definition;
}

export function isPhaseNumber(value: number): value is PhaseNumber {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}
