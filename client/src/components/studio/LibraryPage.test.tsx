import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type {
  Artifact,
  FinalPost,
  GroupedPostSprint,
  Workspace,
} from "@/lib/contracts";
import { LibraryPage } from "./LibraryPage";

vi.mock("@/lib/api", () => ({
  api: {
    listFinalPosts: vi.fn(),
    listArtifacts: vi.fn(),
    decideRun: vi.fn(),
    reviseRun: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const mockWorkspace: Workspace = {
  id: "d7343021-237d-4b84-901a-3479c13ee0a2",
  name: "Novi Studio",
  slug: "novi-studio",
  timezone: "UTC",
  current_phase: 3,
  status: "active",
  version: 1,
  created_at: "2026-10-09T00:00:00Z",
  updated_at: "2026-10-09T00:00:00Z",
};

const mockPost1: FinalPost = {
  publication_version: 1,
  id: "3c3d3e3f-4a4b-4c4d-8e8f-0a0b0c0d0e0f",
  workspace_id: mockWorkspace.id,
  run_id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
  source_artifact_id: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
  logical_id: "c3d4e5f6-a1b2-4c3d-8e4f-5a6b7c8d9e0f",
  revision: 1,
  logical_key: "sprint-1.week-1.day-1.linkedin",
  sprint: "Sprint 1",
  week: 1,
  local_date: "2026-10-12",
  timezone: "UTC",
  platform: "linkedin",
  campaign: "Authority Launch",
  topic: "Rebrand Reality",
  pillar: "Authority",
  content_format: "post",
  title: "Monday · LinkedIn: Authority",
  content:
    "A rebrand should not begin with a logo. It should begin with the sentence your best customer uses.",
  status: "approved",
  publication_status: "ready",
};

const mockPost2: FinalPost = {
  publication_version: 1,
  id: "4d4e4f5a-5b5c-5d5e-9f9a-1b1c1d1e1f10",
  workspace_id: mockWorkspace.id,
  run_id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
  source_artifact_id: "b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e",
  logical_id: "d4e5f6a1-b2c3-4d4e-9f9a-1b1c1d1e1f10",
  revision: 1,
  logical_key: "sprint-1.week-1.day-1.twitter",
  sprint: "Sprint 1",
  week: 1,
  local_date: "2026-10-12",
  timezone: "UTC",
  platform: "x",
  campaign: "Authority Launch",
  topic: "Rebrand Reality",
  pillar: "Authority",
  content_format: "post",
  title: "Monday · X: Authority",
  content:
    "The most expensive rebrand mistake? Making the business look different before making the value feel obvious.",
  status: "approved",
  publication_status: "ready",
};

const mockGroupedSprints: GroupedPostSprint[] = [
  {
    sprint: "1",
    weeks: [
      {
        week: 1,
        days: [
          {
            date: "2026-10-12",
            posts: [mockPost1, mockPost2],
          },
        ],
      },
    ],
  },
];

const mockDraftArtifact: Artifact = {
  id: "e5f6a1b2-c3d4-4e5f-9a1b-2c3d4e5f6a1b",
  workspace_id: mockWorkspace.id,
  run_id: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
  kind: "brand_foundation",
  slug: "brand-foundation-v1",
  title: "Novi Studio Brand Foundation",
  content: "Positioning statement: High-velocity brand strategy for engineering founders.",
  version: 1,
  status: "draft",
};

const mockCalendarArtifact: Artifact = {
  id: "f6a1b2c3-d4e5-4f6a-1b2c-3d4e5f6a1b2c",
  workspace_id: mockWorkspace.id,
  run_id: "b2c3d4e5-f6a1-4a1b-8c2d-3e4f5a6b7c8e",
  kind: "content_calendar",
  slug: "month-1-calendar",
  title: "Month 1 Content Strategy Calendar",
  content: "4 weeks of targeted content across LinkedIn and X.",
  version: 1,
  status: "approved",
};

describe("LibraryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/library");

    // Standard mock resolutions
    vi.mocked(api.listFinalPosts).mockImplementation((_wsId, query) => {
      if (query?.view === "grouped") {
        return Promise.resolve({
          items: [],
          nextCursor: null,
          groups: mockGroupedSprints,
        });
      }
      return Promise.resolve({
        items: [mockPost1, mockPost2],
        nextCursor: null,
      });
    });

    vi.mocked(api.listArtifacts).mockImplementation((_wsId, query) => {
      if (query?.status === "draft") {
        return Promise.resolve({
          items: [mockDraftArtifact],
          nextCursor: null,
        });
      }
      return Promise.resolve({
        items: [mockDraftArtifact, mockCalendarArtifact],
        nextCursor: null,
      });
    });
  });

  it("renders the Fast view with spotlight post and post stream", async () => {
    renderWithClient(<LibraryPage workspace={mockWorkspace} />);

    // Header assertions
    expect(await screen.findByText("Content Library")).toBeInTheDocument();
    expect(
      screen.getByText("Everything your agent creates, organized and ready to use."),
    ).toBeInTheDocument();

    // Spotlight section
    expect(await screen.findByText("Next to publish")).toBeInTheDocument();
    expect(
      await screen.findByText(/A rebrand should not begin with a logo/i),
    ).toBeInTheDocument();

    // Remaining posts section
    expect(
      screen.getByText(/The most expensive rebrand mistake/i),
    ).toBeInTheDocument();

    // Tab badge indicates 1 draft review item
    expect(screen.getByRole("tab", { name: /needs review/i })).toHaveTextContent("1");
  });

  it("handles single-click clipboard copy with accessible feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    renderWithClient(<LibraryPage workspace={mockWorkspace} />);

    const copyButtons = await screen.findAllByRole("button", {
      name: /copy post text/i,
    });
    const copyButton = copyButtons[0];
    expect(copyButton).toBeDefined();
    if (copyButton) {
      fireEvent.click(copyButton);
    }

    expect(writeTextMock).toHaveBeenCalledWith(mockPost1.content);
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });

  it("filters posts by platform and search query", async () => {
    renderWithClient(<LibraryPage workspace={mockWorkspace} />);

    expect(await screen.findByText("Next to publish")).toBeInTheDocument();

    // Filter by platform "X"
    const xFilterButton = screen.getByRole("button", { name: /^x$/i });
    fireEvent.click(xFilterButton);

    // mockPost2 (X) is now in spotlight, mockPost1 (LinkedIn) is filtered out
    expect(
      await screen.findByText(/The most expensive rebrand mistake/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/A rebrand should not begin with a logo/i),
    ).not.toBeInTheDocument();

    // Search query filter
    const searchInput = screen.getByPlaceholderText(
      /search posts, topics, or campaigns/i,
    );
    fireEvent.change(searchInput, { target: { value: "nonexistent query" } });

    expect(
      await screen.findByText(/no posts found matching the selected filters/i),
    ).toBeInTheDocument();
  });

  it("handles cursor pagination when loading more posts", async () => {
    const mockPost3: FinalPost = {
      publication_version: 1,
      ...mockPost1,
      id: "5e5f6a1b-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
      content: "Third page post loaded via cursor pagination.",
    };

    vi.mocked(api.listFinalPosts).mockImplementation((_wsId, query) => {
      if (query?.cursor === "page_2") {
        return Promise.resolve({
          items: [mockPost3],
          nextCursor: null,
        });
      }
      return Promise.resolve({
        items: [mockPost1],
        nextCursor: "page_2",
      });
    });

    renderWithClient(<LibraryPage workspace={mockWorkspace} />);

    // Load more button appears because nextCursor is "page_2"
    const loadMoreButton = await screen.findByRole("button", {
      name: /load more posts/i,
    });
    expect(loadMoreButton).toBeInTheDocument();

    fireEvent.click(loadMoreButton);

    // Appended third post appears in document
    expect(
      await screen.findByText(/Third page post loaded via cursor pagination/i),
    ).toBeInTheDocument();
  });

  it("switches to Folders view and toggles hierarchy accordions", async () => {
    renderWithClient(<LibraryPage workspace={mockWorkspace} />);

    const foldersTab = await screen.findByRole("tab", { name: /folders/i });
    fireEvent.click(foldersTab);

    // Week header
    expect(await screen.findByText(/Sprint 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Week 1/i)).toBeInTheDocument();

    // Deliverables section
    expect(screen.getByText("Strategy & deliverables")).toBeInTheDocument();
    expect(screen.getByText("Novi Studio Brand Foundation")).toBeInTheDocument();

    // Day level posts
    expect(screen.getAllByText("2026-10-12").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/A rebrand should not begin with a logo/i),
    ).toBeInTheDocument();
  });

  it("switches to Needs review tab, renders draft deliverables, and approves", async () => {
    vi.mocked(api.decideRun).mockResolvedValue({} as never);

    renderWithClient(<LibraryPage workspace={mockWorkspace} />);

    const reviewTab = await screen.findByRole("tab", { name: /needs review/i });
    fireEvent.click(reviewTab);

    expect(
      await screen.findByText("Novi Studio Brand Foundation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();

    const approveButton = screen.getByRole("button", {
      name: /approve novi studio brand foundation/i,
    });
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.decideRun).toHaveBeenCalledWith(
        mockDraftArtifact.run_id,
        "approve",
      );
    });
  });

  it("supports requesting revisions with required instructions", async () => {
    vi.mocked(api.reviseRun).mockResolvedValue({} as never);

    renderWithClient(<LibraryPage workspace={mockWorkspace} />);

    const reviewTab = await screen.findByRole("tab", { name: /needs review/i });
    fireEvent.click(reviewTab);

    const reviseButton = await screen.findByRole("button", {
      name: /ask for changes on novi studio brand foundation/i,
    });
    fireEvent.click(reviseButton);

    // Revision textarea appears
    const textarea = screen.getByPlaceholderText(
      /describe exactly what you want adjusted/i,
    );
    expect(textarea).toBeInTheDocument();

    // Submitting without instructions triggers error
    const submitButton = screen.getByRole("button", { name: /submit changes/i });
    fireEvent.click(submitButton);

    expect(
      screen.getByText("Please provide revision instructions."),
    ).toBeInTheDocument();

    // Type instructions and submit
    fireEvent.change(textarea, {
      target: { value: "Make the positioning statement sharper." },
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.reviseRun).toHaveBeenCalledWith(
        mockDraftArtifact.run_id,
        expect.objectContaining({
          expectedReviewRevision: mockDraftArtifact.version,
          instructions: "Make the positioning statement sharper.",
        }),
      );
    });
  });

  it("displays stale revision conflict banner when HTTP 409 occurs", async () => {
    vi.mocked(api.reviseRun).mockRejectedValue({
      status: 409,
      message: "Conflict: stale revision",
    });

    renderWithClient(<LibraryPage workspace={mockWorkspace} />);

    const reviewTab = await screen.findByRole("tab", { name: /needs review/i });
    fireEvent.click(reviewTab);

    const reviseButton = await screen.findByRole("button", {
      name: /ask for changes/i,
    });
    fireEvent.click(reviseButton);

    const textarea = screen.getByPlaceholderText(
      /describe exactly what you want adjusted/i,
    );
    fireEvent.change(textarea, { target: { value: "Change the tone." } });

    const submitButton = screen.getByRole("button", { name: /submit changes/i });
    fireEvent.click(submitButton);

    expect(
      await screen.findByText(/stale revision detected/i),
    ).toBeInTheDocument();
  });

  it("initializes Needs review tab directly when URL has ?view=review", async () => {
    window.history.replaceState({}, "", "/library?view=review");

    renderWithClient(<LibraryPage workspace={mockWorkspace} />);

    // Directly in Review view
    expect(
      await screen.findByText("Novi Studio Brand Foundation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Awaiting review")).toBeInTheDocument();
  });
});
