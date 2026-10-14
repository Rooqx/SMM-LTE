import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewReadingFrame } from "./ReviewReadingFrame";
import { TodayReviewView } from "./TodayReviewView";

const draft = `# Direction\n\nWe help teams publish consistently.\n\n## Voice\n\n${"Direct, useful writing. ".repeat(40)}`;

describe("ReviewReadingFrame", () => {
  it("shows source-based skim and lets readers access the full draft", () => {
    render(<ReviewReadingFrame title="Brand foundation" markdown={draft} />);
    expect(screen.getAllByText("We help teams publish consistently.").length).toBeGreaterThan(0);
    expect(screen.getByText("Approval applies to the complete draft.", { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Full draft" }));
    expect(screen.getByRole("region", { name: "Brand foundation draft" })).toHaveTextContent("Direct, useful writing.");
    fireEvent.click(screen.getByRole("button", { name: "Voice ↗" }));
    expect(screen.getByRole("button", { name: "Full draft" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /open reading view/i }));
    expect(screen.getByRole("dialog", { name: "Brand foundation reading view" })).toHaveTextContent("We help teams publish consistently.");
    fireEvent.click(screen.getByRole("button", { name: "Close reading view" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the existing review approval handler outside the reading area", () => {
    const approve = vi.fn();
    render(<TodayReviewView markdownFallback={draft} onApprove={approve} onReject={vi.fn()} onRevise={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve & continue" }));
    expect(approve).toHaveBeenCalledOnce();
  });
});
