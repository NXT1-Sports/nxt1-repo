/**
 * @fileoverview Film Breakdown Taxonomy Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Standardizes how film review is structured so analysis is repeatable, coach-like,
 * and grounded in observable evidence.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class FilmBreakdownTaxonomySkill extends BaseSkill {
  readonly name = 'film_breakdown_taxonomy';
  readonly description =
    'Film breakdown taxonomy, clip tagging, play-by-play evaluation, technique notes, ' +
    'decision-making review, coaching feedback structure, video grading language.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(): string {
    return `## Film Breakdown Taxonomy

### Review Each Clip With The Same Structure
- **Situation**: down, distance, phase, game context if known
- **Assignment**: what the athlete appears responsible for
- **Execution**: what was observable in technique, timing, leverage, burst, balance, finish
- **Result**: what happened on the play
- **Coaching Point**: one specific correction or reinforcement
- **Confidence**: High, Medium, or Low when context is incomplete

### Tagging Vocabulary
Use clear tags such as:
- technique
- processing
- leverage
- burst
- physicality
- ball skills
- competitiveness
- discipline

### Rules
- Separate what is visible from what is inferred.
- Do not overstate assignment certainty when the camera angle is incomplete.
- Focus on repeatable traits, not just highlight outcomes.
- Prefer one sharp coaching point over a long vague paragraph.`;
  }
}
