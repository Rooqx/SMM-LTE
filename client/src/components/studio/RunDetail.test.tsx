import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { Run } from "@/lib/contracts";
import { RunDetail } from "./RunDetail";

vi.mock("@/lib/api", () => ({
  api: {
    getRun: vi.fn(),
    decideRun: vi.fn(),
  },
}));

const run: Run = {
  id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
  workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
  phase: 1,
  skill_name: "voice-builder",
  status: "completed",
  output_status: "pending",
  output: {
    message: "Voice system ready.",
    artifacts: [],
    context_updates: [],
    next_action: "none",
  },
  approvals: [],
  artifacts: [],
  final_posts: [],
};

describe("RunDetail", () => {
  beforeEach(() => {
    vi.mocked(api.getRun).mockResolvedValue(run);
  });

  it("offers a decision for pending exploratory output without a phase gate", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <RunDetail runId={run.id} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("button", { name: "Approve output" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This exploratory run will not advance the phase/),
    ).toBeInTheDocument();
  });
});
