import { z } from "zod";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const workspaceSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  organization_id: z.string().regex(UUID_REGEX).optional(),
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  current_phase: z.number().int().min(1).max(6),
  status: z.string(),
  version: z.number().int().nonnegative(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const workspacePageSchema = z.object({
  workspaces: z.array(workspaceSchema),
  nextCursor: z.string().nullable().optional(),
});

export const contextItemSchema = z.object({
  key: z.string(),
  markdown: z.string().nullable().optional(),
  data: z.unknown().nullable().optional(),
  version: z.number().int().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const contextPageSchema = z.object({
  context: z.array(contextItemSchema),
  nextCursor: z.string().nullable().optional(),
});

export const contextUpdateSchema = z.object({
  key: z.string(),
  markdown: z.string(),
  data: z.record(z.string(), z.unknown()),
});

export const approvalSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  run_id: z.string().regex(UUID_REGEX),
  gate: z.string(),
  status: z.string(),
  requested_at: z.string().optional(),
  decided_at: z.string().nullable().optional(),
  decided_by: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const artifactSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  workspace_id: z.string().regex(UUID_REGEX),
  run_id: z.string().regex(UUID_REGEX),
  kind: z.string(),
  slug: z.string(),
  title: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  version: z.number().int(),
  status: z.string().optional(),
  logical_id: z.string().regex(UUID_REGEX).nullable().optional(),
  parent_revision_id: z.string().regex(UUID_REGEX).nullable().optional(),
  revision_instructions: z.string().nullable().optional(),
  created_by: z.string().optional(),
  decided_by: z.string().nullable().optional(),
  decided_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const artifactPageSchema = z.object({
  items: z.array(artifactSchema),
  nextCursor: z.string().nullable(),
});

export const finalPostSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  workspace_id: z.string().regex(UUID_REGEX),
  run_id: z.string().regex(UUID_REGEX),
  source_artifact_id: z.string().regex(UUID_REGEX).nullable().optional(),
  logical_id: z.string().regex(UUID_REGEX),
  parent_revision_id: z.string().regex(UUID_REGEX).nullable().optional(),
  revision: z.number().int(),
  logical_key: z.string(),
  sprint: z.string(),
  week: z.number().int(),
  local_date: z.string(),
  day_of_week: z.number().int().optional(),
  timezone: z.string(),
  platform: z.string(),
  campaign: z.string().nullable().optional(),
  topic: z.string(),
  pillar: z.string().nullable().optional(),
  content_format: z.string(),
  title: z.string(),
  content: z.string(),
  pinned_comment: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.string(),
  publication_status: z.string(),
  publication_version: z.number().int().positive().optional(),
  revision_instructions: z.string().nullable().optional(),
  created_by: z.string().optional(),
  decided_by: z.string().nullable().optional(),
  decided_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export const groupedPostDaySchema = z.object({
  date: z.string(),
  posts: z.array(finalPostSchema),
});

export const groupedPostWeekSchema = z.object({
  week: z.number().int(),
  days: z.array(groupedPostDaySchema),
});

export const groupedPostSprintSchema = z.object({
  sprint: z.string(),
  weeks: z.array(groupedPostWeekSchema),
});

export const finalPostPageSchema = z.object({
  items: z.array(finalPostSchema),
  nextCursor: z.string().nullable(),
  groups: z.array(groupedPostSprintSchema).optional(),
});

export const questionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
});

export const pendingQuestionSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  workspace_id: z.string().regex(UUID_REGEX),
  workflow_instance_id: z.string().regex(UUID_REGEX),
  phase_instance_id: z.string().regex(UUID_REGEX),
  orchestration_step_id: z.string().regex(UUID_REGEX).nullable().optional(),
  question_key: z.string(),
  prompt: z.string(),
  purpose: z.string(),
  options: z.array(questionOptionSchema),
  allow_custom: z.boolean(),
  selection_mode: z.enum(["single", "multiple"]).default("single"),
  status: z.enum(["pending", "answered", "cancelled", "superseded"]),
  version: z.number().int().positive(),
  created_at: z.string().optional(),
  answered_at: z.string().nullable().optional(),
  updated_at: z.string().optional(),
});

