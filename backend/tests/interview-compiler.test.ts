import { describe, expect, it } from "vitest";
import type { InterviewAnswerRow, InterviewOptionSetRow } from "../src/db/interview-store.js";
import {
  compileBrandIntake,
  getApplicableQuestions,
  isQuestionApplicable,
  BRAND_INTAKE_COMPILER_VERSION,
  BRAND_INTAKE_SCHEMA_VERSION,
} from "../src/interview/compiler.js";
import {
  getQuestionnaire,
  GUIDED_INTAKE_QUESTIONNAIRE_ID,
} from "../src/interview/definitions.js";

function mockAnswer(overrides: Partial<InterviewAnswerRow> & {
  question_id: string;
  question_version: number;
}): InterviewAnswerRow {
  return {
    id: `ans-${overrides.question_id}`,
    session_id: "00000000-0000-0000-0000-000000000001",
    workspace_id: "00000000-0000-0000-0000-000000000002",
    option_set_id: "00000000-0000-0000-0000-000000000003",
    selected_option_ids: [],
    selected_options: [],
    custom_text: null,
    answer_source: "option",
    idempotency_key: `key-${overrides.question_id}`,
    request_hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    session_version: 2,
    status: "active",
    supersedes_answer_id: null,
    actor: "user:tester",
    created_at: new Date("2026-10-11T12:00:00Z"),
    superseded_at: null,
    ...overrides,
  };
}

