import { z } from "zod";

export const OPTION_PROMPT_VERSION = "options-v1.0.0" as const;

export const SuggestionItemSchema = z.object({
  label: z.string().trim().min(1).max(240).refine((val) => !/[<>]/.test(val), {
    message: "Option label cannot contain markup",
  }),
  description: z.string().trim().min(1).max(500).refine((val) => !/[<>]/.test(val), {
    message: "Option description cannot contain markup",
  }).optional(),
}).strict();

export type SuggestionItem = z.infer<typeof SuggestionItemSchema>;

export const ConfirmedAnswerSummarySchema = z.object({
  questionId: z.string().min(1).max(120),
  selectedLabels: z.array(z.string().min(1).max(240)),
  customText: z.string().max(10000).nullable().optional(),
}).strict();

export type ConfirmedAnswerSummary = z.infer<typeof ConfirmedAnswerSummarySchema>;

export const TargetQuestionDescriptorSchema = z.object({
  questionId: z.string().min(1).max(120),
  prompt: z.string().min(1).max(500),
  meaning: z.string().min(1).max(1000),
  answerMode: z.enum(["single", "multiple", "single_with_text", "multiple_with_text"]),
  minimumSelections: z.number().int().min(1).max(5),
  maximumSelections: z.number().int().min(1).max(5),
}).strict();

export type TargetQuestionDescriptor = z.infer<typeof TargetQuestionDescriptorSchema>;

export const OptionGenerationRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  sessionId: z.string().uuid(),
  questionnaireId: z.string().min(1).max(120),
  questionnaireVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  promptVersion: z.string().min(1).max(120).default(OPTION_PROMPT_VERSION),
  businessDescription: z.string().max(10000),
  category: z.string().max(120).optional(),
  confirmedAnswers: z.array(ConfirmedAnswerSummarySchema),
  targetQuestions: z.array(TargetQuestionDescriptorSchema).min(1).max(5),
}).strict();

export type OptionGenerationRequest = z.infer<typeof OptionGenerationRequestSchema>;

export const OptionGenerationResponseSchema = z.object({
  suggestions: z.record(z.string(), z.array(SuggestionItemSchema).min(2).max(4)),
  explanation: z.string().trim().max(1000).optional(),
}).strict();

export type OptionGenerationResponse = z.infer<typeof OptionGenerationResponseSchema>;

/** Provider metadata used only for bounded operational usage accounting. */
export type OptionGenerationResult = OptionGenerationResponse & Readonly<{
  providerResponseId: string | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}>;

export type OptionCacheEntry = Readonly<{
  cacheKey: string;
  workspaceId: string;
  organizationId: string;
  questionnaireId: string;
  questionnaireVersion: string;
  confirmedAnswersHash: string;
  promptVersion: string;
  generatorProvider: string;
  generatorModel: string;
  suggestions: Record<string, readonly SuggestionItem[]>;
  explanation: string | null;
  expiresAt: Date;
  createdAt: Date;
}>;