export const workflowStateSchema = z.object({
  workflowId: z.string().regex(UUID_REGEX),
  workflowStatus: z.enum(["active", "paused", "completed", "archived"]),
  workflowVersion: z.number().int().nonnegative(),
  recipeVersion: z.string(),
  phaseInstanceId: z.string().regex(UUID_REGEX),
  phase: z.number().int().min(1).max(6),
  cycle: z.number().int().positive(),
  phaseStatus: z.enum(["active", "completed", "failed", "cancelled"]),
  conversationId: z.string().regex(UUID_REGEX),
  pendingQuestion: pendingQuestionSchema.nullable(),
  activeRun: z.object({
    id: z.string().regex(UUID_REGEX),
    status: z.enum(["queued", "running", "waiting_approval"]),
    phase: z.number().int().min(1).max(6),
    updated_at: z.string().or(z.date()),
  }).nullable().optional(),
  contentPlan: z.object({
    total: z.number().int().nonnegative(),
    drafted: z.number().int().nonnegative(),
    slots: z.array(z.object({
      key: z.string(),
      localDate: z.string(),
      platform: z.string(),
      topic: z.string(),
      format: z.string(),
      drafted: z.boolean(),
    })),
  }).optional(),
});

export const answerChoiceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("option"),
    optionId: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal("custom"),
    text: z.string().trim().min(1).max(10_000),
  }),
  z.object({
    type: z.literal("multiple"),
    optionIds: z.array(z.string().min(1).max(80)).max(20),
    text: z.string().trim().min(1).max(10_000).optional(),
  }),
]);

export const answerQuestionPayloadSchema = z.object({
  expectedVersion: z.number().int().positive(),
  answer: answerChoiceSchema,
  idempotencyKey: z.string().min(1).max(200),
});

export const answerQuestionResponseSchema = z.object({
  answer: z.object({
    answerId: z.string(),
    messageId: z.string().optional(),
    questionId: z.string(),
    questionVersion: z.number().int(),
    replayed: z.boolean(),
  }),
  run: z.object({
    id: z.string().regex(UUID_REGEX),
    status: z.string(),
    phase: z.number().int().min(1).max(6),
  }),
});

export const continuePayloadSchema = z.object({
  idempotencyKey: z.string().min(1).max(200),
});

export const continueResponseSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  status: z.string(),
  phase: z.number().int().min(1).max(6),
});

export const revisionPayloadSchema = z.object({
  expectedReviewRevision: z.number().int().positive(),
  instructions: z.string().trim().min(1).max(10_000),
  idempotencyKey: z.string().min(1).max(200),
});

export const revisionResponseSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  status: z.string(),
  phase: z.number().int().min(1).max(6),
  reviewThreadId: z.string().regex(UUID_REGEX),
  reviewRevision: z.number().int().positive(),
  supersedesRunId: z.string().regex(UUID_REGEX),
});

export const runOutputSchema = z.object({
  message: z.string(),
  artifacts: z.array(z.unknown()),
  context_updates: z.array(contextUpdateSchema),
  next_action: z.enum([
    "none",
    "request_user_input",
    "request_approval",
    "continue_phase",
  ]),
});

export const runSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  workspace_id: z.string().regex(UUID_REGEX),
  phase: z.number().int().min(1).max(6),
  skill_name: z.string(),
  status: z.string(),
  progress_stage: z.string().optional(),
  output_status: z.string().nullable().optional(),
  complete_phase: z.boolean().optional(),
  input: z.unknown().optional(),
  output: runOutputSchema.nullable().optional(),
  review_thread_id: z.string().regex(UUID_REGEX).nullable().optional(),
  review_revision: z.number().int().positive().nullable().optional(),
  supersedes_run_id: z.string().regex(UUID_REGEX).nullable().optional(),
  revision_instructions: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  output_decided_at: z.string().nullable().optional(),
  output_decided_by: z.string().nullable().optional(),
  output_decision_note: z.string().nullable().optional(),
  idempotency_key: z.string().optional(),
  approvals: z.array(approvalSchema).default([]),
  artifacts: z.array(artifactSchema).default([]),
  final_posts: z.array(finalPostSchema).default([]),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const obsidianJobSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  status: z.enum(["queued", "running", "completed", "failed", "dead"]),
  workspace_id: z.string().regex(UUID_REGEX).optional(),
  attempts: z.number().int().nonnegative().optional(),
  max_attempts: z.number().int().positive().optional(),
  last_error: z.string().optional(),
  created_at: z.string().or(z.date()).optional(),
  completed_at: z.string().or(z.date()).nullable().optional(),
});

