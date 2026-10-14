import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { conflict, notFound } from "../domain/errors.js";
import { writeAuditEvent, type Queryable } from "./audit.js";
import type { ContextRevisionRow } from "./context-revisions.js";

export const INITIAL_RECIPE_VERSION = "1.0.0";

export type MessageRole = "user" | "assistant" | "tool" | "system";
export type MessageKind =
  | "message"
  | "answer"
  | "action"
  | "tool_request"
  | "tool_result"
  | "error";

export type QuestionOption = {
  id: string;
  label: string;
  description?: string;
};

export type QuestionAnswerValue =
  | { type: "option"; optionId: string }
  | { type: "custom"; text: string }
  | { type: "multiple"; optionIds: string[]; text?: string | undefined };

export type ConversationMessageRow = {
  id: string;
  conversation_id: string;
  workspace_id: string;
  phase_instance_id: string | null;
  orchestration_step_id: string | null;
  ordinal: string;
  role: MessageRole;
  kind: MessageKind;
  content: string;
  data: Record<string, unknown>;
  actor: string;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: Date;
};

export type PendingQuestionRow = {
  id: string;
  workspace_id: string;
  workflow_instance_id: string;
  phase_instance_id: string;
  orchestration_step_id: string | null;
  question_key: string;
  prompt: string;
  purpose: string;
  options: QuestionOption[];
  allow_custom: boolean;
  selection_mode: "single" | "multiple";
  status: "pending" | "answered" | "cancelled" | "superseded";
  version: number;
  created_at: Date;
  answered_at: Date | null;
  updated_at: Date;
};

export type WorkflowState = {
  workflowId: string;
  workflowStatus: "active" | "paused" | "completed" | "archived";
  workflowVersion: number;
  recipeVersion: string;
  phaseInstanceId: string;
  phase: number;
  cycle: number;
  phaseStatus: "active" | "completed" | "failed" | "cancelled";
  conversationId: string;
  pendingQuestion: PendingQuestionRow | null;
  activeRun: {
    id: string;
    status: "queued" | "running" | "waiting_approval";
    phase: number;
    updated_at: Date;
  } | null;
};

export type ConversationMemory = {
  summary: {
    version: number;
    fromOrdinal: number;
    throughOrdinal: number;
    content: string;
    data: Record<string, unknown>;
  } | null;
  messages: ConversationMessageRow[];
};

function assertText(value: string, name: string, minimum: number, maximum: number): void {
  const length = value.length;
  if (length < minimum || length > maximum) {
    throw new RangeError(`${name} must contain between ${minimum} and ${maximum} characters`);
  }
}

function canonicalJson(value: unknown, path = "value"): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => canonicalJson(entry, `${path}[${index}]`)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only JSON values`);
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => {
      if (record[key] === undefined) throw new TypeError(`${path}.${key} cannot be undefined`);
      return `${JSON.stringify(key)}:${canonicalJson(record[key], `${path}.${key}`)}`;
    }).join(",")}}`;
  }
  throw new TypeError(`${path} must contain only JSON values`);
}

function assertJsonSize(value: unknown, maximumBytes: number, name: string): void {
  const encoded = canonicalJson(value, name);
  if (Buffer.byteLength(encoded, "utf8") > maximumBytes) {
    throw new RangeError(`${name} exceeds ${maximumBytes} bytes`);
  }
}

function validateOptions(options: readonly QuestionOption[]): void {
  if (options.length > 20) throw new RangeError("A question can contain at most 20 options");
  const ids = new Set<string>();
  for (const option of options) {
    if (!option || typeof option !== "object" || Array.isArray(option)) {
      throw new TypeError("Every question option must be an object");
    }
    const keys = Object.keys(option);
    if (keys.some((key) => !["id", "label", "description"].includes(key)) ||
        typeof option.id !== "string" || typeof option.label !== "string" ||
        (option.description !== undefined && typeof option.description !== "string")) {
      throw new TypeError("Question options contain an unsupported field or value");
    }
    if (!/^[a-z0-9][a-z0-9_.-]{0,79}$/.test(option.id)) {
      throw new TypeError(`Invalid question option id '${option.id}'`);
    }
    if (ids.has(option.id)) throw new TypeError(`Duplicate question option id '${option.id}'`);
    ids.add(option.id);
    assertText(option.label, "Question option label", 1, 240);
    if (option.description !== undefined) {
      assertText(option.description, "Question option description", 1, 1_000);
    }
  }
  assertJsonSize(options, 50_000, "Question options");
}

