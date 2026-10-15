import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { LlmActionSchema } from "../domain/schemas.js";
import { classifyProviderError, PermanentProviderError } from "./errors.js";
import type { LlmProvider, LlmRequest } from "./provider.js";
import type { CannotContinueReason } from "./provider.js";
import { normalizeOpenAIBaseUrl } from "./openai-url.js";

const emptyObject = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

const artifact = {
  type: "object",
  properties: {
    kind: { type: "string", minLength: 1, maxLength: 80 },
    slug: { type: "string", minLength: 1, maxLength: 160 },
    title: { type: "string", minLength: 1, maxLength: 240 },
    content: { type: "string", maxLength: 50_000 },
    // Structured artifact metadata is introduced with the M5 artifact model.
    metadata: emptyObject,
  },
  required: ["kind", "slug", "title", "content", "metadata"],
  additionalProperties: false,
} as const;

const contextUpdate = {
  type: "object",
  properties: {
    key: {
      type: "string",
      pattern: "^(brand|strategy|calendar|social|analytics)\\.[a-z0-9_.-]+$",
    },
    markdown: { type: "string", maxLength: 50_000 },
    data: emptyObject,
  },
  required: ["key", "markdown", "data"],
  additionalProperties: false,
} as const;

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

const finalPost = {
  type: "object",
  properties: {
    logicalKey: {
      type: "string",
      pattern: "^[a-z0-9][a-z0-9_.-]{0,159}$",
    },
    sprint: { type: "string", minLength: 1, maxLength: 120 },
    week: { type: "integer", minimum: 1, maximum: 53 },
    localDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    platform: {
      type: "string",
      pattern: "^[a-z0-9][a-z0-9_.-]{0,39}$",
    },
    campaign: {
      anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }],
    },
    topic: { type: "string", minLength: 1, maxLength: 240 },
    pillar: {
      anyOf: [{ type: "string", maxLength: 160 }, { type: "null" }],
    },
    format: {
      type: "string",
      pattern: "^[a-z0-9][a-z0-9_.-]{0,79}$",
    },
    title: { type: "string", minLength: 1, maxLength: 240 },
    content: { type: "string", maxLength: 50_000 },
    pinnedComment: {
      anyOf: [{ type: "string", maxLength: 10_000 }, { type: "null" }],
    },
    metadata: emptyObject,
  },
  required: [
    "logicalKey", "sprint", "week", "localDate", "platform", "campaign",
    "topic", "pillar", "format", "title", "content", "pinnedComment", "metadata",
  ],
  additionalProperties: false,
} as const;

/** Strict provider schema; step-specific authorization is still enforced locally. */
const actionVariants = [
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["ask_user"] },
        questionKey: {
          type: "string",
          pattern: "^[a-z0-9][a-z0-9_.-]{0,119}$",
        },
        prompt: { type: "string", minLength: 1, maxLength: 10_000 },
        purpose: { type: "string", maxLength: 2_000 },
        options: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                pattern: "^[a-z0-9][a-z0-9_.-]{0,79}$",
              },
              label: { type: "string", minLength: 1, maxLength: 240 },
              description: { type: "string", maxLength: 1_000 },
            },
            required: ["id", "label", "description"],
            additionalProperties: false,
          },
        },
        selectionMode: { type: "string", enum: ["single", "multiple"] },
        allowCustom: { type: "boolean", enum: [true] },
      },
      required: ["type", "questionKey", "prompt", "purpose", "options", "selectionMode", "allowCustom"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["request_tool"] },
        tool: { type: "string", enum: ["list_approved_artifacts"] },
        arguments: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 60 },
            kinds: { type: "array", items: { type: "string" }, maxItems: 10 },
          },
          required: ["limit", "kinds"],
          additionalProperties: false,
        },
      },
      required: ["type", "tool", "arguments"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["request_optional_skill"] },
        skill: { type: "string" },
        input: {
          type: "object",
          properties: { instruction: { type: "string" } },
          required: ["instruction"],
          additionalProperties: false,
        },
      },
      required: ["type", "skill", "input"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["propose_output"] },
        message: { type: "string", minLength: 1, maxLength: 10_000 },
        artifacts: { type: "array", items: artifact, maxItems: 60 },
        contextUpdates: { type: "array", items: contextUpdate, maxItems: 10 },
        finalPosts: { type: "array", items: finalPost, maxItems: 100 },
      },
      required: ["type", "message", "artifacts", "contextUpdates", "finalPosts"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["request_approval"] },
        message: { type: "string", minLength: 1, maxLength: 10_000 },
        artifacts: { type: "array", items: artifact, maxItems: 60 },
        contextUpdates: { type: "array", items: contextUpdate, maxItems: 10 },
        finalPosts: { type: "array", items: finalPost, maxItems: 100 },
      },
      required: ["type", "message", "artifacts", "contextUpdates", "finalPosts"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["complete_step"] },
        message: { type: "string", minLength: 1, maxLength: 10_000 },
      },
      required: ["type", "message"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["cannot_continue"] },
        message: { type: "string", minLength: 1, maxLength: 10_000 },
        reason: {
          type: "string",
          enum: ["missing_input", "unsupported_capability", "safety_constraint"],
        },
        missing: { type: "array", items: { type: "string" }, maxItems: 20 },
      },
      required: ["type", "message", "reason", "missing"],
      additionalProperties: false,
    },
] as const;