export const obsidianJobPageSchema = z.object({
  items: z.array(obsidianJobSchema),
  nextCursor: z.string().nullable(),
});

export const runSummarySchema = z.object({
  id: z.string().regex(UUID_REGEX),
  workspace_id: z.string().regex(UUID_REGEX),
  phase: z.number().int().min(1).max(6),
  skill_name: z.string(),
  status: z.string(),
  output_status: z.string().nullable().optional(),
  review_thread_id: z.string().regex(UUID_REGEX),
  review_revision: z.number().int().positive(),
  supersedes_run_id: z.string().regex(UUID_REGEX).nullable().optional(),
  error_code: z.string().nullable().optional(),
  created_at: z.string().or(z.date()),
  started_at: z.string().or(z.date()).nullable().optional(),
  completed_at: z.string().or(z.date()).nullable().optional(),
  updated_at: z.string().or(z.date()),
});

export const runSummaryPageSchema = z.object({
  items: z.array(runSummarySchema),
  nextCursor: z.string().nullable(),
});

export const activityItemSchema = z.object({
  id: z.string(),
  workspace_id: z.string().regex(UUID_REGEX).nullable(),
  actor: z.string(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  created_at: z.string().or(z.date()),
});

export const activityPageSchema = z.object({
  items: z.array(activityItemSchema),
  nextCursor: z.string().nullable(),
});

export const contextRevisionSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  workspace_id: z.string().regex(UUID_REGEX),
  key: z.string(),
  revision: z.number().int().positive(),
  markdown: z.string(),
  data: z.record(z.string(), z.unknown()),
  source: z.string(),
  status: z.enum(["proposed", "approved", "rejected", "superseded"]),
  parent_revision_id: z.string().regex(UUID_REGEX).nullable(),
  created_by: z.string(),
  decided_by: z.string().nullable(),
  decision_note: z.string().nullable(),
  created_at: z.string().or(z.date()),
  decided_at: z.string().or(z.date()).nullable(),
});

export const contextRevisionPageSchema = z.object({
  items: z.array(contextRevisionSchema),
  nextCursor: z.string().nullable(),
});

export const accountPreferencesSchema = z.object({
  organization_id: z.string().regex(UUID_REGEX),
  user_id: z.string().regex(UUID_REGEX),
  timezone: z.string(),
  theme: z.enum(["dark", "light", "system"]),
  email_notifications: z.boolean(),
  autopilot_enabled: z.boolean(),
  review_reminders_enabled: z.boolean(),
  version: z.number().int().positive(),
  created_at: z.string().or(z.date()),
  updated_at: z.string().or(z.date()),
});

export const publicationResultSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  workspace_id: z.string().regex(UUID_REGEX),
  publication_status: z.enum(["not_scheduled", "scheduled", "published", "failed", "cancelled"]),
  publication_version: z.number().int().positive(),
});

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  email: z.email(),
  emailVerified: z.boolean().default(false),
  image: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()).optional(),
  updatedAt: z.string().or(z.date()).optional(),
});

export const authSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: z.string().or(z.date()),
  token: z.string(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()).optional(),
  updatedAt: z.string().or(z.date()).optional(),
});

export const authSessionStateSchema = z.object({
  user: authUserSchema.nullable(),
  session: authSessionSchema.nullable(),
});

