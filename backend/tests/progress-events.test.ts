import type pg from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  isRunProgressStage,
  isTerminalProgressStage,
  RUN_PROGRESS_STAGES,
  RunProgressService,
  type RunProgressEvent,
  type RunProgressStage,
} from "../src/orchestration/progress.js";

/**
 * Creates a mock pg.Pool or PoolClient for testing RunProgressService in isolation.
 */
function createMockDbClient() {
  const queryMock = vi.fn();
  return {
    query: queryMock,
  } as unknown as pg.Pool & { query: ReturnType<typeof vi.fn> };
}

function createTransactionalMockPool() {
  const query = vi.fn();
  const client = { query, release: vi.fn() };
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn(),
  } as unknown as pg.Pool;
  return { pool, client, query };
}

describe("M9.5: RunProgressService & SSE Event Stream", () => {
  describe("Progress stages and invariants", () => {
    it("declares all 9 valid coarse progress stages", () => {
      expect(RUN_PROGRESS_STAGES).toEqual([
        "queued",
        "loading_context",
        "generating",
        "validating",
        "ready",
        "waiting_approval",
        "waiting_input",
        "failed",
        "cancelled",
      ]);
    });

    it("correctly identifies valid and invalid progress stages", () => {
      for (const stage of RUN_PROGRESS_STAGES) {
        expect(isRunProgressStage(stage)).toBe(true);
      }
      expect(isRunProgressStage("executing")).toBe(false);
      expect(isRunProgressStage("completed")).toBe(false);
      expect(isRunProgressStage(null)).toBe(false);
      expect(isRunProgressStage(undefined)).toBe(false);
      expect(isRunProgressStage(123)).toBe(false);
    });

    it("correctly distinguishes terminal vs active progress stages", () => {
      // Active / in-flight stages
      expect(isTerminalProgressStage("queued")).toBe(false);
      expect(isTerminalProgressStage("loading_context")).toBe(false);
      expect(isTerminalProgressStage("generating")).toBe(false);
      expect(isTerminalProgressStage("validating")).toBe(false);

      // Terminal stages
      expect(isTerminalProgressStage("ready")).toBe(true);
      expect(isTerminalProgressStage("waiting_approval")).toBe(true);
      expect(isTerminalProgressStage("waiting_input")).toBe(true);
      expect(isTerminalProgressStage("failed")).toBe(true);
      expect(isTerminalProgressStage("cancelled")).toBe(true);
    });
  });

  describe("Tenant saturation and connection limits", () => {
    it("enforces tenant-scoped connection limits and releases properly", () => {
      const mockPool = createMockDbClient();
      const service = new RunProgressService(mockPool, 3); // limit to 3 for test

      const org1 = "org-11111111-1111-1111-1111-111111111111";
      const org2 = "org-22222222-2222-2222-2222-222222222222";

      // Acquire up to limit
      service.acquireConnection(org1);
      expect(service.getActiveConnections(org1)).toBe(1);
      service.acquireConnection(org1);
      expect(service.getActiveConnections(org1)).toBe(2);
      service.acquireConnection(org1);
      expect(service.getActiveConnections(org1)).toBe(3);
      expect(service.getActiveConnections()).toBe(3);

      // 4th connection for org1 must throw 429
      expect(() => service.acquireConnection(org1)).toThrowError(
        /Active progress stream limit \(3\) reached for organization/,
      );

      // org2 should still be able to acquire connections (tenant isolation)
      service.acquireConnection(org2);
      expect(service.getActiveConnections(org2)).toBe(1);
      expect(service.getActiveConnections()).toBe(4);

      // Release connection for org1
      service.releaseConnection(org1);
      expect(service.getActiveConnections(org1)).toBe(2);

      // Now org1 can acquire again
      service.acquireConnection(org1);
      expect(service.getActiveConnections(org1)).toBe(3);

      // Release all for org1
      service.releaseConnection(org1);
      service.releaseConnection(org1);
      service.releaseConnection(org1);
      expect(service.getActiveConnections(org1)).toBe(0);

      // Releasing when already 0 is safe
      service.releaseConnection(org1);
      expect(service.getActiveConnections(org1)).toBe(0);
    });
  });

  describe("Stage recording, event subscription, and dispatch", () => {
    it("reuses an existing PoolClient without attempting to connect it again", async () => {
      const occurredDate = new Date("2026-10-12T10:00:00.000Z");
      const query = vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 41,
            run_id: "run-client",
            workspace_id: "ws-client",
            phase: 1,
            skill_name: "social-media-context-sms",
            stage: "queued",
            occurred_at: occurredDate,
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rowCount: 1 });
      const client = {
        query,
        connect: vi.fn(() => {
          throw new Error("PoolClient.connect must not be called");
        }),
        release: vi.fn(),
      } as unknown as pg.PoolClient;
      const service = new RunProgressService({} as pg.Pool);

      await expect(service.recordStage(client, {
        runId: "run-client",
        workspaceId: "ws-client",
        phase: 1,
        skillName: "social-media-context-sms",
        stage: "queued",
        occurredAt: occurredDate,
      })).resolves.toMatchObject({ id: "41", stage: "queued" });

      expect(client.connect).not.toHaveBeenCalled();
      expect(client.release).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledTimes(2);
    });

    it("records a stage in PostgreSQL and notifies subscribers in-memory", async () => {
      const transactional = createTransactionalMockPool();
      const service = new RunProgressService(transactional.pool);

      const runId = "run-aaaa-bbbb";
      const workspaceId = "ws-1111-2222";
      const occurredDate = new Date("2026-10-12T10:00:00.000Z");

      // Mock INSERT query RETURNING row
      transactional.query
        .mockResolvedValueOnce({ rowCount: null }) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 42,
              run_id: runId,
              workspace_id: workspaceId,
              phase: 1,
              skill_name: "social-media-context-sms",
              stage: "generating",
              occurred_at: occurredDate,
            },
          ],
          rowCount: 1,
        })
        // Mock UPDATE workflow_runs query
        .mockResolvedValueOnce({
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rowCount: null }); // COMMIT

      // Set up in-memory listener
      const receivedEvents: RunProgressEvent[] = [];
      const unsubscribe = service.subscribe(runId, (event) => {
        receivedEvents.push(event);
      });

      const event = await service.recordStage(transactional.pool, {
        runId,
        workspaceId,
        phase: 1,
        skillName: "social-media-context-sms",
        stage: "generating",
        occurredAt: occurredDate,
      });

      // Verify event format
      expect(event).toEqual({
        id: "42",
        runId,
        workspaceId,
        phase: 1,
        skillName: "social-media-context-sms",
        stage: "generating",
        occurredAt: "2026-10-12T10:00:00.000Z",
      });

      // Verify DB queries made
      expect(transactional.query).toHaveBeenCalledTimes(4);
      expect(transactional.query.mock.calls[1]?.[0]).toContain("INSERT INTO workflow_run_progress_events");
      expect(transactional.query.mock.calls[1]?.[1]).toEqual([
        runId,
        workspaceId,
        1,
        "social-media-context-sms",
        "generating",
        occurredDate,
      ]);
      expect(transactional.query.mock.calls[2]?.[0]).toContain("UPDATE workflow_runs");
      expect(transactional.query.mock.calls[2]?.[1]).toEqual([runId, "generating", workspaceId]);

      // Verify subscriber received event
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toEqual(event);

      // Unsubscribe and verify no more events received
      unsubscribe();
      transactional.query
        .mockResolvedValueOnce({ rowCount: null })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 43,
              run_id: runId,
              workspace_id: workspaceId,
              phase: 1,
              skill_name: "social-media-context-sms",
              stage: "validating",
              occurred_at: occurredDate,
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: null });

      await service.recordStage(transactional.pool, {
        runId,
        workspaceId,
        phase: 1,
        skillName: "social-media-context-sms",
        stage: "validating",
      });

      expect(receivedEvents).toHaveLength(1); // unchanged
    });

    it("strictly isolates subscribers by runId", async () => {
      const transactional = createTransactionalMockPool();
      const service = new RunProgressService(transactional.pool);

      const run1Events: RunProgressEvent[] = [];
      const run2Events: RunProgressEvent[] = [];

      service.subscribe("run-1", (e) => run1Events.push(e));
      service.subscribe("run-2", (e) => run2Events.push(e));

      transactional.query
        .mockResolvedValueOnce({ rowCount: null })
        .mockResolvedValueOnce({ rows: [
          {
            id: 1,
            run_id: "run-1",
            workspace_id: "ws-1",
            phase: 1,
            skill_name: "skill-1",
            stage: "queued",
            occurred_at: new Date(),
          },
        ], rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: null });

      await service.recordStage(transactional.pool, {
        runId: "run-1",
        workspaceId: "ws-1",
        phase: 1,
        skillName: "skill-1",
        stage: "queued",
      });

      expect(run1Events).toHaveLength(1);
      expect(run2Events).toHaveLength(0);
    });
  });

  describe("Reconnection semantics & query replay", () => {
    it("queries historical events with tenant isolation and afterEventId replay filter", async () => {
      const mockPool = createMockDbClient();
      const service = new RunProgressService(mockPool);

      const date1 = new Date("2026-10-12T10:00:00.000Z");
      const date2 = new Date("2026-10-12T10:00:05.000Z");

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "101",
            run_id: "run-1",
            workspace_id: "ws-1",
            phase: 1,
            skill_name: "niche-research",
            stage: "loading_context",
            occurred_at: date1,
          },
          {
            id: "102",
            run_id: "run-1",
            workspace_id: "ws-1",
            phase: 1,
            skill_name: "niche-research",
            stage: "generating",
            occurred_at: date2,
          },
        ],
        rowCount: 2,
      });

      const events = await service.listEventsForRun({
        runId: "run-1",
        workspaceId: "ws-1",
        organizationId: "org-1",
        afterEventId: "100",
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE events.run_id = $1"),
        ["run-1", "ws-1", "org-1", "100", 200],
      );

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        id: "101",
        runId: "run-1",
        workspaceId: "ws-1",
        phase: 1,
        skillName: "niche-research",
        stage: "loading_context",
        occurredAt: "2026-10-12T10:00:00.000Z",
      });
      expect(events[1]?.id).toBe("102");
    });
  });

  describe("Authoritative run state projection", () => {
    it("returns run stage and terminal status when found", async () => {
      const mockPool = createMockDbClient();
      const service = new RunProgressService(mockPool);

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: "run-abc",
            workspace_id: "ws-abc",
            phase: 2,
            skill_name: "voice-builder",
            status: "succeeded",
            progress_stage: "ready",
          },
        ],
        rowCount: 1,
      });

      const state = await service.getCurrentRunState({
        runId: "run-abc",
        workspaceId: "ws-abc",
        organizationId: "org-abc",
      });

      expect(state).toEqual({
        runId: "run-abc",
        workspaceId: "ws-abc",
        phase: 2,
        skillName: "voice-builder",
        status: "succeeded",
        progressStage: "ready",
        isTerminal: true,
      });
    });

    it("throws notFound when run does not exist or tenant mismatch", async () => {
      const mockPool = createMockDbClient();
      const service = new RunProgressService(mockPool);

      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      await expect(
        service.getCurrentRunState({
          runId: "run-nonexistent",
          workspaceId: "ws-nonexistent",
          organizationId: "org-nonexistent",
        }),
      ).rejects.toThrowError(/Run was not found/);
    });
  });

  describe("Zero content leak verification (ADR 0014 conformance)", () => {
    it("guarantees event payload contains only coarse progress metadata and ZERO content", async () => {
      const mockPool = createMockDbClient();
      const service = new RunProgressService(mockPool);

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 999,
              run_id: "run-leak-check",
              workspace_id: "ws-leak-check",
              phase: 1,
              skill_name: "social-media-context-sms",
              stage: "generating",
              occurred_at: new Date("2026-10-12T12:00:00Z"),
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1 });

      const event = await service.recordStage(mockPool, {
        runId: "run-leak-check",
        workspaceId: "ws-leak-check",
        phase: 1,
        skillName: "social-media-context-sms",
        stage: "generating",
      });

      const keys = Object.keys(event);
      // Event must strictly contain ONLY coarse metadata
      expect(keys.sort()).toEqual([
        "id",
        "occurredAt",
        "phase",
        "runId",
        "skillName",
        "stage",
        "workspaceId",
      ]);

      // Assert no prompt, token, or context properties exist
      const sensitiveProperties = [
        "prompt",
        "developerPrompt",
        "userPrompt",
        "messages",
        "tokens",
        "content",
        "artifact",
        "input",
        "output",
        "context",
        "raw",
      ];

      for (const prop of sensitiveProperties) {
        expect((event as unknown as Record<string, unknown>)[prop]).toBeUndefined();
      }

      // Assert serialized JSON payload is strictly content-free
      const json = JSON.stringify(event);
      expect(json).not.toContain("prompt");
      expect(json).not.toContain("token");
      expect(json).not.toContain("content");
    });
  });
});
