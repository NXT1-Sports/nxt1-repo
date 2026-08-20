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
          "\n\n**When analyzing clips**: Identify the player's team from canonical organization/team context first. Official Organization colors from the [User Profile] block are authoritative branding context; do not override them with a single-clip visual guess. Use own-team jersey color as the primary anchor only when it is explicitly canonical or user-confirmed. Use opponent color only when provided. If structured breakdown data says offense/defense, formation, or personnel, treat that as stronger evidence than weak visual inference." +
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

### HARD PROHIBITIONS — Never Hallucinate
- **If you cannot see it clearly, do NOT claim you saw it.** 
  - Blurry footage? Say "footage too blurry to assess [X]" — do NOT guess
  - Player out of frame? Say "player not visible in this angle" — do NOT infer
  - Helmet cam or obstructed view? Say "camera angle does not allow assessment of [assignment/technique]" — do NOT fill in gaps
  - Ambiguous result? Say "unclear if assignment was missed or if defender made play" — do NOT pick the narrative that sounds good

- **If the video quality prevents analysis, state it explicitly:**
  - "Cannot verify hand placement due to angle"
  - "Too much crowd noise to assess communication"
  - "Sideline footage does not show interior line blocking"
  - Then move to what IS visible, or flag it as insufficient for coaching feedback

- **Never build a coaching point on inference alone:**
  - Bad: "Clearly missed assignment" (when you only have one partial angle)
  - Good: "From this angle, assignment appears missed — confirm with all-22 angle"
  - Better: "This angle does not show full defensive front — need full-field view to assess assignment execution"

- **When in doubt, ask clarifying questions rather than assuming:**
  - "Is this a cover-2 or cover-3 look? Assignment changes based on pre-snap read"
  - "Can you confirm which player I should be tracking — jersey #8 or #12?"
  - "Is this an option play or a straight handoff? The execution evaluation depends on it"

- **Confidence levels are NOT optional — use them accurately:**
  - HIGH: Clear evidence, multiple angles confirm, no ambiguity
  - MEDIUM: Observable but some context missing, or one angle only
  - LOW: Significant gaps (bad angle, crowd, obscured view, or uncertainty about assignment itself)

- **Own-team identification priority order:**
  - 1. Canonical own-team context from organization/team profile
  - 2. Structured film-review metadata and selected-context fields
  - 3. Existing breakdown data such as offense/defense, formation, personnel, or tagged play details
  - 4. Visual jersey evidence from the clip
  - If those sources conflict, do not guess. Call out the conflict and lower confidence.

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
- Always identify the player's TEAM first using canonical own-team context, then breakdown metadata, then jersey color before analyzing role.
- Do not overstate assignment certainty when the camera angle is incomplete.
- Focus on repeatable traits, not just highlight outcomes.
- Prefer one sharp coaching point over a long vague paragraph.
- When comparing teams, be explicit: "Our team showed [X], opponent showed [Y]".`;
  }
}
