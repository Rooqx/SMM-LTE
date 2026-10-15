import { z } from "zod";

const BoundedMetadataSchema = z.record(z.string(), z.unknown()).refine(
  (value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= 100_000,
  "Metadata exceeds 100 KB",
);

export const ArtifactDraftSchema = z.object({
  kind: z.string().min(1).max(80),
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(240),
  content: z.string().max(50_000),
  metadata: BoundedMetadataSchema,
}).strict();

const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day;
}, "Date must be a real ISO calendar date");

/**
 * Copy-ready social content is structured separately from its review artifact.
 * The runtime owns status, timezone, attribution, and revision lineage.
 */
export const FinalPostDraftSchema = z.object({
  logicalKey: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,159}$/),
  sprint: z.string().min(1).max(120),
  week: z.number().int().min(1).max(53),
  localDate: LocalDateSchema,
  platform: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,39}$/),
  campaign: z.string().max(200).nullable().default(null),
  topic: z.string().min(1).max(240),
  pillar: z.string().max(160).nullable().default(null),
  format: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,79}$/),
  title: z.string().min(1).max(240),
  content: z.string().max(50_000),
  pinnedComment: z.string().max(10_000).nullable().default(null),
  metadata: BoundedMetadataSchema.default({}),
}).strict();

export type FinalPostDraft = z.infer<typeof FinalPostDraftSchema>;

function normalizeContextKey(rawKey: string): string {
  const normalized = rawKey.trim().toLowerCase();
  if (normalized === "about-me.md" || normalized === "about-me" || normalized === "aboutme") {
    return "brand.audience";
  }
  if (normalized === "voice.md" || normalized === "voice") {
    return "brand.voice";
  }
  if (normalized === "positioning.md" || normalized === "positioning") {
    return "brand.positioning";
  }
  if (normalized.startsWith(".agents/brand/")) {
    return normalized.replace(".agents/brand/", "brand.").replace(/\.md$/, "");
  }
  if (normalized.startsWith(".agents/strategy/")) {
    return normalized.replace(".agents/strategy/", "strategy.").replace(/\.md$/, "");
  }
  if (normalized.startsWith(".agents/calendar/")) {
    return normalized.replace(".agents/calendar/", "calendar.").replace(/\.md$/, "");
  }
  if (!normalized.includes(".")) {
    const matched = /^(brand|strategy|calendar|social|analytics)[_/-]([a-z0-9_.-]+)$/.exec(normalized);
    if (matched?.[1] && matched[2]) return `${matched[1]}.${matched[2]}`;
  }
  return normalized;
}

export const ContextUpdateSchema = z.object({
  key: z
    .string()
    .transform(normalizeContextKey)
    .pipe(z.string().regex(/^(brand|strategy|calendar|social|analytics)\.[a-z0-9_.-]+$/)),
  markdown: z.string().max(50_000).default(""),
  data: z.record(z.string(), z.unknown()).default({}),
}).strict();

const QuestionOptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,79}$/),
  label: z.string().min(1).max(240),
  description: z.string().max(1_000).default(""),
}).strict();

/**
 * The model may propose only one explicit action per call. The runtime still
 * validates phase/step permissions and owns every state change or tool call.
 */
export const LlmActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ask_user"),
    questionKey: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,119}$/),
    prompt: z.string().min(1).max(10_000),
    purpose: z.string().max(2_000).default(""),
    options: z.array(QuestionOptionSchema).min(2).max(4),
    selectionMode: z.enum(["single", "multiple"]),
    // Product questions always preserve the user's own-answer escape hatch.
    allowCustom: z.literal(true),
  }).strict(),
  z.object({
    type: z.literal("request_tool"),
    tool: z.literal("list_approved_artifacts"),
    arguments: z.object({
      limit: z.number().int().min(1).max(60),
      kinds: z.array(z.string().min(1).max(80)).max(10),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal("request_optional_skill"),
    skill: z.string().regex(/^[a-z0-9-]{1,64}$/),
    input: z.object({ instruction: z.string().min(1).max(10_000) }).strict(),
  }).strict(),
  z.object({
    type: z.literal("propose_output"),
    message: z.string().min(1).max(10_000),
    artifacts: z.array(ArtifactDraftSchema).max(60),
    contextUpdates: z.array(ContextUpdateSchema).max(10),
    finalPosts: z.array(FinalPostDraftSchema).max(100).optional(),
  }).strict(),
  z.object({
    type: z.literal("request_approval"),
    message: z.string().min(1).max(10_000),
    artifacts: z.array(ArtifactDraftSchema).max(60),
    contextUpdates: z.array(ContextUpdateSchema).max(10),
    finalPosts: z.array(FinalPostDraftSchema).max(100).optional(),
  }).strict(),
  z.object({
    type: z.literal("complete_step"),
    message: z.string().min(1).max(10_000),
  }).strict(),
  z.object({
    type: z.literal("cannot_continue"),
    message: z.string().min(1).max(10_000),
    reason: z.enum(["missing_input", "unsupported_capability", "safety_constraint"]),
    missing: z.array(z.string().min(1).max(240)).max(20),
  }).strict(),
]).refine(
  (value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= 900_000,
  "Model action exceeds 900 KB",
);

export type LlmAction = z.infer<typeof LlmActionSchema>;

export const SkillExecutionResultSchema = z.object({
  message: z.string().max(10_000),
  artifacts: z.array(ArtifactDraftSchema).max(60),
  context_updates: z.array(ContextUpdateSchema).max(10),
  final_posts: z.array(FinalPostDraftSchema).max(100).default([]),
  next_action: z.enum([
    "none",
    "request_user_input",
    "request_approval",
    "continue_phase",
  ]),
});

export type SkillExecutionResult = z.infer<typeof SkillExecutionResultSchema>;

/** Stable database/API projection while the runtime uses richer typed actions. */
export function actionToSkillExecutionResult(action: LlmAction): SkillExecutionResult {
  if (action.type === "propose_output") {
    return {
      message: action.message,
      artifacts: action.artifacts,
      context_updates: action.contextUpdates,
      final_posts: action.finalPosts ?? [],
      next_action: "none",
    };
  }
  if (action.type === "ask_user") {
    return {
      message: action.prompt,
      artifacts: [],
      context_updates: [],
      final_posts: [],
      next_action: "request_user_input",
    };
  }
  if (action.type === "request_approval") {
    return {
      message: action.message,
      artifacts: action.artifacts,
      context_updates: action.contextUpdates,
      final_posts: action.finalPosts ?? [],
      next_action: "request_approval",
    };
  }
  return {
    message: action.type === "request_tool" || action.type === "request_optional_skill"
      ? `Runtime request: ${action.type}`
      : action.message,
    artifacts: [],
    context_updates: [],
    final_posts: [],
    next_action: "none",
  };
}

export type LlmUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type LlmExecution = {
  action: LlmAction;
  provider: string;
  model: string;
  providerResponseId: string | null;
  usage: LlmUsage;
  /** Measured by the runtime around the provider call. */
  durationMs?: number;
  /** Operator-configured estimate; null means pricing is not configured. */
  estimatedCostMicrousd?: number | null;
};
