import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@/lib/contracts";
import { api } from "@/lib/api";
import { authClient, useSession } from "@/lib/auth-client";
import { AccountPage } from "./AccountPage";

vi.mock("@/lib/api", () => ({
  api: {
    enqueueObsidianExportJob: vi.fn(),
    getObsidianExportJob: vi.fn(),
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
    updateWorkspace: vi.fn(),
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    changePassword: vi.fn(),
    linkSocial: vi.fn(),
    listAccounts: vi.fn(),
    listSessions: vi.fn(),
    revokeOtherSessions: vi.fn(),
    revokeSession: vi.fn(),
  },
  signOut: vi.fn(),
  useSession: vi.fn(),
}));

const workspace: Workspace = {
  id: "d7343021-237d-4b84-901a-3479c13ee0a2",
  name: "Novi Studio",
  slug: "novi-studio",
  timezone: "Africa/Lagos",
  current_phase: 2,
  status: "active",
  version: 1,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountPage workspace={workspace} />
    </QueryClientProvider>,
  );
}

describe("AccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: { id: "user-1", email: "owner@example.com", name: "Amina Owner" },
        session: { token: "current-token" },
      },
      error: null,
      isPending: false,
    } as never);
    vi.mocked(authClient.listAccounts).mockResolvedValue({
      data: [{ id: "method-1", providerId: "credential" }],
      error: null,
    } as never);
    vi.mocked(authClient.listSessions).mockResolvedValue({
      data: [
        {
          id: "session-1",
          token: "current-token",
          expiresAt: new Date("2026-12-01T09:00:00Z"),
          userAgent: "Chrome Linux",
        },
        {
          id: "session-2",
          token: "other-token",
          expiresAt: new Date("2026-12-02T09:00:00Z"),
          userAgent: "Safari iPhone",
        },
      ],
      error: null,
    } as never);
    vi.mocked(authClient.revokeSession).mockResolvedValue({
      data: { status: true },
      error: null,
    } as never);
    vi.mocked(api.enqueueObsidianExportJob).mockResolvedValue({
      id: "job-1",
      status: "queued",
    });
    vi.mocked(api.getObsidianExportJob).mockResolvedValue({
      id: "job-1",
      status: "completed",
      workspace_id: workspace.id,
    });
    vi.mocked(api.getPreferences).mockResolvedValue({
      organization_id: "a7343021-237d-4b84-901a-3479c13ee0a2",
      user_id: "b7343021-237d-4b84-901a-3479c13ee0a2",
      timezone: "Africa/Lagos",
      theme: "dark",
      email_notifications: false,
      autopilot_enabled: true,
      review_reminders_enabled: true,
      version: 1,
      created_at: "2026-10-10T00:00:00.000Z",
      updated_at: "2026-10-10T00:00:00.000Z",
    });
  });

  it("shows real identity, sign-in methods, sessions, and durable settings", async () => {
    renderPage();

    expect(await screen.findByText("Amina Owner")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(await screen.findByText("Email and password")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Africa/Lagos")).toHaveLength(2);
    expect(await screen.findByRole("button", { name: "Save preferences" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Rasm" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
  });

  it("requires confirmation before revoking another session", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Sign out this device" }));
    expect(authClient.revokeSession).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "Confirm" })[0]!);

    await waitFor(() => {
      expect(authClient.revokeSession).toHaveBeenCalledWith({ token: "other-token" });
    });
  });

  it("queues an Obsidian export and follows its authoritative status", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Queue export" }));

    await waitFor(() => {
      expect(api.enqueueObsidianExportJob).toHaveBeenCalledWith(
        workspace.id,
        expect.any(String),
      );
    });
    expect(await screen.findByText(/Export status: completed/i)).toBeInTheDocument();
  });
});
