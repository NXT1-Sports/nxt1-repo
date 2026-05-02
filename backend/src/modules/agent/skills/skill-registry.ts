/**
 * @fileoverview Skill Registry — Dynamic Skill Loader
 * @module @nxt1/backend/modules/agent/skills
 *
 * Central registry that holds all skill instances and performs semantic
 * matching at runtime to determine which skills are relevant to a given
 * user intent.
 *
 * Flow:
 *   1. Agent calls `registry.match(intentEmbedding, allowedSkills)`.
 *   2. Each allowed skill computes cosine similarity against the intent.
 *   3. Skills above the threshold are returned, sorted by relevance.
 *   4. The agent injects matched skill contexts into the system prompt.
 *
 * Skill description embeddings are cached in-process after the first call
 * (via BaseSkill._embedding), so subsequent invocations are pure math — no
 * additional LLM API calls.
 */

import { BaseSkill, DEFAULT_SKILL_THRESHOLD } from './base.skill.js';
import { logger } from '../../../utils/logger.js';

export interface MatchedSkill {
  readonly skill: BaseSkill;
  readonly similarity: number;
}

export class SkillRegistry {
  /** All registered skill instances keyed by name. */
  private readonly skills = new Map<string, BaseSkill>();

  /** Register a skill instance. Duplicate names are rejected. */
  register(skill: BaseSkill): void {
    if (this.skills.has(skill.name)) {
      logger.warn(`[SkillRegistry] Duplicate skill name "${skill.name}" — skipping.`);
      return;
    }
    this.skills.set(skill.name, skill);
    logger.info(`[SkillRegistry] Registered skill: ${skill.name} (${skill.category})`);
  }

  /** Get a skill by name. */
  get(name: string): BaseSkill | undefined {
    return this.skills.get(name);
  }

  /** List all registered skill names. */
  listAll(): readonly string[] {
    return [...this.skills.keys()];
  }

  /**
   * Semantic match: find skills relevant to the user intent.
   *
   * @param intentEmbedding Pre-computed embedding of the user's intent.
   * @param embedFn        Embedding function for lazily computing skill embeddings.
   * @param allowedNames   If provided, only consider skills in this set.
   * @param threshold      Minimum cosine similarity (default: DEFAULT_SKILL_THRESHOLD).
   * @returns Matched skills sorted by descending similarity.
   */
  async match(
    intentEmbedding: readonly number[],
    embedFn: (text: string) => Promise<readonly number[]>,
    allowedNames?: readonly string[],
    threshold: number = DEFAULT_SKILL_THRESHOLD
  ): Promise<readonly MatchedSkill[]> {
    const candidates = allowedNames
      ? (allowedNames.map((n) => this.skills.get(n)).filter(Boolean) as BaseSkill[])
      : [...this.skills.values()];

    if (candidates.length === 0) return [];

    // Run semantic matching in parallel for all candidate skills
    const results = await Promise.all(
      candidates.map(async (skill) => {
        const { matched, similarity } = await skill.matchIntent(
          intentEmbedding,
          embedFn,
          threshold
        );
        return { skill, matched, similarity };
      })
    );

    const matched = results
      .filter((r) => r.matched)
      .sort((a, b) => b.similarity - a.similarity)
      .map(({ skill, similarity }) => ({ skill, similarity }));

    if (matched.length > 0) {
      logger.info(`[SkillRegistry] Matched ${matched.length} skill(s)`, {
        skills: matched.map((m) => `${m.skill.name} (${m.similarity.toFixed(3)})`),
      });
    }

    return matched;
  }

  /**
   * Build the prompt injection block for all matched skills.
   * Returns an empty string if no skills matched.
   */
  buildPromptBlock(matched: readonly MatchedSkill[], params?: Record<string, unknown>): string {
    if (matched.length === 0) return '';

    const blocks = matched
      .map((m) => {
        const context = m.skill.getPromptContext(params).trim();
        if (context.length === 0) return null;
        return `### Skill: ${m.skill.name} (relevance: ${m.similarity.toFixed(2)})\n${context}`;
      })
      .filter((block): block is string => block !== null);

    if (blocks.length === 0) return '';

    return ['', '## Loaded Skills (dynamically matched to this task)', ...blocks].join('\n\n');
  }
}