function assertQuestionAnswer(value: unknown): asserts value is QuestionAnswerValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Question answer must be an object");
  }
  const answer = value as Record<string, unknown>;
  if (answer.type === "option") {
    if (typeof answer.optionId !== "string" || Object.keys(answer).some(
      (key) => key !== "type" && key !== "optionId",
    )) {
      throw new TypeError("An option answer must contain only type and optionId");
    }
    return;
  }
  if (answer.type === "custom") {
    if (typeof answer.text !== "string" || Object.keys(answer).some(
      (key) => key !== "type" && key !== "text",
    )) {
      throw new TypeError("A custom answer must contain only type and text");
    }
    return;
  }
  if (answer.type === "multiple") {
    if (!Array.isArray(answer.optionIds) ||
        answer.optionIds.some((id) => typeof id !== "string") ||
        (answer.text !== undefined && typeof answer.text !== "string") ||
        Object.keys(answer).some((key) => !["type", "optionIds", "text"].includes(key))) {
      throw new TypeError("A multiple answer must contain optionIds and optional text");
    }
    return;
  }
  throw new TypeError("Unsupported question answer type");
}

function answerDisplayText(
  answer: QuestionAnswerValue,
  question: Pick<PendingQuestionRow, "options" | "allow_custom" | "selection_mode">,
): string {
  if (answer.type === "option") {
    const option = question.options.find((candidate) => candidate.id === answer.optionId);
    if (!option) throw new TypeError("The selected option does not belong to this question");
    return option.label;
  }
  if (answer.type === "multiple") {
    if (question.selection_mode !== "multiple") {
      throw new TypeError("This question accepts only one option");
    }
    if (answer.optionIds.length > question.options.length ||
        new Set(answer.optionIds).size !== answer.optionIds.length) {
      throw new TypeError("Selected options must be unique and belong to this question");
    }
    const labels = answer.optionIds.map((id) => {
      const option = question.options.find((candidate) => candidate.id === id);
      if (!option) throw new TypeError("The selected option does not belong to this question");
      return option.label;
    });
    if (answer.text !== undefined) {
      if (!question.allow_custom) throw new TypeError("This question does not accept a custom answer");
      assertText(answer.text, "Custom answer", 1, 10_000);
      labels.push(answer.text);
    }
    if (labels.length === 0) throw new TypeError("Select an option or write an answer");
    return labels.join("; ");
  }
  if (!question.allow_custom) throw new TypeError("This question does not accept a custom answer");
  assertText(answer.text, "Custom answer", 1, 10_000);
  return answer.text;
}

/**
 * Creates the recoverable state a new workspace needs to start onboarding.
 * IDs are allocated up front because workflow and phase rows reference each
 * other; the deferred foreign key validates the cycle when the transaction
 * commits. Calling this function again safely returns the existing state.
 */
