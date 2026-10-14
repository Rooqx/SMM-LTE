import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("@/lib/auth-client", () => ({ signOut }));

import {
  clearPrivateBrowserState,
  endPrivateSession,
} from "@/lib/session-security";

describe("session security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("clears only private workflow state", () => {
    sessionStorage.setItem("smm_active_run_workspace", "run-1");
    sessionStorage.setItem("unrelated", "keep");

    clearPrivateBrowserState();

    expect(sessionStorage.getItem("smm_active_run_workspace")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });

  it("clears queries and signs out", async () => {
    const queryClient = {
      cancelQueries: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };
    signOut.mockResolvedValue({ error: null });

    await endPrivateSession(queryClient as never);

    expect(queryClient.cancelQueries).toHaveBeenCalledOnce();
    expect(queryClient.clear).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("does not silently accept a failed sign-out", async () => {
    const queryClient = {
      cancelQueries: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    };
    signOut.mockResolvedValue({ error: { message: "failed" } });

    await expect(endPrivateSession(queryClient as never)).rejects.toThrow(
      "Secure sign-out could not be completed.",
    );
  });
});
