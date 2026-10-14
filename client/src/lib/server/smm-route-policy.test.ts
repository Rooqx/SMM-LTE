import { describe, expect, it } from "vitest";
import { isAllowedSmmRoute } from "./smm-route-policy";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const questionId = "22222222-2222-4222-8222-222222222222";

describe("SMM browser route policy", () => {
  it("exposes guided continuation but not raw skill selection", () => {
    expect(isAllowedSmmRoute("POST", `v1/workspaces/${workspaceId}/continue`)).toBe(true);
    expect(isAllowedSmmRoute("POST", `v1/workspaces/${workspaceId}/content-cycles`)).toBe(true);
    expect(isAllowedSmmRoute("GET", `v1/workspaces/${workspaceId}/workflow`)).toBe(true);
    expect(isAllowedSmmRoute(
      "POST",
      `v1/workspaces/${workspaceId}/questions/${questionId}/answer`,
    )).toBe(true);
    expect(isAllowedSmmRoute("POST", `v1/workspaces/${workspaceId}/runs`)).toBe(false);
    expect(isAllowedSmmRoute("GET", "v1/skills")).toBe(false);
    expect(isAllowedSmmRoute("PUT", `v1/workspaces/${workspaceId}/context`)).toBe(false);
    expect(
      isAllowedSmmRoute(
        "POST",
        `v1/workspaces/${workspaceId}/exports/obsidian`,
      ),
    ).toBe(false);
    expect(isAllowedSmmRoute("POST", `v1/runs/${questionId}/revise`)).toBe(true);
    expect(isAllowedSmmRoute("GET", `v1/workspaces/${workspaceId}/artifacts`)).toBe(true);
    expect(isAllowedSmmRoute("GET", `v1/workspaces/${workspaceId}/final-posts`)).toBe(true);
    expect(isAllowedSmmRoute("GET", `v1/workspaces/${workspaceId}/runs`)).toBe(true);
    expect(isAllowedSmmRoute("GET", `v1/workspaces/${workspaceId}/context/history`)).toBe(true);
    expect(isAllowedSmmRoute("PATCH", `v1/workspaces/${workspaceId}`)).toBe(true);
    expect(isAllowedSmmRoute("GET", "v1/account/preferences")).toBe(true);
    expect(isAllowedSmmRoute("PUT", "v1/account/preferences")).toBe(true);
    expect(isAllowedSmmRoute(
      "POST",
      `v1/workspaces/${workspaceId}/exports/obsidian/jobs`,
    )).toBe(true);
    expect(isAllowedSmmRoute("POST", `v1/workspaces/${workspaceId}/interview/start`)).toBe(true);
    expect(isAllowedSmmRoute("GET", `v1/workspaces/${workspaceId}/interview`)).toBe(true);
    expect(isAllowedSmmRoute("POST", `v1/workspaces/${workspaceId}/interview/answers`)).toBe(true);
    expect(isAllowedSmmRoute("GET", `v1/workspaces/${workspaceId}/interview/questions/promotion_target/options`)).toBe(true);
    expect(isAllowedSmmRoute("POST", `v1/workspaces/${workspaceId}/interview/options/${questionId}/present`)).toBe(true);
    expect(isAllowedSmmRoute("POST", `v1/workspaces/${workspaceId}/interview/options/prefetch`)).toBe(true);
    expect(isAllowedSmmRoute("GET", `v1/workspaces/${workspaceId}/runs/${questionId}/events`)).toBe(true);
    expect(isAllowedSmmRoute("GET", `v1/runs/${questionId}/events`)).toBe(true);
  });

  it("rejects method and identifier variations outside the explicit contract", () => {
    expect(isAllowedSmmRoute("GET", `v1/workspaces/${workspaceId}/continue`)).toBe(false);
    expect(isAllowedSmmRoute("POST", "v1/workspaces/not-a-uuid/continue")).toBe(false);
    expect(isAllowedSmmRoute("POST", `v1/workspaces/${workspaceId}/continue/extra`)).toBe(false);
  });
});
