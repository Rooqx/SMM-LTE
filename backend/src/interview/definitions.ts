export const GUIDED_INTAKE_QUESTIONNAIRE_ID = "phase-1-brand-intake";
export const CURRENT_GUIDED_INTAKE_VERSION = "1.2.0";

export type InterviewAnswerMode =
  | "single"
  | "multiple"
  | "single_with_text"
  | "multiple_with_text";

export type CuratedOption = Readonly<{
  id: string;
  label: string;
  description?: string;
  requiresCustomText?: true;
}>;

export type BranchCondition = Readonly<{
  questionId: string;
  selectedOptionIds: readonly string[];
}>;

export type InterviewQuestionDefinition = Readonly<{
  id: string;
  version: number;
  meaning: string;
  prompt: string;
  supportingText: string;
  examples: readonly string[];
  answerMode: InterviewAnswerMode;
  required: boolean;
  allowCustom: boolean;
  customTextRequired: boolean;
  minimumSelections: number;
  maximumSelections: number;
  /** True only when every visible suggestion can be selected together. */
  allowSelectAll: boolean;
  fallbackOptions: readonly CuratedOption[];
  when?: BranchCondition;
}>;

export type QuestionnaireDefinition = Readonly<{
  id: string;
  version: string;
  compilerInputSchema: "brand-intake";
  questions: readonly InterviewQuestionDefinition[];
}>;

const IDENTIFIER = /^[a-z0-9][a-z0-9_.-]{0,119}$/;

function option(
  id: string,
  label: string,
  description?: string,
  requiresCustomText = false,
): CuratedOption {
  return Object.freeze({
    id,
    label,
    ...(description ? { description } : {}),
    ...(requiresCustomText ? { requiresCustomText: true as const } : {}),
  });
}

function freezeQuestion(
  definition: Omit<
    InterviewQuestionDefinition,
    "examples" | "fallbackOptions" | "customTextRequired" | "allowSelectAll"
  > & {
    examples?: readonly string[];
    customTextRequired?: boolean;
    allowSelectAll?: boolean;
    fallbackOptions: readonly CuratedOption[];
  },
): InterviewQuestionDefinition {
  return Object.freeze({
    ...definition,
    examples: Object.freeze([...(definition.examples ?? [])]),
    customTextRequired: definition.customTextRequired ?? false,
    allowSelectAll: definition.allowSelectAll ?? false,
    fallbackOptions: Object.freeze([...definition.fallbackOptions]),
    ...(definition.when
      ? {
          when: Object.freeze({
            ...definition.when,
            selectedOptionIds: Object.freeze([...definition.when.selectedOptionIds]),
          }),
        }
      : {}),
  });
}

