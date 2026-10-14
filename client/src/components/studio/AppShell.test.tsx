import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Workspace } from "@/lib/contracts";
import { MobileNavDock } from "./MobileNavDock";
import { PhaseProgressStrip } from "./PhaseProgressStrip";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

describe("WorkspaceSwitcher", () => {
  const mockWorkspaces: Workspace[] = [
    {
      id: "d7343021-237d-4b84-901a-3479c13ee0a2",
      name: "Acme Brand",
      slug: "acme-brand",
      timezone: "UTC",
      current_phase: 1,
      status: "active",
      version: 1,
    },
    {
      id: "e8454132-348e-5c95-a12b-4580d24ff1b3",
      name: "Beta Corp",
      slug: "beta-corp",
      timezone: "UTC",
      current_phase: 2,
      status: "active",
      version: 1,
    },
  ];

  it("renders current workspace and toggles dropdown on click", () => {
    const onSelect = vi.fn();
    const onCreateNew = vi.fn();

    render(
      <WorkspaceSwitcher
        currentWorkspace={mockWorkspaces[0]}
        onCreateNew={onCreateNew}
        onSelect={onSelect}
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: /select workspace/i });
    expect(trigger).toHaveTextContent("Acme Brand");

    // Open dropdown
    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: /workspaces/i })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: /beta corp/i }),
    ).toBeInTheDocument();

    // Select other workspace
    fireEvent.click(screen.getByRole("menuitemradio", { name: /beta corp/i }));
    expect(onSelect).toHaveBeenCalledWith(mockWorkspaces[1]);
  });

  it("triggers create new workspace action", () => {
    const onSelect = vi.fn();
    const onCreateNew = vi.fn();

    render(
      <WorkspaceSwitcher
        currentWorkspace={mockWorkspaces[0]}
        onCreateNew={onCreateNew}
        onSelect={onSelect}
        workspaces={mockWorkspaces}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /select workspace/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /create new workspace/i }));
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });

  it("supports menu arrow keys and restores focus with Escape", () => {
    render(
      <WorkspaceSwitcher
        currentWorkspace={mockWorkspaces[0]}
        onCreateNew={vi.fn()}
        onSelect={vi.fn()}
        workspaces={mockWorkspaces}
      />,
    );

    const trigger = screen.getByRole("button", { name: /select workspace/i });
    fireEvent.click(trigger);
    const first = screen.getByRole("menuitemradio", { name: /acme brand/i });
    const second = screen.getByRole("menuitemradio", { name: /beta corp/i });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });
});

describe("PhaseProgressStrip", () => {
  it("renders all 6 phases and reflects active phase", () => {
    render(<PhaseProgressStrip currentPhase={2} />);

    // Supporting label for phase 1 is Onboarding, phase 2 is Strategy
    expect(screen.getAllByText("Onboarding").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Strategy").length).toBeGreaterThan(0);
    expect(screen.getByText(/Phase 2 of 6/i)).toBeInTheDocument();
  });
});

describe("MobileNavDock", () => {
  it("renders all four primary destinations and includes workspace param in links", () => {
    render(
      <MobileNavDock
        currentPath="/"
        workspaceId="d7343021-237d-4b84-901a-3479c13ee0a2"
      />,
    );

    const todayLink = screen.getByRole("link", { name: /today/i });
    expect(todayLink).toHaveAttribute(
      "href",
      "/?workspace=d7343021-237d-4b84-901a-3479c13ee0a2",
    );

    const libraryLink = screen.getByRole("link", { name: /library/i });
    expect(libraryLink).toHaveAttribute(
      "href",
      "/library?workspace=d7343021-237d-4b84-901a-3479c13ee0a2",
    );

    const brandLink = screen.getByRole("link", { name: /brand/i });
    expect(brandLink).toHaveAttribute(
      "href",
      "/brand?workspace=d7343021-237d-4b84-901a-3479c13ee0a2",
    );

    const youLink = screen.getByRole("link", { name: /you/i });
    expect(youLink).toHaveAttribute(
      "href",
      "/you?workspace=d7343021-237d-4b84-901a-3479c13ee0a2",
    );
  });
});
