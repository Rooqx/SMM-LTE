import { describe, expect, it, vi } from "vitest";
import {
  classifyProviderError,
  PermanentProviderError,
  TransientProviderError,
} from "../src/llm/errors.js";
import { parseActionEnvelope } from "../src/llm/openai-provider.js";

describe("provider error policy", () => {
  it("retries timeouts, rate limits, and server failures", () => {
    expect(classifyProviderError({ status: 429 })).toBeInstanceOf(TransientProviderError);
    expect(classifyProviderError({ status: 503 })).toBeInstanceOf(TransientProviderError);
    expect(classifyProviderError(Object.assign(new Error(), { code: "ETIMEDOUT" })))
      .toBeInstanceOf(TransientProviderError);
  });

  it("does not retry permanent provider requests or malformed actions", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(classifyProviderError({ status: 400 })).toBeInstanceOf(PermanentProviderError);
    expect(() => parseActionEnvelope({ action: { type: "invented_action" } }))
      .toThrow(PermanentProviderError);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("does not expose provider response bodies in classified errors", () => {
    const classified = classifyProviderError({ status: 500, message: "sensitive response body" });
    expect(classified.message).not.toContain("sensitive");
  });
});