const VERSION_1_0_0 = Object.freeze({
  id: GUIDED_INTAKE_QUESTIONNAIRE_ID,
  version: "1.0.0",
  compilerInputSchema: "brand-intake",
  questions: Object.freeze([
    freezeQuestion({
      id: "promotion_target",
      version: 1,
      meaning: "The kind of account or offer the user is promoting.",
      prompt: "What are we promoting?",
      supportingText: "Pick the closest fit. You can add your own answer if none is quite right.",
      answerMode: "single_with_text",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 1,
      fallbackOptions: [
        option("company_business", "A company or business"),
        option("personal_brand", "My personal brand"),
        option("client_business", "A client's business"),
        option("product_launch", "A product launch"),
        option("something_else", "Something else", undefined, true),
      ],
    }),
    freezeQuestion({
      id: "client_approval",
      version: 1,
      meaning: "Whether a client-marketing user can confirm brand decisions directly.",
      prompt: "How should we handle choices for the client?",
      supportingText: "This helps us separate ideas you can confirm now from choices the client still needs to approve.",
      answerMode: "single",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 1,
      fallbackOptions: [
        option("authorized", "I can confirm choices for the client"),
        option("client_review", "The client needs to review important choices"),
        option("not_sure", "I'm not sure yet"),
      ],
      when: { questionId: "promotion_target", selectedOptionIds: ["client_business"] },
    }),
    freezeQuestion({
      id: "launch_timing",
      version: 1,
      meaning: "The user's approximate product-launch timing.",
      prompt: "Where are you in the launch?",
      supportingText: "A rough answer is enough; you do not need a final launch date.",
      answerMode: "single",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 1,
      fallbackOptions: [
        option("preparing", "Still preparing"),
        option("launching_soon", "Launching soon"),
        option("already_live", "Already live"),
        option("not_sure", "I'm not sure yet"),
      ],
      when: { questionId: "promotion_target", selectedOptionIds: ["product_launch"] },
    }),
    freezeQuestion({
      id: "business_description",
      version: 1,
      meaning: "A plain-language description of the account, offer, or work.",
      prompt: "Tell me what you do.",
      supportingText: "Write normally—this does not need to sound professional. Pick a starting point and add a sentence in your own words.",
      examples: [
        "I created a SaaS app that helps small businesses make social media posts.",
        "I sell skincare products online.",
        "I help people find and buy properties.",
        "I am trying to grow my personal account as a fitness coach.",
        "I manage social media for local businesses.",
      ],
      answerMode: "single_with_text",
      required: true,
      allowCustom: true,
      customTextRequired: true,
      minimumSelections: 1,
      maximumSelections: 1,
      fallbackOptions: [
        option("software_app", "Software or an app"),
        option("online_products", "Products sold online"),
        option("professional_service", "A professional service"),
        option("creator_personal_brand", "A creator or personal brand"),
        option("local_business", "A local business"),
        option("client_marketing", "Marketing for a client"),
      ],
    }),
    freezeQuestion({
      id: "audience",
      version: 1,
      meaning: "The people most likely to benefit from or buy the offer.",
      prompt: "Who would get the most value from this?",
      supportingText: "Choose up to three groups. These are starting points, not claims about customers you have already proven.",
      answerMode: "multiple_with_text",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 3,
      fallbackOptions: [
        option("individuals", "Individual customers"),
        option("small_businesses", "Small businesses"),
        option("professionals", "Working professionals"),
        option("creators", "Creators or freelancers"),
        option("local_community", "People in a local community"),
        option("not_sure", "I'm not sure—help me choose"),
        option("something_else", "Something else", undefined, true),
      ],
    }),
    freezeQuestion({
      id: "customer_outcome",
      version: 1,
      meaning: "The main outcome or problem the offer addresses.",
      prompt: "What do you most want to help them achieve?",
      supportingText: "Pick the closest outcome and add your own words if useful.",
      answerMode: "multiple_with_text",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 2,
      fallbackOptions: [
        option("save_time", "Save time or make something easier"),
        option("grow_income", "Earn or grow revenue"),
        option("learn_skill", "Learn or improve a skill"),
        option("feel_better", "Feel healthier or more confident"),
        option("avoid_problem", "Avoid a costly or frustrating problem"),
        option("not_sure", "I'm not sure—help me choose"),
        option("something_else", "Something else", undefined, true),
      ],
    }),
    freezeQuestion({
      id: "primary_goal",
      version: 1,
      meaning: "The most important current social-media objective.",
      prompt: "What is the most important social media goal right now?",
      supportingText: "Choose one priority so the plan can make sensible tradeoffs.",
      answerMode: "single",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 1,
      fallbackOptions: [
        option("awareness", "Help more of the right people discover us"),
        option("trust", "Build trust and credibility"),
        option("leads", "Generate enquiries or leads"),
        option("sales", "Drive sales or sign-ups"),
        option("community", "Grow an engaged community"),
        option("not_sure", "I'm not sure—help me choose"),
      ],
    }),
    freezeQuestion({
      id: "brand_perception",
      version: 1,
      meaning: "How the user wants the brand to feel and be perceived.",
      prompt: "How should people describe the brand after seeing your content?",
      supportingText: "Choose up to three qualities. Contrasting choices are okay—we will make the combination coherent later.",
      answerMode: "multiple_with_text",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 3,
      fallbackOptions: [
        option("helpful", "Helpful and clear"),
        option("expert", "Expert and trustworthy"),
        option("friendly", "Friendly and approachable"),
        option("bold", "Bold and energetic"),
        option("premium", "Polished and premium"),
        option("practical", "Practical and no-nonsense"),
        option("not_sure", "I'm not sure—help me choose"),
      ],
    }),
    freezeQuestion({
      id: "platform_priorities",
      version: 1,
      meaning: "The social platforms the user wants to prioritize.",
      prompt: "Which platforms matter most right now?",
      supportingText: "Choose up to three. If you are unsure, we can recommend a starting point later.",
      answerMode: "multiple_with_text",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 3,
      fallbackOptions: [
        option("instagram", "Instagram"),
        option("linkedin", "LinkedIn"),
        option("tiktok", "TikTok"),
        option("x", "X"),
        option("facebook", "Facebook"),
        option("youtube", "YouTube"),
        option("not_sure", "I'm not sure—help me choose"),
      ],
    }),
    freezeQuestion({
      id: "call_to_action",
      version: 1,
      meaning: "The action the user usually wants a viewer to take.",
      prompt: "What should interested people usually do next?",
      supportingText: "Pick the most useful next step. This can change for individual posts later.",
      answerMode: "single_with_text",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 1,
      fallbackOptions: [
        option("visit_website", "Visit a website or landing page"),
        option("send_message", "Send a message"),
        option("book_call", "Book a call or appointment"),
        option("buy", "Buy or sign up"),
        option("follow", "Follow for more useful content"),
        option("not_sure", "I'm not sure—help me choose"),
      ],
    }),
    freezeQuestion({
      id: "publishing_capacity",
      version: 1,
      meaning: "The user's realistic recurring publishing capacity.",
      prompt: "What publishing pace feels realistic?",
      supportingText: "Choose what you can sustain on an ordinary week, not your most ambitious week.",
      answerMode: "single",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 1,
      fallbackOptions: [
        option("one_weekly", "About once a week"),
        option("two_three_weekly", "Two or three times a week"),
        option("four_five_weekly", "Four or five times a week"),
        option("daily", "Daily or almost daily"),
        option("not_sure", "I'm not sure—help me choose"),
      ],
    }),
    freezeQuestion({
      id: "founder_visibility",
      version: 1,
      meaning: "How visible the founder or team should be in content.",
      prompt: "How visible do you want to be in the content?",
      supportingText: "There is no right answer. We can build a strong plan with or without showing your face.",
      answerMode: "single",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 1,
      fallbackOptions: [
        option("face_forward", "Comfortable being the main face"),
        option("sometimes", "Visible sometimes"),
        option("voice_only", "Use my voice or ideas, but rarely my face"),
        option("brand_only", "Keep the content focused on the brand"),
        option("not_sure", "I'm not sure yet"),
      ],
    }),
    freezeQuestion({
      id: "content_boundaries",
      version: 1,
      meaning: "Topics, claims, formats, or styles the user wants to avoid.",
      prompt: "Is there anything the content should avoid?",
      supportingText: "Choose any that apply and add specific boundaries in your own words.",
      answerMode: "multiple_with_text",
      required: true,
      allowCustom: true,
      minimumSelections: 1,
      maximumSelections: 5,
      fallbackOptions: [
        option("none_known", "Nothing specific yet"),
        option("politics", "Politics or divisive topics"),
        option("unverified_claims", "Claims we cannot verify"),
        option("aggressive_sales", "Aggressive or pushy sales language"),
        option("personal_details", "Private personal details"),
        option("trend_chasing", "Trends that do not fit the brand"),
        option("something_else", "Something else", undefined, true),
      ],
    }),
  ]),
} satisfies QuestionnaireDefinition);

