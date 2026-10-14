import type {
  BrandFoundationPresentation,
  ContentCalendarPresentation,
  FinalPost,
  PendingQuestion,
  PostBatchPresentation,
  QcScorecardPresentation,
} from "@/lib/contracts";

export type TodaySceneKey =
  | "welcome"
  | "question"
  | "thinking"
  | "review"
  | "approved"
  | "calendar"
  | "production"
  | "qc"
  | "posts"
  | "cycle_complete";

export interface TimelineEntry {
  icon: string;
  title: string;
  description: string;
  time: string;
}

export interface TodayMomentMeta {
  scene: TodaySceneKey;
  phase: number;
  percent: number;
  title: string;
  purpose: string;
  greeting: string;
  copy: string;
  status: string;
}

export interface TodayMomentFixture {
  meta: TodayMomentMeta;
  timeline: TimelineEntry[];
  badge: {
    icon: string;
    text: string;
    timeLabel?: string;
  };
  kicker: string;
  heading: string;
  subheading: string;
  actions: Array<{
    action: string;
    label: string;
    variant: "primary" | "secondary" | "ghost" | "success";
    icon?: string;
  }>;
  payload?: {
    question?: PendingQuestion;
    brandFoundation?: BrandFoundationPresentation;
    calendar?: ContentCalendarPresentation;
    production?: PostBatchPresentation;
    qcScorecard?: QcScorecardPresentation;
    posts?: FinalPost[];
    reviewRunId?: string;
    reviewRevision?: number;
    cycle?: number;
  };
}

