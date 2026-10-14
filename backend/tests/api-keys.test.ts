import { describe, expect, it } from "vitest";
import { API_KEY_PREFIX, generateApiKey, hashApiKey } from "../src/auth/api-keys.js";

describe("API key material", () => {
  it("generates high-entropy prefixed tokens and deterministic hashes", () => {
    const first = generateApiKey();
    const second = generateApiKey();

    expect(first.token).toMatch(/^smm_[A-Za-z0-9_-]{43}$/);
    expect(first.token.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashApiKey(first.token));
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).not.toContain(first.token);
  });
});
