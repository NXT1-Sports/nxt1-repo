/**
 * @fileoverview Coach Game Plan And Adjustments Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Adds a practical framework for pre-game planning and in-game adaptation.
 * Enhanced to receive team context (our team vs opponent, colors, perspective)
 * so it can generate perspective-aware game plans.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';
import { extractGameAnalysisParams } from '@nxt1/core';

export class CoachGamePlanAndAdjustmentsSkill extends BaseSkill {
  readonly name = 'coach_game_plan_and_adjustments';
  readonly description =
    'Coach game planning, scripted opening sequences, in-game adjustment trees, timeout strategy, ' +
    'priority resets, matchup exploitation, and decision triggers by game state.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(params?: Record<string, unknown>): string {
    const gameAnalysisParams = extractGameAnalysisParams(params);
    const team = gameAnalysisParams?.team;
    const game = gameAnalysisParams?.game;

    const teamContext =
      team && (team.ownTeamName || team.opponentTeamName || team.perspectiveTeam)
        ? `\n### Team Context\n` +
          (team.ownTeamName ? `- **Our Team**: ${team.ownTeamName}` : '') +
          (team.ownTeamColor ? ` (${team.ownTeamColor} jersey)` : '') +
          '\n' +
          (team.opponentTeamName ? `- **Opponent**: ${team.opponentTeamName}` : '') +
          (team.opponentTeamColor ? ` (${team.opponentTeamColor} jersey)` : '') +
          '\n' +
          (team.perspectiveTeam
            ? team.perspectiveTeam === 'own'
              ? '- **Perspective**: Our team (offensive planning)'
              : '- **Perspective**: Opponent scouting (defensive analysis)'
            : '') +
          '\n'
        : '';

    const gameContext =
      game && (game.phase || game.sport)
        ? `\n### Game Context\n` +
          (game.sport
            ? `- **Sport**: ${game.sport}` + (game.division ? ` (${game.division})` : '') + '\n'
            : '') +
          (game.phase
            ? `- **Phase**: ${game.phase}` +
              (game.phase === 'pregame'
                ? ' — Focus on predictive prep and contingency planning'
                : game.phase === 'in-game'
                  ? ' — Focus on reactive adjustments and momentum preservation'
                  : game.phase === 'postgame'
                    ? ' — Focus on learning and refinement'
                    : '') +
              '\n'
            : '') +
          ''
        : '';

    return `## Coach Game Plan And Adjustments
${teamContext}${gameContext}
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

### Priority Reset
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
