import { createHash } from "node:crypto";
import type pg from "pg";
import { conflict, notFound } from "../domain/errors.js";
import {
  CURRENT_GUIDED_INTAKE_VERSION,
  getQuestionnaire,
  GUIDED_INTAKE_QUESTIONNAIRE_ID,
  type CuratedOption,
  type InterviewQuestionDefinition,
  type QuestionnaireDefinition,
} from "../interview/definitions.js";
import { writeAuditEvent } from "./audit.js";

const IDENTIFIER = /^[a-z0-9][a-z0-9_.-]{0,119}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InterviewAuthority = "legacy" | "guided";
export type OptionSetOrigin = "curated" | "programmatic" | "model";

export type InterviewSessionRow = {
  id: string;
  workspace_id: string;
  questionnaire_id: string;
  questionnaire_version: string;
  status: "in_progress" | "completed" | "cancelled";
  current_question_id: string | null;
  current_question_version: number | null;
  version: number;
  compiled_intake?: unknown | null;
  started_at: Date;
  completed_at: Date | null;
  updated_at: Date;
};

export type InterviewOption = CuratedOption;

export type InterviewOptionSetRow = {
  id: string;
  session_id: string;
  workspace_id: string;
  question_id: string;
  question_version: number;
  origin: OptionSetOrigin;
  generator_provider: string | null;
  generator_model: string | null;
  prompt_version: string | null;
  content_hash: string;
  options: InterviewOption[];
  status: "active" | "superseded" | "expired";
  expires_at: Date | null;
  presented_at: Date | null;
  interaction_started_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type InterviewAnswerRow = {
  id: string;
  session_id: string;
  workspace_id: string;
  question_id: string;
  question_version: number;
  option_set_id: string;
  selected_option_ids: string[];
  selected_options: InterviewOption[];
  custom_text: string | null;
  answer_source: "option" | "custom" | "combined";
  idempotency_key: string;
  request_hash: string;
  session_version: number;
  status: "active" | "superseded";
  supersedes_answer_id: string | null;
  actor: string;
  created_at: Date;
  superseded_at: Date | null;
};

export type InterviewState = {
  authority: "guided";
  session: InterviewSessionRow;
  optionSets: InterviewOptionSetRow[];
  answers: InterviewAnswerRow[];
};

export type InterviewStartResult =
  | { authority: "legacy"; session: null; resumed: true }
  | { authority: "guided"; session: InterviewSessionRow; resumed: boolean };

type StoredAuthority = {
  authority: InterviewAuthority;
  questionnaire_id: string | null;
  questionnaire_version: string | null;
};

export type CuratedOptionInput = CuratedOption;
export type ModelOptionInput = Readonly<{ label: string; description?: string }>;

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertShortText(value: string, name: string, maximum: number): void {
  if (value.trim().length === 0 || value.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new RangeError(`${name} must contain safe text between 1 and ${maximum} characters`);
  }
}

function assertOptionText(value: string, name: string, maximum: number): void {
  assertShortText(value, name, maximum);
  if (value !== value.trim() || /[<>]/.test(value)) {
    throw new TypeError(`${name} must be plain text without markup or surrounding whitespace`);
  }
}

function questionForSession(
  session: Pick<InterviewSessionRow, "questionnaire_id" | "questionnaire_version">,
  questionId: string,
  questionVersion: number,
): { questionnaire: QuestionnaireDefinition; question: InterviewQuestionDefinition } {
  let questionnaire: QuestionnaireDefinition;
  try {
    questionnaire = getQuestionnaire(session.questionnaire_id, session.questionnaire_version);
  } catch {
    throw conflict(
      "questionnaire_release_unavailable",
      "The interview's pinned questionnaire release is unavailable",
    );
  }
  const question = questionnaire.questions.find((candidate) => candidate.id === questionId);
  if (!question || question.version !== questionVersion) {
    throw conflict("question_version_changed", "The question does not match the pinned interview release");
  }
  return { questionnaire, question };
}

function validateOptionObject(
  value: CuratedOptionInput | ModelOptionInput,
  origin: OptionSetOrigin,
  index: number,
): { id?: string; label: string; description?: string; requiresCustomText?: true } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`Option ${index + 1} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const allowedKeys = origin === "model"
    ? ["label", "description"]
    : ["id", "label", "description", "requiresCustomText"];
  if (Object.keys(record).some((key) => !allowedKeys.includes(key)) ||
      typeof record.label !== "string" ||
      (record.description !== undefined && typeof record.description !== "string")) {
    throw new TypeError(`Option ${index + 1} contains an unsupported field or value`);
  }
  assertOptionText(record.label, `Option ${index + 1} label`, 240);
  if (record.description !== undefined) {
    assertOptionText(record.description as string, `Option ${index + 1} description`, 500);
  }
  if (origin !== "model") {
    if (typeof record.id !== "string" || !IDENTIFIER.test(record.id)) {
      throw new TypeError(`Option ${index + 1} must have a canonical id`);
    }
    if (record.requiresCustomText !== undefined && record.requiresCustomText !== true) {
      throw new TypeError(`Option ${index + 1} has an invalid custom-text requirement`);
    }
  } else if ("id" in record) {
    throw new TypeError("Model-provided option identifiers are not accepted");
  }
  return {
    ...(origin === "model" ? {} : { id: record.id as string }),
    label: record.label,
    ...(record.description === undefined ? {} : { description: record.description as string }),
    ...(record.requiresCustomText === true ? { requiresCustomText: true as const } : {}),
  };
}

export function canonicalizeInterviewOptions(
  origin: OptionSetOrigin,
  options: readonly CuratedOptionInput[] | readonly ModelOptionInput[],
): InterviewOption[] {
  if (options.length < 2 || options.length > 12) {
    throw new RangeError("An interview option set must contain between 2 and 12 options");
  }
  const validated = options.map((value, index) => validateOptionObject(value, origin, index));
  const ids = new Set<string>();
  const labels = new Set<string>();
  return validated.map((value, index) => {
    const normalizedLabel = value.label.normalize("NFKC").toLocaleLowerCase("en-US");
    if (labels.has(normalizedLabel)) throw new TypeError("Option labels must be meaningfully distinct");
    labels.add(normalizedLabel);
    const id = value.id ?? `suggestion_${index + 1}_${hashJson({
      label: value.label,
      description: value.description ?? null,
    }).slice(0, 12)}`;
    if (ids.has(id)) throw new TypeError(`Duplicate interview option id '${id}'`);
    ids.add(id);
    return Object.freeze({
      id,
      label: value.label,
      ...(value.description === undefined ? {} : { description: value.description }),
      ...(value.requiresCustomText === true ? { requiresCustomText: true as const } : {}),
    });
  });
}

function assertIdentifier(value: string, name: string): void {
  if (!IDENTIFIER.test(value)) throw new TypeError(`Invalid ${name}`);
}

function assertUuid(value: string, name: string): void {
  if (!UUID.test(value)) throw new TypeError(`Invalid ${name}`);
}

async function lockOwnedSession(
  client: pg.PoolClient,
  input: { organizationId: string; workspaceId: string; sessionId: string },
): Promise<InterviewSessionRow> {
  const result = await client.query(
    `SELECT session.*
     FROM interview_sessions AS session
     JOIN workspaces ON workspaces.id = session.workspace_id
     WHERE session.id = $1
       AND session.workspace_id = $2
       AND workspaces.organization_id = $3
     FOR UPDATE OF session`,
    [input.sessionId, input.workspaceId, input.organizationId],
  );
  const session = result.rows[0] as InterviewSessionRow | undefined;
  if (!session) throw notFound("Interview session");
  return session;
}

/**
 * Tenant-scoped persistence for M9 guided interviews. This store deliberately
 * does not decide question progression; the deterministic M9.2 service owns
 * transition and completeness rules while this layer owns locking, pins,
 * provenance, idempotency, and immutable answer history.
 */
export class InterviewStore {
  constructor(readonly pool: pg.Pool) {}

  async startOrResume(input: {
    organizationId: string;
    workspaceId: string;
    actor: string;
    allowNewGuidedInterview?: boolean;
    questionnaireId?: string;
    questionnaireVersion?: string;
  }): Promise<InterviewStartResult> {
    assertUuid(input.organizationId, "organization id");
    assertUuid(input.workspaceId, "workspace id");
    assertShortText(input.actor, "Actor", 200);
    const questionnaire = getQuestionnaire(
      input.questionnaireId ?? GUIDED_INTAKE_QUESTIONNAIRE_ID,
      input.questionnaireVersion ?? CURRENT_GUIDED_INTAKE_VERSION,
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const workspaceResult = await client.query(
        `SELECT id, current_phase, status
         FROM workspaces
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [input.workspaceId, input.organizationId],
      );
      const workspace = workspaceResult.rows[0] as
        | { id: string; current_phase: number; status: string }
        | undefined;
      if (!workspace) throw notFound("Workspace");
      if (workspace.status === "archived") {
        throw conflict("workspace_archived", "Archived workspaces cannot start an interview");
      }
      if (workspace.current_phase !== 1) {
        throw conflict("phase_changed", "Guided intake is available only during Phase 1");
      }

      const existingAuthority = (await client.query(
        `SELECT authority, questionnaire_id, questionnaire_version
         FROM interview_authorities WHERE workspace_id = $1`,
        [input.workspaceId],
      )).rows[0] as StoredAuthority | undefined;

      let authority = existingAuthority;
      if (!authority) {
        const legacy = await client.query(
          `SELECT (
             EXISTS (
               SELECT 1 FROM workflow_runs
               WHERE workspace_id = $1 AND phase = 1
             ) OR EXISTS (
               SELECT 1 FROM pending_questions
               WHERE workspace_id = $1
             )
           ) AS has_legacy_state`,
          [input.workspaceId],
        );
        const hasLegacyState = legacy.rows[0]?.has_legacy_state === true;
        // The rollout switch must be reversible. When no authority exists and
        // guided intake is disabled, expose the legacy path without pinning a
        // permanent legacy authority. Real legacy state is still pinned below.
        if (!hasLegacyState && input.allowNewGuidedInterview === false) {
          await client.query("COMMIT");
          return { authority: "legacy", session: null, resumed: true };
        }
        authority = hasLegacyState
          ? { authority: "legacy", questionnaire_id: null, questionnaire_version: null }
          : {
              authority: "guided",
              questionnaire_id: questionnaire.id,
              questionnaire_version: questionnaire.version,
            };
        await client.query(
          `INSERT INTO interview_authorities(
             workspace_id, authority, questionnaire_id, questionnaire_version, selected_by
           ) VALUES ($1, $2, $3, $4, $5)`,
          [input.workspaceId, authority.authority, authority.questionnaire_id,
            authority.questionnaire_version, input.actor],
        );
        await writeAuditEvent(client, {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          actor: input.actor,
          action: "interview.authority_selected",
          entityType: "interview_authority",
          entityId: input.workspaceId,
          data: {
            authority: authority.authority,
            questionnaireId: authority.questionnaire_id,
            questionnaireVersion: authority.questionnaire_version,
          },
        });
      }

      if (authority.authority === "legacy") {
        await client.query("COMMIT");
        return { authority: "legacy", session: null, resumed: true };
      }
      if (authority.questionnaire_id !== questionnaire.id ||
          authority.questionnaire_version !== questionnaire.version) {
        // A deploy or stale caller cannot silently reinterpret a pinned interview.
        let pinned: QuestionnaireDefinition;
        try {
          pinned = getQuestionnaire(
            authority.questionnaire_id as string,
            authority.questionnaire_version as string,
          );
        } catch {
          throw conflict(
            "questionnaire_release_unavailable",
            "The interview's pinned questionnaire release is unavailable",
          );
        }
        const session = await this.#resumeOrCreateGuidedSession(
          client,
          input,
          pinned,
        );
        await client.query("COMMIT");
        return session;
      }

      const session = await this.#resumeOrCreateGuidedSession(client, input, questionnaire);
      await client.query("COMMIT");
      return session;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async #resumeOrCreateGuidedSession(
    client: pg.PoolClient,
    input: { organizationId: string; workspaceId: string; actor: string },
    questionnaire: QuestionnaireDefinition,
  ): Promise<Extract<InterviewStartResult, { authority: "guided" }>> {
    const existing = await client.query(
      `SELECT * FROM interview_sessions
       WHERE workspace_id = $1 AND status IN ('in_progress', 'completed')
       ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END, started_at DESC
       LIMIT 1`,
      [input.workspaceId],
    );
    const session = existing.rows[0] as InterviewSessionRow | undefined;
    if (session) {
      if (session.questionnaire_id !== questionnaire.id ||
          session.questionnaire_version !== questionnaire.version) {
        throw conflict(
          "interview_version_conflict",
          "The workspace already has an interview pinned to a different questionnaire release",
        );
      }
      return { authority: "guided", session, resumed: true };
    }

    const first = questionnaire.questions[0];
    if (!first) throw new Error("Validated questionnaire has no first question");
    const inserted = await client.query(
      `INSERT INTO interview_sessions(
         workspace_id, questionnaire_id, questionnaire_version,
         current_question_id, current_question_version
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.workspaceId, questionnaire.id, questionnaire.version, first.id, first.version],
    );
    const created = inserted.rows[0] as InterviewSessionRow;
    await writeAuditEvent(client, {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "interview.started",
      entityType: "interview_session",
      entityId: created.id,
      data: {
        questionnaireId: questionnaire.id,
        questionnaireVersion: questionnaire.version,
      },
    });
    return { authority: "guided", session: created, resumed: false };
  }

  async getState(input: {
    organizationId: string;
    workspaceId: string;
    sessionId?: string;
  }): Promise<InterviewState | null> {
    assertUuid(input.organizationId, "organization id");
    assertUuid(input.workspaceId, "workspace id");
    if (input.sessionId) assertUuid(input.sessionId, "session id");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const sessionResult = input.sessionId
        ? await client.query(
            `SELECT session.*
             FROM interview_sessions AS session
             JOIN interview_authorities AS authority
               ON authority.workspace_id = session.workspace_id
             JOIN workspaces ON workspaces.id = session.workspace_id
             WHERE session.id = $1
               AND session.workspace_id = $2
               AND workspaces.organization_id = $3
               AND authority.authority = 'guided'`,
            [input.sessionId, input.workspaceId, input.organizationId],
          )
        : await client.query(
            `SELECT session.*
             FROM interview_sessions AS session
             JOIN interview_authorities AS authority
               ON authority.workspace_id = session.workspace_id
             JOIN workspaces ON workspaces.id = session.workspace_id
             WHERE session.workspace_id = $1
               AND workspaces.organization_id = $2
               AND authority.authority = 'guided'
               AND session.status IN ('in_progress', 'completed')
             ORDER BY CASE session.status WHEN 'in_progress' THEN 0 ELSE 1 END,
                      session.started_at DESC
             LIMIT 1`,
            [input.workspaceId, input.organizationId],
          );
      const session = sessionResult.rows[0] as InterviewSessionRow | undefined;
      if (!session) {
        await client.query("COMMIT");
        return null;
      }
      const optionSets = await client.query(
        `SELECT * FROM interview_option_sets
         WHERE session_id = $1 AND workspace_id = $2 AND status = 'active'
           AND (expires_at IS NULL OR expires_at > now())
         ORDER BY created_at, id`,
        [session.id, input.workspaceId],
      );
      const answers = await client.query(
        `SELECT * FROM interview_answers
         WHERE session_id = $1 AND workspace_id = $2 AND status = 'active'
         ORDER BY created_at, id`,
        [session.id, input.workspaceId],
      );
      await client.query("COMMIT");
      return {
        authority: "guided",
        session,
        optionSets: optionSets.rows as InterviewOptionSetRow[],
        answers: answers.rows as InterviewAnswerRow[],
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveOptionSet(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    questionId: string;
    questionVersion: number;
    origin: OptionSetOrigin;
    options: readonly CuratedOptionInput[] | readonly ModelOptionInput[];
    generator?: { provider: string; model: string; promptVersion: string };
    expiresAt?: Date;
  }): Promise<InterviewOptionSetRow> {
    assertUuid(input.organizationId, "organization id");
    assertUuid(input.workspaceId, "workspace id");
    assertUuid(input.sessionId, "session id");
    assertIdentifier(input.questionId, "question id");
    if (input.origin === "model" && !input.generator) {
      throw new TypeError("Model option sets require generator provenance");
    }
    if (input.origin === "model" && !input.expiresAt) {
      throw new TypeError("Model option sets require an explicit expiry");
    }
    if (input.origin !== "model" && input.generator) {
      throw new TypeError("Only model option sets may include model generator provenance");
    }
    if (input.generator) {
      assertShortText(input.generator.provider, "Option provider", 120);
      assertShortText(input.generator.model, "Option model", 200);
      assertShortText(input.generator.promptVersion, "Option prompt version", 120);
    }
    if (input.expiresAt &&
        (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt.getTime() <= Date.now())) {
      throw new RangeError("Option-set expiry must be a valid future date");
    }
    const options = canonicalizeInterviewOptions(input.origin, input.options);
    const contentHash = hashJson(options);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const session = await lockOwnedSession(client, input);
      if (session.status !== "in_progress") {
        throw conflict("interview_not_active", "Options cannot change after an interview ends");
      }
      const { question } = questionForSession(session, input.questionId, input.questionVersion);
      if (input.origin === "curated" && hashJson(question.fallbackOptions) !== contentHash) {
        throw new TypeError("Curated options must exactly match the pinned reviewed fallback catalog");
      }
      const answered = await client.query(
        `SELECT 1 FROM interview_answers
         WHERE session_id = $1 AND question_id = $2 AND status = 'active'`,
        [input.sessionId, input.questionId],
      );
      if (answered.rowCount) {
        throw conflict("question_already_answered", "Options cannot change after an answer exists");
      }
      const active = await client.query(
        `SELECT * FROM interview_option_sets
         WHERE session_id = $1 AND question_id = $2 AND status = 'active'
         FOR UPDATE`,
        [input.sessionId, input.questionId],
      );
      const existing = active.rows[0] as InterviewOptionSetRow | undefined;
      const existingExpired = existing?.expires_at
        ? existing.expires_at.getTime() <= Date.now()
        : false;
      if (existing?.content_hash === contentHash && existing.origin === input.origin &&
          existing.generator_provider === (input.generator?.provider ?? null) &&
          existing.generator_model === (input.generator?.model ?? null) &&
          existing.prompt_version === (input.generator?.promptVersion ?? null) &&
          !existingExpired) {
        await client.query("COMMIT");
        return existing;
      }
      if (existing) {
        if (existing.interaction_started_at && !existingExpired) {
          throw conflict(
            "option_set_in_use",
            "Options cannot change after the user starts interacting with them",
          );
        }
        await client.query(
          `UPDATE interview_option_sets
           SET status = $2, updated_at = now()
           WHERE id = $1`,
          [existing.id, existingExpired ? "expired" : "superseded"],
        );
      }
      const inserted = await client.query(
        `INSERT INTO interview_option_sets(
           session_id, workspace_id, question_id, question_version, origin,
           generator_provider, generator_model, prompt_version,
           content_hash, options, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [input.sessionId, input.workspaceId, input.questionId, input.questionVersion,
          input.origin, input.generator?.provider ?? null, input.generator?.model ?? null,
          input.generator?.promptVersion ?? null, contentHash, JSON.stringify(options),
          input.expiresAt ?? null],
      );
      await client.query(
        "UPDATE interview_sessions SET updated_at = now() WHERE id = $1",
        [input.sessionId],
      );
      await client.query("COMMIT");
      return inserted.rows[0] as InterviewOptionSetRow;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Idempotently records that a projection was shown or touched. Presentation
   * alone still permits an untouched model refresh; interaction permanently
   * freezes the active set so the user's visible choices cannot move.
   */
  async markOptionSetPresented(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    optionSetId: string;
    interactionStarted: boolean;
  }): Promise<InterviewOptionSetRow> {
    assertUuid(input.organizationId, "organization id");
    assertUuid(input.workspaceId, "workspace id");
    assertUuid(input.sessionId, "session id");
    assertUuid(input.optionSetId, "option-set id");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const session = await lockOwnedSession(client, input);
      if (session.status !== "in_progress") {
        throw conflict("interview_not_active", "Options cannot be presented after an interview ends");
      }
      const updated = await client.query(
        `UPDATE interview_option_sets
         SET presented_at = COALESCE(presented_at, now()),
             interaction_started_at = CASE
               WHEN $4 THEN COALESCE(interaction_started_at, now())
               ELSE interaction_started_at
             END,
             updated_at = now()
         WHERE id = $1
           AND session_id = $2
           AND workspace_id = $3
           AND status = 'active'
           AND (expires_at IS NULL OR expires_at > now())
         RETURNING *`,
        [input.optionSetId, input.sessionId, input.workspaceId, input.interactionStarted],
      );
      const optionSet = updated.rows[0] as InterviewOptionSetRow | undefined;
      if (!optionSet) throw notFound("Active interview option set");
      await client.query("COMMIT");
      return optionSet;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveAnswer(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    expectedSessionVersion: number;
    questionId: string;
    questionVersion: number;
    optionSetId: string;
    selectedOptionIds: readonly string[];
    customText?: string;
    idempotencyKey: string;
    actor: string;
    nextQuestionId?: string | null;
    nextQuestionVersion?: number | null;
    status?: "in_progress" | "completed";
    completedAt?: Date | null;
    compiledIntake?: unknown | null;
  }): Promise<{ answer: InterviewAnswerRow; sessionVersion: number; replayed: boolean }> {
    assertUuid(input.organizationId, "organization id");
    assertUuid(input.workspaceId, "workspace id");
    assertUuid(input.sessionId, "session id");
    assertUuid(input.optionSetId, "option-set id");
    assertIdentifier(input.questionId, "question id");
    assertShortText(input.idempotencyKey, "Idempotency key", 200);
    assertShortText(input.actor, "Actor", 200);
    if (!Number.isInteger(input.expectedSessionVersion) || input.expectedSessionVersion < 1) {
      throw new RangeError("Expected interview version must be a positive integer");
    }
    if (new Set(input.selectedOptionIds).size !== input.selectedOptionIds.length ||
        input.selectedOptionIds.some((id) => !IDENTIFIER.test(id))) {
      throw new TypeError("Selected option ids must be unique canonical identifiers");
    }
    if (input.customText !== undefined) {
      assertShortText(input.customText, "Custom answer", 10_000);
    }
    const requestHash = hashJson({
      sessionId: input.sessionId,
      questionId: input.questionId,
      questionVersion: input.questionVersion,
      optionSetId: input.optionSetId,
      selectedOptionIds: input.selectedOptionIds,
      customText: input.customText ?? null,
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const session = await lockOwnedSession(client, input);
      const priorRequest = await client.query(
        `SELECT * FROM interview_answers
         WHERE session_id = $1 AND idempotency_key = $2`,
        [input.sessionId, input.idempotencyKey],
      );
      const replay = priorRequest.rows[0] as InterviewAnswerRow | undefined;
      if (replay) {
        if (replay.request_hash !== requestHash) {
          throw conflict(
            "idempotency_key_reused",
            "The idempotency key was already used for a different interview answer",
          );
        }
        await client.query("COMMIT");
        return { answer: replay, sessionVersion: replay.session_version, replayed: true };
      }
      if (session.status !== "in_progress") {
        throw conflict("interview_not_active", "Answers cannot change after an interview ends");
      }
      if (session.version !== input.expectedSessionVersion) {
        throw conflict("interview_changed", "The interview changed before this answer arrived");
      }
      const { question } = questionForSession(session, input.questionId, input.questionVersion);
      if (input.selectedOptionIds.length > question.maximumSelections) {
        throw new RangeError(`Question '${question.id}' accepts at most ${question.maximumSelections} selections`);
      }
      if (input.selectedOptionIds.length > 0 &&
          input.selectedOptionIds.length < question.minimumSelections) {
        throw new RangeError(`Question '${question.id}' requires at least ${question.minimumSelections} selections`);
      }
      if (input.selectedOptionIds.length === 0 && input.customText === undefined) {
        throw new TypeError("An interview answer must select an option or include custom text");
      }
      if (!question.allowCustom && input.customText !== undefined) {
        throw new TypeError(`Question '${question.id}' does not accept custom text`);
      }
      if (question.customTextRequired && input.customText === undefined) {
        throw new TypeError(`Question '${question.id}' requires a plain-language answer`);
      }
      const supportsCombinedAnswer = question.answerMode === "single_with_text" ||
        question.answerMode === "multiple_with_text";
      if (input.selectedOptionIds.length > 0 && input.customText !== undefined &&
          !supportsCombinedAnswer) {
        throw new TypeError(`Question '${question.id}' does not accept option-plus-text answers`);
      }

      const optionResult = await client.query(
        `SELECT * FROM interview_option_sets
         WHERE id = $1 AND session_id = $2 AND workspace_id = $3
           AND question_id = $4 AND question_version = $5
         FOR SHARE`,
        [input.optionSetId, input.sessionId, input.workspaceId,
          input.questionId, input.questionVersion],
      );
      const optionSet = optionResult.rows[0] as InterviewOptionSetRow | undefined;
      if (!optionSet) throw notFound("Interview option set");
      await client.query(
        `UPDATE interview_option_sets
         SET presented_at = COALESCE(presented_at, now()),
             interaction_started_at = COALESCE(interaction_started_at, now()),
             updated_at = now()
         WHERE id = $1`,
        [optionSet.id],
      );
      const selectedOptions = input.selectedOptionIds.map((id) => {
        const selected = optionSet.options.find((candidate) => candidate.id === id);
        if (!selected) throw new TypeError(`Selected option '${id}' was not shown to the user`);
        return selected;
      });
      if (selectedOptions.some((selected) => selected.requiresCustomText) &&
          input.customText === undefined) {
        throw new TypeError("The selected option requires a plain-language custom answer");
      }
      const activeResult = await client.query(
        `SELECT * FROM interview_answers
         WHERE session_id = $1 AND question_id = $2 AND status = 'active'
         FOR UPDATE`,
        [input.sessionId, input.questionId],
      );
      const active = activeResult.rows[0] as InterviewAnswerRow | undefined;
      if (active) {
        await client.query(
          `UPDATE interview_answers
           SET status = 'superseded', superseded_at = now()
           WHERE id = $1`,
          [active.id],
        );
      }
      const source = input.selectedOptionIds.length > 0
        ? (input.customText === undefined ? "option" : "combined")
        : "custom";
      const inserted = await client.query(
        `INSERT INTO interview_answers(
           session_id, workspace_id, question_id, question_version, option_set_id,
           selected_option_ids, selected_options, custom_text, answer_source,
           idempotency_key, request_hash, session_version, supersedes_answer_id, actor
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [input.sessionId, input.workspaceId, input.questionId, input.questionVersion,
          input.optionSetId, input.selectedOptionIds, JSON.stringify(selectedOptions),
          input.customText ?? null, source, input.idempotencyKey, requestHash,
          input.expectedSessionVersion + 1, active?.id ?? null, input.actor],
      );
      const nextQId = input.nextQuestionId !== undefined ? input.nextQuestionId : session.current_question_id;
      const nextQVersion = input.nextQuestionVersion !== undefined ? input.nextQuestionVersion : session.current_question_version;
      const nextStatus = input.status ?? session.status;
      const nextCompletedAt = input.completedAt !== undefined ? input.completedAt : session.completed_at;
      const nextCompiledIntake = input.compiledIntake !== undefined
        ? (input.compiledIntake ? JSON.stringify(input.compiledIntake) : null)
        : null;
      const updatedSession = await client.query(
        `UPDATE interview_sessions
         SET version = version + 1,
             current_question_id = $3,
             current_question_version = $4,
             status = $5,
             completed_at = CASE WHEN $5 = 'completed' THEN COALESCE($6, now()) ELSE NULL END,
             compiled_intake = CASE WHEN $5 = 'completed' THEN $7::jsonb ELSE NULL END,
             updated_at = now()
         WHERE id = $1 AND version = $2
         RETURNING version`,
        [
          input.sessionId,
          input.expectedSessionVersion,
          nextQId,
          nextQVersion,
          nextStatus,
          nextCompletedAt,
          nextCompiledIntake,
        ],
      );
      if (!updatedSession.rows[0]) {
        throw conflict("interview_changed", "The interview changed before this answer arrived");
      }
      const answer = inserted.rows[0] as InterviewAnswerRow;
      await writeAuditEvent(client, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: active ? "interview.answer_superseded" : "interview.answer_recorded",
        entityType: "interview_answer",
        entityId: answer.id,
        data: {
          sessionId: input.sessionId,
          questionId: input.questionId,
          questionVersion: input.questionVersion,
          answerSource: source,
          supersedesAnswerId: active?.id ?? null,
        },
      });
      await client.query("COMMIT");
      return {
        answer,
        sessionVersion: Number(updatedSession.rows[0].version),
        replayed: false,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listAnswerHistory(input: {
    organizationId: string;
    workspaceId: string;
    sessionId: string;
    questionId: string;
  }): Promise<InterviewAnswerRow[]> {
    assertUuid(input.organizationId, "organization id");
    assertUuid(input.workspaceId, "workspace id");
    assertUuid(input.sessionId, "session id");
    assertIdentifier(input.questionId, "question id");
    const result = await this.pool.query(
      `SELECT answer.*
       FROM interview_answers AS answer
       JOIN interview_sessions AS session
         ON session.id = answer.session_id AND session.workspace_id = answer.workspace_id
       JOIN workspaces ON workspaces.id = session.workspace_id
       WHERE answer.session_id = $1
         AND answer.workspace_id = $2
         AND answer.question_id = $3
         AND workspaces.organization_id = $4
       ORDER BY answer.created_at, answer.id`,
      [input.sessionId, input.workspaceId, input.questionId, input.organizationId],
    );
    return result.rows as InterviewAnswerRow[];
  }
}
