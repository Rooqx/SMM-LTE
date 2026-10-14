/**
 * Pure programmatic brand-intake compiler (Milestone M9.2).
 *
 * Translates confirmed, version-pinned questionnaire answers into a deterministic,
 * lossless `brand-intake` packet.
 *
 * Key Architectural Invariants:
 * 1. Purity & Determinism: Identical inputs strictly yield identical outputs.
 * 2. Lossless Provenance: Records all options shown, selections made, and raw custom notes.
 * 3. Zero Hallucination: Never invents facts, revenues, or marketing claims.
 * 4. Active Branch Isolation: Answers on inactive branches never leak into compiled output.
 * 5. Explicit Unknown Tracking: Answers marked 'not_sure' or 'none_known' are tracked in unknownFields.
 */

import { z } from "zod";
import type { InterviewAnswerRow, InterviewOptionSetRow } from "../db/interview-store.js";
import {
  getQuestionnaire,
  type InterviewQuestionDefinition,
  type QuestionnaireDefinition,
} from "./definitions.js";

export const BRAND_INTAKE_SCHEMA_VERSION = "1.0.0" as const;
export const BRAND_INTAKE_COMPILER_VERSION = "1.0.0" as const;

export const SelectedOptionSummarySchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(240),
  description: z.string().max(1000).optional(),
}).strict();

export type SelectedOptionSummary = z.infer<typeof SelectedOptionSummarySchema>;

export const OptionProvenanceSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(240),
}).strict();

export type OptionProvenance = z.infer<typeof OptionProvenanceSchema>;

export const AnswerProvenanceSchema = z.object({
  questionId: z.string().min(1).max(120),
  questionVersion: z.number().int().positive(),
  prompt: z.string().min(1).max(500),
  meaning: z.string().min(1).max(1000),
  optionsShown: z.array(OptionProvenanceSchema).readonly(),
  selectedOptionIds: z.array(z.string().min(1).max(120)).readonly(),
  selectedOptions: z.array(SelectedOptionSummarySchema).readonly(),
  customText: z.string().max(10000).nullable(),
  answerSource: z.enum(["option", "custom", "combined"]),
}).strict();

export type AnswerProvenance = z.infer<typeof AnswerProvenanceSchema>;

export const BrandIntakePacketSchema = z.object({
  schemaVersion: z.literal(BRAND_INTAKE_SCHEMA_VERSION),
  compilerVersion: z.literal(BRAND_INTAKE_COMPILER_VERSION),
  compiledAt: z.string().datetime(),
  questionnaireId: z.string().min(1).max(120),
  questionnaireVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  status: z.enum(["complete", "incomplete"]),
  validationIssues: z.array(z.string().min(1).max(500)).readonly(),
  accountOffer: z.object({
    promotionTarget: z.object({
      id: z.string().min(1).max(120),
      label: z.string().min(1).max(240),
      customText: z.string().max(10000).nullable(),
    }).strict().nullable(),
    businessDescription: z.object({
      category: z.object({
        id: z.string().min(1).max(120),
        label: z.string().min(1).max(240),
      }).strict().nullable(),
      descriptionText: z.string().min(1).max(10000),
    }).strict().nullable(),
    clientApproval: z.object({
      status: z.enum(["authorized", "client_review", "not_sure", "custom"]),
      label: z.string().min(1).max(240),
      canConfirmDirectly: z.boolean().nullable(),
      customText: z.string().max(10000).nullable(),
    }).strict().nullable(),
    launchTiming: z.object({
      stage: z.enum(["preparing", "launching_soon", "already_live", "not_sure", "custom"]),
      label: z.string().min(1).max(240),
      customText: z.string().max(10000).nullable(),
    }).strict().nullable(),
  }).strict(),
  audienceBuyer: z.object({
    targetGroups: z.array(SelectedOptionSummarySchema).readonly(),
    customNotes: z.string().max(10000).nullable(),
    isUncertain: z.boolean(),
  }).strict(),
  problemsOutcomes: z.object({
    desiredOutcomes: z.array(SelectedOptionSummarySchema).readonly(),
    customNotes: z.string().max(10000).nullable(),
    isUncertain: z.boolean(),
  }).strict(),
  goals: z.object({
    primaryGoal: SelectedOptionSummarySchema.nullable(),
    customNotes: z.string().max(10000).nullable(),
    isUncertain: z.boolean(),
  }).strict(),
  platforms: z.object({
    priorities: z.array(SelectedOptionSummarySchema).readonly(),
    customNotes: z.string().max(10000).nullable(),
    isUncertain: z.boolean(),
  }).strict(),
  voicePreferences: z.object({
    attributes: z.array(SelectedOptionSummarySchema).readonly(),
    customNotes: z.string().max(10000).nullable(),
    isUncertain: z.boolean(),
  }).strict(),
  callsToAction: z.object({
    primaryAction: SelectedOptionSummarySchema.nullable(),
    customNotes: z.string().max(10000).nullable(),
    isUncertain: z.boolean(),
  }).strict(),
  capacity: z.object({
    publishingPace: SelectedOptionSummarySchema.nullable(),
    founderVisibility: SelectedOptionSummarySchema.nullable(),
    isUncertain: z.boolean(),
  }).strict(),
  contentBoundaries: z.object({
    avoidTopics: z.array(SelectedOptionSummarySchema).readonly(),
    customNotes: z.string().max(10000).nullable(),
    hasNoKnownBoundaries: z.boolean(),
  }).strict(),
  unknownFields: z.array(z.string().min(1).max(120)).readonly(),
  sourceAnswers: z.array(AnswerProvenanceSchema).readonly(),
}).strict();