export async function initializeWorkspaceWorkflow(
  database: Queryable,
  workspaceId: string,
  recipeVersion = INITIAL_RECIPE_VERSION,
): Promise<{ workflowId: string; phaseInstanceId: string; conversationId: string }> {
  // Workspace creation and repair both use the workspace row as the aggregate
  // lock. This makes concurrent initialization idempotent without a global lock.
  const workspace = await database.query(
    "SELECT id FROM workspaces WHERE id = $1 FOR UPDATE",
    [workspaceId],
  );
  if (!workspace.rows[0]) throw notFound("Workspace");
  const existing = await database.query(
    `SELECT workflow.id AS workflow_id,
            workflow.current_phase_instance_id AS phase_instance_id,
            conversation.id AS conversation_id
     FROM workflow_instances AS workflow
     LEFT JOIN conversations AS conversation
       ON conversation.workspace_id = workflow.workspace_id
      AND conversation.status = 'active'
     WHERE workflow.workspace_id = $1`,
    [workspaceId],
  );
  const existingRow = existing.rows[0] as
    | { workflow_id: string; phase_instance_id: string; conversation_id: string | null }
    | undefined;
  if (existingRow?.conversation_id) {
    return {
      workflowId: existingRow.workflow_id,
      phaseInstanceId: existingRow.phase_instance_id,
      conversationId: existingRow.conversation_id,
    };
  }

  if (existingRow) {
    const conversation = await database.query(
      `INSERT INTO conversations(workspace_id, workflow_instance_id)
       VALUES ($1, $2)
       ON CONFLICT (workspace_id) WHERE status = 'active' DO UPDATE
         SET updated_at = conversations.updated_at
       RETURNING id`,
      [workspaceId, existingRow.workflow_id],
    );
    return {
      workflowId: existingRow.workflow_id,
      phaseInstanceId: existingRow.phase_instance_id,
      conversationId: String(conversation.rows[0]?.id),
    };
  }

  const workflowId = randomUUID();
  const phaseInstanceId = randomUUID();
  await database.query(
    `INSERT INTO workflow_instances(
       id, workspace_id, recipe_version, current_phase_instance_id
     ) VALUES ($1, $2, $3, $4)`,
    [workflowId, workspaceId, recipeVersion, phaseInstanceId],
  );
  await database.query(
    `INSERT INTO phase_instances(
       id, workflow_instance_id, workspace_id, phase, recipe_version
     ) VALUES ($1, $2, $3, 1, $4)`,
    [phaseInstanceId, workflowId, workspaceId, recipeVersion],
  );
  const conversation = await database.query(
    `INSERT INTO conversations(workspace_id, workflow_instance_id)
     VALUES ($1, $2)
     RETURNING id`,
    [workspaceId, workflowId],
  );
  return {
    workflowId,
    phaseInstanceId,
    conversationId: String(conversation.rows[0]?.id),
  };
}

export class WorkflowStore {
  constructor(readonly pool: pg.Pool) {}

