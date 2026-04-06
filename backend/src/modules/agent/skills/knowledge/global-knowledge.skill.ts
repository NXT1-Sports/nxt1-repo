/**
 * @fileoverview Global Knowledge Skill — Dynamic Domain Knowledge Retrieval
 * @module @nxt1/backend/modules/agent/skills/knowledge
 *
 * Unlike all other skills which return hardcoded Markdown strings, this skill
 * dynamically queries the MongoDB Atlas Vector Search knowledge base at runtime.
 *
 * When matched, instead of returning a static `getPromptContext()` string, it:
 *   1. Takes the user's intent
 *   2. Runs a `$vectorSearch` against `agentGlobalKnowledge`
 *   3. Returns the top-K most relevant verified domain chunks
 *
 * This is the bridge between the `SkillRegistry` pattern and the
 * `KnowledgeRetrievalService`. It extends `BaseSkill` so it integrates
 * seamlessly with the existing agent architecture — no changes needed to
 * `BaseAgent.execute()` or `AgentRouter`.
 *
 * **Key difference from static skills:**
 * Static skills (e.g., `ComplianceRulebookSkill`) are matched via semantic
 * similarity on their description, then return a fixed string. This skill
 * is also matched via semantic similarity, but its `getPromptContext()` returns
 * the last retrieval result (populated by `retrieveForIntent()`).
 *
 * Integration flow:
 * ```
 * BaseAgent.execute()
 *   → skillRegistry.match(intentEmbedding, embedFn, allowedSkills)
 *       → globalKnowledgeSkill.matchIntent(intentEmbedding, embedFn)
 *           → Always returns matched=true (threshold 0.0) so it always participates
 *   → skillRegistry.buildPromptBlock(matched)
 *       → globalKnowledgeSkill.getPromptContext()
 *           → Returns cached retrieval results from last retrieveForIntent() call
 * ```
 *
 * The `GlobalKnowledgeSkill` uses a two-phase approach:
 * 1. `matchIntent()` overridden to always match AND trigger retrieval
 * 2. `getPromptContext()` returns the cached retrieval block
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';
import type { KnowledgeRetrievalService } from '../../memory/knowledge-retrieval.service.js';
import type { KnowledgeRetrievalResult } from '@nxt1/core';
import { logger } from '../../../../utils/logger.js';

export class GlobalKnowledgeSkill extends BaseSkill {
  readonly name = 'global_knowledge';
  readonly description =
    'Domain knowledge retrieval from the verified NXT1 knowledge base. ' +
    'NCAA NAIA NJCAA rules eligibility recruiting calendars compliance regulations ' +
    'transfer portal NIL guidelines sport-specific training nutrition mental performance ' +
    'platform guides help center articles recruiting strategy athlete development.';
  readonly category: SkillCategory = 'compliance';

  private readonly retrievalService: KnowledgeRetrievalService;

  /** Cached prompt block from the most recent retrieval. */
  private _cachedPromptBlock = '';

  /** Cached results from the most recent retrieval (for inspection/logging). */
  private _lastResults: readonly KnowledgeRetrievalResult[] = [];

  constructor(retrievalService: KnowledgeRetrievalService) {
    super();
    this.retrievalService = retrievalService;
  }

  /**
   * Override matchIntent to:
   * 1. Always return matched=true (this skill should participate whenever allowed)
   * 2. Perform the actual vector search retrieval as a side effect
   * 3. Cache the results for `getPromptContext()` to return
   *
   * This is intentional: the SkillRegistry calls matchIntent() before
   * buildPromptBlock(), so we use this hook to eagerly fetch knowledge.
   * The similarity score returned is the top retrieval score (or 0.5 if
   * no results), which positions this skill correctly in the sorted list.
   */
  override async matchIntent(
    _intentEmbedding: readonly number[],
    _embedFn: (text: string) => Promise<readonly number[]>,
    _threshold?: number
  ): Promise<{ matched: boolean; similarity: number }> {
    // Reset cached state from any previous invocation to prevent stale
    // knowledge from leaking across concurrent agent executions.
    this._cachedPromptBlock = '';
    this._lastResults = [];

    // Always match so this skill participates whenever allowed by getSkills().
    // Actual retrieval happens in retrieveForIntent(), called by BaseAgent.
    return { matched: true, similarity: 0.8 };
  }

  /**
   * Perform retrieval against the knowledge base for a specific intent.
   * This should be called by the agent pipeline BEFORE `getPromptContext()`.
   *
   * @param query The user's intent text (plain language).
   * @param topK Number of chunks to retrieve.
   */
  async retrieveForIntent(query: string, topK: number = 5): Promise<void> {
    try {
      this._lastResults = await this.retrievalService.retrieve(query, { topK });
      this._cachedPromptBlock = this.retrievalService.buildPromptBlock(this._lastResults);

      logger.info('[GlobalKnowledgeSkill] Retrieved knowledge for intent', {
        query: query.slice(0, 100),
        chunksRetrieved: this._lastResults.length,
        topScore: this._lastResults[0]?.score?.toFixed(4),
      });
    } catch (err) {
      logger.warn('[GlobalKnowledgeSkill] Retrieval failed — proceeding without knowledge', {
        error: err instanceof Error ? err.message : String(err),
      });
      this._cachedPromptBlock = '';
      this._lastResults = [];
    }
  }

  /**
   * Returns the cached retrieval results as a Markdown prompt block.
   * If `retrieveForIntent()` has not been called, returns empty string.
   */
  getPromptContext(_params?: Record<string, unknown>): string {
    return this._cachedPromptBlock;
  }

  /** Get the last retrieval results (for logging/debugging). */
  get lastResults(): readonly KnowledgeRetrievalResult[] {
    return this._lastResults;
  }
}