export const TODAY_MOMENT_FIXTURES: Record<TodaySceneKey, TodayMomentFixture> = {
  welcome: {
    meta: {
      scene: "welcome",
      phase: 1,
      percent: 0,
      title: "Know your brand",
      purpose: "Start with a two-minute introduction",
      greeting: "Welcome to your social media team",
      copy: "Tell me the basics. I’ll turn them into a complete brand foundation.",
      status: "Ready when you are",
    },
    timeline: [
      {
        icon: "message-circle",
        title: "Workspace created",
        description: "Novi Studio is ready",
        time: "Now",
      },
      {
        icon: "route",
        title: "Autopilot started onboarding",
        description: "Phase 1 selected automatically",
        time: "Now",
      },
    ],
    badge: {
      icon: "flag",
      text: "Your first step",
      timeLabel: "About 2 minutes",
    },
    kicker: "Meet your autopilot manager",
    heading: "Let’s teach me the basics about Novi Studio.",
    subheading:
      "You answer. I research, organize, write and save the useful parts for every future post.",
    actions: [
      {
        action: "start",
        label: "Start with one question",
        variant: "primary",
        icon: "arrow-right",
      },
    ],
  },

  question: {
    meta: {
      scene: "question",
      phase: 1,
      percent: 40,
      title: "Know your brand",
      purpose: "Help your agent understand you",
      greeting: "Good morning, Farooq",
      copy: "I have one quick question, then I’ll keep building your brand profile.",
      status: "Autopilot active",
    },
    timeline: [
      {
        icon: "scan-search",
        title: "Researched your market",
        description: "Found recurring audience pain points",
        time: "2m",
      },
      {
        icon: "file-check-2",
        title: "Saved your business basics",
        description: "Offer and goals added to Brand",
        time: "4m",
      },
    ],
    badge: {
      icon: "message-circle-question",
      text: "One quick question",
      timeLabel: "About 20 seconds",
    },
    kicker: "Your social media manager",
    heading: "How should your brand feel when people read a post?",
    subheading:
      "I’ll use this to keep every caption, thread and reply sounding consistently like you.",
    actions: [
      {
        action: "why",
        label: "Why I’m asking",
        variant: "ghost",
        icon: "help-circle",
      },
      {
        action: "answer",
        label: "Use this answer",
        variant: "primary",
        icon: "arrow-right",
      },
    ],
    payload: {
      question: {
        id: "7b0d7718-4e31-4e7a-9a99-b1d5225d2b0e",
        workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
        workflow_instance_id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
        phase_instance_id: "f3c8008a-24a9-467f-a631-0428ef50a9dc",
        orchestration_step_id: null,
        question_key: "brand-voice-personality",
        prompt: "How should your brand feel when people read a post?",
        purpose:
          "I’ll use this to keep every caption, thread and reply sounding consistently like you.",
        options: [
          {
            id: "trusted",
            label: "Trusted expert",
            description: "Clear, confident and practical—never stiff.",
          },
          {
            id: "warm",
            label: "Warm guide",
            description: "Friendly, encouraging and easy to relate to.",
          },
          {
            id: "bold",
            label: "Bold challenger",
            description: "Direct, energetic and willing to question norms.",
          },
          {
            id: "custom",
            label: "Something else",
            description: "Describe the personality in your own words.",
          },
        ],
        allow_custom: true,
        selection_mode: "single",
        status: "pending",
        version: 1,
        created_at: "2026-10-09T18:00:00Z",
      },
    },
  },

  thinking: {
    meta: {
      scene: "thinking",
      phase: 1,
      percent: 72,
      title: "Know your brand",
      purpose: "Your agent is combining your answers",
      greeting: "You’re all caught up",
      copy: "I’m doing the research and writing now. You can leave this page.",
      status: "Working in background",
    },
    timeline: [
      {
        icon: "brain-circuit",
        title: "Building your voice guide",
        description: "Combining tone, examples and audience fit",
        time: "Now",
      },
      {
        icon: "archive",
        title: "Saved your answers",
        description: "Nothing will be lost if you leave",
        time: "1m",
      },
    ],
    badge: {
      icon: "brain-circuit",
      text: "Working for you",
      timeLabel: "Usually under 2 minutes",
    },
    kicker: "In progress",
    heading: "Building your brand foundation",
    subheading:
      "I’m turning your answers and market research into something useful—not just a chat transcript.",
    actions: [],
  },

  review: {
    meta: {
      scene: "review",
      phase: 1,
      percent: 95,
      title: "Know your brand",
      purpose: "Review what your agent learned",
      greeting: "Your brand foundation is ready",
      copy: "Check the summary—not the process. Approve it or tell me what to fix.",
      status: "Waiting for you",
    },
    timeline: [
      {
        icon: "file-check-2",
        title: "Created Brand Voice v1",
        description: "Saved as a reviewable delivery",
        time: "Now",
      },
      {
        icon: "users-round",
        title: "Created Audience Blueprint v1",
        description: "3 priority audience segments",
        time: "Now",
      },
    ],
    badge: {
      icon: "clipboard-check",
      text: "Approval needed",
      timeLabel: "Version 1",
    },
    kicker: "Here’s what I learned",
    heading: "Does this sound like Novi Studio?",
    subheading:
      "Review the meaning. I’ll manage the underlying files and keep the history.",
    actions: [
      {
        action: "fix",
        label: "Ask for changes",
        variant: "secondary",
        icon: "message-square-text",
      },
      {
        action: "approve",
        label: "Approve and continue",
        variant: "success",
        icon: "check",
      },
    ],
    payload: {
      reviewRunId: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
      reviewRevision: 1,
      brandFoundation: {
        kind: "brand_foundation",
        version: 1,
        brandName: "Novi Studio",
        voiceTone: ["Trusted expert", "Clear", "Warm and specific"],
        pillars: ["Authority", "Proof", "Value", "Opinion", "Trust"],
        targetAudience:
          "Service founders with a strong offer but an inconsistent visual presence.",
        positioningSummary:
          "A practical design studio that helps growing founders look established without losing personality.",
      },
    },
  },

  approved: {
    meta: {
      scene: "approved",
      phase: 2,
      percent: 3,
      title: "Plan the month",
      purpose: "Turn your brand into a focused strategy",
      greeting: "Brand foundation approved",
      copy: "It’s saved to Brand and Library. I’ve already prepared the next step.",
      status: "Moving to strategy",
    },
    timeline: [
      {
        icon: "badge-check",
        title: "Brand foundation approved",
        description: "Canonical brand context updated",
        time: "Now",
      },
      {
        icon: "route",
        title: "Strategy phase unlocked",
        description: "Preparing content directions",
        time: "Now",
      },
    ],
    badge: {
      icon: "route",
      text: "Phase 2 is ready",
      timeLabel: "Strategy",
    },
    kicker: "Next best action",
    heading: "What is the most important business result for this month?",
    subheading:
      "I’ll use your answer to choose content topics, calls to action and the weekly mix.",
    actions: [
      {
        action: "view-brand",
        label: "View saved brand",
        variant: "ghost",
      },
      {
        action: "calendar",
        label: "Plan my month",
        variant: "primary",
        icon: "arrow-right",
      },
    ],
  },

  calendar: {
    meta: {
      scene: "calendar",
      phase: 2,
      percent: 84,
      title: "Plan the month",
      purpose: "Review a simple week before content is written",
      greeting: "Next week is planned",
      copy: "Five focused ideas, matched to the right platform and purpose.",
      status: "Calendar ready",
    },
    timeline: [
      {
        icon: "calendar-check-2",
        title: "Built next week’s calendar",
        description: "5 days · 8 platform-native posts",
        time: "Now",
      },
      {
        icon: "target",
        title: "Balanced the content mix",
        description: "Authority, trust and conversion",
        time: "1m",
      },
    ],
    badge: {
      icon: "calendar-days",
      text: "Week 1 · June 10–14",
      timeLabel: "8 posts",
    },
    kicker: "Strategy translated into action",
    heading: "A simple week built around qualified enquiries",
    subheading:
      "Each day has one job. Approve the direction and I’ll write every platform version.",
    actions: [
      {
        action: "adjust",
        label: "Adjust the plan",
        variant: "secondary",
        icon: "message-square-text",
      },
      {
        action: "produce",
        label: "Approve and create posts",
        variant: "success",
        icon: "check",
      },
    ],
    payload: {
      reviewRunId: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
      reviewRevision: 1,
      calendar: {
        kind: "content_calendar",
        version: 1,
        sprint: "Sprint 1",
        week: 1,
        totalPosts: 8,
        schedule: [
          {
            day: "MON",
            platform: "linkedin",
            topic: "The expensive rebrand mistake",
            format: "Authority",
          },
          {
            day: "TUE",
            platform: "instagram",
            topic: "Before-and-after teardown",
            format: "Proof",
          },
          {
            day: "WED",
            platform: "twitter",
            topic: "A founder’s brand checklist",
            format: "Value",
          },
          {
            day: "THU",
            platform: "linkedin",
            topic: "Why “professional” feels generic",
            format: "Opinion",
          },
          {
            day: "FRI",
            platform: "instagram",
            topic: "Studio notes: what worked",
            format: "Trust",
          },
        ],
      },
    },
  },

  production: {
    meta: {
      scene: "production",
      phase: 3,
      percent: 56,
      title: "Create posts",
      purpose: "Your agent writes every platform-native draft",
      greeting: "Your content is being created",
      copy: "I’m drafting, adapting and checking each post automatically.",
      status: "4 of 7 posts ready",
    },
    timeline: [
      {
        icon: "pen-tool",
        title: "Drafted Monday posts",
        description: "LinkedIn and X completed",
        time: "Now",
      },
      {
        icon: "list-checks",
        title: "Quality check passed",
        description: "Voice, clarity and CTA verified",
        time: "1m",
      },
    ],
    badge: {
      icon: "wand-sparkles",
      text: "Creating your posts",
      timeLabel: "4 of 7 complete",
    },
    kicker: "Autopilot production",
    heading: "I’m adapting each idea to its platform.",
    subheading:
      "The approved brand voice and calendar are pinned to every draft. You only review the finished batch.",
    actions: [
      {
        action: "posts",
        label: "Preview completed posts",
        variant: "secondary",
      },
    ],
    payload: {
      production: {
        kind: "post_batch",
        version: 1,
        batchCount: 7,
        platforms: ["linkedin", "twitter", "instagram"],
        previewTitles: [
          "Monday · LinkedIn: Long-form authority post",
          "Monday · X: Concise contrarian version",
          "Tuesday · Instagram: Carousel caption and slides",
          "Thursday · LinkedIn: Founder opinion post",
          "Friday · Instagram: Behind-the-scenes story",
        ],
      },
    },
  },

  posts: {
    meta: {
      scene: "posts",
      phase: 5,
      percent: 100,
      title: "Multiply reach",
      purpose: "Copy, publish or browse every finished post",
      greeting: "Your final posts are ready",
      copy: "Everything is grouped by day, but the fastest posts are shown first.",
      status: "12 posts approved",
    },
    timeline: [
      {
        icon: "badge-check",
        title: "Final batch approved",
        description: "12 posts ready to publish",
        time: "Now",
      },
      {
        icon: "copy-check",
        title: "Platform versions prepared",
        description: "LinkedIn, X and Instagram",
        time: "2m",
      },
    ],
    badge: {
      icon: "send",
      text: "Ready to publish",
      timeLabel: "Week 1 · 12 posts",
    },
    kicker: "Fast view",
    heading: "Copy the next post without opening folders.",
    subheading:
      "Use Library when you want the full week → day → platform structure and revision history.",
    actions: [
      {
        action: "library",
        label: "Browse all 12 in Library",
        variant: "secondary",
        icon: "library",
      },
      {
        action: "mark-complete",
        label: "Mark today complete",
        variant: "success",
        icon: "check",
      },
    ],
    payload: {
      posts: [
        {
          id: "3c3d3e3f-4a4b-4c4d-8e8f-0a0b0c0d0e0f",
          workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
          run_id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
          source_artifact_id: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
          logical_id: "c3d4e5f6-a1b2-4c3d-8e4f-5a6b7c8d9e0f",
          revision: 1,
          logical_key: "sprint-1.week-1.day-1.linkedin",
          sprint: "Sprint 1",
          week: 1,
          local_date: "2026-10-12",
          timezone: "UTC",
          platform: "linkedin",
          campaign: "Launch",
          topic: "Rebrand Reality",
          pillar: "Authority",
          content_format: "post",
          title: "Monday · LinkedIn: Authority",
          content:
            "A rebrand should not begin with a logo. It should begin with the sentence your best customer uses when they finally understand why you are different...",
          status: "approved",
          publication_status: "ready",
        },
        {
          id: "4d4e4f5a-5b5c-5d5e-9f9a-1b1c1d1e1f10",
          workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
          run_id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
          source_artifact_id: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
          logical_id: "d4e5f6a1-b2c3-4d4e-9f9a-1b1c1d1e1f10",
          revision: 1,
          logical_key: "sprint-1.week-1.day-1.twitter",
          sprint: "Sprint 1",
          week: 1,
          local_date: "2026-10-12",
          timezone: "UTC",
          platform: "twitter",
          campaign: "Launch",
          topic: "Rebrand Reality",
          pillar: "Authority",
          content_format: "post",
          title: "Monday · X: Authority",
          content:
            "The most expensive rebrand mistake? Making the business look different before making the value feel obvious.",
          status: "approved",
          publication_status: "ready",
        },
      ],
    },
  },

  qc: {
    meta: {
      scene: "qc",
      phase: 4,
      percent: 90,
      title: "Polish quality",
      purpose: "Review automated compliance and quality scorecard",
      greeting: "Quality review ready",
      copy: "Check the automated quality scorecard and approve or adjust.",
      status: "Quality review",
    },
    timeline: [
      {
        icon: "shield-check",
        title: "Quality scorecard compiled",
        description: "8 checks passed · 0 warnings",
        time: "Now",
      },
    ],
    badge: {
      icon: "shield-check",
      text: "Quality review",
    },
    kicker: "Phase 4 · Quality review",
    heading: "Your content quality & compliance scorecard is ready.",
    subheading:
      "Review automated compliance scores, formatting validations, and brand voice rules before distribution.",
    actions: [
      {
        action: "approve",
        label: "Approve scorecard & continue",
        variant: "success",
        icon: "check",
      },
      {
        action: "revise",
        label: "Ask for changes",
        variant: "secondary",
        icon: "message-square-text",
      },
    ],
    payload: {
      reviewRunId: "e4f5a6b7-c8d9-4e5f-8a9b-0c1d2e3f4a5b",
      reviewRevision: 1,
      qcScorecard: {
        kind: "qc_scorecard",
        version: 1,
        passedCount: 8,
        failedCount: 0,
        warnings: [],
        recommendations: [
          "Ensure link in pinned comment matches target URL",
        ],
      },
    },
  },

  cycle_complete: {
    meta: {
      scene: "cycle_complete",
      phase: 6,
      percent: 100,
      title: "Learn & improve",
      purpose: "Review analytics learnings and start next monthly cycle",
      greeting: "Monthly cycle complete",
      copy: "Performance signals recorded. Ready for the next strategic cycle.",
      status: "Cycle 1 complete",
    },
    timeline: [
      {
        icon: "refresh-cw",
        title: "Cycle 1 complete",
        description: "Performance indexed into canonical memory",
        time: "Now",
      },
    ],
    badge: {
      icon: "refresh-cw",
      text: "Cycle 1 complete",
    },
    kicker: "Phase 6 · Continuous improvement",
    heading: "Cycle 1 complete. Ready for Cycle 2 strategy.",
    subheading:
      "Performance signals, audience insights, and top-performing angles have been indexed into canonical brand memory.",
    actions: [
      {
        action: "continue",
        label: "Start Cycle 2 strategy",
        variant: "primary",
        icon: "arrow-right",
      },
    ],
    payload: {
      cycle: 1,
    },
  },
};
