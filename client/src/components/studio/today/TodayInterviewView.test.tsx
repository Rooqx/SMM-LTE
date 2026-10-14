import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { QuestionPresentation } from "@/lib/contracts";
import { TodayInterviewView } from "./TodayInterviewView";

vi.mock("@/lib/api", () => ({
  api: {
    markOptionSetPresented: vi.fn().mockResolvedValue({ id: "opt-set-1" }),
  },
}));

describe("TodayInterviewView (Variant B Guided Briefing UI)", () => {
  const defaultQuestion: QuestionPresentation = {
    id: "brand_voice",
    version: 1,
    meaning: "Determines the tone and posture for all platform drafts",
    prompt: "How should your brand communicate with your audience?",
    supportingText: "Choose the communication style that fits your company best.",
    examples: [
      "Witty and conversational, like Notion or Slack",
      "Direct, institutional, and data-driven",
    ],
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
        {
          id: "bold_direct",
          label: "Bold & Direct",
          description: "Clear, assertive, and focused on decisive outcomes.",
        },
        {
          id: "friendly_approachable",
          label: "Friendly & Approachable",
          description: "Warm, empathetic, and community-first tone.",
        },
        {
          id: "technical_analytical",
          label: "Technical & Analytical",
          description: "Rigorous, metric-backed, and developer-friendly.",
        },
      ],
    },
  };

  const defaultProps = {
    question: defaultQuestion,
    sessionId: "7a26ea98-0c67-4bbd-986c-48600c3b0dfb",
    sessionVersion: 1,
    workspaceId: "2443a6db-ae8e-4a4e-bf23-f3f2ff11a913",
    onSubmit: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders question prompt, supporting text, and option cards with number badges", () => {
    render(<TodayInterviewView {...defaultProps} />);

    expect(
      screen.getByText("How should your brand communicate with your audience?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Choose the communication style that fits your company best."),
    ).toBeInTheDocument();

    expect(screen.getByText("Bold & Direct")).toBeInTheDocument();
    expect(screen.getByText("Friendly & Approachable")).toBeInTheDocument();
    expect(screen.getByText("Technical & Analytical")).toBeInTheDocument();
    expect(screen.getByLabelText("Your own answer")).toBeInTheDocument();

    // Check number badge labels
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("submits single-select choice and triggers option presentation tracking on interaction", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TodayInterviewView {...defaultProps} onSubmit={onSubmit} />);

    // Select second option "Friendly & Approachable"
    const secondOption = screen.getByLabelText(/Friendly & Approachable/i);
    fireEvent.click(secondOption);

    // Verify option presentation tracking was called non-blockingly
    expect(api.markOptionSetPresented).toHaveBeenCalledWith(
      defaultProps.workspaceId,
      "set-voice-1",
      expect.objectContaining({
        sessionId: defaultProps.sessionId,
        interactionStarted: true,
      }),
    );

    // Submit answer
    const submitBtn = screen.getByRole("button", { name: /Submit answer and advance/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        sessionId: defaultProps.sessionId,
        expectedSessionVersion: 1,
        questionId: "brand_voice",
        questionVersion: 1,
        optionSetId: "set-voice-1",
        selectedOptionIds: ["friendly_approachable"],
      });
    });
  });

  it("selects options via keyboard number shortcuts when not focused in input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TodayInterviewView {...defaultProps} onSubmit={onSubmit} />);

    // Press key "2"
    fireEvent.keyDown(window, { key: "2" });

    const submitBtn = screen.getByRole("button", { name: /Submit answer and advance/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        sessionId: defaultProps.sessionId,
        expectedSessionVersion: 1,
        questionId: "brand_voice",
        questionVersion: 1,
        optionSetId: "set-voice-1",
        selectedOptionIds: ["friendly_approachable"],
      });
    });
  });

  it("supports multi-select with min and max bounds validation", async () => {
    const multiQuestion: QuestionPresentation = {
      ...defaultQuestion,
      answerMode: "multiple",
      minimumSelections: 2,
      maximumSelections: 2,
    };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <TodayInterviewView
        {...defaultProps}
        onSubmit={onSubmit}
        question={multiQuestion}
      />,
    );

    const submitBtn = screen.getByRole("button", { name: /Submit answer and advance/i });

    // Initially 0 or 1 selected (below minimum of 2)
    fireEvent.click(submitBtn);
    expect(
      await screen.findByText(/Please select at least 2 options/i),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    // Select 2 options
    fireEvent.click(screen.getByLabelText(/Bold & Direct/i));
    fireEvent.click(screen.getByLabelText(/Friendly & Approachable/i));

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedOptionIds: ["bold_direct", "friendly_approachable"],
        }),
      );
    });
  });

  it("supports an always-visible custom-only answer", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TodayInterviewView {...defaultProps} onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText(/Your own answer/i);
    expect(textarea).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /Submit answer and advance/i });

    // No option and no custom text is not an answer.
    fireEvent.click(submitBtn);
    expect(
      await screen.findByText(/Please select at least 1 option/i),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    // Fill in custom text
    fireEvent.change(textarea, { target: { value: "Irreverent, witty tech journalism" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        sessionId: defaultProps.sessionId,
        expectedSessionVersion: 1,
        questionId: "brand_voice",
        questionVersion: 1,
        optionSetId: "set-voice-1",
        selectedOptionIds: [],
        customText: "Irreverent, witty tech journalism",
      });
    });
  });

  it("supports hybrid option plus companion text mode", async () => {
    const hybridQuestion: QuestionPresentation = {
      ...defaultQuestion,
      answerMode: "single_with_text",
      customTextRequired: true,
    };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <TodayInterviewView
        {...defaultProps}
        onSubmit={onSubmit}
        question={hybridQuestion}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Bold & Direct/i));
    const textarea = screen.getByLabelText(/Your own answer/i);
    fireEvent.change(textarea, { target: { value: "Focus especially on LinkedIn posts" } });

    const submitBtn = screen.getByRole("button", { name: /Submit answer and advance/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedOptionIds: ["bold_direct"],
          customText: "Focus especially on LinkedIn posts",
        }),
      );
    });
  });

  it("selects every compatible suggestion and combines it with custom text", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <TodayInterviewView
        {...defaultProps}
        onSubmit={onSubmit}
        question={{
          ...defaultQuestion,
          answerMode: "multiple_with_text",
          maximumSelections: 3,
          allowSelectAll: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.change(screen.getByLabelText("Your own answer"), {
      target: { value: "We also want to educate existing customers." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit answer and advance/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      selectedOptionIds: ["bold_direct", "friendly_approachable", "technical_analytical"],
      customText: "We also want to educate existing customers.",
    })));
  });

  it("toggles examples and purpose disclosures with correct aria-expanded attributes", () => {
    render(<TodayInterviewView {...defaultProps} />);

    // Examples toggle
    const examplesBtn = screen.getByRole("button", { name: /See examples/i });
    expect(examplesBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(examplesBtn);
    expect(examplesBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Witty and conversational, like Notion or Slack/i)).toBeInTheDocument();

    // Purpose toggle
    const purposeBtn = screen.getByRole("button", { name: /Why I’m asking/i });
    expect(purposeBtn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(purposeBtn);
    expect(purposeBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Why autopilot asks this:/i)).toBeInTheDocument();
  });

  it("renders progress indicator when progress object is passed", () => {
    render(
      <TodayInterviewView
        {...defaultProps}
        progress={{
          currentIndex: 3,
          totalQuestions: 5,
          completedCount: 2,
          percentComplete: 40,
        }}
      />,
    );

    expect(screen.getByText("Question 3 of 5")).toBeInTheDocument();
    expect(screen.getByText("40% complete")).toBeInTheDocument();
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "40");
  });
});
