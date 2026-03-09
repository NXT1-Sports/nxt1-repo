/**
 * @fileoverview Base Skill — Abstract Skill Interface
 * @module @nxt1/backend/modules/agent/skills
 *
 * Skills represent "Domain Knowledge" or "How to think".
 * Unlike Tools (which execute code), Skills inject specialized rubrics,
 * few-shot examples, and heuristics into the LLM's prompt context.
 *
 * Agents dynamically load Skills based on the task.
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

export type SkillCategory = 'evaluation' | 'copywriting' | 'compliance' | 'strategy';

export abstract class BaseSkill {
  /** Unique name of the skill. */
  abstract readonly name: string;

  /** What this skill teaches the agent to do. */
  abstract readonly description: string;

  /** Logical category for grouping. */
  abstract readonly category: SkillCategory;

  /**
   * Returns the plain-text domain knowledge, heuristics, or few-shot examples
   * to be injected into the system prompt.
   *
   * @param params Optional dynamic context (e.g., sport, position, division)
   */
  abstract getPromptContext(params?: Record<string, unknown>): string;
}
