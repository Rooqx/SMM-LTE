import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import type {
  BrandFoundationPresentation,
  ContentCalendarPresentation,
  FinalPost,
  PendingQuestion,
  QcScorecardPresentation,
  Run,
  WorkflowState,
  Workspace,
} from "@/lib/contracts";
import { TODAY_MOMENT_FIXTURES } from "@/test/fixtures/today-moments";
import { TodayPage } from "./TodayPage";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "usr_123",
        name: "Farooq Ashiru",
        email: "dev@autopilot.local",
      },
    },
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getWorkflow: vi.fn(),
    listArtifacts: vi.fn(),
    listFinalPosts: vi.fn(),
    getRun: vi.fn(),
    continueWorkflow: vi.fn(),
    startContentCycle: vi.fn(),
    startInterview: vi.fn(),
    answerQuestion: vi.fn(),
    decideRun: vi.fn(),
    reviseRun: vi.fn(),
    connectRunEvents: vi.fn().mockReturnValue(() => {}),
    getInterviewState: vi.fn().mockResolvedValue(null),
    submitInterviewAnswer: vi.fn(),
    markOptionSetPresented: vi.fn().mockResolvedValue({ id: "opt-1" }),
    prefetchInterviewOptions: vi.fn().mockResolvedValue({ status: "queued" }),
  },
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly code = "REQUEST_FAILED",
      readonly status = 500,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

const mockWorkspace: Workspace = {
  id: "d7343021-237d-4b84-901a-3479c13ee0a2",
  name: "Novi Studio",
  slug: "novi-studio",
  timezone: "UTC",
  current_phase: 1,
  status: "active",
  version: 1,
};

const mockWorkflow: WorkflowState = {
  activeRun: null,
  workflowId: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
  workflowStatus: "active",
  workflowVersion: 1,
  recipeVersion: "1.0.0",
  phaseInstanceId: "f3c8008a-24a9-467f-a631-0428ef50a9dc",
  phase: 1,
  cycle: 1,
  phaseStatus: "active",
  conversationId: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  pendingQuestion: null,
};

const defaultRun: Run = {
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: mockWorkspace.id,
  phase: 1,
  skill_name: "brand-foundations",
  status: "running",
  approvals: [],
  artifacts: [],
  final_posts: [],
};

