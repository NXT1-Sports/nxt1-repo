/**
 * @fileoverview Skills System — Barrel Export
 * @module @nxt1/backend/modules/agent/skills
 */

export { BaseSkill, type SkillCategory } from './base.skill.js';

// Evaluation
export { ScoutingRubricSkill } from './evaluation/scouting-rubric.skill.js';

// Copywriting
export { OutreachCopywritingSkill } from './copywriting/outreach-copywriting.skill.js';

// Note: Future categories like compliance/strategy will be exported here
