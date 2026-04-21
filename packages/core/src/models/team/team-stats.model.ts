/**
 * @fileoverview Team Stats — Firestore `TeamStats` collection document type
 *
 * Stores sport-agnostic team season statistics.
 * Document ID pattern: `{teamId}_{sportId}_{season}` — one doc per team/sport/season.
 *
 * Stats use a self-describing flat entry shape (same pattern as PlayerStats):
 *   field = '{category}_{key}'  e.g. 'offense_ppg', 'record_wins', 'defense_opp_fg_pct'
 *
 * The UI renders label + value directly — no sport-specific field names required.
 */

export type TeamStatTrend = 'up' | 'down' | 'neutral';

export interface TeamStatEntry {
  /** Machine key — '{category}_{statsKey}' e.g. 'offense_ppg', 'record_wins' */
  readonly field: string;

  /** Human-readable label e.g. "Points Per Game" */
  readonly label: string;

  /** Stat value — number or formatted string (e.g. "11-1", "48.3%") */
  readonly value: number | string;

  /** Unit string e.g. "avg", "%", "pts" */
  readonly unit?: string;

  /** Grouping category e.g. 'offense', 'defense', 'record', 'special_teams' */
  readonly category: string;

  /** Direction of change relative to prior period */
  readonly trend?: TeamStatTrend;

  /** Numeric change value to show with the trend arrow */
  readonly trendValue?: number;
}

export interface TeamStatDoc {
  readonly id: string;

  readonly teamId: string;

  /** Sport key (lowercase, e.g. 'football', 'basketball') */
  readonly sportId: string;

  /** Season label e.g. '2024-2025' */
  readonly season: string;

  /** Sport-agnostic stat entries */
  readonly stats: TeamStatEntry[];

  // ── Provenance ─────────────────────────────────────────────────────────
  readonly source: string;
  readonly verified: boolean;
  readonly provider: string;
  readonly extractedAt: string;
  readonly sourceUrl?: string;

  // ── Timestamps ─────────────────────────────────────────────────────────
  readonly createdAt: string;
  readonly updatedAt: string;
}