describe("TodayPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    vi.mocked(api.getRun).mockResolvedValue(defaultRun);
    vi.mocked(api.listArtifacts).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    vi.mocked(api.listFinalPosts).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
  });

  it("renders needs_workspace moment when workspace is undefined", () => {
    renderWithClient(<TodayPage workspace={undefined} />);

    expect(
      screen.getByText("Give your brand a dedicated workspace."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Initialize your first brand workspace"),
    ).toBeInTheDocument();
  });

  it("renders welcome moment and handles 'Start with one question'", async () => {
    vi.mocked(api.getWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(api.startInterview).mockResolvedValue({
      authority: "guided",
      session: {
        id: "33333333-3333-4333-8333-333333333333",
        workspace_id: mockWorkspace.id,
        questionnaire_id: "brand_foundation_v1",
        questionnaire_version: "1.0.0",
        status: "in_progress",
        current_question_id: "promotion_target",
        version: 1,
        started_at: "2026-10-13T00:00:00.000Z",
        updated_at: "2026-10-13T00:00:00.000Z",
        completed_at: null,
      },
      progress: {
        completedCount: 0,
        totalQuestions: 1,
        currentIndex: 1,
        percentComplete: 0,
      },
      currentQuestion: null,
      previousAnswer: null,
    });

    renderWithClient(<TodayPage workspace={mockWorkspace} />);

    expect(
      await screen.findByText("Let’s teach me the basics about Novi Studio."),
    ).toBeInTheDocument();
    expect(screen.getByText("Start with one question")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Start with one question"));

    await waitFor(() => {
      expect(api.startInterview).toHaveBeenCalledWith(mockWorkspace.id);
    });
    expect(api.continueWorkflow).not.toHaveBeenCalled();
  });

  it("renders question moment and handles selecting option and submitting answer", async () => {
    const questionFixture = TODAY_MOMENT_FIXTURES.question.payload
      ?.question as PendingQuestion;
    vi.mocked(api.getWorkflow).mockResolvedValue({
      ...mockWorkflow,
      pendingQuestion: questionFixture,
    });
    vi.mocked(api.answerQuestion).mockResolvedValue({
      answer: {
        answerId: "ans-1",
        questionId: questionFixture.id,
        questionVersion: 1,
        replayed: false,
      },
      run: {
        id: "22222222-2222-4222-8222-222222222222",
        status: "running",
        phase: 1,
      },
    });

    renderWithClient(<TodayPage workspace={mockWorkspace} />);

    expect(
      await screen.findByRole(
        "heading",
        { name: "How should your brand feel when people read a post?" },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Trusted expert")).toBeInTheDocument();
    expect(screen.getByText("Warm guide")).toBeInTheDocument();

    // Select second option
    fireEvent.click(screen.getByText("Warm guide"));

    // Submit answer
    const submitBtn = screen.getByRole("button", { name: /Submit answer/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.answerQuestion).toHaveBeenCalledWith(
        mockWorkspace.id,
        questionFixture.id,
        {
          expectedVersion: questionFixture.version,
          answer: { type: "option", optionId: "warm" },
          idempotencyKey: expect.any(String),
        },
      );
    });
  });

  it("renders question moment and handles custom text answer", async () => {
    const questionFixture = TODAY_MOMENT_FIXTURES.question.payload
      ?.question as PendingQuestion;
    vi.mocked(api.getWorkflow).mockResolvedValue({
      ...mockWorkflow,
      pendingQuestion: questionFixture,
    });
    vi.mocked(api.answerQuestion).mockResolvedValue({
      answer: {
        answerId: "ans-2",
        questionId: questionFixture.id,
        questionVersion: 1,
        replayed: false,
      },
      run: {
        id: "22222222-2222-4222-8222-222222222222",
        status: "running",
        phase: 1,
      },
    });

    renderWithClient(<TodayPage workspace={mockWorkspace} />);

    expect(
      await screen.findByRole(
        "heading",
        { name: "How should your brand feel when people read a post?" },
        { timeout: 5_000 },
      ),
    ).toBeInTheDocument();

    // The own-answer field is always visible; no extra selection is needed.
    const textarea = screen.getByLabelText(/Your own answer/i);
    fireEvent.change(textarea, {
      target: { value: "Irreverent, sharp, and highly technical" },
    });

    // Submit
    const submitBtn = screen.getByRole("button", { name: /Submit answer/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.answerQuestion).toHaveBeenCalledWith(
        mockWorkspace.id,
        questionFixture.id,
        {
          expectedVersion: questionFixture.version,
          answer: {
            type: "custom",
            text: "Irreverent, sharp, and highly technical",
          },
          idempotencyKey: expect.any(String),
        },
      );
    });
  });

  it("renders thinking moment when run is active via linkable parameter", async () => {
    const runningRun: Run = {
      id: "33333333-3333-4333-8333-333333333333",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "brand-foundations",
      status: "running",
      approvals: [],
      artifacts: [],
      final_posts: [],
    };

    window.history.replaceState({}, "", `/?run=${runningRun.id}`);
    vi.mocked(api.getWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(api.getRun).mockResolvedValue(runningRun);

    renderWithClient(<TodayPage workspace={mockWorkspace} />);

    expect(
      await screen.findByText("Synthesizing your brand foundation..."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Researching & writing/i)).toBeInTheDocument();
  });

  it("recovers the workspace active run without a URL pointer", async () => {
    const runningRun: Run = {
      ...defaultRun,
      id: "33333333-3333-4333-8333-333333333334",
    };
    vi.mocked(api.getWorkflow).mockResolvedValue({
      ...mockWorkflow,
      activeRun: {
        id: runningRun.id,
        status: "running",
        phase: 1,
        updated_at: "2026-10-10T09:00:00.000Z",
      },
    });
    vi.mocked(api.getRun).mockResolvedValue(runningRun);

    renderWithClient(<TodayPage workspace={mockWorkspace} />);

    expect(await screen.findByText("Synthesizing your brand foundation...")).toBeInTheDocument();
    expect(api.getRun).toHaveBeenCalledWith(runningRun.id, expect.any(Object));
    expect(window.location.search).toBe(`?run=${runningRun.id}`);
  });

  it("renders review moment and handles approve action with waiting_approval contract", async () => {
    const brandFoundation = TODAY_MOMENT_FIXTURES.review.payload
      ?.brandFoundation as BrandFoundationPresentation;
    const reviewRun: Run = {
      id: "44444444-4444-4444-8444-444444444444",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "brand-foundations",
      status: "waiting_approval",
      output_status: "pending",
      review_revision: 1,
      output: {
        message: "Brand foundation ready.",
        artifacts: [brandFoundation],
        context_updates: [],
        next_action: "request_approval",
      },
      approvals: [],
      artifacts: [],
      final_posts: [],
    };

    window.history.replaceState({}, "", `/?run=${reviewRun.id}`);
    vi.mocked(api.getWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(api.getRun).mockResolvedValue(reviewRun);
    vi.mocked(api.decideRun).mockResolvedValue({
      ...reviewRun,
      status: "approved",
    });

    renderWithClient(<TodayPage workspace={mockWorkspace} />);

    expect(
      await screen.findByText("Your brand foundation is ready for review."),
    ).toBeInTheDocument();
    expect(screen.getByText("Approve & continue")).toBeInTheDocument();
    expect(screen.getByText("Ask for changes")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Approve & continue"));

    await waitFor(() => {
      expect(api.decideRun).toHaveBeenCalledWith(reviewRun.id, "approve");
    });
  });

  it("renders review moment, expands revision input, and submits revision feedback", async () => {
    const brandFoundation = TODAY_MOMENT_FIXTURES.review.payload
      ?.brandFoundation as BrandFoundationPresentation;
    const reviewRun: Run = {
      id: "44444444-4444-4444-8444-444444444444",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "brand-foundations",
      status: "waiting_approval",
      output_status: "pending",
      review_revision: 1,
      output: {
        message: "Brand foundation ready.",
        artifacts: [brandFoundation],
        context_updates: [],
        next_action: "request_approval",
      },
      approvals: [],
      artifacts: [],
      final_posts: [],
    };

    window.history.replaceState({}, "", `/?run=${reviewRun.id}`);
    vi.mocked(api.getWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(api.getRun).mockResolvedValue(reviewRun);
    vi.mocked(api.reviseRun).mockResolvedValue({
      id: "55555555-5555-4555-8555-555555555555",
      status: "running",
      phase: 1,
      reviewThreadId: "th-1",
      reviewRevision: 2,
      supersedesRunId: reviewRun.id,
    });

    renderWithClient(<TodayPage workspace={mockWorkspace} />);

    expect(
      await screen.findByText("Your brand foundation is ready for review."),
    ).toBeInTheDocument();

    // Click "Ask for changes"
    fireEvent.click(screen.getByText("Ask for changes"));

    const textarea = screen.getByLabelText(/What would you like adjusted\?/i);
    expect(textarea).toBeInTheDocument();

    fireEvent.change(textarea, {
      target: {
        value: "Emphasize enterprise security and HIPAA compliance in pillar 2.",
      },
    });

    // Send revision
    const sendBtn = screen.getByText("Send revision request");
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(api.reviseRun).toHaveBeenCalledWith(reviewRun.id, {
        expectedReviewRevision: 1,
        instructions:
          "Emphasize enterprise security and HIPAA compliance in pillar 2.",
        idempotencyKey: expect.any(String),
      });
    });
  });

  it("handles revision concurrency conflict (HTTP 409) with friendly banner", async () => {
    const brandFoundation = TODAY_MOMENT_FIXTURES.review.payload
      ?.brandFoundation as BrandFoundationPresentation;
    const reviewRun: Run = {
      id: "44444444-4444-4444-8444-444444444444",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "brand-foundations",
      status: "waiting_approval",
      output_status: "pending",
      review_revision: 1,
      output: {
        message: "Brand foundation ready.",
        artifacts: [brandFoundation],
        context_updates: [],
        next_action: "request_approval",
      },
      approvals: [],
      artifacts: [],
      final_posts: [],
    };

    window.history.replaceState({}, "", `/?run=${reviewRun.id}`);
    vi.mocked(api.getWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(api.getRun).mockResolvedValue(reviewRun);
    vi.mocked(api.reviseRun).mockRejectedValue(
      new ApiError("Conflict revision mismatch", "REVISION_CONFLICT", 409),
    );

    renderWithClient(<TodayPage workspace={mockWorkspace} />);

    expect(
      await screen.findByText("Your brand foundation is ready for review."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Ask for changes"));
    const textarea = screen.getByLabelText(/What would you like adjusted\?/i);
    fireEvent.change(textarea, {
      target: { value: "Update target demographic" },
    });

    fireEvent.click(screen.getByText("Send revision request"));

    expect(await screen.findByText("Revision Conflict")).toBeInTheDocument();
    expect(
      screen.getByText(
        /A revision conflict occurred because the deliverable was updated/i,
      ),
    ).toBeInTheDocument();
  });

  it("renders calendar moment (Phase 2 review) with calendar details", async () => {
    const calendar = TODAY_MOMENT_FIXTURES.calendar.payload
      ?.calendar as ContentCalendarPresentation;
    const calendarRun: Run = {
      id: "66666666-6666-4666-8666-666666666666",
      workspace_id: mockWorkspace.id,
      phase: 2,
      skill_name: "content-calendar",
      status: "waiting_approval",
      output_status: "pending",
      review_revision: 1,
      output: {
        message: "Calendar draft ready.",
        artifacts: [calendar],
        context_updates: [],
        next_action: "request_approval",
      },
      approvals: [],
      artifacts: [],
      final_posts: [],
    };

    window.history.replaceState({}, "", `/?run=${calendarRun.id}`);
    vi.mocked(api.getWorkflow).mockResolvedValue({
      ...mockWorkflow,
      phase: 2,
    });
    vi.mocked(api.getRun).mockResolvedValue(calendarRun);

    renderWithClient(
      <TodayPage workspace={{ ...mockWorkspace, current_phase: 2 }} />,
    );

    expect(
      await screen.findByText(
        "Your monthly strategic content calendar is ready for review.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Approve calendar & continue")).toBeInTheDocument();
  });

  it("renders qc moment (Phase 4 review) and handles approve action", async () => {
    const qcScorecard = TODAY_MOMENT_FIXTURES.qc.payload
      ?.qcScorecard as QcScorecardPresentation;
    const qcRun: Run = {
      id: "77777777-7777-4777-8777-777777777777",
      workspace_id: mockWorkspace.id,
      phase: 4,
      skill_name: "qc-polish",
      status: "waiting_approval",
      output_status: "pending",
      review_revision: 1,
      output: {
        message: "Scorecard ready.",
        artifacts: [qcScorecard],
        context_updates: [],
        next_action: "request_approval",
      },
      approvals: [],
      artifacts: [],
      final_posts: [],
    };

    window.history.replaceState({}, "", `/?run=${qcRun.id}`);
    vi.mocked(api.getWorkflow).mockResolvedValue({
      ...mockWorkflow,
      phase: 4,
    });
    vi.mocked(api.getRun).mockResolvedValue(qcRun);
    vi.mocked(api.decideRun).mockResolvedValue({
      ...qcRun,
      status: "approved",
    });

    renderWithClient(
      <TodayPage workspace={{ ...mockWorkspace, current_phase: 4 }} />,
    );

    expect(
      await screen.findByText(
        "Your content quality & compliance scorecard is ready.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Checks Passed")).toBeInTheDocument();
    expect(
      screen.getByText("Approve scorecard & continue"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Approve scorecard & continue"));

    await waitFor(() => {
      expect(api.decideRun).toHaveBeenCalledWith(qcRun.id, "approve");
    });
  });

  it("renders cycle_complete moment (Phase 6) and triggers next cycle continuation", async () => {
    vi.mocked(api.getWorkflow).mockResolvedValue({
      ...mockWorkflow,
      phase: 6,
      cycle: 1,
      phaseStatus: "completed",
    });
    vi.mocked(api.continueWorkflow).mockResolvedValue({
      id: "88888888-8888-4888-8888-888888888888",
      status: "running",
      phase: 2,
    });

    renderWithClient(
      <TodayPage workspace={{ ...mockWorkspace, current_phase: 6 }} />,
    );

    expect(
      await screen.findByText(
        "Cycle 1 complete. Ready for Cycle 2 strategy.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Start Cycle 2 strategy"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Start Cycle 2 strategy"));

    await waitFor(() => {
      expect(api.continueWorkflow).toHaveBeenCalledWith(
        mockWorkspace.id,
        expect.any(String),
      );
    });
  });

  it("isolates cache and resets active run when switching workspaces", async () => {
    const runningRun: Run = {
      id: "99999999-9999-4999-8999-999999999999",
      workspace_id: mockWorkspace.id,
      phase: 1,
      skill_name: "brand-foundations",
      status: "running",
      approvals: [],
      artifacts: [],
      final_posts: [],
    };

    window.history.replaceState({}, "", `/?run=${runningRun.id}`);
    vi.mocked(api.getWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(api.getRun).mockResolvedValue(runningRun);

    const { rerender } = renderWithClient(
      <TodayPage workspace={mockWorkspace} />,
    );

    expect(
      await screen.findByText("Synthesizing your brand foundation..."),
    ).toBeInTheDocument();

    // Switch workspace to different workspace
    const secondWorkspace: Workspace = {
      ...mockWorkspace,
      id: "e8454132-348e-5c95-012b-4580d24ff1b3",
      name: "Second Brand",
      slug: "second-brand",
    };

    rerender(<TodayPage workspace={secondWorkspace} />);

    // Active run resets, showing orientation welcome for second workspace
    expect(
      await screen.findByText("Let’s teach me the basics about Second Brand."),
    ).toBeInTheDocument();
  });

  it("renders production moment (Phase 3)", async () => {
    vi.mocked(api.getWorkflow).mockResolvedValue({
      ...mockWorkflow,
      phase: 3,
    });

    renderWithClient(
      <TodayPage workspace={{ ...mockWorkspace, current_phase: 3 }} />,
    );

    expect(
      await screen.findByText("Ready to draft your scheduled posts."),
    ).toBeInTheDocument();
    expect(screen.getByText("Start drafting")).toBeInTheDocument();
  });

  it("renders posts moment and allows copying post content", async () => {
    const posts = TODAY_MOMENT_FIXTURES.posts.payload?.posts as FinalPost[];
    vi.mocked(api.getWorkflow).mockResolvedValue({
      ...mockWorkflow,
      phase: 5,
    });
    vi.mocked(api.listFinalPosts).mockResolvedValue({
      items: posts,
      nextCursor: null,
    });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    renderWithClient(
      <TodayPage workspace={{ ...mockWorkspace, current_phase: 5 }} />,
    );

    expect(
      await screen.findByText("Your latest platform-native posts are ready to publish."),
    ).toBeInTheDocument();
    const firstPost = posts[0]!;
    expect(screen.getByText(firstPost.content)).toBeInTheDocument();

    // Copy first post
    const copyBtn = screen.getByRole("button", {
      name: `Copy post for ${firstPost.platform}`,
    });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(firstPost.content);
    });
  });

  it("renders coach rail on desktop viewports", async () => {
    vi.mocked(api.getWorkflow).mockResolvedValue(mockWorkflow);

    renderWithClient(<TodayPage workspace={mockWorkspace} />);

    expect(
      await screen.findByLabelText("Rasm coach rail"),
    ).toBeInTheDocument();
    expect(screen.getByText("THIS PHASE")).toBeInTheDocument();
    expect(screen.getByText("LATEST DELIVERY")).toBeInTheDocument();
  });

  it("renders guided interview moment and submits answer via api.submitInterviewAnswer", async () => {
    vi.mocked(api.getWorkflow).mockResolvedValue(mockWorkflow);
    vi.mocked(api.getInterviewState).mockResolvedValue({
      authority: "guided",
      session: {
        id: "44444444-4444-4444-8444-444444444444",
        workspace_id: mockWorkspace.id,
        questionnaire_id: "core-brand-intake",
        questionnaire_version: "1.0.0",
        status: "in_progress",
        version: 1,
        started_at: "2026-10-10T00:00:00Z",
        updated_at: "2026-10-10T00:00:00Z",
      },
      status: "in_progress",
      progress: {
        currentIndex: 1,
        totalQuestions: 5,
        completedCount: 0,
        percentComplete: 0,
      },
      currentQuestion: {
        id: "brand_voice",
        version: 1,
        meaning: "Tone of voice",
        prompt: "How should your brand communicate with your audience?",
        supportingText: "Pick your communication style.",
        examples: [],
        answerMode: "single",
        required: true,
        allowCustom: true,
        customTextRequired: false,
        minimumSelections: 1,
        maximumSelections: 1,
        allowSelectAll: false,
        activeOptionSet: {
          id: "set-voice-1",
          origin: "curated",
          options: [
            { id: "bold_direct", label: "Bold & Direct" },
            { id: "friendly", label: "Friendly & Warm" },
          ],
        },
      },
    });

    renderWithClient(<TodayPage workspace={mockWorkspace} />);

    expect(
      await screen.findByRole("heading", {
        name: "How should your brand communicate with your audience?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Bold & Direct")).toBeInTheDocument();
    expect(screen.getByText("Friendly & Warm")).toBeInTheDocument();

    // Select second option and submit
    fireEvent.click(screen.getByLabelText(/Friendly & Warm/i));
    const submitBtn = screen.getByRole("button", { name: /Submit answer and advance/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.submitInterviewAnswer).toHaveBeenCalledWith(
        mockWorkspace.id,
        expect.objectContaining({
          sessionId: "44444444-4444-4444-8444-444444444444",
          expectedSessionVersion: 1,
          questionId: "brand_voice",
          questionVersion: 1,
          selectedOptionIds: ["friendly"],
        }),
      );
    });
  });
});
