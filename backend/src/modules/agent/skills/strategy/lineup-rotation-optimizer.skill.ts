/**
 * @fileoverview Lineup Rotation Optimizer Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Provides a repeatable model for lineup and rotation decisions.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class LineupRotationOptimizerSkill extends BaseSkill {
  readonly name = 'lineup_rotation_optimizer';
  readonly description =
    'Lineup optimization, rotation planning, substitution patterns, role balancing, fatigue management, ' +
    'foul-trouble contingencies, and closing-unit decision strategy.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(): string {
    return `## Lineup Rotation Optimizer

### Rotation Design Principles
- Preserve at least one primary creator/leader on the floor when possible.
- Balance shot creation, defensive coverage, and rebounding/transition duties.
- Protect high-impact players from unnecessary fatigue spikes.

### Substitution Triggers
- **Performance Trigger**: repeated breakdowns or cold stretches beyond expected variance
- **Foul Trigger**: risk thresholds by quarter/game state
- **Fatigue Trigger**: measurable drop in execution pace, closeout quality, or decision speed
- **Matchup Trigger**: opponent lineup change that creates leverage or vulnerability

### Unit Planning
- **Starter Unit**: establish identity and tempo
- **Bridge Unit**: stabilize non-starter stretches
- **Specialist Unit**: situational defense/offense package
- **Closing Unit**: best five for the current game script, not only default starters

### Output Format
1. Planned minute bands by role
2. Quarter-by-quarter substitution windows
3. Contingency rotations (foul trouble, injury, matchup emergency)
4. Closing-time decision rules

### Rules
- Do not optimize purely for offense or purely for defense.
- Favor role clarity over frequent random shuffling.
- Make closing-lineup decisions based on live game context and execution quality.`;
  }
}