/**
 * The 1.1 release keeps the reviewed question order while reducing cognitive
 * load: four scannable suggestions plus a first-class custom answer. Older
 * sessions remain pinned to 1.0 and are never reinterpreted in place.
 */
const SELECT_ALL_QUESTION_IDS = new Set([
  "audience",
  "customer_outcome",
  "brand_perception",
  "platform_priorities",
]);

const VERSION_1_1_FALLBACK_ADDITIONS: Readonly<Record<string, CuratedOption>> = {
  client_approval: option(
    "approved_brief",
    "I’ll work from a client-approved brief",
  ),
};

const VERSION_1_1_0 = Object.freeze({
  ...VERSION_1_0_0,
  version: "1.1.0",
  questions: Object.freeze(VERSION_1_0_0.questions.map((question) => {
    const fallbackOptions = question.fallbackOptions
      .filter((candidate) => candidate.id !== "something_else")
      .slice(0, 4);
    const addition = VERSION_1_1_FALLBACK_ADDITIONS[question.id];
    if (fallbackOptions.length < 4 && addition) fallbackOptions.push(addition);
    const isMultiple = question.answerMode === "multiple" ||
      question.answerMode === "multiple_with_text";
    const answerMode: InterviewAnswerMode = isMultiple
      ? "multiple_with_text"
      : "single_with_text";
    return freezeQuestion({
      ...question,
      version: question.version + 1,
      answerMode,
      fallbackOptions,
      maximumSelections: isMultiple ? fallbackOptions.length : 1,
      allowSelectAll: isMultiple && SELECT_ALL_QUESTION_IDS.has(question.id),
      supportingText: isMultiple
        ? "Select everything that applies, or write your own answer below."
        : "Choose the closest answer, or write your own answer below.",
    });
  })),
} satisfies QuestionnaireDefinition);