export const userPreferencesSchema = z.object({
  timezone: z.string().default("UTC"),
  theme: z.enum(["dark", "light", "system"]).default("dark"),
  emailNotifications: z.boolean().default(false),
  autopilotEnabled: z.boolean().default(true),
  reviewRemindersEnabled: z.boolean().default(true),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

// Structured view presentation contracts (FE-AUD-002)
export const brandFoundationPresentationSchema = z.object({
  kind: z.literal("brand_foundation"),
  version: z.number().int().default(1),
  brandName: z.string(),
  voiceTone: z.array(z.string()),
  pillars: z.array(z.string()),
  targetAudience: z.string(),
  positioningSummary: z.string(),
});

export const contentCalendarPresentationSchema = z.object({
  kind: z.literal("content_calendar"),
  version: z.number().int().default(1),
  sprint: z.string(),
  week: z.number().int(),
  totalPosts: z.number().int(),
  schedule: z.array(
    z.object({
      day: z.string(),
      platform: z.string(),
      topic: z.string(),
      format: z.string(),
    }),
  ),
});

export const postBatchPresentationSchema = z.object({
  kind: z.literal("post_batch"),
  version: z.number().int().default(1),
  batchCount: z.number().int(),
  platforms: z.array(z.string()),
  previewTitles: z.array(z.string()),
});

export const qcScorecardPresentationSchema = z.object({
  kind: z.literal("qc_scorecard"),
  version: z.number().int().default(1),
  passedCount: z.number().int(),
  failedCount: z.number().int(),
  warnings: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export const fallbackMarkdownPresentationSchema = z.object({
  kind: z.literal("markdown_prose"),
  version: z.number().int().default(1),
  content: z.string(),
});

export const structuredPresentationDataSchema = z.discriminatedUnion("kind", [
  brandFoundationPresentationSchema,
  contentCalendarPresentationSchema,
  postBatchPresentationSchema,
  qcScorecardPresentationSchema,
  fallbackMarkdownPresentationSchema,
]);

export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspacePage = z.infer<typeof workspacePageSchema>;
export type ContextItem = z.infer<typeof contextItemSchema>;
export type ContextPage = z.infer<typeof contextPageSchema>;
export type ContextUpdate = z.infer<typeof contextUpdateSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type ArtifactPage = z.infer<typeof artifactPageSchema>;
export type FinalPost = z.infer<typeof finalPostSchema>;
export type GroupedPostDay = z.infer<typeof groupedPostDaySchema>;
export type GroupedPostWeek = z.infer<typeof groupedPostWeekSchema>;
export type GroupedPostSprint = z.infer<typeof groupedPostSprintSchema>;
export type FinalPostPage = z.infer<typeof finalPostPageSchema>;
export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type PendingQuestion = z.infer<typeof pendingQuestionSchema>;
export type WorkflowState = z.infer<typeof workflowStateSchema>;
export type AnswerChoice = z.infer<typeof answerChoiceSchema>;
export type AnswerQuestionPayload = z.infer<typeof answerQuestionPayloadSchema>;
export type AnswerQuestionResponse = z.infer<typeof answerQuestionResponseSchema>;
export type ContinuePayload = z.infer<typeof continuePayloadSchema>;
export type ContinueResponse = z.infer<typeof continueResponseSchema>;
export type RevisionPayload = z.infer<typeof revisionPayloadSchema>;
export type RevisionResponse = z.infer<typeof revisionResponseSchema>;
export type RunOutput = z.infer<typeof runOutputSchema>;
export type Run = z.infer<typeof runSchema>;
export type ObsidianJob = z.infer<typeof obsidianJobSchema>;
export type ObsidianJobPage = z.infer<typeof obsidianJobPageSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type RunSummaryPage = z.infer<typeof runSummaryPageSchema>;
export type ActivityItem = z.infer<typeof activityItemSchema>;
export type ActivityPage = z.infer<typeof activityPageSchema>;
export type ContextRevision = z.infer<typeof contextRevisionSchema>;
export type ContextRevisionPage = z.infer<typeof contextRevisionPageSchema>;
export type AccountPreferences = z.infer<typeof accountPreferencesSchema>;
export type PublicationResult = z.infer<typeof publicationResultSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthSessionState = z.infer<typeof authSessionStateSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorSchema>;
export type BrandFoundationPresentation = z.infer<
  typeof brandFoundationPresentationSchema
>;
export type ContentCalendarPresentation = z.infer<
  typeof contentCalendarPresentationSchema
>;
export type PostBatchPresentation = z.infer<
  typeof postBatchPresentationSchema
>;
export type QcScorecardPresentation = z.infer<
  typeof qcScorecardPresentationSchema
>;
export type FallbackMarkdownPresentation = z.infer<
  typeof fallbackMarkdownPresentationSchema
>;
export type StructuredPresentationData = z.infer<
  typeof structuredPresentationDataSchema
>;

// --- M9 Guided Brand Intake & Run Progress Contracts ---

export const curatedOptionSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(240),
  description: z.string().max(1000).optional(),
  requiresCustomText: z.boolean().optional(),
});

export const branchConditionSchema = z.object({
  questionId: z.string().min(1).max(120),
  selectedOptionIds: z.array(z.string().min(1).max(120)),
});

export const interviewQuestionSchema = z.object({
  id: z.string().min(1).max(120),
  version: z.number().int().positive(),
  meaning: z.string().min(1).max(1000),
  prompt: z.string().min(1).max(500),
  supportingText: z.string().max(1000),
  examples: z.array(z.string().max(500)),
  answerMode: z.enum([
    "single",
    "multiple",
    "single_with_text",
    "multiple_with_text",
  ]),
  required: z.boolean(),
  allowCustom: z.boolean(),
  customTextRequired: z.boolean(),
  minimumSelections: z.number().int().nonnegative(),
  maximumSelections: z.number().int().positive(),
  allowSelectAll: z.boolean().default(false),
  fallbackOptions: z.array(curatedOptionSchema),
  when: branchConditionSchema.optional(),
});

export const interviewSessionSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  workspace_id: z.string().regex(UUID_REGEX),
  questionnaire_id: z.string().min(1).max(120),
  questionnaire_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  status: z.enum(["in_progress", "completed"]),
  current_question_id: z.string().nullable().optional(),
  current_question_version: z.number().int().positive().nullable().optional(),
  version: z.number().int().positive(),
  started_at: z.string().or(z.date()),
  completed_at: z.string().or(z.date()).nullable().optional(),
  updated_at: z.string().or(z.date()),
});

