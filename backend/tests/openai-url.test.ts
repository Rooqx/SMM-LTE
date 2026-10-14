import { describe, expect, it } from "vitest";
import {
  normalizeOpenAIBaseUrl,
  openAIChatCompletionsUrl,
} from "../src/llm/openai-url.js";

describe("OpenAI-compatible URL normalization", () => {
  it.each([
    ["https://gateway.example/v1", "https://gateway.example/v1"],
    ["https://gateway.example/v1/", "https://gateway.example/v1"],
    ["https://gateway.example/v1/chat/completions", "https://gateway.example/v1"],
    ["https://gateway.example/v1/responses", "https://gateway.example/v1"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeOpenAIBaseUrl(input)).toBe(expected);
  });

  it("builds one chat-completions suffix from either accepted form", () => {
    expect(openAIChatCompletionsUrl("https://gateway.example/v1/chat/completions"))
      .toBe("https://gateway.example/v1/chat/completions");
  });
});
