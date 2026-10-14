import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContentContinuationPanel } from "./ContentContinuationPanel";

describe("ContentContinuationPanel", () => {
  it("starts the next week without forcing the owner to invent a change", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<ContentContinuationPanel isPending={false} onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name: "Start next week" }));
    fireEvent.click(screen.getByLabelText(/Nothing changed/i));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      mode: "next_week",
      nothingChanged: true,
    })));
  });

  it("collects only the bounded brief required for an extra batch", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(<ContentContinuationPanel isPending={false} onStart={onStart} />);

    fireEvent.click(screen.getByRole("button", { name: "Create extra posts" }));
    fireEvent.change(screen.getByLabelText("What are the posts about?"), {
      target: { value: "Our Lagos launch event" },
    });
    fireEvent.click(screen.getByText("LinkedIn"));
    fireEvent.change(screen.getByLabelText("Number of posts"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      mode: "extra_posts",
      topic: "Our Lagos launch event",
      platforms: ["linkedin"],
      quantity: 4,
    })));
  });
});