export const selectedOptionSummarySchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(240),
  description: z.string().max(1000).optional(),
});

export const interviewAnswerSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  session_id: z.string().regex(UUID_REGEX),
  question_id: z.string().min(1).max(120),
  question_version: z.number().int().positive(),
  option_set_id: z.string().regex(UUID_REGEX).nullable().optional(),
  selected_option_ids: z.array(z.string().min(1).max(120)),
  selected_options: z.array(selectedOptionSummarySchema),
  custom_text: z.string().nullable().optional(),
  answer_source: z.enum(["option", "custom", "combined"]),
  status: z.enum(["active", "superseded"]),
  created_at: z.string().or(z.date()),
});

export const activeOptionSetSchema = z.object({
  id: z.string().min(1),
  origin: z.enum(["curated", "assistant"]).optional(),
  options: z.array(curatedOptionSchema),
});

export const interviewProgressSchema = z.object({
  currentIndex: z.number().int().nonnegative(),
  totalQuestions: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  percentComplete: z.number().int().min(0).max(100),
});

export const questionPresentationSchema = z.object({
  id: z.string().min(1).max(120),
  version: z.number().int().positive(),
  meaning: z.string().min(1).max(1000),
  prompt: z.string().min(1).max(500),
  supportingText: z.string().max(1000),
  examples: z.array(z.string().max(500)),
  answerMode: z.enum([
    "single",
    "multiple",
    "single_with_text",
    "multiple_with_text",
  ]),
  required: z.boolean(),
  allowCustom: z.boolean(),
  customTextRequired: z.boolean(),
  minimumSelections: z.number().int().nonnegative(),
  maximumSelections: z.number().int().positive(),
  allowSelectAll: z.boolean().default(false),
  activeOptionSet: activeOptionSetSchema,
});

