import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewMarkdown } from "./ReviewMarkdown";

describe("review deliverable rendering", () => {
  it("formats Markdown and blocks executable HTML, unsafe links, and external images", () => {
    const { container } = render(
      <ReviewMarkdown markdown={'# Brand direction\n\n**Clear** positioning\n\n- Helpful posts\n- Consistent tone\n\n[Read more](https://example.com)\n\n[Unsafe](javascript:alert(1))\n\n![Tracker](https://example.com/pixel.png)\n\n<script>alert(1)</script>'} />,
    );

    expect(screen.getByRole("heading", { name: "Brand direction" })).toBeInTheDocument();
    expect(screen.getByText("Helpful posts").closest("li")).not.toBeNull();
    expect(screen.getByText("Clear").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Read more" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: "Unsafe" })).toBeNull();
    expect(container.querySelector("script, img")).toBeNull();
    expect(screen.getByText("[Image omitted: Tracker]")).toBeInTheDocument();
  });
});
