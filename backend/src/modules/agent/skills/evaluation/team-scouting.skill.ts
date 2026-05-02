/**
 * @fileoverview Team Scouting Framework Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Provides a scouting-first framework for evaluating team identity, systems,
 * tendencies, and matchup factors without grades or rankings.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class TeamScoutingSkill extends BaseSkill {
  readonly name = 'team_scouting_framework';
  readonly description =
    'Generic team scouting framework for evaluating identity, style of play, units, tendencies, and matchup plans using verified evidence without team grades or rankings.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(_params?: { sport?: string; position?: string }): string {
    return `## Team Scouting Framework
When scouting a team, use this system-focused structure:

### Team Snapshot
- Team name, level, record window, competition context
- Recent sample size (games reviewed and date range)

### Identity & Style
- Core identity (tempo, physicality, spacing, pressure, possession profile)
- Preferred game script (front-runner style vs comeback style)

### System Tendencies
1. Offensive Tendencies
   - Primary actions/sets, preferred entry points, late-clock behavior
2. Defensive Tendencies
   - Base scheme, coverage rules, pressure triggers, weak-side help patterns
3. Transition & Special Situations
   - Conversion behavior, set-piece/special package tendencies, end-game patterns

### Personnel & Unit Notes
- Core contributors and role clarity
- Unit combinations that change performance profile
- Rotational patterns and substitution timing indicators

### Matchup Planning Notes
- What this team does reliably well
- Where this team can be stressed by specific counters
- Priority preparation items for coaches/players

### Scouting Rules
- Do not assign grades, ratings, or power-rank labels.
- Do not infer tendencies without observable evidence.
- Cite sources for key claims (film timestamps, stat providers, game logs).
- If sample size is limited, explicitly state confidence limits.`;
  }
}
