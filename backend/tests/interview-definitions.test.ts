import { describe, expect, it } from "vitest";
import {
  CURRENT_GUIDED_INTAKE_VERSION,
  getQuestionnaire,
  GUIDED_INTAKE_QUESTIONNAIRE_ID,
  listQuestionnaireVersions,
  validateQuestionnaire,
  type QuestionnaireDefinition,
} from "../src/interview/definitions.js";

describe("guided interview questionnaire definitions", () => {
  it("ships the reviewed beginner-friendly opening and complete fallback catalog", () => {
    const definition = getQuestionnaire();
    expect(definition).toMatchObject({
      id: GUIDED_INTAKE_QUESTIONNAIRE_ID,
      version: CURRENT_GUIDED_INTAKE_VERSION,
      compilerInputSchema: "brand-intake",
    });
    expect(definition.questions.map((question) => question.id)).toEqual([
      "promotion_target", "business_description", "audience", "customer_outcome",
    ]);
    expect(definition.questions[0]).toMatchObject({
      id: "promotion_target",
      prompt: "What are we promoting?",
      allowCustom: true,
      fallbackOptions: expect.arrayContaining([
        expect.objectContaining({ id: "company_business" }),
        expect.objectContaining({ id: "personal_brand" }),
        expect.objectContaining({ id: "client_business" }),
        expect.objectContaining({ id: "product_launch" }),
      ]),
    });
    expect(definition.questions.find((question) => question.id === "business_description"))
      .toMatchObject({
        prompt: "Tell me what you do.",
        answerMode: "single_with_text",
        customTextRequired: true,
        examples: expect.arrayContaining([
          "I created a SaaS app that helps small businesses make social media posts.",
          "I sell skincare products online.",
        ]),
      });
    for (const question of definition.questions) {
      expect(question.allowCustom).toBe(true);
      expect(question.fallbackOptions).toHaveLength(4);
      expect(question.fallbackOptions.some((option) => option.id === "something_else"))
        .toBe(false);
      expect(question.answerMode.endsWith("_with_text")).toBe(true);
    }
    expect(definition.questions.find((question) => question.id === "audience")?.allowSelectAll)
      .toBe(true);
  });

  it("retains older releases and never falls back silently for an unknown pin", () => {
    expect(listQuestionnaireVersions()).toEqual(["0.9.0", "1.0.0", "1.1.0", "1.2.0"]);
    expect(getQuestionnaire(GUIDED_INTAKE_QUESTIONNAIRE_ID, "0.9.0").questions[0]?.prompt)
      .toBe("What would you like to promote?");
    expect(() => getQuestionnaire(GUIDED_INTAKE_QUESTIONNAIRE_ID, "8.8.8"))
      .toThrow("Unknown questionnaire release");
  });

  it("rejects invalid ordering, branches, identifiers, and answer bounds", () => {
    const current = getQuestionnaire();
    const invalid = {
      ...current,
      questions: [{
        ...current.questions[0]!,
        id: "invalid branch",
        when: { questionId: "not_seen", selectedOptionIds: ["unknown"] },
      }],
    } as QuestionnaireDefinition;
    expect(() => validateQuestionnaire(invalid)).toThrow("Invalid or duplicate question id");

    const invalidBranch = {
      ...current,
      questions: [{
        ...current.questions[0]!,
        when: { questionId: "later_question", selectedOptionIds: ["unknown"] },
      }],
    } as QuestionnaireDefinition;
    expect(() => validateQuestionnaire(invalidBranch)).toThrow("branch only on an earlier question");
  });

  it("exposes frozen definitions so callers cannot mutate a pinned release", () => {
    const definition = getQuestionnaire();
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.questions)).toBe(true);
    expect(Object.isFrozen(definition.questions[0]?.fallbackOptions)).toBe(true);
  });
});
