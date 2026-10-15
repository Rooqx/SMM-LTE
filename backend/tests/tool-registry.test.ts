import { describe, expect, it, vi } from "vitest";
import type { Store } from "../src/db/store.js";
import { ToolRegistry } from "../src/tools/registry.js";

describe("read-only runtime tool registry", () => {
  it("fails closed before storage access when a step did not allow the tool", async () => {
    const listRecentApprovedArtifacts = vi.fn();
    const registry = new ToolRegistry({ listRecentApprovedArtifacts } as unknown as Store, 1_000);

    await expect(registry.execute({
      request: { type: "request_tool", tool: "list_approved_artifacts", arguments: { limit: 5, kinds: [] } },
      allowedTools: [],
      workspaceId: "workspace",
      organizationId: "organization",
    })).rejects.toMatchObject({ code: "tool_not_allowed" });
    expect(listRecentApprovedArtifacts).not.toHaveBeenCalled();
  });

  it("passes account scope and returns a bounded, explicit snapshot", async () => {
    const listRecentApprovedArtifacts = vi.fn().mockResolvedValue(Array.from({ length: 3 }, (_, index) => ({
      id: `artifact-${index}`,
      kind: "post-draft",
      slug: `post-${index}`,
      title: `Post ${index}`,
      content: "🧠".repeat(300),
      metadata: {},
      version: 1,
      created_at: new Date(0),
    })));
    const registry = new ToolRegistry({ listRecentApprovedArtifacts } as unknown as Store, 450);
    const result = await registry.execute({
      request: {
        type: "request_tool",
        tool: "list_approved_artifacts",
        arguments: { limit: 3, kinds: ["post-draft"] },
      },
      allowedTools: ["list_approved_artifacts"],
      workspaceId: "workspace",
      organizationId: "organization",
    });

    expect(listRecentApprovedArtifacts).toHaveBeenCalledWith({
      workspaceId: "workspace",
      organizationId: "organization",
      limit: 3,
      kinds: ["post-draft"],
    });
    expect(Buffer.byteLength(JSON.stringify(result.items), "utf8")).toBeLessThanOrEqual(450);
    expect(result.omitted).toBeGreaterThan(0);
  });

  it("loads backend-declared dependencies without a model tool request", async () => {
    const listRecentApprovedArtifacts = vi.fn().mockResolvedValue([{
      id: "draft-1",
      kind: "post-draft",
      slug: "linkedin-monday",
      title: "LinkedIn Monday",
      content: "Draft copy",
      metadata: {},
      version: 1,
      created_at: new Date(0),
    }]);
    const registry = new ToolRegistry(
      { listRecentApprovedArtifacts } as unknown as Store,
      2_000,
    );

    const result = await registry.loadApprovedArtifacts({
      workspaceId: "workspace",
      organizationId: "organization",
      limit: 20,
      kinds: ["post-draft"],
    });

    expect(result.items).toHaveLength(1);
    expect(result.query).toEqual({ limit: 20, kinds: ["post-draft"] });
  });

  it("loads 47 posts without truncation under expanded byte budget", async () => {
    const listRecentApprovedArtifacts = vi.fn().mockResolvedValue(
      Array.from({ length: 47 }, (_, index) => ({
        id: `draft-${index}`,
        kind: "post-draft",
        slug: `draft-post-${index}`,
        title: `Draft Post ${index}`,
        content: "Here is a complete formatted post draft with plenty of text ".repeat(15),
        metadata: { contentSlotKey: `cal-slot-${index}` },
        version: 1,
        created_at: new Date(0),
      })),
    );
    const registry = new ToolRegistry(
      { listRecentApprovedArtifacts } as unknown as Store,
      120_000,
    );

    const result = await registry.loadApprovedArtifacts({
      workspaceId: "workspace",
      organizationId: "organization",
      limit: 60,
      kinds: ["post-draft"],
    });

    expect(result.items).toHaveLength(47);
    expect(result.omitted).toBe(0);
    expect(result.contentTruncated).toBe(false);
  });
});
