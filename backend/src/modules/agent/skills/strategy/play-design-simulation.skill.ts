/**
 * @fileoverview Play Design Simulation Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Gives the Strategy Coordinator a reusable framework for creating,
 * pressure-testing, and sequencing sport-specific plays.
 * Enhanced to receive team context so plays are designed from the correct perspective.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class PlayDesignSimulationSkill extends BaseSkill {
  readonly name = 'play_design_simulation';
  readonly description =
    'Play design, play simulation, tactical sequencing, formation planning, route combinations, ' +
    'coverage stress testing, counter design, situational play calling, and sport-specific playbook building.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(params?: Record<string, unknown>): string {
    // Extract team context if provided
    const team = (params as any)?.team;
    const game = (params as any)?.game;

    const perspectiveNote =
      team?.perspectiveTeam === 'own'
        ? "\n**Perspective**: Design offensive plays from OUR team's perspective (what WE call and execute)."
        : team?.perspectiveTeam === 'opponent'
          ? "\n**Perspective**: Design plays from OPPONENT's perspective (what THEY might call against us). This is for defensive scouting and counter-planning."
          : '';

    const teamContext =
      team && (team.ownTeamName || team.opponentTeamName)
        ? `\n### Relevant Teams\n- **Our Team**: ${team.ownTeamName || 'Unknown'}${team.ownTeamColor ? ` (${team.ownTeamColor})` : ''}\n- **Opponent**: ${team.opponentTeamName || 'Unknown'}${team.opponentTeamColor ? ` (${team.opponentTeamColor})` : ''}${perspectiveNote}\n`
        : '';

    const sportContext = game?.sport
      ? `\n### Sport Context\n- **Sport**: ${game.sport}${game.division ? ` (${game.division})` : ''}\n`
      : '';

    return `## Play Design Simulation Framework
${teamContext}${sportContext}
### Start With The Constraint
For every play or set, identify:
- **Situation**: down-distance, field zone, clock, score, or equivalent game state
- **Primary Objective**: create leverage, isolate a defender, generate space, force rotation, or protect against pressure
- **Personnel Reality**: who can actually execute the action at the user's level
- **Opponent Stress Point**: the exact rule, matchup, or help responsibility the design is attacking

### Design Sequence
1. **Alignment**: establish formation, spacing, and role clarity
2. **Primary Action**: define the first stress point and timing window
3. **Read Progression**: what the user reads first, second, and third
4. **Counter**: how the concept changes if the defense overplays the first answer
5. **Emergency Outlet**: what keeps the play alive when timing breaks down

### Simulation Checklist
Before finalizing a play, test it against:
- Base coverage or default defensive structure
- Pressure or blitz adjustment
- Switch, hedge, trap, or help-heavy responses
- Short-yardage / red-zone / compressed-space versions
- Tempo or late-clock versions when applicable

### Deliverable Format
For each play, provide:
1. **Play Intent**
2. **Personnel And Alignment**
3. **Assignment By Role**
4. **Primary Read And Counter**
5. **Best Use Cases**
6. **Failure Points And Coaching Cues**

### Rules
- One play should solve one primary problem.
- Do not assign impossible reads, spacing, or movement demands for the stated age or level.
- If personnel, opponent rules, or sport context are unclear, label assumptions before simulating.
- Distinguish between the base call and the adjustment package instead of blending them together.`;
  }
}