// Keep the interview to the facts only the owner can reliably supply. The
// synthesis agent can ask follow-up questions when a required detail is absent.
// Existing sessions remain pinned to their original, longer questionnaire.
const ESSENTIAL_QUESTION_IDS = new Set([
  "promotion_target",
  "business_description",
  "audience",
  "customer_outcome",
]);
const VERSION_1_2_0 = Object.freeze({
  ...VERSION_1_1_0,
  version: CURRENT_GUIDED_INTAKE_VERSION,
  questions: Object.freeze(VERSION_1_1_0.questions.filter((question) =>
    ESSENTIAL_QUESTION_IDS.has(question.id))),
} satisfies QuestionnaireDefinition);

// Retained release fixture proving that deployed interviews stay pinned across
// questionnaire upgrades. Never mutate or delete a release while sessions may
// still reference it; add a new version instead.
const VERSION_0_9_0 = Object.freeze({
  ...VERSION_1_0_0,
  version: "0.9.0",
  questions: Object.freeze(VERSION_1_0_0.questions.map((question) =>
    question.id === "promotion_target"
      ? freezeQuestion({ ...question, prompt: "What would you like to promote?" })
      : question)),
} satisfies QuestionnaireDefinition);

const QUESTIONNAIRE_CATALOG = new Map<string, QuestionnaireDefinition>([
  [`${VERSION_0_9_0.id}@${VERSION_0_9_0.version}`, VERSION_0_9_0],
  [`${VERSION_1_0_0.id}@${VERSION_1_0_0.version}`, VERSION_1_0_0],
  [`${VERSION_1_1_0.id}@${VERSION_1_1_0.version}`, VERSION_1_1_0],
  [`${VERSION_1_2_0.id}@${VERSION_1_2_0.version}`, VERSION_1_2_0],
]);

/**
 * Fails at process/test startup when a reviewed questionnaire violates a
 * versioning, branching, or fallback invariant. This keeps malformed releases
 * out of the database instead of discovering them midway through an interview.
 */