function actionTypeForVariant(variant: (typeof actionVariants)[number]): string {
  return variant.properties.type.enum[0];
}

/** Builds the smallest schema authorized for a single orchestration step. */
export function actionSchemaFor(
  allowedActionTypes: readonly string[],
  allowedCannotContinueReasons: readonly CannotContinueReason[] = [
    "missing_input",
    "unsupported_capability",
    "safety_constraint",
  ],
) {
  const allowed = new Set(allowedActionTypes);
  const variants = actionVariants
    .filter((variant) => allowed.has(actionTypeForVariant(variant)))
    .map((variant) => {
      if (actionTypeForVariant(variant) !== "cannot_continue") return variant;
      return {
        ...variant,
        properties: {
          ...variant.properties,
          reason: {
            type: "string",
            enum: [...allowedCannotContinueReasons],
          },
        },
      };
    });
  if (variants.length === 0) {
    throw new Error("At least one model action must be authorized");
  }
  return {
    type: "object",
    properties: { action: { anyOf: variants } },
    required: ["action"],
    additionalProperties: false,
  } as const;
}

export const LLM_ACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    action: {
      anyOf: actionVariants,
    },
  },
  required: ["action"],
  additionalProperties: false,
} as const;

function extractJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const raw = fenced?.[1] ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    throw new PermanentProviderError("The model returned malformed JSON output");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Some OpenAI-compatible gateways satisfy JSON mode but still emit `null` or
 * an array for optional metadata bags. Metadata is not user-facing content and
 * never controls orchestration, so dropping an invalid bag is safer than
 * discarding an otherwise valid multi-post deliverable. All substantive fields
 * remain under the strict Zod trust boundary below.
 */
function normalizeMetadataBags(value: unknown): unknown {
  if (!isRecord(value)) return value;

  let root: Record<string, unknown> = value;
  for (const wrapper of ["output", "data", "result", "response"]) {
    if (!root.action && isRecord(root[wrapper]) && isRecord((root[wrapper] as Record<string, unknown>).action)) {
      root = root[wrapper] as Record<string, unknown>;
      break;
    }
  }

  const action = root.action;
  if (!isRecord(action) ||
    (action.type !== "propose_output" && action.type !== "request_approval")) {
    return root;
  }

  const normalizedAction: Record<string, unknown> = { ...action };
  if (normalizedAction.context_updates) {
    if (!normalizedAction.contextUpdates) {
      normalizedAction.contextUpdates = normalizedAction.context_updates;
    }
    delete normalizedAction.context_updates;
  }
  if (normalizedAction.final_posts) {
    if (!normalizedAction.finalPosts) {
      normalizedAction.finalPosts = normalizedAction.final_posts;
    }
    delete normalizedAction.final_posts;
  }

  const normalizeItems = (
    items: unknown,
    field: "metadata" | "data",
  ): unknown => Array.isArray(items)
    ? items.map((item) => isRecord(item)
      ? { ...item, [field]: isRecord(item[field]) ? item[field] : {} }
      : item)
    : items;

  const rawFinalPosts = Array.isArray(normalizedAction.finalPosts)
    ? normalizedAction.finalPosts
    : undefined;
  const finalPosts = rawFinalPosts
    ? rawFinalPosts.map((post) => {
        if (!isRecord(post)) return post;
        const p = { ...post };
        if (p.logical_key) {
          if (!p.logicalKey) p.logicalKey = p.logical_key;
          delete p.logical_key;
        }
        if (p.local_date) {
          if (!p.localDate) p.localDate = p.local_date;
          delete p.local_date;
        }
        if (p.pinned_comment !== undefined) {
          if (p.pinnedComment === undefined) p.pinnedComment = p.pinned_comment;
          delete p.pinned_comment;
        }
        if (p.content_format) {
          if (!p.format) p.format = p.content_format;
          delete p.content_format;
        }
        if (typeof p.format === "string") {
          p.format = p.format
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_.-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80) || "post";
        }
        if (typeof p.platform === "string") {
          p.platform = p.platform
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_.-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "social";
        }
        if (typeof p.week === "string") {
          const parsedWeek = parseInt(p.week, 10);
          if (!Number.isNaN(parsedWeek)) p.week = parsedWeek;
        }
        p.metadata = isRecord(p.metadata) ? p.metadata : {};
        return p;
      })
    : undefined;

  return {
    ...root,
    action: {
      ...normalizedAction,
      artifacts: normalizeItems(normalizedAction.artifacts, "metadata"),
      contextUpdates: normalizeItems(normalizedAction.contextUpdates, "data"),
      ...(finalPosts ? { finalPosts } : {}),
    },
  };
}

