import { conflict } from "../domain/errors.js";
import type { LlmAction } from "../domain/schemas.js";
import type { Store } from "../db/store.js";
import type { RuntimeToolName } from "../orchestration/recipes/types.js";

type ToolRequest = Extract<LlmAction, { type: "request_tool" }>;

export type ToolResult = {
  tool: RuntimeToolName;
  query: Record<string, unknown>;
  items: unknown[];
  omitted: number;
  contentTruncated: boolean;
};

/** Executes only application-owned, read-only tools with step-scoped permission. */
export class ToolRegistry {
  constructor(
    readonly store: Store,
    readonly maxResultBytes: number,
  ) {}

  async execute(input: {
    request: ToolRequest;
    allowedTools: readonly RuntimeToolName[];
    workspaceId: string;
    organizationId: string;
  }): Promise<ToolResult> {
    if (!input.allowedTools.includes(input.request.tool)) {
      throw conflict(
        "tool_not_allowed",
        `Tool '${input.request.tool}' is not allowed for the active recipe step`,
      );
    }

    return this.loadApprovedArtifacts({
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      limit: input.request.arguments.limit,
      kinds: input.request.arguments.kinds,
    });
  }

  /**
   * Loads a bounded artifact snapshot for backend-declared recipe dependencies.
   * Callers must supply an already-authorized workspace and organization pair.
   */
  async loadApprovedArtifacts(input: {
    workspaceId: string;
    organizationId: string;
    limit: number;
    kinds: readonly string[];
  }): Promise<ToolResult> {

    const rows = await this.store.listRecentApprovedArtifacts({
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      limit: input.limit,
      kinds: input.kinds,
    });
    const items = rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      slug: row.slug,
      title: row.title,
      content: row.content,
      metadata: row.metadata,
      version: row.version,
      createdAt: row.created_at.toISOString(),
    }));
    let contentTruncated = false;
    let omitted = 0;
    const resultSize = () => Buffer.byteLength(JSON.stringify(items), "utf8");
    while (items.length > 0 && resultSize() > this.maxResultBytes) {
      if (items.length === 1) {
        const only = items[0] as { content: string };
        // Binary search preserves as much UTF-8 content as the byte budget
        // permits; character counts are unsafe for multi-byte text.
        const original = only.content;
        let low = 0;
        let high = original.length;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          only.content = original.slice(0, middle);
          if (resultSize() <= this.maxResultBytes) low = middle;
          else high = middle - 1;
        }
        only.content = original.slice(0, low);
        contentTruncated = true;
        if (resultSize() > this.maxResultBytes) {
          items.pop();
          omitted += 1;
        }
        break;
      }
      items.pop();
      omitted += 1;
    }
    return {
      tool: "list_approved_artifacts",
      query: { limit: input.limit, kinds: input.kinds },
      items,
      omitted,
      contentTruncated,
    };
  }
}
