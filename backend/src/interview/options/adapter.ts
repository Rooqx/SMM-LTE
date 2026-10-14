import { buildOptionAssistantPrompt } from "./prompt.js";
import { openAIChatCompletionsUrl } from "../../llm/openai-url.js";
import {
  type OptionGenerationRequest,
  type OptionGenerationResponse,
  type OptionGenerationResult,
  OptionGenerationResponseSchema,
  type SuggestionItem,
} from "./types.js";

function validateTargetCoverage(
  response: OptionGenerationResponse,
  request: OptionGenerationRequest,
): OptionGenerationResponse {
  const expected = new Set(request.targetQuestions.map((question) => question.questionId));
  const actual = Object.keys(response.suggestions);
  if (actual.length !== expected.size || actual.some((questionId) => !expected.has(questionId))) {
    throw new Error("Option assistant returned suggestions for an unexpected question set");
  }
  return response;
}

function boundedTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 &&
      value <= 10_000_000
    ? value
    : null;
}

function boundedResponseId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(value)
    ? value
    : null;
}

export interface OptionAssistantAdapter {
  readonly providerName: string;
  readonly modelName: string;
  generate(
    request: OptionGenerationRequest,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<OptionGenerationResult>;
}

export class MockOptionAssistantAdapter implements OptionAssistantAdapter {
  readonly providerName = "mock";
  readonly modelName = "mock-small-model";

  constructor(
    readonly simulateDelayMs = 0,
    readonly shouldFail = false,
    readonly shouldTimeout = false,
  ) {}

  async generate(
    request: OptionGenerationRequest,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<OptionGenerationResult> {
    if (this.shouldTimeout) {
      await new Promise((resolve) => setTimeout(resolve, (options?.timeoutMs ?? 5000) + 100));
      throw new Error("Option assistant timed out");
    }

    if (this.simulateDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulateDelayMs));
    }

    if (this.shouldFail) {
      throw new Error("Simulated option generation error");
    }

    const suggestions: Record<string, SuggestionItem[]> = {};
    const text = (request.businessDescription + " " + (request.category ?? "")).toLowerCase();

    for (const q of request.targetQuestions) {
      suggestions[q.questionId] = this.#generateForQuestion(q.questionId, text);
    }

    const response = {
      suggestions,
      explanation: "Personalized suggestions based on your business description.",
    };

    return {
      ...validateTargetCoverage(OptionGenerationResponseSchema.parse(response), request),
      providerResponseId: null,
      usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    };
  }

  #generateForQuestion(questionId: string, businessText: string): SuggestionItem[] {
    const isSoftware = businessText.includes("saas") || businessText.includes("software") || businessText.includes("app");
    const isRetail = businessText.includes("store") || businessText.includes("skincare") || businessText.includes("product") || businessText.includes("ecommerce");
    const isService = businessText.includes("service") || businessText.includes("consult") || businessText.includes("coach") || businessText.includes("fitness");

