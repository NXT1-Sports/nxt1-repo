/**
 * @fileoverview Compare Athletes Tool — Side-by-side prospect comparison
 * @module @nxt1/backend/modules/agent/tools/analytics
 *
 * Reads two athlete profiles from Firestore and returns a structured
 * comparison payload covering identity, measurables, stats, academics,
 * and awards. The LLM then uses this data to produce a narrative
 * comparison with recommendations.
 *
 * Designed for:
 * - **Coaches / Directors** — Evaluating which prospect is the better fit.
 * - **Athletes** — Understanding how they compare to peers/competitors.
 * - **Recruiters** — Building shortlists and prospect boards.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'Users';
const PLAYER_STATS_COLLECTION = 'PlayerStats';
const MAX_RECENT_SEASONS = 3;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface AthleteSnapshot {
  readonly userId: string;
  readonly identity: Record<string, unknown>;
  readonly academics: unknown;
  readonly sportData: Record<string, unknown> | null;
  readonly recentStats: readonly Record<string, unknown>[];
  readonly awards: readonly unknown[];
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class CompareAthletesTool extends BaseTool {
  readonly name = 'compare_athletes';

  readonly description =
    'Reads two athlete profiles from the database and returns a structured ' +
    'side-by-side comparison of identity, measurables, sport data, stats, ' +
    'academics, and awards.\n\n' +
    'Use this when a coach or athlete wants to compare two prospects head-to-head. ' +
    'After receiving the comparison data, synthesize it into a formatted table ' +
    'with analysis and a recommendation.\n\n' +
    'Parameters:\n' +
    '- athleteAId (required): Firebase UID of the first athlete.\n' +
    '- athleteBId (required): Firebase UID of the second athlete.\n' +
    '- sport (required): Sport key to compare within (e.g. "football").\n' +
    '- focusAreas (optional): Comma-separated areas to emphasize — "measurables", "stats", "academics", "awards".';

  readonly parameters = {
    type: 'object',
    properties: {
      athleteAId: {
        type: 'string',
        description: 'Firebase UID of the first athlete.',
      },
      athleteBId: {
        type: 'string',
        description: 'Firebase UID of the second athlete.',
      },
      sport: {
        type: 'string',
        description: 'Sport key to compare within (e.g. "football", "basketball").',
      },
      focusAreas: {
        type: 'string',
        description:
          'Comma-separated list of areas to emphasize: "measurables", "stats", "academics", "awards". ' +
          'Defaults to all areas.',
      },
    },
    required: ['athleteAId', 'athleteBId', 'sport'],
  } as const;

  override readonly allowedAgents = ['performance_coordinator', 'recruiting_coordinator'] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    // ── Input validation ──────────────────────────────────────────────────
    const athleteAId = this.str(input, 'athleteAId');
    if (!athleteAId) return this.paramError('athleteAId');

    const athleteBId = this.str(input, 'athleteBId');
    if (!athleteBId) return this.paramError('athleteBId');

    if (athleteAId === athleteBId) {
      return { success: false, error: 'athleteAId and athleteBId must be different.' };
    }

    const sport = this.str(input, 'sport');
    if (!sport) return this.paramError('sport');

    const focusAreas = this.str(input, 'focusAreas')
      ?.split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean) ?? ['measurables', 'stats', 'academics', 'awards'];

    logger.debug('[CompareAthletes] Comparing', { athleteAId, athleteBId, sport, focusAreas });

    try {
      // ── Read both profiles in parallel ────────────────────────────────
      const [athleteA, athleteB] = await Promise.all([
        this.readAthlete(athleteAId, sport),
        this.readAthlete(athleteBId, sport),
      ]);

      if (!athleteA) {
        return { success: false, error: `Athlete A ("${athleteAId}") not found.` };
      }
      if (!athleteB) {
        return { success: false, error: `Athlete B ("${athleteBId}") not found.` };
      }

      return {
        success: true,
        data: {
          sport,
          focusAreas,
          athleteA,
          athleteB,
          message:
            `Comparison data loaded for ${this.displayName(athleteA)} vs ${this.displayName(athleteB)} (${sport}). ` +
            'Build a side-by-side comparison table with analysis and recommendation.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to compare athletes';
      logger.error('[CompareAthletes] Error', { athleteAId, athleteBId, sport, error: message });
      return { success: false, error: message };
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private async readAthlete(userId: string, sport: string): Promise<AthleteSnapshot | null> {
    const userDoc = await this.db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) return null;

    const profile = userDoc.data() as Record<string, unknown>;

    // Sport-specific entry
    const sports = Array.isArray(profile['sports']) ? profile['sports'] : [];
    const sportEntry = sports.find(
      (s: Record<string, unknown>) =>
        typeof s['sport'] === 'string' && s['sport'].toLowerCase() === sport.toLowerCase()
    ) as Record<string, unknown> | undefined;

    // Recent season stats
    const statsSnap = await this.db
      .collection(PLAYER_STATS_COLLECTION)
      .where('userId', '==', userId)
      .where('sport', '==', sport.toLowerCase())
      .orderBy('season', 'desc')
      .limit(MAX_RECENT_SEASONS)
      .get();

    const recentStats = statsSnap.docs.map((doc) => {
      const d = doc.data();
      return { season: d['season'] ?? '', stats: d['stats'] ?? [], category: d['category'] ?? '' };
    });

    return {
      userId,
      identity: {
        firstName: profile['firstName'] ?? null,
        lastName: profile['lastName'] ?? null,
        displayName: profile['displayName'] ?? null,
        height: profile['height'] ?? null,
        weight: profile['weight'] ?? null,
        classOf: profile['classOf'] ?? null,
        location: profile['location'] ?? null,
        school: profile['school'] ?? null,
      },
      academics: profile['academics'] ?? null,
      sportData: sportEntry
        ? {
            positions: sportEntry['positions'] ?? [],
            jerseyNumber: sportEntry['jerseyNumber'] ?? null,
            side: sportEntry['side'] ?? null,
            metrics: sportEntry['metrics'] ?? [],
            team: sportEntry['team'] ?? null,
          }
        : null,
      recentStats,
      awards: Array.isArray(profile['awards']) ? profile['awards'] : [],
    };
  }

  private displayName(athlete: AthleteSnapshot): string {
    const identity = athlete.identity;
    const first = identity['firstName'] as string | null;
    const last = identity['lastName'] as string | null;
    if (first && last) return `${first} ${last}`;
    return (identity['displayName'] as string) ?? athlete.userId;
  }
}