describe("pure programmatic brand-intake compiler", () => {
  // Exercise the full historical questionnaire separately from the new short
  // version; pinned sessions must keep compiling exactly as before.
  const legacyVersion = "1.1.0";
  const questionnaire = getQuestionnaire(GUIDED_INTAKE_QUESTIONNAIRE_ID, legacyVersion);

  it("evaluates branching rules deterministically for different promotion targets", () => {
    const qClientApproval = questionnaire.questions.find((q) => q.id === "client_approval")!;
    const qLaunchTiming = questionnaire.questions.find((q) => q.id === "launch_timing")!;

    // Case 1: Company business (neither branch applies)
    const companyAns = mockAnswer({
      question_id: "promotion_target",
      question_version: 1,
      selected_option_ids: ["company_business"],
      selected_options: [{ id: "company_business", label: "A company or business" }],
    });
    const mapCompany = new Map([[companyAns.question_id, companyAns]]);
    expect(isQuestionApplicable(qClientApproval, mapCompany)).toBe(false);
    expect(isQuestionApplicable(qLaunchTiming, mapCompany)).toBe(false);

    // Case 2: Client business (client_approval applies)
    const clientAns = mockAnswer({
      question_id: "promotion_target",
      question_version: 1,
      selected_option_ids: ["client_business"],
      selected_options: [{ id: "client_business", label: "A client's business" }],
    });
    const mapClient = new Map([[clientAns.question_id, clientAns]]);
    expect(isQuestionApplicable(qClientApproval, mapClient)).toBe(true);
    expect(isQuestionApplicable(qLaunchTiming, mapClient)).toBe(false);

    // Case 3: Product launch (launch_timing applies)
    const launchAns = mockAnswer({
      question_id: "promotion_target",
      question_version: 1,
      selected_option_ids: ["product_launch"],
      selected_options: [{ id: "product_launch", label: "A product launch" }],
    });
    const mapLaunch = new Map([[launchAns.question_id, launchAns]]);
    expect(isQuestionApplicable(qClientApproval, mapLaunch)).toBe(false);
    expect(isQuestionApplicable(qLaunchTiming, mapLaunch)).toBe(true);
  });

  it("returns incomplete status and validation issues when required questions are missing", () => {
    const answers = [
      mockAnswer({
        question_id: "promotion_target",
        question_version: 1,
        selected_option_ids: ["company_business"],
        selected_options: [{ id: "company_business", label: "A company or business" }],
      }),
    ];

    const fixedDate = new Date("2026-10-11T12:00:00.000Z");
    const result = compileBrandIntake({
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: legacyVersion,
      answers,
      now: fixedDate,
    });

    expect(result.status).toBe("incomplete");
    expect(result.validationIssues.length).toBeGreaterThan(0);
    expect(result.validationIssues).toContain("Missing required answer for question 'business_description'");
    expect(result.accountOffer.promotionTarget).toEqual({
      id: "company_business",
      label: "A company or business",
      customText: null,
    });
    expect(result.accountOffer.businessDescription).toBeNull();
  });

  it("compiles a complete interview losslessly with full provenance and unknown fields tracking", () => {
    const completeAnswers: InterviewAnswerRow[] = [
      mockAnswer({
        question_id: "promotion_target",
        question_version: 1,
        selected_option_ids: ["client_business"],
        selected_options: [{ id: "client_business", label: "A client's business" }],
        custom_text: "Local boutique bakery client",
        answer_source: "combined",
      }),
      mockAnswer({
        question_id: "client_approval",
        question_version: 1,
        selected_option_ids: ["client_review"],
        selected_options: [{ id: "client_review", label: "The client needs to review important choices" }],
      }),
      mockAnswer({
        question_id: "business_description",
        question_version: 1,
        selected_option_ids: ["online_products"],
        selected_options: [{ id: "online_products", label: "Products sold online" }],
        custom_text: "Artisan sourdough bread and pastries shipped across the country.",
        answer_source: "combined",
      }),
      mockAnswer({
        question_id: "audience",
        question_version: 1,
        selected_option_ids: ["individuals", "local_community"],
        selected_options: [
          { id: "individuals", label: "Individual customers" },
          { id: "local_community", label: "People in a local community" },
        ],
        custom_text: "Foodies and specialty coffee enthusiasts",
        answer_source: "combined",
      }),
      mockAnswer({
        question_id: "customer_outcome",
        question_version: 1,
        selected_option_ids: ["feel_better"],
        selected_options: [{ id: "feel_better", label: "Feel healthier or more confident" }],
      }),
      mockAnswer({
        question_id: "primary_goal",
        question_version: 1,
        selected_option_ids: ["sales"],
        selected_options: [{ id: "sales", label: "Drive sales or sign-ups" }],
      }),
      mockAnswer({
        question_id: "brand_perception",
        question_version: 1,
        selected_option_ids: ["friendly", "premium"],
        selected_options: [
          { id: "friendly", label: "Friendly and approachable" },
          { id: "premium", label: "Polished and premium" },
        ],
      }),
      mockAnswer({
        question_id: "platform_priorities",
        question_version: 1,
        selected_option_ids: ["instagram", "tiktok"],
        selected_options: [
          { id: "instagram", label: "Instagram" },
          { id: "tiktok", label: "TikTok" },
        ],
      }),
      mockAnswer({
        question_id: "call_to_action",
        question_version: 1,
        selected_option_ids: ["buy"],
        selected_options: [{ id: "buy", label: "Buy or sign up" }],
      }),
      mockAnswer({
        question_id: "publishing_capacity",
        question_version: 1,
        selected_option_ids: ["two_three_weekly"],
        selected_options: [{ id: "two_three_weekly", label: "Two or three times a week" }],
      }),
      mockAnswer({
        question_id: "founder_visibility",
        question_version: 1,
        selected_option_ids: ["sometimes"],
        selected_options: [{ id: "sometimes", label: "Visible sometimes" }],
      }),
      mockAnswer({
        question_id: "content_boundaries",
        question_version: 1,
        selected_option_ids: ["politics", "unverified_claims"],
        selected_options: [
          { id: "politics", label: "Politics or divisive topics" },
          { id: "unverified_claims", label: "Claims we cannot verify" },
        ],
        custom_text: "No artificial flavoring comparisons",
        answer_source: "combined",
      }),
    ];

    const fixedDate = new Date("2026-10-11T12:00:00.000Z");
    const result1 = compileBrandIntake({
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: legacyVersion,
      answers: completeAnswers,
      now: fixedDate,
    });
    const result2 = compileBrandIntake({
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: legacyVersion,
      answers: completeAnswers,
      now: fixedDate,
    });

    // Purity check: identical inputs yield identical output
    expect(result1).toEqual(result2);

    expect(result1.status).toBe("complete");
    expect(result1.validationIssues).toEqual([]);
    expect(result1.schemaVersion).toBe(BRAND_INTAKE_SCHEMA_VERSION);
    expect(result1.compilerVersion).toBe(BRAND_INTAKE_COMPILER_VERSION);

    // Account offer verification
    expect(result1.accountOffer.clientApproval).toEqual({
      status: "client_review",
      label: "The client needs to review important choices",
      canConfirmDirectly: false,
      customText: null,
    });
    expect(result1.accountOffer.businessDescription).toEqual({
      category: { id: "online_products", label: "Products sold online" },
      descriptionText: "Artisan sourdough bread and pastries shipped across the country.",
    });

    // Capacity & visibility
    expect(result1.capacity.publishingPace?.id).toBe("two_three_weekly");
    expect(result1.capacity.founderVisibility?.id).toBe("sometimes");
    expect(result1.capacity.isUncertain).toBe(false);

    // Provenance check
    expect(result1.sourceAnswers.length).toBe(12);
    const promoProv = result1.sourceAnswers.find((s) => s.questionId === "promotion_target");
    expect(promoProv).toMatchObject({
      questionId: "promotion_target",
      prompt: "What are we promoting?",
      selectedOptionIds: ["client_business"],
      customText: "Local boutique bakery client",
      answerSource: "combined",
    });
  });

  it("accurately records 'not_sure' and 'none_known' as uncertain in unknownFields", () => {
    const answers: InterviewAnswerRow[] = [
      mockAnswer({
        question_id: "promotion_target",
        question_version: 1,
        selected_option_ids: ["company_business"],
        selected_options: [{ id: "company_business", label: "A company or business" }],
      }),
      mockAnswer({
        question_id: "business_description",
        question_version: 1,
        selected_option_ids: ["software_app"],
        selected_options: [{ id: "software_app", label: "Software or an app" }],
        custom_text: "A mobile expense tracker.",
      }),
      mockAnswer({
        question_id: "audience",
        question_version: 1,
        selected_option_ids: ["not_sure"],
        selected_options: [{ id: "not_sure", label: "I'm not sure—help me choose" }],
      }),
      mockAnswer({
        question_id: "customer_outcome",
        question_version: 1,
        selected_option_ids: ["not_sure"],
        selected_options: [{ id: "not_sure", label: "I'm not sure—help me choose" }],
      }),
      mockAnswer({
        question_id: "primary_goal",
        question_version: 1,
        selected_option_ids: ["not_sure"],
        selected_options: [{ id: "not_sure", label: "I'm not sure—help me choose" }],
      }),
      mockAnswer({
        question_id: "brand_perception",
        question_version: 1,
        selected_option_ids: ["not_sure"],
        selected_options: [{ id: "not_sure", label: "I'm not sure—help me choose" }],
      }),
      mockAnswer({
        question_id: "platform_priorities",
        question_version: 1,
        selected_option_ids: ["not_sure"],
        selected_options: [{ id: "not_sure", label: "I'm not sure—help me choose" }],
      }),
      mockAnswer({
        question_id: "call_to_action",
        question_version: 1,
        selected_option_ids: ["not_sure"],
        selected_options: [{ id: "not_sure", label: "I'm not sure—help me choose" }],
      }),
      mockAnswer({
        question_id: "publishing_capacity",
        question_version: 1,
        selected_option_ids: ["not_sure"],
        selected_options: [{ id: "not_sure", label: "I'm not sure—help me choose" }],
      }),
      mockAnswer({
        question_id: "founder_visibility",
        question_version: 1,
        selected_option_ids: ["not_sure"],
        selected_options: [{ id: "not_sure", label: "I'm not sure yet" }],
      }),
      mockAnswer({
        question_id: "content_boundaries",
        question_version: 1,
        selected_option_ids: ["none_known"],
        selected_options: [{ id: "none_known", label: "Nothing specific yet" }],
      }),
    ];

    const result = compileBrandIntake({
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: legacyVersion,
      answers,
      now: new Date("2026-10-11T12:00:00Z"),
    });

    expect(result.status).toBe("complete");
    expect(result.audienceBuyer.isUncertain).toBe(true);
    expect(result.problemsOutcomes.isUncertain).toBe(true);
    expect(result.goals.isUncertain).toBe(true);
    expect(result.platforms.isUncertain).toBe(true);
    expect(result.voicePreferences.isUncertain).toBe(true);
    expect(result.callsToAction.isUncertain).toBe(true);
    expect(result.capacity.isUncertain).toBe(true);
    expect(result.contentBoundaries.hasNoKnownBoundaries).toBe(true);
    expect(result.unknownFields).toEqual(expect.arrayContaining([
      "audience",
      "customer_outcome",
      "primary_goal",
      "brand_perception",
      "platform_priorities",
      "call_to_action",
      "publishing_capacity",
      "founder_visibility",
      "content_boundaries",
    ]));
  });

  it("satisfies compiler purity and schema validity across multiple permutation fixtures", () => {
    const questions = questionnaire.questions;
    const baseDate = new Date("2026-10-11T14:30:00Z");

    for (let run = 0; run < 5; run++) {
      const generatedAnswers: InterviewAnswerRow[] = [];
      for (const q of questions) {
        const option = q.fallbackOptions[run % q.fallbackOptions.length]!;
        generatedAnswers.push(mockAnswer({
          question_id: q.id,
          question_version: q.version,
          selected_option_ids: [option.id],
          selected_options: [{ id: option.id, label: option.label }],
          custom_text: q.customTextRequired ? "Required test detail provided." : null,
          answer_source: q.customTextRequired ? "combined" : "option",
        }));
      }

      const pass1 = compileBrandIntake({
        questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
        questionnaireVersion: legacyVersion,
        answers: generatedAnswers,
        now: baseDate,
      });

      const pass2 = compileBrandIntake({
        questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
        questionnaireVersion: legacyVersion,
        answers: generatedAnswers,
        now: baseDate,
      });

      expect(pass1).toEqual(pass2);
      expect(pass1.schemaVersion).toBe(BRAND_INTAKE_SCHEMA_VERSION);
    }
  });

  it("does not leak inactive branch answers or unknown fields when branch changes", () => {
    // Session originally answered client_business with client_approval, then user switched to company_business
    const residualAnswers: InterviewAnswerRow[] = [
      mockAnswer({
        question_id: "promotion_target",
        question_version: 1,
        selected_option_ids: ["company_business"],
        selected_options: [{ id: "company_business", label: "A company or business" }],
      }),
      mockAnswer({
        question_id: "client_approval",
        question_version: 1,
        selected_option_ids: ["not_sure"],
        selected_options: [{ id: "not_sure", label: "I'm not sure yet" }],
      }),
      mockAnswer({
        question_id: "launch_timing",
        question_version: 1,
        selected_option_ids: ["not_sure"],
        selected_options: [{ id: "not_sure", label: "I'm not sure yet" }],
      }),
      mockAnswer({
        question_id: "business_description",
        question_version: 1,
        selected_option_ids: ["software_app"],
        selected_options: [{ id: "software_app", label: "Software or an app" }],
        custom_text: "SaaS backup app.",
      }),
    ];

    const result = compileBrandIntake({
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: legacyVersion,
      answers: residualAnswers,
      now: new Date("2026-10-11T12:00:00Z"),
    });

    // Neither client_approval nor launch_timing are applicable for company_business
    expect(result.accountOffer.clientApproval).toBeNull();
    expect(result.accountOffer.launchTiming).toBeNull();
    // Inactive branch answers must NOT pollute unknownFields
    expect(result.unknownFields).not.toContain("client_approval");
    expect(result.unknownFields).not.toContain("launch_timing");
    // Source answers must only include applicable questions
    const sourceQIds = result.sourceAnswers.map((s) => s.questionId);
    expect(sourceQIds).not.toContain("client_approval");
    expect(sourceQIds).not.toContain("launch_timing");
  });

  it("is replay-deterministic without an injected wall clock", () => {
    const answers = [mockAnswer({
      question_id: "promotion_target",
      question_version: 1,
      selected_option_ids: ["company_business"],
      selected_options: [{ id: "company_business", label: "A company or business" }],
      created_at: new Date("2026-10-11T12:34:56.000Z"),
    })];

    const first = compileBrandIntake({
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: legacyVersion,
      answers,
    });
    const second = compileBrandIntake({
      questionnaireId: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      questionnaireVersion: legacyVersion,
      answers,
    });

    expect(second).toEqual(first);
    expect(first.compiledAt).toBe("2026-10-11T12:34:56.000Z");
  });
});
