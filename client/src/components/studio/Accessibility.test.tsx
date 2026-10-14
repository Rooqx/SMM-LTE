import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PendingQuestion, Workspace } from "@/lib/contracts";
import { findAccessibilityViolations } from "@/test/accessibility";
import { CreateWorkspace } from "./CreateWorkspace";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { LibraryTabs } from "./library/LibraryTabs";
import { TodayQuestionView } from "./today/TodayQuestionView";

const workspace: Workspace = {
  id: "d7343021-237d-4b84-901a-3479c13ee0a2",
  name: "Novi Studio",
  slug: "novi-studio",
  timezone: "Africa/Lagos",
  current_phase: 1,
  status: "active",
  version: 1,
};

const question: PendingQuestion = {
  id: "7b0d7718-4e31-4e7a-9a99-b1d5225d2b0e",
  workspace_id: workspace.id,
  workflow_instance_id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
  phase_instance_id: "f3c8008a-24a9-467f-a631-0428ef50a9dc",
  orchestration_step_id: null,
  question_key: "brand-voice",
  prompt: "How should the brand sound?",
  purpose: "Keeps every post consistent.",
  options: [
    { id: "clear", label: "Clear expert", description: "Direct and useful." },
    { id: "warm", label: "Warm guide", description: "Friendly and calm." },
  ],
  allow_custom: true,
  selection_mode: "multiple",
  status: "pending",
  version: 1,
  created_at: "2026-10-09T18:00:00Z",
};

function renderCreateWorkspace(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateWorkspace isOpen onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe("key interaction accessibility", () => {
  it("keeps the workspace dialog labelled, trapped, and dismissible", async () => {
    const before = document.createElement("button");
    document.body.append(before);
    before.focus();
    const onClose = vi.fn();
    const { container, unmount } = renderCreateWorkspace(onClose);

    expect(screen.getByRole("dialog", { name: "Create a workspace" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Acme Social")).toHaveFocus();
    expect(await findAccessibilityViolations(container)).toEqual([]);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(before).toHaveFocus();
    before.remove();
  });

  it("exposes the workspace chooser as a keyboard menu", async () => {
    const { container } = render(
      <WorkspaceSwitcher
        currentWorkspace={workspace}
        onCreateNew={vi.fn()}
        onSelect={vi.fn()}
        workspaces={[workspace]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select workspace" }));

    expect(screen.getByRole("menuitemradio", { name: workspace.name })).toHaveFocus();
    expect(await findAccessibilityViolations(container)).toEqual([]);
  });

  it("exposes library views as an arrow-key tab list", async () => {
    const onChangeTab = vi.fn();
    const { container } = render(
      <>
        <LibraryTabs activeTab="fast" onChangeTab={onChangeTab} />
        <div id="library-panel-fast" role="tabpanel" />
        <div id="library-panel-folders" role="tabpanel" />
        <div id="library-panel-review" role="tabpanel" />
      </>,
    );
    const first = screen.getByRole("tab", { name: "Fast view" });
    fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(onChangeTab).toHaveBeenCalledWith("folders");
    expect(await findAccessibilityViolations(container)).toEqual([]);
  });

  it("uses native answer controls for generated questions", async () => {
    const { container } = render(
      <TodayQuestionView onSubmit={vi.fn()} question={question} />,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(await findAccessibilityViolations(container)).toEqual([]);
  });

  it("submits several suggestions together with a written answer", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TodayQuestionView onSubmit={onSubmit} question={question} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your own answer" }), {
      target: { value: "Keep it practical" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "multiple",
      optionIds: ["clear", "warm"],
      text: "Keep it practical",
    });
  });
});
