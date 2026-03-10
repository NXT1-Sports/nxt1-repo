/**
 * @fileoverview Scouting Rubric Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Provides the Performance Coordinator with the exact, sport-specific rubrics
 * needed to evaluate a player properly (Physical, Technical, Mental, Potential).
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class ScoutingRubricSkill extends BaseSkill {
  readonly name = 'scouting_rubric';
  readonly description = 'Provides sport-specific evaluation rubrics and grading scales.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(_params?: { sport?: string; position?: string }): string {
    // TODO: Dynamically load exact rubrics from a database or constants file
    // based on params.sport and params.position.
    return `
      SCOUTING RUBRIC:
      You must evaluate prospects across 4 dimensions:
      1. Physical (Measurements, Speed, Strength)
      2. Technical (Sport-specific skills, form, mechanics)
      3. Mental (IQ, decision making, body language)
      4. Potential (Ceiling, developmental timeline)
      
      Score each out of 100.
    `.trim();
  }
}
