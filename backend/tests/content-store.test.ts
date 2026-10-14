import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import { ContentStore } from "../src/db/content-store.js";

function cursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("content cursors", () => {
  it("rejects malformed values before issuing a database query", async () => {
    const query = vi.fn();
    const store = new ContentStore({ query } as unknown as pg.Pool);

    await expect(store.listArtifacts({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      limit: 10,
      cursor: cursor({ createdAt: "not-an-instant", id: "not-a-uuid" }),
    })).rejects.toMatchObject({ code: "invalid_cursor", statusCode: 400 });

    await expect(store.listFinalPosts({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      limit: 10,
      cursor: cursor({
        createdAt: "2026-10-08T12:00:00.000Z",
        id: "33333333-3333-4333-8333-333333333333",
        localDate: "2026-02-30",
      }),
    })).rejects.toMatchObject({ code: "invalid_cursor", statusCode: 400 });

    expect(query).not.toHaveBeenCalled();
  });
});
