/**
 * @fileoverview Intel Report Quality Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Defines quality bars for write_intel and update_intel outputs so reports stay
 * evidence-led, actionable, and consistent across coordinators.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class IntelReportQualitySkill extends BaseSkill {
  readonly name = 'intel_report_quality';
  readonly description =
    'Intel report quality standards, evidence-based summaries, confidence ratings, actionable next steps, ' +
    'section update quality control, report consistency, insight prioritization.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Intel Report Quality Standard

### Every Section Must Include
- **Claim**: the main insight in plain language
- **Evidence**: verified source, metric, timeline, or observed behavior
- **Confidence**: High, Medium, or Low
- **Action**: what the athlete, coach, or family should do next

### Quality Gates
- No generic filler or motivational padding
- No unsupported claims
- No contradictions across sections
- No stale recommendations without a current timestamp or reason
- Prioritize the 1-3 insights that materially change decisions

### Update Rules
When using update_intel:
- Refresh only the affected section unless the new evidence changes the whole report
- Preserve still-valid context from existing sections
- Call out what changed and why it matters

### Writing Rules
- Lead with the decision-relevant insight, not background info
- Use concise language and concrete numbers when available
- If evidence is thin, say that directly and lower confidence`;
  }
}
