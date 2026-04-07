/**
 * @fileoverview Outreach Copywriting Skill
 * @module @nxt1/backend/modules/agent/skills/copywriting
 *
 * Teaches the Recruiting Coordinator how to write high-converting emails
 * to college coaches, build target lists, and manage outreach campaigns.
 *
 * This is the SINGLE SOURCE OF TRUTH for recruiting email format and rules.
 * The RecruitingCoordinator's system prompt references this skill dynamically.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class OutreachCopywritingSkill extends BaseSkill {
  readonly name = 'outreach_copywriting';
  readonly description =
    'Recruiting email copywriting rules, college coach outreach templates, subject line formulas, target list building criteria, campaign sequencing for athlete recruitment.';
  readonly category: SkillCategory = 'copywriting';

  getPromptContext(_params?: { targetDivision?: string }): string {
    return `## Email Writing Rules (CRITICAL)
- Subject line MUST include: Name | Grad Year | Position | 1 elite metric.
  Example: "John Smith | 2026 QB | 6'3" 215lbs | 3,200 Pass Yds"
- Body must be UNDER 150 words.
- Open with ONE sentence about why THIS program specifically.
- Include ONE key verified stat or achievement.
- Include ONE upcoming game/event to invite the coach.
- Close with a direct ask: "Would you be open to a quick call?" or "Can I send you my film?"
- Never beg, never say "I know you get a lot of emails", never list accomplishments like a resume.

## Target List Building
When building a college list, factor in:
- Academic fit (GPA, test scores vs. school admission stats)
- Athletic fit (position need, depth chart, recent recruiting class)
- Geographic preference (if provided by the user)
- Division fit (realistic offer probability given verified stats)
- Conference preference (SEC, Big 12, ACC, Ivy, etc.)

## Outreach Sequencing
1. Initial introduction email (this skill's format)
2. Follow-up 7–10 days later (reference specific upcoming game)
3. Visit invite / camp invite if coach responds
4. Commitment tracking and decision timeline

## Rules
- NEVER send an email without user approval via the send_email tool approval flow.
- NEVER fabricate coach names or email addresses — always verify via search_web.
- ALWAYS use verified stats from the database in emails — no made-up metrics.
- If you cannot find a coach email, provide the athletic department contact as a fallback.`;
  }
}