    switch (questionId) {
      case "audience":
        if (isSoftware) {
          return [
            { label: "Startup founders and operators", description: "Early-stage teams looking to move faster" },
            { label: "Independent software developers", description: "Engineers building side projects or tools" },
            { label: "Small business managers", description: "Teams looking to automate recurring tasks" },
          ];
        }
        if (isRetail) {
          return [
            { label: "Everyday online shoppers", description: "People looking for quality direct-to-consumer items" },
            { label: "Eco-conscious buyers", description: "Shoppers who care about sustainable packaging" },
            { label: "Gift shoppers", description: "People buying thoughtful presents for others" },
          ];
        }
        if (isService) {
          return [
            { label: "Busy working parents", description: "People needing structured, flexible guidance" },
            { label: "Career transitioners", description: "People looking for expert step-by-step coaching" },
            { label: "Local clients", description: "People in the immediate regional area" },
          ];
        }
        return [
          { label: "Individual consumers", description: "People buying directly for personal use" },
          { label: "Small team leads", description: "Managers looking to improve team output" },
          { label: "Local community members", description: "People living or working nearby" },
        ];

      case "customer_outcome":
        if (isSoftware) {
          return [
            { label: "Cut repetitive manual work", description: "Save hours each week on routine tasks" },
            { label: "Get organized faster", description: "Keep key workflows in one reliable place" },
          ];
        }
        if (isRetail) {
          return [
            { label: "Feel confident in what they use", description: "Trusted, high-quality ingredients" },
            { label: "Simplify their daily routine", description: "Reliable products that just work" },
          ];
        }
        return [
          { label: "Save precious time each week", description: "Clear steps without trial and error" },
          { label: "Achieve measurable progress", description: "Noticeable results within a few weeks" },
        ];

      case "primary_goal":
        if (isSoftware) {
          return [
            { label: "Get early beta testers and feedback" },
            { label: "Build credibility in our industry" },
          ];
        }
        return [
          { label: "Attract people who are ready to buy" },
          { label: "Build trust with helpful educational posts" },
        ];

      case "brand_perception":
        if (isSoftware) {
          return [
            { label: "Modern and intuitive", description: "Clean, fresh, and easy to use" },
            { label: "Dependable and robust", description: "Rock solid with great support" },
            { label: "Approachable and friendly", description: "Warm and easy to talk to" },
          ];
        }
        return [
          { label: "Warm and inviting", description: "A friendly space where anyone feels welcome" },
          { label: "Knowledgeable and clear", description: "Explains things simply without confusing terms" },
          { label: "Practical and down-to-earth", description: "Focused on real-world results" },
        ];

      case "platform_priorities":
        if (isSoftware) {
          return [
            { label: "X / Twitter", description: "Tech community and builder updates" },
            { label: "LinkedIn", description: "Professional networking and founder thoughts" },
            { label: "YouTube", description: "Product walkthroughs and tutorials" },
          ];
        }
        return [
          { label: "Instagram", description: "Visual stories and community interaction" },
          { label: "TikTok", description: "Short-form video tips and relatable moments" },
          { label: "Facebook", description: "Local groups and community discussions" },
        ];

      case "call_to_action":
        if (isSoftware) {
          return [
            { label: "Try the free trial", description: "Test the tool without a credit card" },
            { label: "Join the waitlist", description: "Get early access as we roll out" },
          ];
        }
        return [
          { label: "Visit the website", description: "Browse the full collection online" },
          { label: "Send a direct message", description: "Ask a quick question or book an appointment" },
        ];

      case "content_boundaries":
        return [
          { label: "No pushy sales pitches", description: "Focus on helping rather than hard selling" },
          { label: "No unverified claims", description: "Stick to what we know and can stand behind" },
          { label: "Keep private details offline", description: "Protect personal family and team privacy" },
        ];

      default:
        return [
          { label: "Option A tailored to you", description: "A strong starting point based on your profile" },
          { label: "Option B tailored to you", description: "An alternative angle focusing on steady growth" },
        ];
    }
  }
}

export class OpenAIOptionAssistantAdapter implements OptionAssistantAdapter {
  readonly providerName = "openai";
  readonly modelName: string;

  constructor(
    readonly apiKey: string,
    modelName: string,
    readonly baseUrl = "https://api.openai.com/v1",
    readonly defaultTimeoutMs = 5000,
  ) {
    this.modelName = modelName;
  }

  async generate(
    request: OptionGenerationRequest,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<OptionGenerationResult> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const { developerPrompt, userPrompt } = buildOptionAssistantPrompt(request);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    if (options?.signal?.aborted) {
      controller.abort();
    } else if (options?.signal) {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const response = await fetch(openAIChatCompletionsUrl(this.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            { role: "system", content: developerPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 800,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Provider bodies may echo prompts or user content. Keep operational
        // errors content-free and expose only the bounded status code.
        throw new Error(`OpenAI option assistant request failed with status ${response.status}`);
      }

      let data: {
        id?: string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };
      try {
        data = await response.json() as typeof data;
      } catch {
        throw new Error("OpenAI option assistant returned an invalid response envelope");
      }
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI option assistant returned empty message content");
      }

      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7).replace(/```$/, "").trim();
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3).replace(/```$/, "").trim();
      }

      let validated: OptionGenerationResponse;
      try {
        const parsedJson = JSON.parse(cleanContent) as unknown;

        // Gracefully cap suggestion arrays to the schema maximum (4) if the
        // model generated extras.
        if (parsedJson && typeof parsedJson === "object" && "suggestions" in parsedJson) {
          const rawSuggestions = (parsedJson as Record<string, unknown>).suggestions;
          if (rawSuggestions && typeof rawSuggestions === "object") {
            for (const key of Object.keys(rawSuggestions as Record<string, unknown>)) {
              const suggestions = (rawSuggestions as Record<string, unknown>)[key];
              if (Array.isArray(suggestions) && suggestions.length > 4) {
                (rawSuggestions as Record<string, unknown>)[key] = suggestions.slice(0, 4);
              }
            }
          }
        }

        validated = OptionGenerationResponseSchema.parse(parsedJson);
      } catch {
        // Schema errors may embed provider-generated labels or descriptions.
        // Keep the worker's logged exception content-free.
        throw new Error("OpenAI option assistant returned invalid structured output");
      }

      return {
        ...validateTargetCoverage(validated, request),
        providerResponseId: boundedResponseId(data.id),
        usage: {
          inputTokens: boundedTokenCount(data.usage?.prompt_tokens),
          outputTokens: boundedTokenCount(data.usage?.completion_tokens),
          totalTokens: boundedTokenCount(data.usage?.total_tokens),
        },
      };
    } finally {
      clearTimeout(timer);
      if (options?.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    }
  }
}
