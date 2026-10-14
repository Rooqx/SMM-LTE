import { describe, expect, it } from "vitest";
import { isCrossOriginMutation } from "./request-origin";

const target = new URL("https://app.example.com/api/auth/sign-in/email");

function request(method: string, headers?: HeadersInit): Request {
  return new Request(target, { method, ...(headers ? { headers } : {}) });
}

describe("isCrossOriginMutation", () => {
  it("allows safe methods", () => {
    expect(
      isCrossOriginMutation(
        request("GET", {
          origin: "https://malicious.example",
          "sec-fetch-site": "cross-site",
        }),
        target,
      ),
    ).toBe(false);
  });

  it("trusts an exact Origin over rewritten Fetch Metadata", () => {
    expect(
      isCrossOriginMutation(
        request("POST", {
          origin: target.origin,
          "sec-fetch-site": "cross-site",
        }),
        target,
      ),
    ).toBe(false);
  });

  it("allows an explicitly configured proxy-facing Origin", () => {
    expect(
      isCrossOriginMutation(
        request("POST", {
          origin: "https://public.example.com",
          "sec-fetch-site": "cross-site",
        }),
        target,
        ["https://public.example.com"],
      ),
    ).toBe(false);
  });

  it("rejects a different or malformed Origin", () => {
    expect(
      isCrossOriginMutation(
        request("POST", { origin: "https://malicious.example" }),
        target,
      ),
    ).toBe(true);
    expect(
      isCrossOriginMutation(request("POST", { origin: "not a url" }), target),
    ).toBe(true);
  });

  it("uses Fetch Metadata when Origin is absent", () => {
    expect(
      isCrossOriginMutation(
        request("POST", { "sec-fetch-site": "same-origin" }),
        target,
      ),
    ).toBe(false);
    expect(
      isCrossOriginMutation(
        request("POST", { "sec-fetch-site": "cross-site" }),
        target,
      ),
    ).toBe(true);
  });

  it("falls back to Referer for browser clients without other metadata", () => {
    expect(
      isCrossOriginMutation(
        request("POST", { referer: "https://app.example.com/work" }),
        target,
      ),
    ).toBe(false);
    expect(
      isCrossOriginMutation(
        request("POST", { referer: "https://malicious.example/work" }),
        target,
      ),
    ).toBe(true);
  });
});
