import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/contracts";
import { ArtifactCard } from "./RunDetail";
import { ContextChanges } from "./ContextChanges";

const artifact: Artifact = {
  id: "1993bb4b-e8e1-4617-9041-7a7d3f5d03aa",
  workspace_id: "d7343021-237d-4b84-901a-3479c13ee0a2",
  run_id: "8ec34220-cb0b-4d24-9317-d0d959a50e98",
  kind: "social-post",
  slug: "launch-post",
  title: "Launch post",
  content: "# A useful launch\n\n<script>alert('unsafe')</script>",
  version: 1,
  status: "draft",
};

describe("orchestration output rendering", () => {
  it("renders an artifact as Markdown without injecting raw HTML", () => {
    const { container } = render(<ArtifactCard artifact={artifact} />);
    expect(
      screen.getByRole("heading", { name: "A useful launch" }),
    ).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("labels context changes as staged rather than already applied", () => {
    render(
      <ContextChanges
        updates={[
          {
            key: "brand.voice",
            markdown: "## Voice\nClear and warm.",
            data: {},
          },
        ]}
      />,
    );
    expect(screen.getByText("Staged context changes")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Brand Voice" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Clear and warm.")).toBeInTheDocument();
  });
});
