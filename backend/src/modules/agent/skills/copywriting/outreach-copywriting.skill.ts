/**
 * @fileoverview Outreach Copywriting Skill
 * @module @nxt1/backend/modules/agent/skills/copywriting
 *
 * Teaches the Recruiting Coordinator how to write high-converting emails
 * to college coaches, avoiding spammy tones and focusing on verified data.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class OutreachCopywritingSkill extends BaseSkill {
  readonly name = 'outreach_copywriting';
  readonly description = 'Best practices for writing recruiting emails to college coaches.';
  readonly category: SkillCategory = 'copywriting';

  getPromptContext(_params?: { targetDivision?: string }): string {
    return `
      COPYWRITING RULES FOR COLLEGE COACHES:
      1. Subject Line: MUST include Name, Grad Year, Position, and 1 elite metric.
         (e.g., "John Doe | 2026 QB | 6'3" 215lbs | 4.5 GPA")
      2. Keep it under 150 words.
      3. Never beg. Be professional, confident, and direct.
      4. Always link to the NXT1 verified profile.
      5. Include upcoming game schedule if available.
    `.trim();
  }
}
