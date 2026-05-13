/**
 * @fileoverview Game Analysis Parameters — Context for Team & Game Analysis Skills
 * @module @nxt1/core/ai
 * @version 1.0.0
 *
 * When coaches analyze film or design game plans, they need to know:
 *  - Which team is their own (offense/home team)
 *  - Which team is the opponent (defense/away team)
 *  - Team colors and jersey identification
 *  - Formation context (which side is our formation)
 *
 * These parameters are extracted from AgentSessionContext + user intent
 * and passed to skills so they can generate context-aware analysis.
 */

/**
 * Team identity and role context for game/film analysis.
 * Used by skills to differentiate "our team" vs "opponent" perspective.
 */
export interface GameAnalysisTeamContext {
  /** The program's own team identifier (role perspective: offense/home/subject). */
  readonly ownTeamId?: string;

  /** The program's own team name. */
  readonly ownTeamName?: string;

  /** Color/jersey of the program's own team (e.g., "white", "blue", "black"). */
  readonly ownTeamColor?: string;

  /** The opposing team identifier. */
  readonly opponentTeamId?: string;

  /** The opposing team name. */
  readonly opponentTeamName?: string;

  /** Color/jersey of the opponent (e.g., "black", "gold", "crimson"). */
  readonly opponentTeamColor?: string;

  /**
   * Formation side perspective:
   * - "own": formations/plays are from the program's perspective
   * - "opponent": formations/plays are from opponent's perspective (for scouting)
   * - "neutral": no specific perspective (default)
   */
  readonly perspectiveTeam?: 'own' | 'opponent' | 'neutral';
}

/**
 * Game or film context for analysis.
 * Captures situational metadata so skills can be contextually aware.
 */
export interface GameAnalysisGameContext {
  /** Game/match identifier. */
  readonly gameId?: string;

  /** Sport context (e.g., "football", "basketball", "baseball"). */
  readonly sport?: string;

  /** Division/level (e.g., "high school", "college", "nfl"). */
  readonly division?: string;

  /** Date of the game/film (ISO 8601). */
  readonly gameDate?: string;

  /** Week or round number. */
  readonly week?: number;

  /**
   * Game state/phase:
   * - "pregame": planning phase
   * - "in-game": live analysis during game
   * - "postgame": review/film analysis after game
   * - "scouting": opponent scouting/preparation
   */
  readonly phase?: 'pregame' | 'in-game' | 'postgame' | 'scouting';

  /** Current score (e.g., "24-17", only if in-game or postgame). */
  readonly score?: string;

  /** Clock/time remaining (e.g., "2:34 Q3", only if in-game). */
  readonly timeRemaining?: string;
}

/**
 * Complete game analysis context passed to skills.
 * Skills receive this as optional params in getPromptContext(params).
 *
 * @example
 * ```ts
 * const params: GameAnalysisParams = {
 *   team: {
 *     ownTeamName: 'Alabama',
 *     ownTeamColor: 'crimson',
 *     opponentTeamName: 'Texas',
 *     opponentTeamColor: 'burnt orange',
 *     perspectiveTeam: 'own'
 *   },
 *   game: {
 *     sport: 'football',
 *     division: 'college',
 *     gameDate: '2026-09-05',
 *     phase: 'postgame'
 *   }
 * };
 *
 * const context = skill.getPromptContext(params);
 * // Skill now knows to analyze from Alabama's perspective with team color context
 * ```
 */
export interface GameAnalysisParams extends Record<string, unknown> {
  /** Team identity and role context. */
  readonly team?: GameAnalysisTeamContext;

  /** Game or film context. */
  readonly game?: GameAnalysisGameContext;
}

/**
 * Type guard to check if params contains game analysis context.
 * @param params Optional params object from skill invocation.
 * @returns true if params is GameAnalysisParams.
 */
export function isGameAnalysisParams(
  params?: Record<string, unknown>
): params is GameAnalysisParams {
  if (!params) return false;
  return 'team' in params || 'game' in params;
}

/**
 * Extract game analysis params from a params record.
 * Safe to call even if params doesn't contain game analysis context.
 * @param params Optional params object.
 * @returns GameAnalysisParams or undefined.
 */
export function extractGameAnalysisParams(
  params?: Record<string, unknown>
): GameAnalysisParams | undefined {
  if (!isGameAnalysisParams(params)) return undefined;
  return params;
}
