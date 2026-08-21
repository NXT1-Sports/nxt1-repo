/**
 * @fileoverview Team Event Model
 * @module @nxt1/core/models
 *
 * Firestore collection: `TeamEvents`
 *
 * Canonical type definitions for team schedule events.
 * Each document represents one game, scrimmage, practice, or other team event.
 * Used by the seed script, backend mapper, and frontend schedule board.
 *
 * 100% portable — no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// UNION TYPES
// ============================================

/**
 * Type of team event.
 *
 * - `game`      — Official competitive game (league/tournament)
 * - `scrimmage` — Friendly/practice game against another team
 * - `practice`  — Internal team practice session
 * - `camp`      — Multi-day training camp
 * - `combine`   — Recruiting combine/evaluation event
 * - `showcase`  — Showcase tournament (primarily for recruiting exposure)
 * - `other`     — Any other event type
 */
export type TeamEventType =
  | 'game'
  | 'scrimmage'
  | 'practice'
  | 'camp'
  | 'combine'
  | 'showcase'
  | 'other';

/**
 * Current status of a team event.
 *
 * - `upcoming`   — Scheduled, not yet started
 * - `live`       — Currently in progress
 * - `final`      — Completed (result may be available)
 * - `postponed`  — Delayed, new date TBD
 * - `cancelled`  — Cancelled entirely
 */
export type TeamEventStatus = 'upcoming' | 'live' | 'final' | 'postponed' | 'cancelled';

/**
 * Outcome of a completed game/scrimmage.
 */
export type TeamEventOutcome = 'win' | 'loss' | 'tie';

// ============================================
// SUB-TYPES
// ============================================

/**
 * Final score and outcome for a completed event.
 * Only present when `status === 'final'`.
 */
export interface TeamEventResult {
  /** Our team's final score */
  readonly teamScore: number;
  /** Opponent's final score */
  readonly opponentScore: number;
  /** Win / loss / tie from our team's perspective */
  readonly outcome: TeamEventOutcome;
  /** Whether the game went to overtime */
  readonly overtime: boolean;
}

// ============================================
// MAIN MODEL
// ============================================

/**
 * Firestore document model for a team event (`TeamEvents/{docId}`).
 *
 * Written by: seed script, team admin actions
 * Read by:    backend mapper → `TeamProfileScheduleEvent`
 *
 * @example Seed data shape:
 * ```json
 * {
 *   "teamId": "seed_team_231645",
 *   "type": "game",
 *   "opponent": "Hà Nội Eagles",
 *   "opponentLogoUrl": "https://...",
 *   "date": "2026-01-04T11:00:00.000Z",
 *   "time": "18:00",
 *   "location": "Nhà thi đấu Quận Đống Đa",
 *   "isHome": true,
 *   "status": "final",
 *   "result": {
 *     "teamScore": 87,
 *     "opponentScore": 72,
 *     "outcome": "win",
 *     "overtime": false
 *   }
 * }
 * ```
 */
export interface TeamEventDoc {
  /** Reference to the parent team (TeamCodes document ID) */
  readonly teamId: string;

  /** Category of the event */
  readonly type: TeamEventType;

  /**
   * Optional display name for the event.
   * Used for non-game events (e.g. "Summer Training Camp 2026").
   * For games, the matchup is derived from `opponent` + `isHome`.
   */
  readonly name?: string;

  /** Opponent team display name (games/scrimmages only) */
  readonly opponent?: string;

  /** Opponent team logo URL */
  readonly opponentLogoUrl?: string;

  /**
   * Event date as ISO 8601 string (e.g. "2026-03-12T11:00:00.000Z").
   * Always stored in UTC; displayed in local time on the frontend.
   */
  readonly date: string;

  /**
   * Local display time string (e.g. "18:00", "7:00 PM").
   * Optional — used for display only, not for sorting.
   */
  readonly time?: string;

  /** Venue name or address */
  readonly location?: string;

  /** Whether this team is the home team */
  readonly isHome: boolean;

  /** Current event status */
  readonly status: TeamEventStatus;

  /**
   * Final result — only present when `status === 'final'`.
   * Omitted for upcoming/live/postponed/cancelled events.
   */
  readonly result?: TeamEventResult;
}

/**
 * Runtime representation of a TeamEvent — includes the Firestore document ID.
 * Use `TeamEventDoc` for write operations, `TeamEvent` for read/display.
 */
export interface TeamEvent extends TeamEventDoc {
  /** Firestore document ID (auto-generated) */
  readonly id: string;
}
