import { createHash } from "node:crypto";
import type pg from "pg";
import type { OptionCacheEntry, SuggestionItem } from "./types.js";

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function computeOptionCacheKey(input: {
  organizationId: string;
  workspaceId: string;
  questionnaireVersion: string;
  confirmedAnswersHash: string;
  targetQuestionIds: readonly string[];
  promptVersion: string;
  generatorProvider: string;
  generatorModel: string;
}): string {
  return hashJson({
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    questionnaireVersion: input.questionnaireVersion,
    confirmedAnswersHash: input.confirmedAnswersHash,
    // The same answers can legitimately prefetch different future questions.
    // Canonicalizing the target set prevents a partial batch from poisoning a
    // later cache lookup and keeps equivalent request orderings idempotent.
    targetQuestionIds: [...new Set(input.targetQuestionIds)].sort(),
    promptVersion: input.promptVersion,
    generatorProvider: input.generatorProvider,
    generatorModel: input.generatorModel,
  });
}

/**
 * Tenant-scoped cache for Option Assistant suggestions.
 * Uses an in-memory LRU layer backed by PostgreSQL `interview_option_cache` table.
 */
export class InterviewOptionCache {
  readonly #memory = new Map<string, OptionCacheEntry>();
  readonly #maxMemoryEntries = 500;

  constructor(readonly pool: pg.Pool) {}

  async get(cacheKey: string): Promise<OptionCacheEntry | null> {
    const cached = this.#memory.get(cacheKey);
    if (cached) {
      if (cached.expiresAt.getTime() > Date.now()) {
        // Refresh entry position to preserve most-recently-used ordering
        this.#memory.delete(cacheKey);
        this.#memory.set(cacheKey, cached);
        return cached;
      }
      this.#memory.delete(cacheKey);
    }

    const result = await this.pool.query(
      `SELECT * FROM interview_option_cache
       WHERE cache_key = $1 AND expires_at > now()
       LIMIT 1`,
      [cacheKey],
    );

    const row = result.rows[0] as {
      cache_key: string;
      workspace_id: string;
      organization_id: string;
      questionnaire_id: string;
      questionnaire_version: string;
      confirmed_answers_hash: string;
      prompt_version: string;
      generator_provider: string;
      generator_model: string;
      suggestions: Record<string, SuggestionItem[]>;
      explanation: string | null;
      expires_at: Date;
      created_at: Date;
    } | undefined;

    if (!row) return null;

    const entry: OptionCacheEntry = {
      cacheKey: row.cache_key,
      workspaceId: row.workspace_id,
      organizationId: row.organization_id,
      questionnaireId: row.questionnaire_id,
      questionnaireVersion: row.questionnaire_version,
      confirmedAnswersHash: row.confirmed_answers_hash,
      promptVersion: row.prompt_version,
      generatorProvider: row.generator_provider,
      generatorModel: row.generator_model,
      suggestions: row.suggestions,
      explanation: row.explanation,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };

    this.#putMemory(cacheKey, entry);
    return entry;
  }

  async set(entry: Omit<OptionCacheEntry, "createdAt">): Promise<void> {
    const fullEntry: OptionCacheEntry = {
      ...entry,
      createdAt: new Date(),
    };
    await this.pool.query(
      `INSERT INTO interview_option_cache(
         workspace_id, organization_id, cache_key, questionnaire_id, questionnaire_version,
         confirmed_answers_hash, prompt_version, generator_provider, generator_model,
         suggestions, explanation, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (cache_key) DO UPDATE
         SET suggestions = EXCLUDED.suggestions,
             explanation = EXCLUDED.explanation,
             expires_at = EXCLUDED.expires_at`,
      [
        entry.workspaceId,
        entry.organizationId,
        entry.cacheKey,
        entry.questionnaireId,
        entry.questionnaireVersion,
        entry.confirmedAnswersHash,
        entry.promptVersion,
        entry.generatorProvider,
        entry.generatorModel,
        JSON.stringify(entry.suggestions),
        entry.explanation ?? null,
        entry.expiresAt,
      ],
    );

    // Do not expose a cache entry in this process until the shared durable
    // write succeeds. Otherwise a transient database failure would create
    // replica-specific behavior.
    this.#putMemory(entry.cacheKey, fullEntry);
  }

  async deleteExpired(): Promise<number> {
    const result = await this.pool.query(
      "DELETE FROM interview_option_cache WHERE expires_at <= now()",
    );
    return result.rowCount ?? 0;
  }

  async deleteForWorkspace(workspaceId: string): Promise<number> {
    for (const [key, entry] of this.#memory.entries()) {
      if (entry.workspaceId === workspaceId) {
        this.#memory.delete(key);
      }
    }

    const result = await this.pool.query(
      "DELETE FROM interview_option_cache WHERE workspace_id = $1",
      [workspaceId],
    );
    return result.rowCount ?? 0;
  }

  #putMemory(key: string, entry: OptionCacheEntry): void {
    if (this.#memory.has(key)) {
      this.#memory.delete(key);
    } else if (this.#memory.size >= this.#maxMemoryEntries) {
      const oldestKey = this.#memory.keys().next().value;
      if (oldestKey) this.#memory.delete(oldestKey);
    }
    this.#memory.set(key, entry);
  }
}
