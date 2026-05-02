/**
 * @fileoverview Media Creative Intent Skill
 * @module @nxt1/backend/modules/agent/skills/brand
 *
 * Shared intent-to-creative-brief rules used across graphics, video, and
 * other media outputs to prevent literal rendering of style directions.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class MediaCreativeIntentSkill extends BaseSkill {
  readonly name = 'media_creative_intent';
  readonly description =
    'Converts user requests into media production briefs by separating literal on-canvas text from non-literal style direction for graphics and video.';
  readonly category: SkillCategory = 'brand';

  getPromptContext(_params?: Record<string, unknown>): string {
    return `## Media Creative Intent Translation

### Primary Rule
- Separate requests into two buckets before creating assets:
- 1) **Literal Content**: text or facts that must appear in output
- 2) **Creative Direction**: style, mood, aesthetic, references, atmosphere

### Literal Text Policy
- Only include text on graphic/video overlays when user clearly asks for that text
- If user describes style ("galaxy", "fire", "cinematic", "neon"), treat as visual direction, not display text
- If uncertain, prefer less on-canvas text rather than inventing a headline

### Graphic Generation Mapping
- textRequirements should contain only explicit display copy
- styleDescription should contain all style language, inspirations, and mood words
- Never move style phrases into textRequirements

### Video Generation Mapping
- Apply style language to color grade, motion language, transitions, and pacing
- Do not convert style words into title cards unless explicitly requested

### Quality Gate
- Before finalizing: verify every displayed word can be traced to a user-explicit text request
- Remove any decorative headline generated from style-only terms`;
  }
}