export function validateQuestionnaire(definition: QuestionnaireDefinition): void {
  if (!IDENTIFIER.test(definition.id)) throw new Error("Invalid questionnaire id");
  if (!/^\d+\.\d+\.\d+$/.test(definition.version)) {
    throw new Error(`Invalid questionnaire version '${definition.version}'`);
  }
  if (definition.questions.length === 0) throw new Error("A questionnaire must contain questions");

  const seenQuestions = new Map<string, InterviewQuestionDefinition>();
  for (const question of definition.questions) {
    if (!IDENTIFIER.test(question.id) || seenQuestions.has(question.id)) {
      throw new Error(`Invalid or duplicate question id '${question.id}'`);
    }
    if (!Number.isInteger(question.version) || question.version < 1) {
      throw new Error(`Question '${question.id}' must have a positive version`);
    }
    if (question.fallbackOptions.length < 2 || question.fallbackOptions.length > 12) {
      throw new Error(`Question '${question.id}' must have between 2 and 12 fallback options`);
    }
    if (!question.allowCustom) {
      throw new Error(`Question '${question.id}' must preserve a custom-answer path`);
    }
    if (question.customTextRequired &&
        question.answerMode !== "single_with_text" &&
        question.answerMode !== "multiple_with_text") {
      throw new Error(`Question '${question.id}' cannot require text in mode '${question.answerMode}'`);
    }
    if (question.prompt.trim().length === 0 || question.prompt.length > 500 ||
        question.supportingText.trim().length === 0 || question.supportingText.length > 2_000 ||
        question.meaning.trim().length === 0 || question.meaning.length > 1_000 ||
        question.examples.length > 10 || question.examples.some((example) =>
          example.trim().length === 0 || example.length > 1_000)) {
      throw new Error(`Question '${question.id}' has invalid reviewed copy`);
    }
    if (question.minimumSelections < 1 ||
        question.maximumSelections < question.minimumSelections ||
        question.maximumSelections > 5) {
      throw new Error(`Question '${question.id}' has invalid selection bounds`);
    }
    if ((question.answerMode === "single" || question.answerMode === "single_with_text") &&
        question.maximumSelections !== 1) {
      throw new Error(`Single-select question '${question.id}' must allow exactly one selection`);
    }
    const optionIds = new Set<string>();
    for (const fallback of question.fallbackOptions) {
      if (!IDENTIFIER.test(fallback.id) || optionIds.has(fallback.id)) {
        throw new Error(`Question '${question.id}' has an invalid or duplicate option id`);
      }
      if (fallback.label.trim().length === 0 || fallback.label.length > 240 ||
          fallback.label !== fallback.label.trim() || /[<>]/.test(fallback.label) ||
          /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(fallback.label) ||
          (fallback.description?.length ?? 0) > 1_000 ||
          (fallback.description !== undefined &&
            (fallback.description !== fallback.description.trim() ||
              /[<>]/.test(fallback.description) ||
              /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(fallback.description))) ||
          (fallback.requiresCustomText !== undefined && fallback.requiresCustomText !== true)) {
        throw new Error(`Question '${question.id}' has invalid fallback copy`);
      }
      optionIds.add(fallback.id);
    }
    if (question.when) {
      const dependency = seenQuestions.get(question.when.questionId);
      if (!dependency) {
        throw new Error(`Question '${question.id}' must branch only on an earlier question`);
      }
      if (question.when.selectedOptionIds.length === 0 ||
          question.when.selectedOptionIds.some((id) =>
            !dependency.fallbackOptions.some((fallback) => fallback.id === id))) {
        throw new Error(`Question '${question.id}' has an invalid branch option`);
      }
    }
    seenQuestions.set(question.id, question);
  }
}

for (const questionnaire of QUESTIONNAIRE_CATALOG.values()) validateQuestionnaire(questionnaire);

export function getQuestionnaire(
  questionnaireId = GUIDED_INTAKE_QUESTIONNAIRE_ID,
  version = CURRENT_GUIDED_INTAKE_VERSION,
): QuestionnaireDefinition {
  const questionnaire = QUESTIONNAIRE_CATALOG.get(`${questionnaireId}@${version}`);
  if (!questionnaire) {
    throw new Error(`Unknown questionnaire release '${questionnaireId}@${version}'`);
  }
  return questionnaire;
}

export function listQuestionnaireVersions(
  questionnaireId = GUIDED_INTAKE_QUESTIONNAIRE_ID,
): readonly string[] {
  return Object.freeze([...QUESTIONNAIRE_CATALOG.values()]
    .filter((definition) => definition.id === questionnaireId)
    .map((definition) => definition.version));
}
