import { afterEach, describe, expect, it, vi } from "vitest";
import { getServerConfig, resetServerConfigForTests } from "./config";

const secret = "test-only-better-auth-secret-at-least-32-chars";

afterEach(() => {
  resetServerConfigForTests();
  vi.unstubAllEnvs();
});

describe("server authentication configuration", () => {
  it("normalizes and deduplicates exact trusted origins", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4321/path-is-removed");
    vi.stubEnv(
      "AUTH_TRUSTED_ORIGINS",
      "http://localhost:4321, https://preview.example.com/path",
    );

    expect(getServerConfig().AUTH_TRUSTED_ORIGINS).toEqual([
      "http://localhost:4321",
      "https://preview.example.com",
    ]);
  });

  it("requires Google credentials as a pair", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");

    expect(() => getServerConfig()).toThrow("GOOGLE_CLIENT_ID");
  });

  it("rejects insecure production auth origins", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    vi.stubEnv("BETTER_AUTH_URL", "http://example.com");

    expect(() => getServerConfig()).toThrow("BETTER_AUTH_URL");
  });

  it("rejects an insecure additional trusted origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", "http://preview.example.com");

    expect(() => getServerConfig()).toThrow("AUTH_TRUSTED_ORIGINS");
  });
});
