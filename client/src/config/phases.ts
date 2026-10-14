export interface PhaseConfig {
  number: number;
  label: string;
  supportingLabel: string;
  shortDescription: string;
}

export const PHASES_CONFIG: Record<number, PhaseConfig> = {
  1: {
    number: 1,
    label: "Know your brand",
    supportingLabel: "Onboarding",
    shortDescription: "Teach your agent the basics and establish your brand voice and positioning.",
  },
  2: {
    number: 2,
    label: "Plan the month",
    supportingLabel: "Strategy",
    shortDescription: "Turn your brand foundation into a focused content calendar and strategic angles.",
  },
  3: {
    number: 3,
    label: "Create posts",
    supportingLabel: "Production",
    shortDescription: "Draft platform-native posts tailored to LinkedIn, X, and Instagram.",
  },
  4: {
    number: 4,
    label: "Polish quality",
    supportingLabel: "Review",
    shortDescription: "Review quality scores, verify voice alignment, and approve draft deliverables.",
  },
  5: {
    number: 5,
    label: "Multiply reach",
    supportingLabel: "Repurpose",
    shortDescription: "Repurpose core posts across secondary formats and queues.",
  },
  6: {
    number: 6,
    label: "Learn & improve",
    supportingLabel: "Analytics",
    shortDescription: "Review performance signals and feed insights back into the next monthly strategy.",
  },
} as const;

export function getPhaseConfig(phaseNumber: number): PhaseConfig {
  return (
    PHASES_CONFIG[phaseNumber] ?? {
      number: phaseNumber,
      label: `Phase ${phaseNumber}`,
      supportingLabel: "Workflow",
      shortDescription: "Automated social media workflow phase.",
    }
  );
}
