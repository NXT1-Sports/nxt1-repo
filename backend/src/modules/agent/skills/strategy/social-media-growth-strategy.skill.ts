/**
 * @fileoverview Social Media Growth Strategy Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Gives Brand workflows a growth-focused planning layer beyond visual style.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class SocialMediaGrowthStrategySkill extends BaseSkill {
  readonly name = 'social_media_growth_strategy';
  readonly description =
    'Social media growth strategy, audience building, content cadence, hook structures, ' +
    'distribution planning, engagement loops, and conversion to recruiting visibility.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Social Media Growth Strategy

### Weekly Content Mix (Baseline)
- **40% Performance Proof**: clips, measurable progress, game impact moments
- **25% Story Layer**: behind-the-scenes, routines, adversity, leadership context
- **20% Recruiting Signal**: schedule updates, visit recaps, coach-facing accomplishments
- **15% Community/Personality**: teammate features, gratitude, authentic off-field moments

### Post Architecture
1. **Hook (0-2 sec / first line)**: specific and outcome-oriented
2. **Proof**: clip, stat, or before/after evidence
3. **Context**: why it matters (team impact, role growth, next target)
4. **CTA**: save/share/comment/follow based on objective

### Distribution Rules
- Repurpose each anchor video into 3-5 platform-specific cuts.
- Publish at consistent windows around training/game cycles.
- Pair high-quality visuals with concise, searchable captions.
- Use sport-, position-, and region-relevant tags over generic spam tags.

### Measurement
Track by objective, not vanity:
- Discovery: reach, profile visits
- Engagement quality: saves, shares, meaningful comments
- Recruiting outcomes: inbound messages, coach interactions, visit interest

### Rules
- Prioritize consistency over one-off viral chasing.
- Never fabricate stats or credentials for engagement.
- Keep tone athlete-authentic, not over-produced corporate.`;
  }
}
