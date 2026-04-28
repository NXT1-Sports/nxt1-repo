/**
 * @fileoverview Base Skill — Abstract Skill Interface with Semantic Matching
 * @module @nxt1/backend/modules/agent/skills
 *
 * Skills represent "Domain Knowledge" or "How to think".
 * Unlike Tools (which execute code), Skills inject specialized rubrics,
 * few-shot examples, and heuristics into the LLM's prompt context.
 *
 * Skills are dynamically loaded at runtime via semantic matching:
 *   1. The user intent is embedded (1536-dim vector via OpenRouter).
 *   2. Each skill's description is embedded once and cached in RAM.
 *   3. Cosine similarity determines which skills are relevant (≥ threshold).
 *   4. Matched skill contexts are injected into the agent's system prompt.
 *
 * @example
 * ```ts
 * export class ScoutingRubricSkill extends BaseSkill {
 *   readonly name = 'scouting_rubric';
 *   readonly category = 'evaluation';
 *
 *   getPromptContext(params: { sport: string, position: string }): string {
 *     return `When evaluating a ${params.position} in ${params.sport}, focus on...`;
 *   }
 * }
 * ```
 */

export type SkillCategory =
  | 'evaluation'
  | 'copywriting'
  | 'compliance'
  | 'strategy'
  | 'brand'
  | 'data'
  | 'knowledge';

// ─── Cosine Similarity ──────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two embedding vectors.
 * Returns a value in [-1, 1] where 1 = identical direction, 0 = orthogonal.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Base Skill ─────────────────────────────────────────────────────────────

/** Default similarity threshold for skill matching. */
export const DEFAULT_SKILL_THRESHOLD = 0.35;

export abstract class BaseSkill {
  /** Unique name of the skill. */
  abstract readonly name: string;

  /** What this skill teaches the agent to do. Used for semantic matching. */
  abstract readonly description: string;

  /** Logical category for grouping. */
  abstract readonly category: SkillCategory;

  /**
   * Cached embedding vector of this skill's description.
   * Lazily computed on first `matchIntent()` call, then reused.
   */
  private _embedding: readonly number[] | null = null;

  /**
   * Returns the plain-text domain knowledge, heuristics, or few-shot examples
   * to be injected into the system prompt.
   *
   * @param params Optional dynamic context (e.g., sport, position, division)
   */
  abstract getPromptContext(params?: Record<string, unknown>): string;

  /**
   * Determine whether this skill is semantically relevant to the given intent.
   *
   * @param intentEmbedding Pre-computed embedding of the user's intent text.
   * @param embedFn Embedding function (OpenRouterService.embed) — called once
   *                to populate the cached skill description embedding.
   * @param threshold Minimum cosine similarity to count as a match (0–1).
   * @returns `{ matched: boolean; similarity: number }`
   */
  async matchIntent(
    intentEmbedding: readonly number[],
    embedFn: (text: string) => Promise<readonly number[]>,
    threshold: number = DEFAULT_SKILL_THRESHOLD
  ): Promise<{ matched: boolean; similarity: number }> {
    // Lazily embed the skill description (one-time, cached for process lifetime)
    if (!this._embedding) {
      this._embedding = await embedFn(this.description);
    }

    const similarity = cosineSimilarity(intentEmbedding, this._embedding);
    return { matched: similarity >= threshold, similarity };
  }
}
