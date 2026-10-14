const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/**
 * Accept either an OpenAI-compatible API root or a concrete generation
 * endpoint. Keeping this normalization at the provider boundary prevents
 * accidental paths such as `/chat/completions/chat/completions`.
 */
export function normalizeOpenAIBaseUrl(value?: string): string {
  const raw = (value ?? DEFAULT_OPENAI_BASE_URL).trim().replace(/\/+$/, "");
  const normalized = raw
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/responses$/i, "");
  const url = new URL(normalized);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("OPENAI_BASE_URL must use HTTP or HTTPS");
  }
  return url.toString().replace(/\/$/, "");
}

export function openAIChatCompletionsUrl(value?: string): string {
  return `${normalizeOpenAIBaseUrl(value)}/chat/completions`;
}
