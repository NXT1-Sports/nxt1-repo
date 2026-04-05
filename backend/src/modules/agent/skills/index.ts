/**
 * @fileoverview Skills System — Barrel Export
 * @module @nxt1/backend/modules/agent/skills
 */

export {
  BaseSkill,
  type SkillCategory,
  cosineSimilarity,
  DEFAULT_SKILL_THRESHOLD,
} from './base.skill.js';
export { SkillRegistry, type MatchedSkill } from './skill-registry.js';

// Evaluation
export { ScoutingRubricSkill } from './evaluation/scouting-rubric.skill.js';

// Copywriting
export { OutreachCopywritingSkill } from './copywriting/outreach-copywriting.skill.js';

// Compliance
export { ComplianceRulebookSkill } from './compliance/compliance-rulebook.skill.js';

// Brand
export { StaticGraphicStyleSkill } from './brand/static-graphic-style.skill.js';
export { VideoHighlightStyleSkill } from './brand/video-highlight-style.skill.js';
export { SocialCaptionStyleSkill } from './brand/social-caption-style.skill.js';