export const guidedInterviewStateSchema = z.object({
  authority: z.literal("guided"),
  session: interviewSessionSchema,
  status: z.enum(["in_progress", "completed"]).optional(),
  progress: interviewProgressSchema.optional(),
  currentQuestion: questionPresentationSchema.nullable(),
  intakePacket: z.unknown().nullable().optional(),
  currentOptions: z.array(curatedOptionSchema).optional(),
  currentOptionSetId: z.string().nullable().optional(),
  previousAnswer: interviewAnswerSchema.nullable().optional(),
  isComplete: z.boolean().optional(),
});

export const legacyInterviewStateSchema = z.object({
  authority: z.literal("legacy"),
  session: z.null(),
  resumed: z.boolean(),
});

export const interviewStateSchema = z.discriminatedUnion("authority", [
  guidedInterviewStateSchema,
  legacyInterviewStateSchema,
]);

export const submitGuidedAnswerBodySchema = z.object({
  sessionId: z.string().regex(UUID_REGEX),
  expectedSessionVersion: z.number().int().positive(),
  questionId: z.string().min(1).max(120),
  questionVersion: z.number().int().positive(),
  optionSetId: z.string().min(1),
  selectedOptionIds: z.array(z.string().min(1).max(120)).default([]),
  customText: z.string().trim().min(1).max(10000).optional(),
  answerSource: z.enum(["option", "custom", "combined"]).optional(),
  idempotencyKey: z.string().min(1).max(200),
});

export const submitGuidedAnswerResponseSchema = z.object({
  answer: interviewAnswerSchema,
  sessionVersion: z.number().int().positive(),
  replayed: z.boolean(),
  state: interviewStateSchema,
});

export const interviewOptionSetResponseSchema = z.object({
  optionSetId: z.string().regex(UUID_REGEX),
  questionId: z.string().min(1).max(120),
  questionVersion: z.number().int().positive(),
  options: z.array(curatedOptionSchema),
  isFallback: z.boolean(),
});

export const runProgressEventSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]*$/),
  runId: z.string().regex(UUID_REGEX),
  workspaceId: z.string().regex(UUID_REGEX),
  phase: z.number().int().min(1).max(6),
  skillName: z.string(),
  stage: z.enum([
    "queued",
    "loading_context",
    "generating",
    "validating",
    "ready",
    "waiting_approval",
    "waiting_input",
    "failed",
    "cancelled",
  ]),
  occurredAt: z.string(),
});

export const contentCycleResponseSchema = z.object({
  mode: z.enum(["next_week", "extra_posts", "refresh_strategy"]),
  phase: z.number().int().min(2).max(3),
  cycle: z.number().int().positive(),
  week: z.number().int().positive(),
  run: z.object({
    id: z.string().regex(UUID_REGEX),
    status: z.string(),
    phase: z.number().int().min(2).max(3),
  }),
});

export type ContentCycleResponse = z.infer<typeof contentCycleResponseSchema>;

export type CuratedOption = z.infer<typeof curatedOptionSchema>;
export type ActiveOptionSet = z.infer<typeof activeOptionSetSchema>;
export type InterviewProgress = z.infer<typeof interviewProgressSchema>;
export type QuestionPresentation = z.infer<typeof questionPresentationSchema>;
export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>;
export type InterviewSession = z.infer<typeof interviewSessionSchema>;
export type InterviewAnswer = z.infer<typeof interviewAnswerSchema>;
export type GuidedInterviewState = z.infer<typeof guidedInterviewStateSchema>;
export type InterviewState = z.infer<typeof interviewStateSchema>;
export type SubmitGuidedAnswerBody = z.infer<typeof submitGuidedAnswerBodySchema>;
export type SubmitGuidedAnswerResponse = z.infer<
  typeof submitGuidedAnswerResponseSchema
>;
export type InterviewOptionSetResponse = z.infer<
  typeof interviewOptionSetResponseSchema
>;
export type RunProgressEvent = z.infer<typeof runProgressEventSchema>;
