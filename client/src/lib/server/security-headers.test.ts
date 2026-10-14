import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "./security-headers";

describe("security headers", () => {
  it("protects private responses without unsafe inline allowances", () => {
    const response = applySecurityHeaders(new Response("ok"), false);

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("content-security-policy")).not.toContain(
      "unsafe-inline",
    );
    expect(response.headers.has("strict-transport-security")).toBe(false);
  });

  it("enables HSTS only for the production TLS boundary", () => {
    const response = applySecurityHeaders(new Response("ok"), true);
    expect(response.headers.get("strict-transport-security")).toContain(
      "max-age=31536000",
    );
  });
});
