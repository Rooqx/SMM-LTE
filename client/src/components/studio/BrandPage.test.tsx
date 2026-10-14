import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { ContextPage, ContextRevisionPage, Workspace } from "@/lib/contracts";
import { BrandPage } from "./BrandPage";

vi.mock("@/lib/api", () => ({
  api: {
    getContextPage: vi.fn(),
    getContextHistory: vi.fn(),
  },
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
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrandPage workspace={workspace} />
    </QueryClientProvider>,
  );
}

const firstPage: ContextPage = {
  context: [
    {
      key: "brand.voice",
      markdown: "## Voice rule\n\nBe **clear and warm**.\n\n<img src=x onerror=alert(1)>\n\n![Tracker](https://example.com/pixel.gif)",
      data: {},
      version: 2,
      updated_at: "2026-10-09T10:00:00Z",
    },
    {
      key: "brand.audience.primary",
      markdown: "Service founders who value practical guidance.",
      data: {},
      version: 1,
      updated_at: "2026-10-08T10:00:00Z",
    },
  ],
  nextCursor: null,
};

const historyPage: ContextRevisionPage = {
  items: [
    {
      id: "237452af-acde-48d0-ad8d-5f947bab8833",
      workspace_id: workspace.id,
      key: "brand.voice",
      revision: 2,
      markdown: "Be clear and warm.",
      data: {},
      source: "approval",
      status: "approved",
      parent_revision_id: "a81b8df2-5a60-485f-8c37-fda7463e8c55",
      created_by: "user:owner",
      decided_by: "user:owner",
      decision_note: null,
      created_at: "2026-10-09T10:00:00Z",
      decided_at: "2026-10-09T10:05:00Z",
    },
  ],
  nextCursor: null,
};

describe("BrandPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/brand");
    vi.mocked(api.getContextPage).mockResolvedValue(firstPage);
    vi.mocked(api.getContextHistory).mockResolvedValue(historyPage);
  });

  it("presents approved memory as friendly areas and safe Markdown", async () => {
    const { container } = renderPage();

    expect(await screen.findByRole("button", { name: /Brand voice/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your Brand" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Audience blueprint/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Voice rule" })).toBeInTheDocument();
    expect(screen.getByText("clear and warm")).toBeInTheDocument();
    expect(screen.getByText("brand.voice")).toBeInTheDocument();
    expect(screen.getByText("Current canonical memory")).toBeInTheDocument();
    expect(screen.getByText("Image omitted: Tracker")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("switches detail areas without exposing a raw context editor", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Audience blueprint/i }));

    expect(screen.getByRole("heading", { name: "Audience blueprint" })).toBeInTheDocument();
    expect(screen.getByText(/Service founders who value practical guidance/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Context key/i)).not.toBeInTheDocument();
    expect(window.location.search).toBe("?area=audience");
  });

  it("restores a valid Brand area from the URL", async () => {
    window.history.replaceState({}, "", "/brand?area=audience");
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Audience blueprint" }),
    ).toBeInTheDocument();
  });

  it("loads another bounded context page when a cursor is available", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getContextPage).mockImplementation(async (_workspaceId, query) => {
      if (query?.cursor === "next-page") {
        return {
          context: [
            {
              key: "strategy.monthly_plan",
              markdown: "Build qualified demand.",
              data: {},
              version: 1,
            },
          ],
          nextCursor: null,
        };
      }
      return { ...firstPage, nextCursor: "next-page" };
    });
    renderPage();

    expect(
      await screen.findByText(/More approved memory is available/i),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Load more memory" }));

    await waitFor(() => {
      expect(api.getContextPage).toHaveBeenCalledWith(
        workspace.id,
        { cursor: "next-page", limit: 50 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(await screen.findByRole("button", { name: /Current strategy/i })).toBeInTheDocument();
  });

  it("loads bounded protected history and routes improvement through Today", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Version history" }));
    expect(await screen.findByText("Be clear and warm.")).toBeInTheDocument();
    expect(api.getContextHistory).toHaveBeenCalledWith(
      workspace.id,
      { key: "brand.voice", limit: 20, cursor: null },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByRole("button", { name: "Hide version history" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "Improve in Today" })).toHaveAttribute(
      "href",
      `/?workspace=${workspace.id}`,
    );
  });

  it("uses an honest empty state when no approved memory exists", async () => {
    vi.mocked(api.getContextPage).mockResolvedValue({ context: [], nextCursor: null });
    renderPage();

    expect(await screen.findByText("No approved brand memory yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start brand onboarding" })).toBeInTheDocument();
  });

  it("initializes selected area from URL query and updates URL on selection", async () => {
    window.history.replaceState({}, "", "/brand?area=audience");
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Audience blueprint" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Brand voice/i }));
    expect(window.location.search).toContain("area=voice");
  });

  it("restores the selected area when browser history changes", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Audience blueprint/i }));
    window.history.pushState({}, "", "/brand?area=voice");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByRole("heading", { name: "Brand voice" })).toBeInTheDocument();
  });
});
