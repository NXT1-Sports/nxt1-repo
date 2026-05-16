/**
 * @fileoverview Film Breakdown Taxonomy Skill
 * @module @nxt1/backend/modules/agent/skills/evaluation
 *
 * Standardizes how film review is structured so analysis is repeatable, coach-like,
 * and grounded in observable evidence.
 * Enhanced to receive team context (jersey colors, perspective) so analysis
 * correctly identifies which side of the field/play is being analyzed.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';
import { extractGameAnalysisParams } from '@nxt1/core';

export class FilmBreakdownTaxonomySkill extends BaseSkill {
  readonly name = 'film_breakdown_taxonomy';
  readonly description =
    'Film breakdown taxonomy, clip tagging, play-by-play evaluation, technique notes, ' +
    'decision-making review, coaching feedback structure, video grading language.';
  readonly category: SkillCategory = 'evaluation';

  getPromptContext(params?: Record<string, unknown>): string {
    const gameAnalysisParams = extractGameAnalysisParams(params);
    const team = gameAnalysisParams?.team;
    const game = gameAnalysisParams?.game;

    const jerseyContext =
      team && (team.ownTeamColor || team.opponentTeamColor)
        ? `\n### Jersey / Team Identification\n` +
          (team.ownTeamName
            ? `- **${team.ownTeamName}** (${team.ownTeamColor || 'primary'} jersey)`
            : '') +
          '\n' +
          (team.opponentTeamName
            ? `- **${team.opponentTeamName}** (${team.opponentTeamColor || 'alternate'} jersey)`
            : '') +
          "\n\n**When analyzing clips**: Identify the player's team by jersey color before evaluating their role/assignment." +
          '\n'
        : '';

    const perspectiveNote =
      team?.perspectiveTeam === 'own'
        ? '\n**Analysis Perspective**: Evaluate OUR athletes — focus on execution, assignment compliance, and technique development.\n'
        : team?.perspectiveTeam === 'opponent'
          ? '\n**Analysis Perspective**: Evaluate OPPONENT athletes — focus on tendencies, weaknesses, and scouting intelligence.\n'
          : '';

    const sportNote = game?.sport
      ? `\n### Sport Context\n- **Sport**: ${game.sport}${game.division ? ` (${game.division})` : ''}\n`
      : '';

    return `## Film Breakdown Taxonomy
${jerseyContext}${perspectiveNote}${sportNote}
### Review Each Clip With The Same Structure
- **Situation**: down, distance, phase, game context if known
- **Team & Player**: which team is this (identify by jersey), which player/role
- **Assignment**: what the athlete appears responsible for
- **Execution**: what was observable in technique, timing, leverage, burst, balance, finish
- **Result**: what happened on the play
- **Coaching Point**: one specific correction or reinforcement (reinforcement for our team, scouting note for opponent)
- **Confidence**: High, Medium, or Low when context is incomplete

### Tagging Vocabulary
Use clear tags such as:
- technique
- processing
- leverage
- burst
- physicality
- ball skills
- competitiveness
- discipline

### Rules
- Separate what is visible from what is inferred.
- Always identify the player's TEAM first (via jersey color) before analyzing their role.
- Do not overstate assignment certainty when the camera angle is incomplete.
- Focus on repeatable traits, not just highlight outcomes.
- Prefer one sharp coaching point over a long vague paragraph.
- When comparing teams, be explicit: "Our team showed [X], opponent showed [Y]".`;
  }
}