export function parseActionEnvelope(value: unknown) {
  const normalized = normalizeMetadataBags(value);
  if (!isRecord(normalized)) {
    throw new Error("The model returned an invalid action envelope");
  }
  const parsed = LlmActionSchema.safeParse(normalized.action);
  if (!parsed.success) {
    // Provider output can contain user-derived content. The worker records a
    // bounded error classification at the orchestration boundary; never dump
    // the rejected envelope or schema values to stdout.
    const issueSummary = parsed.error.issues
      .slice(0, 12)
      .map((issue) => `${issue.path.join(".") || "action"}:${issue.code}`)
      .join(", ");
    throw new PermanentProviderError(
      `The model returned an invalid structured action (${issueSummary})`,
    );
  }
  return parsed.data;
}

export class OpenAIProvider implements LlmProvider {
  readonly #client: OpenAI;
  readonly #model: string;
  readonly #maxOutputTokens: number;

  constructor(
    apiKey: string,
    model: string,
    options: {
      baseURL?: string | undefined;
      timeoutMs: number;
      maxRetries: number;
      maxOutputTokens: number;
    },
  ) {
    this.#client = new OpenAI({
      apiKey,
      baseURL: normalizeOpenAIBaseUrl(options.baseURL),
      timeout: options.timeoutMs,
      maxRetries: options.maxRetries,
    });
    this.#model = model;
    this.#maxOutputTokens = options.maxOutputTokens;
  }

  async execute(request: LlmRequest) {
    try {
      const schema = actionSchemaFor(
        request.allowedActionTypes,
        request.allowedCannotContinueReasons,
      );
      const systemPrompt = [
        request.developerPrompt,
        "Return exactly one JSON object matching this authorized action schema:",
        JSON.stringify(schema),
      ].join("\n\n");
      let previousOutput: string | null = null;
      let validationFeedback: string | null = null;
      let inputTokens = 0;
      let outputTokens = 0;
      let totalTokens = 0;
      let hasInputUsage = false;
      let hasOutputUsage = false;
      let hasTotalUsage = false;

      // A compatible gateway may guarantee JSON syntax without enforcing the
      // full schema. Permit one corrective turn for malformed model content;
      // transport retries remain owned by the SDK and durable job queue.
      for (let contentAttempt = 0; contentAttempt < 2; contentAttempt += 1) {
        const messages: ChatCompletionMessageParam[] = previousOutput === null
          ? [
              { role: "system" as const, content: systemPrompt },
              { role: "user" as const, content: request.userPrompt },
            ]
          : [
              { role: "system" as const, content: systemPrompt },
              { role: "user" as const, content: request.userPrompt },
              { role: "assistant" as const, content: previousOutput },
              {
                role: "user" as const,
                content: [
                  "The previous JSON failed local schema validation.",
                  validationFeedback ? `Validation issues: ${validationFeedback}.` : "",
                  "Correct it to match the authorized schema exactly. Preserve the substantive deliverable and return JSON only.",
                ].filter(Boolean).join(" "),
              },
            ];
        const response: ChatCompletion = await this.#client.chat.completions.create({
          model: this.#model,
          max_tokens: this.#maxOutputTokens,
          messages,
          // JSON mode is supported by more OpenAI-compatible gateways than the
          // Responses API. The local Zod schema remains the trust boundary.
          response_format: { type: "json_object" },
        }, {
          headers: {
            "X-Client-Request-Id": contentAttempt === 0
              ? request.correlationId
              : `${request.correlationId}:repair`,
          },
        });

        if (response.usage?.prompt_tokens !== undefined) {
          inputTokens += response.usage.prompt_tokens;
          hasInputUsage = true;
        }
        if (response.usage?.completion_tokens !== undefined) {
          outputTokens += response.usage.completion_tokens;
          hasOutputUsage = true;
        }
        if (response.usage?.total_tokens !== undefined) {
          totalTokens += response.usage.total_tokens;
          hasTotalUsage = true;
        }

        const outputText: string | null | undefined = response.choices[0]?.message.content;
        if (!outputText) {
          if (contentAttempt === 0) {
            previousOutput = "{}";
            continue;
          }
          throw new PermanentProviderError("The model returned no usable structured output");
        }

        try {
          const parsedJson = extractJsonText(outputText);
          const action = parseActionEnvelope(parsedJson);
          return {
            action,
            provider: "openai",
            model: this.#model,
            providerResponseId: response.id,
            usage: {
              inputTokens: hasInputUsage ? inputTokens : null,
              outputTokens: hasOutputUsage ? outputTokens : null,
              totalTokens: hasTotalUsage ? totalTokens : null,
            },
          };
        } catch (error) {
          console.log("[LLM_EXECUTE_ATTEMPT]", {
            attempt: contentAttempt,
            error: (error as Error).message,
            finishReason: response.choices[0]?.finish_reason,
            outputTextSnippet: outputText.slice(0, 400),
          });
          if (!(error instanceof PermanentProviderError) || contentAttempt > 0) {
            throw error;
          }
          previousOutput = outputText;
          validationFeedback = error.message;
        }
      }

      throw new PermanentProviderError("The model returned invalid structured output");
    } catch (error) {
      // Provider SDK errors can echo request/output bodies. Classification
      // preserves retry semantics without logging the raw diagnostic object.
      throw classifyProviderError(error);
    }
  }
}
