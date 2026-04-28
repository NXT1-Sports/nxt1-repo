/**
 * @fileoverview Strategy Gameplan Framework Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Gives the Strategy Coordinator a repeatable planning framework for weekly
 * execution plans, opponent prep, and decision-ready action boards.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class StrategyGameplanFrameworkSkill extends BaseSkill {
  readonly name = 'strategy_gameplan_framework';
  readonly description =
    'Weekly execution planning, opponent scouting, priority frameworks, action plans, KPI setting, ' +
    'decision trees, athlete development planning, coach workflows, sports strategy gameplanning.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Strategy Gameplan Framework

### Planning Hierarchy
Always move from top-down:
1. **North Star Outcome**: what success looks like this week
2. **Top 3 Priorities**: the only workstreams that materially change the outcome
3. **Daily Actions**: repeatable actions with owners and deadlines
4. **Review Loop**: what gets measured, when, and what triggers an adjustment

### Weekly Plan Format
For strategic plans, use this structure:
- **Objective**: one sentence, outcome-based
- **Win Conditions**: 2-4 measurable signals
- **Top Priorities**: ranked 1-3
- **Action Board**: owner, deadline, dependency, expected impact
- **Risks**: what could break the plan
- **Adjustments**: what to do if conditions change

### Opponent Or Situation Prep
When asked for a gameplan, always cover:
- What the opponent or situation does best
- Where the leverage points are
- What to attack first
- What to avoid
- One contingency if the first plan fails

### Decision Rules
- Tie every recommendation to verified data, observed behavior, or clearly labeled assumptions.
- Keep priorities ruthlessly narrow. More than 5 priorities means the plan is unfocused.
- Give the user execution-ready actions, not motivational filler.
- When evidence is incomplete, label confidence as High, Medium, or Low.`;
  }
}
