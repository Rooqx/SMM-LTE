import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PwaInstallCard } from "./PwaInstallCard";

interface MockInstallPrompt extends Event {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: "accepted"; platform: string }>;
}

describe("PwaInstallCard", () => {
  it("explains manual installation when the browser has no native prompt", async () => {
    const user = userEvent.setup();
    render(<PwaInstallCard />);

    await user.click(screen.getByRole("button", { name: "How to install" }));

    expect(screen.getByText("On iPhone or iPad")).toBeInTheDocument();
    expect(screen.getByText("On Android or desktop")).toBeInTheDocument();
  });

  it("uses the browser installation prompt when it becomes available", async () => {
    const user = userEvent.setup();
    const event = new Event("beforeinstallprompt") as MockInstallPrompt;
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
    render(<PwaInstallCard />);

    fireEvent(window, event);
    await user.click(await screen.findByRole("button", { name: "Install app" }));

    expect(event.prompt).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Installation started");
    });
  });
});
