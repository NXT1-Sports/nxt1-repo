/**
 * @fileoverview Coach Game Plan And Adjustments Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Adds a practical framework for pre-game planning and in-game adaptation.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class CoachGamePlanAndAdjustmentsSkill extends BaseSkill {
  readonly name = 'coach_game_plan_and_adjustments';
  readonly description =
    'Coach game planning, scripted opening sequences, in-game adjustment trees, timeout strategy, ' +
    'halftime resets, matchup exploitation, and decision triggers by game state.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Coach Game Plan And Adjustments

### Pre-Game Plan Structure
1. **Identity First**: anchor on team strengths and preferred tempo
2. **Primary Attack Plan**: top actions/sets/calls to create high-value outcomes
3. **Defensive Priorities**: remove opponent strengths before adding complexity
4. **Special Situations**: baseline/after-timeout, end-of-quarter, late-clock plans

### In-Game Adjustment Tree
- **Trigger**: what signal changed (coverage, pressure, foul trouble, tempo, efficiency drop)
- **Diagnosis**: why the original plan is underperforming
- **Adjustment**: specific tactical change (personnel, spacing, scheme, call family)
- **Validation Window**: 2-4 possessions or defined sequence before next change

### Halftime Reset
- Keep to 3 priorities max:
  - one offensive correction
  - one defensive correction
  - one execution discipline point

### Output Format
- **Opening Script**
- **Adjustment Triggers**
- **Counter Package**
- **End-Game Protocol**

### Rules
- Do not recommend wholesale system changes mid-game without clear evidence.
- Tie every adjustment to an observable trigger.
- Prioritize clarity for players under pressure; fewer, sharper instructions win.`;
  }
}