export type BrandIntakePacket = z.infer<typeof BrandIntakePacketSchema>;

export type IntakeCompilerInput = Readonly<{
  questionnaireId: string;
  questionnaireVersion: string;
  answers: readonly InterviewAnswerRow[];
  optionSets?: readonly InterviewOptionSetRow[];
  now?: Date;
}>;

/**
 * Determines whether a question is applicable given the set of confirmed answers.
 * Evaluates the deterministic `when` branch rule against existing confirmed answers.
 */
export function isQuestionApplicable(
  question: InterviewQuestionDefinition,
  answerMap: ReadonlyMap<string, InterviewAnswerRow>,
): boolean {
  if (!question.when) return true;
  const parentAnswer = answerMap.get(question.when.questionId);
  if (!parentAnswer) return false;
  return question.when.selectedOptionIds.some((id) =>
    parentAnswer.selected_option_ids.includes(id),
  );
}

/**
 * Returns the ordered list of applicable questions for a session given its confirmed answers.
 */
export function getApplicableQuestions(
  questionnaire: QuestionnaireDefinition,
  answers: readonly InterviewAnswerRow[],
): readonly InterviewQuestionDefinition[] {
  const answerMap = new Map<string, InterviewAnswerRow>();
  for (const answer of answers) {
    if (answer.status === "active") {
      answerMap.set(answer.question_id, answer);
    }
  }

  const applicable: InterviewQuestionDefinition[] = [];
  for (const question of questionnaire.questions) {
    if (isQuestionApplicable(question, answerMap)) {
      applicable.push(question);
    }
  }
  return Object.freeze(applicable);
}

/**
 * Pure, deterministic programmatic compiler.
 *
 * Converts validated interview answers into a concise, lossless, versioned `brand-intake`
 * packet without creative expansion or hallucinated facts. Preserves raw user custom text,
 * selected alternatives, and answer provenance.
 */