  async getState(workspaceId: string, organizationId: string): Promise<WorkflowState | null> {
    const result = await this.pool.query(
      `SELECT workflow.id AS workflow_id,
              workflow.status AS workflow_status,
              workflow.version AS workflow_version,
              workflow.recipe_version,
              phase.id AS phase_instance_id,
              phase.phase,
              phase.cycle,
              phase.status AS phase_status,
              conversation.id AS conversation_id,
              question.id AS question_id,
              question.orchestration_step_id,
              question.question_key,
              question.prompt,
              question.purpose,
              question.options,
              question.allow_custom,
              question.selection_mode,
              question.version AS question_version,
              question.created_at AS question_created_at,
              question.updated_at AS question_updated_at,
              active_run.id AS active_run_id,
              active_run.status AS active_run_status,
              active_run.phase AS active_run_phase,
              active_run.updated_at AS active_run_updated_at
       FROM workspaces
       JOIN workflow_instances AS workflow
         ON workflow.workspace_id = workspaces.id
       JOIN phase_instances AS phase
         ON phase.id = workflow.current_phase_instance_id
        AND phase.workflow_instance_id = workflow.id
        AND phase.workspace_id = workflow.workspace_id
       JOIN conversations AS conversation
         ON conversation.workspace_id = workspaces.id
        AND conversation.workflow_instance_id = workflow.id
        AND conversation.status = 'active'
       LEFT JOIN pending_questions AS question
         ON question.workspace_id = workspaces.id
        AND question.workflow_instance_id = workflow.id
        AND question.phase_instance_id = phase.id
        AND question.status = 'pending'
       LEFT JOIN LATERAL (
         SELECT run.id, run.status, run.phase, run.updated_at
         FROM workflow_runs AS run
         WHERE run.workspace_id = workspaces.id
           AND run.status IN ('queued', 'running', 'waiting_approval')
         ORDER BY run.updated_at DESC, run.id DESC
         LIMIT 1
       ) AS active_run ON true
       WHERE workspaces.id = $1 AND workspaces.organization_id = $2`,
      [workspaceId, organizationId],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const pendingQuestion = row.question_id
      ? {
          id: String(row.question_id),
          workspace_id: workspaceId,
          workflow_instance_id: String(row.workflow_id),
          phase_instance_id: String(row.phase_instance_id),
          orchestration_step_id: row.orchestration_step_id
            ? String(row.orchestration_step_id)
            : null,
          question_key: String(row.question_key),
          prompt: String(row.prompt),
          purpose: String(row.purpose),
          options: row.options as QuestionOption[],
          allow_custom: Boolean(row.allow_custom),
          selection_mode: row.selection_mode as "single" | "multiple",
          status: "pending" as const,
          version: Number(row.question_version),
          created_at: row.question_created_at as Date,
          answered_at: null,
          updated_at: row.question_updated_at as Date,
        }
      : null;
    return {
      workflowId: String(row.workflow_id),
      workflowStatus: row.workflow_status as WorkflowState["workflowStatus"],
      workflowVersion: Number(row.workflow_version),
      recipeVersion: String(row.recipe_version),
      phaseInstanceId: String(row.phase_instance_id),
      phase: Number(row.phase),
      cycle: Number(row.cycle),
      phaseStatus: row.phase_status as WorkflowState["phaseStatus"],
      conversationId: String(row.conversation_id),
      pendingQuestion,
      activeRun: row.active_run_id
        ? {
            id: String(row.active_run_id),
            status: row.active_run_status as "queued" | "running" | "waiting_approval",
            phase: Number(row.active_run_phase),
            updated_at: row.active_run_updated_at as Date,
          }
        : null,
    };
  }

  /**
   * Returns the newest summary plus a bounded window after its source range.
   * Full history remains in PostgreSQL; prompt construction never loads it all.
   */
  async getConversationMemory(input: {
    workspaceId: string;
    organizationId: string;
    maxMessages: number;
  }): Promise<ConversationMemory> {
    if (!Number.isInteger(input.maxMessages) || input.maxMessages < 1 || input.maxMessages > 100) {
      throw new RangeError("Conversation memory must request between 1 and 100 messages");
    }
    const owner = await this.pool.query(
      `SELECT conversation.id AS conversation_id,
              summary.version AS summary_version,
              summary.from_ordinal,
              summary.through_ordinal,
              summary.content AS summary_content,
              summary.data AS summary_data
       FROM conversations AS conversation
       JOIN workspaces ON workspaces.id = conversation.workspace_id
       LEFT JOIN LATERAL (
         SELECT version, from_ordinal, through_ordinal, content, data
         FROM conversation_summaries
         WHERE conversation_id = conversation.id
         ORDER BY version DESC
         LIMIT 1
       ) AS summary ON true
       WHERE conversation.workspace_id = $1
         AND workspaces.organization_id = $2
         AND conversation.status = 'active'`,
      [input.workspaceId, input.organizationId],
    );
    const row = owner.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw notFound("Active conversation");
    const throughOrdinal = row.summary_version ? Number(row.through_ordinal) : 0;
    const messages = await this.pool.query(
      `SELECT * FROM (
         SELECT message.*
         FROM conversation_messages AS message
         WHERE message.conversation_id = $1
           AND message.ordinal > $2
         ORDER BY message.ordinal DESC
         LIMIT $3
       ) AS recent
       ORDER BY ordinal`,
      [row.conversation_id, throughOrdinal, input.maxMessages],
    );
    return {
      summary: row.summary_version
        ? {
            version: Number(row.summary_version),
            fromOrdinal: Number(row.from_ordinal),
            throughOrdinal,
            content: String(row.summary_content),
            data: row.summary_data as Record<string, unknown>,
          }
        : null,
      messages: messages.rows as ConversationMessageRow[],
    };
  }

  async appendMessage(input: {
    workspaceId: string;
    organizationId: string;
    role: MessageRole;
    kind: MessageKind;
    content: string;
    data?: Record<string, unknown>;
    actor: string;
    phaseInstanceId?: string;
    orchestrationStepId?: string;
    provider?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  }): Promise<ConversationMessageRow> {
    if (!["user", "assistant", "tool", "system"].includes(input.role)) {
      throw new TypeError("Invalid message role");
    }
    if (!["message", "answer", "action", "tool_request", "tool_result", "error"].includes(
      input.kind,
    )) {
      throw new TypeError("Invalid message kind");
    }
    assertText(input.actor, "Message actor", 1, 240);
    if (input.content.length > 100_000) throw new RangeError("Message content exceeds 100000 characters");
    if (input.provider !== undefined) assertText(input.provider, "Message provider", 1, 200);
    if (input.model !== undefined) assertText(input.model, "Message model", 1, 200);
    const data = input.data ?? {};
    assertJsonSize(data, 200_000, "Message data");
    for (const [name, count] of [["inputTokens", input.inputTokens], ["outputTokens", input.outputTokens]] as const) {
      if (count !== undefined && (!Number.isInteger(count) || count < 0)) {
        throw new RangeError(`${name} must be a non-negative integer`);
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.#lockWorkspace(client, input.workspaceId, input.organizationId);
      const owner = await this.#lockActiveConversation(client, input.workspaceId, input.organizationId);
      const ordinal = owner.next_message_ordinal;
      const inserted = await client.query(
        `INSERT INTO conversation_messages(
           conversation_id, workspace_id, phase_instance_id, orchestration_step_id,
           ordinal, role, kind, content, data, actor, provider, model,
           input_tokens, output_tokens
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [owner.conversation_id, input.workspaceId,
          input.phaseInstanceId ?? owner.phase_instance_id,
          input.orchestrationStepId ?? null, ordinal, input.role, input.kind,
          input.content, data, input.actor, input.provider ?? null, input.model ?? null,
          input.inputTokens ?? null, input.outputTokens ?? null],
      );
      await client.query(
        `UPDATE conversations
         SET next_message_ordinal = next_message_ordinal + 1, updated_at = now()
         WHERE id = $1`,
        [owner.conversation_id],
      );
      await client.query("COMMIT");
      return inserted.rows[0] as ConversationMessageRow;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createPendingQuestion(input: {
    workspaceId: string;
    organizationId: string;
    questionKey: string;
    prompt: string;
    purpose?: string;
    options?: readonly QuestionOption[];
    allowCustom?: boolean;
    selectionMode?: "single" | "multiple";
    orchestrationStepId?: string;
    actor: string;
  }): Promise<PendingQuestionRow> {
    if (!/^[a-z0-9][a-z0-9_.-]{0,119}$/.test(input.questionKey)) {
      throw new TypeError("Invalid question key");
    }
    assertText(input.prompt, "Question prompt", 1, 10_000);
    const purpose = input.purpose ?? "";
    if (purpose.length > 2_000) throw new RangeError("Question purpose exceeds 2000 characters");
    assertText(input.actor, "Question actor", 1, 240);
    const options = [...(input.options ?? [])];
    validateOptions(options);
    if ((input.allowCustom ?? true) === false && options.length === 0) {
      throw new TypeError("A question without custom answers must provide at least one option");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.#lockWorkspace(client, input.workspaceId, input.organizationId);
      const state = await client.query(
        `SELECT workflow.id AS workflow_id,
                workflow.current_phase_instance_id AS phase_instance_id
         FROM workflow_instances AS workflow
         JOIN workspaces ON workspaces.id = workflow.workspace_id
         WHERE workflow.workspace_id = $1
           AND workspaces.organization_id = $2
           AND workflow.status = 'active'
         FOR UPDATE OF workflow`,
        [input.workspaceId, input.organizationId],
      );
      const row = state.rows[0] as
        | { workflow_id: string; phase_instance_id: string }
        | undefined;
      if (!row) throw notFound("Active workflow");
      const inserted = await client.query(
        `INSERT INTO pending_questions(
           workspace_id, workflow_instance_id, phase_instance_id,
           orchestration_step_id, question_key, prompt, purpose, options, allow_custom, selection_mode
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [input.workspaceId, row.workflow_id, row.phase_instance_id,
          input.orchestrationStepId ?? null, input.questionKey, input.prompt,
          purpose, canonicalJson(options), input.allowCustom ?? true,
          input.selectionMode ?? "single"],
      );
      const question = inserted.rows[0] as PendingQuestionRow;
      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: "workflow.question_created",
        entityType: "pending_question",
        entityId: question.id,
        data: { questionKey: question.question_key, version: question.version },
      });
      await client.query("COMMIT");
      return question;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string; constraint?: string }).constraint ===
          "pending_questions_one_workspace_idx") {
        throw conflict("question_already_pending", "The workspace already has a pending question");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getPendingQuestion(
    workspaceId: string,
    organizationId: string,
  ): Promise<PendingQuestionRow | null> {
    const result = await this.pool.query(
      `SELECT question.*
       FROM pending_questions AS question
       JOIN workspaces ON workspaces.id = question.workspace_id
       JOIN workflow_instances AS workflow
         ON workflow.id = question.workflow_instance_id
        AND workflow.workspace_id = question.workspace_id
       WHERE question.workspace_id = $1
         AND workspaces.organization_id = $2
         AND workflow.status = 'active'
         AND workflow.current_phase_instance_id = question.phase_instance_id
         AND question.status = 'pending'`,
      [workspaceId, organizationId],
    );
    return (result.rows[0] as PendingQuestionRow | undefined) ?? null;
  }

  /** Count clarifications for this skill in the current phase instance only. */
  async countSkillQuestions(input: {
    workspaceId: string;
    organizationId: string;
    phaseInstanceId: string;
    skillName: string;
  }): Promise<number> {
    const result = await this.pool.query(
      `SELECT count(*)::integer AS total
       FROM conversation_messages AS message
       JOIN workspaces ON workspaces.id = message.workspace_id
       JOIN workflow_runs AS run
         ON run.id::text = message.data->>'runId'
        AND run.workspace_id = message.workspace_id
       WHERE message.workspace_id = $1
         AND workspaces.organization_id = $2
         AND message.phase_instance_id = $3
         AND message.kind = 'action'
         AND message.data->'action'->>'type' = 'ask_user'
         AND run.skill_name = $4`,
      [input.workspaceId, input.organizationId, input.phaseInstanceId, input.skillName],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async answerQuestion(input: {
    workspaceId: string;
    organizationId: string;
    questionId: string;
    expectedVersion: number;
    answer: QuestionAnswerValue;
    actor: string;
    idempotencyKey: string;
  }): Promise<{
    answerId: string;
    messageId: string;
    questionId: string;
    questionVersion: number;
    replayed: boolean;
  }> {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new RangeError("Expected question version must be a positive integer");
    }
    assertText(input.idempotencyKey, "Idempotency key", 1, 200);
    assertText(input.actor, "Answer actor", 1, 240);
    assertQuestionAnswer(input.answer);
    assertJsonSize(input.answer, 50_000, "Question answer");
    const requestHash = createHash("sha256").update(canonicalJson({
      workspaceId: input.workspaceId,
      questionId: input.questionId,
      expectedVersion: input.expectedVersion,
      answer: input.answer,
    })).digest("hex");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.#lockWorkspace(client, input.workspaceId, input.organizationId);
      const locked = await client.query(
        `SELECT question.*
         FROM pending_questions AS question
         JOIN workspaces ON workspaces.id = question.workspace_id
         WHERE question.id = $1
           AND question.workspace_id = $2
           AND workspaces.organization_id = $3
         FOR UPDATE OF question`,
        [input.questionId, input.workspaceId, input.organizationId],
      );
      const question = locked.rows[0] as PendingQuestionRow | undefined;
      if (!question) throw notFound("Question");

      const prior = await client.query(
        `SELECT id, question_id, message_id, request_hash
         FROM question_answers
         WHERE workspace_id = $1 AND idempotency_key = $2`,
        [input.workspaceId, input.idempotencyKey],
      );
      const priorRow = prior.rows[0] as
        | { id: string; question_id: string; message_id: string; request_hash: string }
        | undefined;
      if (priorRow) {
        if (priorRow.question_id !== input.questionId || priorRow.request_hash !== requestHash) {
          throw conflict(
            "idempotency_key_reused",
            "The idempotency key was already used for a different answer",
          );
        }
        await client.query("COMMIT");
        return {
          answerId: priorRow.id,
          messageId: priorRow.message_id,
          questionId: priorRow.question_id,
          questionVersion: question.version,
          replayed: true,
        };
      }
      if (question.version !== input.expectedVersion || question.status !== "pending") {
        throw conflict("question_changed", "The pending question changed before this answer arrived");
      }
      const displayText = answerDisplayText(input.answer, question);

      const conversation = await this.#lockActiveConversation(
        client,
        input.workspaceId,
        input.organizationId,
      );
      const message = await client.query(
        `INSERT INTO conversation_messages(
           conversation_id, workspace_id, phase_instance_id, ordinal,
           role, kind, content, data, actor
         ) VALUES ($1, $2, $3, $4, 'user', 'answer', $5, $6, $7)
         RETURNING id`,
        [conversation.conversation_id, input.workspaceId, question.phase_instance_id,
          conversation.next_message_ordinal, displayText,
          { questionId: question.id, answer: input.answer }, input.actor],
      );
      const messageId = String(message.rows[0]?.id);
      await client.query(
        `UPDATE conversations
         SET next_message_ordinal = next_message_ordinal + 1, updated_at = now()
         WHERE id = $1`,
        [conversation.conversation_id],
      );
      const answer = await client.query(
        `INSERT INTO question_answers(
           question_id, workspace_id, message_id, answer, actor,
           idempotency_key, request_hash
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
         RETURNING id`,
        [question.id, input.workspaceId, messageId, canonicalJson(input.answer), input.actor,
          input.idempotencyKey, requestHash],
      );
      const updated = await client.query(
        `UPDATE pending_questions
         SET status = 'answered', version = version + 1,
             answered_at = now(), updated_at = now()
         WHERE id = $1 AND status = 'pending' AND version = $2
         RETURNING version`,
        [question.id, input.expectedVersion],
      );
      if (!updated.rows[0]) {
        throw conflict("question_changed", "The pending question changed before this answer arrived");
      }
      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: "workflow.question_answered",
        entityType: "pending_question",
        entityId: question.id,
        data: { messageId, version: Number(updated.rows[0].version) },
      });
      await client.query("COMMIT");
      return {
        answerId: String(answer.rows[0]?.id),
        messageId,
        questionId: question.id,
        questionVersion: Number(updated.rows[0].version),
        replayed: false,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createConversationSummary(input: {
    workspaceId: string;
    organizationId: string;
    fromOrdinal: number;
    throughOrdinal: number;
    content: string;
    data?: Record<string, unknown>;
    createdBy: string;
  }): Promise<{ id: string; version: number; from_ordinal: string; through_ordinal: string }> {
    if (!Number.isSafeInteger(input.fromOrdinal) || input.fromOrdinal < 1 ||
        !Number.isSafeInteger(input.throughOrdinal) || input.throughOrdinal < input.fromOrdinal) {
      throw new RangeError("Summary message boundaries are invalid");
    }
    assertText(input.content, "Summary content", 1, 100_000);
    assertText(input.createdBy, "Summary creator", 1, 240);
    const data = input.data ?? {};
    assertJsonSize(data, 200_000, "Summary data");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.#lockWorkspace(client, input.workspaceId, input.organizationId);
      const conversation = await this.#lockActiveConversation(
        client,
        input.workspaceId,
        input.organizationId,
      );
      const sources = await client.query(
        `SELECT count(*)::integer AS count
         FROM conversation_messages
         WHERE conversation_id = $1 AND ordinal BETWEEN $2 AND $3`,
        [conversation.conversation_id, input.fromOrdinal, input.throughOrdinal],
      );
      const expectedCount = input.throughOrdinal - input.fromOrdinal + 1;
      if (Number(sources.rows[0]?.count) !== expectedCount) {
        throw conflict(
          "summary_source_missing",
          "Every message in the requested summary range must exist",
        );
      }
      const inserted = await client.query(
        `INSERT INTO conversation_summaries(
           conversation_id, workspace_id, version, from_ordinal,
           through_ordinal, content, data, created_by
         ) VALUES (
           $1, $2,
           COALESCE((SELECT max(version) + 1 FROM conversation_summaries
                     WHERE conversation_id = $1), 1),
           $3, $4, $5, $6, $7
         )
         RETURNING id, version, from_ordinal, through_ordinal`,
        [conversation.conversation_id, input.workspaceId, input.fromOrdinal,
          input.throughOrdinal, input.content, data, input.createdBy],
      );
      await client.query("COMMIT");
      return inserted.rows[0] as {
        id: string;
        version: number;
        from_ordinal: string;
        through_ordinal: string;
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listContextHistory(
    workspaceId: string,
    organizationId: string,
    key: string,
  ): Promise<ContextRevisionRow[]> {
    const result = await this.pool.query(
      `SELECT revision.*
       FROM workspace_context_revisions AS revision
       JOIN workspaces ON workspaces.id = revision.workspace_id
       WHERE revision.workspace_id = $1
         AND workspaces.organization_id = $2
         AND revision.key = $3
       ORDER BY revision.revision DESC`,
      [workspaceId, organizationId, key],
    );
    return result.rows as ContextRevisionRow[];
  }

  /** Worker-only exact lookup; callers must pass IDs pinned at enqueue time. */
  async loadContextRevisionsForExecution(
    workspaceId: string,
    revisionIds: readonly string[],
  ): Promise<ContextRevisionRow[]> {
    const uniqueIds = [...new Set(revisionIds)];
    if (uniqueIds.length > 100) throw new RangeError("A context snapshot can contain at most 100 revisions");
    if (uniqueIds.length === 0) return [];
    const result = await this.pool.query(
      `SELECT * FROM workspace_context_revisions
       WHERE workspace_id = $1
         AND id = ANY($2::uuid[])
         AND status = 'approved'`,
      [workspaceId, uniqueIds],
    );
    if (result.rowCount !== uniqueIds.length) throw notFound("Context revision");
    const byId = new Map((result.rows as ContextRevisionRow[]).map((row) => [row.id, row]));
    return uniqueIds.map((id) => byId.get(id)!);
  }

  async #lockActiveConversation(
    database: pg.PoolClient,
    workspaceId: string,
    organizationId: string,
  ): Promise<{
    conversation_id: string;
    phase_instance_id: string;
    next_message_ordinal: string;
  }> {
    const result = await database.query(
      `SELECT conversation.id AS conversation_id,
              workflow.current_phase_instance_id AS phase_instance_id,
              conversation.next_message_ordinal
       FROM conversations AS conversation
       JOIN workspaces ON workspaces.id = conversation.workspace_id
       JOIN workflow_instances AS workflow
         ON workflow.id = conversation.workflow_instance_id
        AND workflow.workspace_id = conversation.workspace_id
       WHERE conversation.workspace_id = $1
         AND workspaces.organization_id = $2
         AND conversation.status = 'active'
       FOR UPDATE OF conversation`,
      [workspaceId, organizationId],
    );
    const row = result.rows[0] as
      | { conversation_id: string; phase_instance_id: string; next_message_ordinal: string }
      | undefined;
    if (!row) throw notFound("Active conversation");
    return row;
  }

  async #lockWorkspace(
    database: pg.PoolClient,
    workspaceId: string,
    organizationId: string,
  ): Promise<void> {
    const result = await database.query(
      `SELECT id FROM workspaces
       WHERE id = $1 AND organization_id = $2
       FOR UPDATE`,
      [workspaceId, organizationId],
    );
    if (!result.rows[0]) throw notFound("Workspace");
  }
}