export function compileBrandIntake(input: IntakeCompilerInput): BrandIntakePacket {
  const questionnaire = getQuestionnaire(input.questionnaireId, input.questionnaireVersion);
  // Keep compilation replayable: without an injected clock, derive the packet
  // timestamp from immutable answer input rather than wall-clock time.
  const latestAnswerAt = input.answers.reduce<number>(
    (latest, answer) => Math.max(latest, answer.created_at.getTime()),
    0,
  );
  const now = input.now ?? new Date(latestAnswerAt);
  const compiledAt = now.toISOString();

  // Index active answers and option sets by questionId
  const activeAnswers = new Map<string, InterviewAnswerRow>();
  for (const answer of input.answers) {
    if (answer.status === "active") {
      activeAnswers.set(answer.question_id, answer);
    }
  }

  const optionSetMap = new Map<string, InterviewOptionSetRow>();
  if (input.optionSets) {
    for (const set of input.optionSets) {
      if (set.status === "active") {
        optionSetMap.set(set.question_id, set);
      }
    }
  }

  const applicableQuestions = getApplicableQuestions(questionnaire, input.answers);
  const validationIssues: string[] = [];
  const unknownFields: string[] = [];
  const sourceAnswers: AnswerProvenance[] = [];

  // Build provenance and record completeness
  for (const question of applicableQuestions) {
    const answer = activeAnswers.get(question.id);
    if (!answer) {
      if (question.required) {
        validationIssues.push(`Missing required answer for question '${question.id}'`);
      }
      continue;
    }

    // Determine options shown to the user (from option set, or fallback from questionnaire)
    const optionSet = optionSetMap.get(question.id);
    const optionsShown: OptionProvenance[] = optionSet
      ? optionSet.options.map((opt) => ({ id: opt.id, label: opt.label }))
      : question.fallbackOptions.map((opt) => ({ id: opt.id, label: opt.label }));

    const selectedSummaries: SelectedOptionSummary[] = answer.selected_options.map((opt) => ({
      id: opt.id,
      label: opt.label,
      ...(opt.description ? { description: opt.description } : {}),
    }));

    sourceAnswers.push({
      questionId: question.id,
      questionVersion: answer.question_version,
      prompt: question.prompt,
      meaning: question.meaning,
      optionsShown,
      selectedOptionIds: answer.selected_option_ids,
      selectedOptions: selectedSummaries,
      customText: answer.custom_text,
      answerSource: answer.answer_source,
    });
  }

  // Build set of applicable question IDs so answers on inactive branches never leak
  const applicableSet = new Set(applicableQuestions.map((q) => q.id));

  // Helper to extract an active answer, strictly gated to questions applicable in the current branch
  const getAns = (questionId: string): InterviewAnswerRow | undefined => {
    if (!applicableSet.has(questionId)) return undefined;
    return activeAnswers.get(questionId);
  };

  // 1. Account / Offer
  const promoAns = getAns("promotion_target");
  let promotionTarget: BrandIntakePacket["accountOffer"]["promotionTarget"] = null;
  if (promoAns) {
    const firstSelected = promoAns.selected_options[0];
    if (firstSelected) {
      promotionTarget = {
        id: firstSelected.id,
        label: firstSelected.label,
        customText: promoAns.custom_text,
      };
    } else if (promoAns.custom_text) {
      promotionTarget = {
        id: "custom",
        label: promoAns.custom_text,
        customText: promoAns.custom_text,
      };
    }
  }

  const descAns = getAns("business_description");
  let businessDescription: BrandIntakePacket["accountOffer"]["businessDescription"] = null;
  if (descAns) {
    const category = descAns.selected_options[0]
      ? { id: descAns.selected_options[0].id, label: descAns.selected_options[0].label }
      : null;
    const text = descAns.custom_text?.trim() || category?.label || "";
    businessDescription = {
      category,
      descriptionText: text.length > 0 ? text : "Unspecified",
    };
  }

  const clientAns = getAns("client_approval");
  let clientApproval: BrandIntakePacket["accountOffer"]["clientApproval"] = null;
  if (clientAns) {
    const selected = clientAns.selected_options[0];
    if (selected) {
      const isAuth = selected.id === "authorized";
      const isReview = selected.id === "client_review";
      const isNotSure = selected.id === "not_sure";
      if (isNotSure) unknownFields.push("client_approval");
      clientApproval = {
        status: isAuth ? "authorized" : isReview ? "client_review" : isNotSure ? "not_sure" : "custom",
        label: selected.label,
        canConfirmDirectly: isAuth ? true : isReview ? false : null,
        customText: clientAns.custom_text,
      };
    } else if (clientAns.custom_text) {
      clientApproval = {
        status: "custom",
        label: clientAns.custom_text,
        canConfirmDirectly: null,
        customText: clientAns.custom_text,
      };
    }
  }

  const launchAns = getAns("launch_timing");
  let launchTiming: BrandIntakePacket["accountOffer"]["launchTiming"] = null;
  if (launchAns) {
    const selected = launchAns.selected_options[0];
    if (selected) {
      const isPrep = selected.id === "preparing";
      const isSoon = selected.id === "launching_soon";
      const isLive = selected.id === "already_live";
      const isNotSure = selected.id === "not_sure";
      if (isNotSure) unknownFields.push("launch_timing");
      launchTiming = {
        stage: isPrep ? "preparing" : isSoon ? "launching_soon" : isLive ? "already_live" : isNotSure ? "not_sure" : "custom",
        label: selected.label,
        customText: launchAns.custom_text,
      };
    } else if (launchAns.custom_text) {
      launchTiming = {
        stage: "custom",
        label: launchAns.custom_text,
        customText: launchAns.custom_text,
      };
    }
  }

  // 2. Audience / Buyer
  const audAns = getAns("audience");
  const audGroups: SelectedOptionSummary[] = [];
  let audUncertain = false;
  if (audAns) {
    for (const opt of audAns.selected_options) {
      if (opt.id === "not_sure") {
        audUncertain = true;
        unknownFields.push("audience");
      } else {
        audGroups.push({ id: opt.id, label: opt.label, ...(opt.description ? { description: opt.description } : {}) });
      }
    }
  }

  // 3. Problems and Outcomes
  const outAns = getAns("customer_outcome");
  const outList: SelectedOptionSummary[] = [];
  let outUncertain = false;
  if (outAns) {
    for (const opt of outAns.selected_options) {
      if (opt.id === "not_sure") {
        outUncertain = true;
        unknownFields.push("customer_outcome");
      } else {
        outList.push({ id: opt.id, label: opt.label, ...(opt.description ? { description: opt.description } : {}) });
      }
    }
  }

  // 4. Goals
  const goalAns = getAns("primary_goal");
  let primaryGoal: SelectedOptionSummary | null = null;
  let goalUncertain = false;
  if (goalAns) {
    const selected = goalAns.selected_options[0];
    if (selected) {
      if (selected.id === "not_sure") {
        goalUncertain = true;
        unknownFields.push("primary_goal");
      } else {
        primaryGoal = { id: selected.id, label: selected.label, ...(selected.description ? { description: selected.description } : {}) };
      }
    }
  }

  // 5. Platforms
  const platAns = getAns("platform_priorities");
  const platList: SelectedOptionSummary[] = [];
  let platUncertain = false;
  if (platAns) {
    for (const opt of platAns.selected_options) {
      if (opt.id === "not_sure") {
        platUncertain = true;
        unknownFields.push("platform_priorities");
      } else {
        platList.push({ id: opt.id, label: opt.label });
      }
    }
  }

  // 6. Voice Preferences
  const voiceAns = getAns("brand_perception");
  const voiceList: SelectedOptionSummary[] = [];
  let voiceUncertain = false;
  if (voiceAns) {
    for (const opt of voiceAns.selected_options) {
      if (opt.id === "not_sure") {
        voiceUncertain = true;
        unknownFields.push("brand_perception");
      } else {
        voiceList.push({ id: opt.id, label: opt.label });
      }
    }
  }

  // 7. Calls to Action
  const ctaAns = getAns("call_to_action");
  let primaryAction: SelectedOptionSummary | null = null;
  let ctaUncertain = false;
  if (ctaAns) {
    const selected = ctaAns.selected_options[0];
    if (selected) {
      if (selected.id === "not_sure") {
        ctaUncertain = true;
        unknownFields.push("call_to_action");
      } else {
        primaryAction = { id: selected.id, label: selected.label };
      }
    }
  }

  // 8. Capacity & Visibility
  const capAns = getAns("publishing_capacity");
  let publishingPace: SelectedOptionSummary | null = null;
  let capUncertain = false;
  if (capAns) {
    const selected = capAns.selected_options[0];
    if (selected) {
      if (selected.id === "not_sure") {
        capUncertain = true;
        unknownFields.push("publishing_capacity");
      } else {
        publishingPace = { id: selected.id, label: selected.label };
      }
    }
  }

  const visAns = getAns("founder_visibility");
  let founderVisibility: SelectedOptionSummary | null = null;
  if (visAns) {
    const selected = visAns.selected_options[0];
    if (selected) {
      if (selected.id === "not_sure") {
        capUncertain = true;
        unknownFields.push("founder_visibility");
      } else {
        founderVisibility = { id: selected.id, label: selected.label };
      }
    }
  }

  // 9. Content Boundaries
  const boundAns = getAns("content_boundaries");
  const avoidTopics: SelectedOptionSummary[] = [];
  let hasNoKnownBoundaries = false;
  if (boundAns) {
    for (const opt of boundAns.selected_options) {
      if (opt.id === "none_known") {
        hasNoKnownBoundaries = true;
        unknownFields.push("content_boundaries");
      } else {
        avoidTopics.push({ id: opt.id, label: opt.label });
      }
    }
  }

  const isComplete = validationIssues.length === 0;

  const packet: BrandIntakePacket = Object.freeze({
    schemaVersion: BRAND_INTAKE_SCHEMA_VERSION,
    compilerVersion: BRAND_INTAKE_COMPILER_VERSION,
    compiledAt,
    questionnaireId: questionnaire.id,
    questionnaireVersion: questionnaire.version,
    status: isComplete ? "complete" : "incomplete",
    validationIssues: Object.freeze([...validationIssues]),
    accountOffer: Object.freeze({
      promotionTarget: promotionTarget ? Object.freeze(promotionTarget) : null,
      businessDescription: businessDescription ? Object.freeze(businessDescription) : null,
      clientApproval: clientApproval ? Object.freeze(clientApproval) : null,
      launchTiming: launchTiming ? Object.freeze(launchTiming) : null,
    }),
    audienceBuyer: Object.freeze({
      targetGroups: Object.freeze([...audGroups]),
      customNotes: audAns?.custom_text ?? null,
      isUncertain: audUncertain,
    }),
    problemsOutcomes: Object.freeze({
      desiredOutcomes: Object.freeze([...outList]),
      customNotes: outAns?.custom_text ?? null,
      isUncertain: outUncertain,
    }),
    goals: Object.freeze({
      primaryGoal: primaryGoal ? Object.freeze(primaryGoal) : null,
      customNotes: goalAns?.custom_text ?? null,
      isUncertain: goalUncertain,
    }),
    platforms: Object.freeze({
      priorities: Object.freeze([...platList]),
      customNotes: platAns?.custom_text ?? null,
      isUncertain: platUncertain,
    }),
    voicePreferences: Object.freeze({
      attributes: Object.freeze([...voiceList]),
      customNotes: voiceAns?.custom_text ?? null,
      isUncertain: voiceUncertain,
    }),
    callsToAction: Object.freeze({
      primaryAction: primaryAction ? Object.freeze(primaryAction) : null,
      customNotes: ctaAns?.custom_text ?? null,
      isUncertain: ctaUncertain,
    }),
    capacity: Object.freeze({
      publishingPace: publishingPace ? Object.freeze(publishingPace) : null,
      founderVisibility: founderVisibility ? Object.freeze(founderVisibility) : null,
      isUncertain: capUncertain,
    }),
    contentBoundaries: Object.freeze({
      avoidTopics: Object.freeze([...avoidTopics]),
      customNotes: boundAns?.custom_text ?? null,
      hasNoKnownBoundaries,
    }),
    unknownFields: Object.freeze([...new Set(unknownFields)]),
    sourceAnswers: Object.freeze(sourceAnswers.map((s) => Object.freeze({
      ...s,
      optionsShown: Object.freeze([...s.optionsShown]),
      selectedOptionIds: Object.freeze([...s.selectedOptionIds]),
      selectedOptions: Object.freeze([...s.selectedOptions]),
    }))),
  });

  // Strict runtime self-validation
  BrandIntakePacketSchema.parse(packet);
  return packet;
}
