/**
 * @fileoverview Generate Scout Report Tool — Structured athlete evaluation
 * @module @nxt1/backend/modules/agent/tools/analytics
 *
 * Reads an athlete's Firestore profile and combine/stat data to produce a
 * structured scout report grading Physical, Technical, Mental, and Potential
 * dimensions on a 1–100 scale.
 *
 * Designed for:
 * - **Athletes** — Self-assessment and college-readiness check.
 * - **Coaches / Directors** — Prospect evaluation and roster decisions.
 *
 * The tool gathers raw data; the LLM synthesizes the narrative evaluation.
 * This keeps the tool deterministic (pure data read) while leveraging the
 * agent's reasoning capabilities for the subjective scoring.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'Users';
const PLAYER_STATS_COLLECTION = 'PlayerStats';
const MAX_SEASONS_TO_FETCH = 5;

// ─── Tool ───────────────────────────────────────────────────────────────────

export class GenerateScoutReportTool extends BaseTool {
  readonly name = 'generate_scout_report';

  readonly description =
    'Reads an athlete profile, combine metrics, and season stats from the database ' +
    'to compile the raw data needed for a structured scout report.\n\n' +
    'Returns profile identity, physical measurables, verified stats, awards, ' +
    'and team history so you can generate a scout report with Physical / Technical / ' +
    'Mental / Potential scores (1–100).\n\n' +
    'Use this tool BEFORE writing a scout report so you have verified data to cite. ' +
    'After receiving the data, synthesize it into the standard scout report format.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID of the athlete to evaluate.\n' +
    '- sport (required): Sport key (e.g. "football", "basketball").\n' +
    '- evaluationFocus (optional): Specific area to emphasize — "physical", "technical", "mental", "overall".';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'Firebase UID of the athlete to evaluate.',
      },
      sport: {
        type: 'string',
        description: 'Sport key (e.g. "football", "basketball", "soccer").',
      },
      evaluationFocus: {
        type: 'string',
        enum: ['physical', 'technical', 'mental', 'overall'],
        description:
          'Optional focus area for deeper analysis. Defaults to "overall" for a complete report.',
      },
    },
    required: ['userId', 'sport'],
  } as const;

  override readonly allowedAgents = [
    'performance_coordinator',
    'recruiting_coordinator',
    'data_coordinator',
  ] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    // ── Input validation ──────────────────────────────────────────────────
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');

    const sport = this.str(input, 'sport');
    if (!sport) return this.paramError('sport');

    const evaluationFocus = this.str(input, 'evaluationFocus') ?? 'overall';

    logger.debug('[GenerateScoutReport] Gathering data', { userId, sport, evaluationFocus });

    try {
      // ── 1. Read athlete profile ───────────────────────────────────────
      const userDoc = await this.db.collection(USERS_COLLECTION).doc(userId).get();
      if (!userDoc.exists) {
        return { success: false, error: `Athlete with userId "${userId}" not found.` };
      }

      const profile = userDoc.data() as Record<string, unknown>;

      // ── 2. Extract sport-specific data ────────────────────────────────
      const sports = Array.isArray(profile['sports']) ? profile['sports'] : [];
      const sportEntry = sports.find(
        (s: Record<string, unknown>) =>
          typeof s['sport'] === 'string' && s['sport'].toLowerCase() === sport.toLowerCase()
      ) as Record<string, unknown> | undefined;

      // ── 3. Fetch season stats ─────────────────────────────────────────
      const statsSnapshot = await this.db
        .collection(PLAYER_STATS_COLLECTION)
        .where('userId', '==', userId)
        .where('sport', '==', sport.toLowerCase())
        .orderBy('season', 'desc')
        .limit(MAX_SEASONS_TO_FETCH)
        .get();

      const seasonStats = statsSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          season: data['season'] ?? '',
          category: data['category'] ?? '',
          stats: data['stats'] ?? [],
          gameLogs: data['gameLogs'] ?? [],
        };
      });

      // ── 4. Build structured report data ───────────────────────────────
      const identity = {
        firstName: profile['firstName'] ?? null,
        lastName: profile['lastName'] ?? null,
        displayName: profile['displayName'] ?? null,
        height: profile['height'] ?? null,
        weight: profile['weight'] ?? null,
        classOf: profile['classOf'] ?? null,
        location: profile['location'] ?? null,
        school: profile['school'] ?? null,
      };

      const academics = profile['academics'] ?? null;

      const sportData = sportEntry
        ? {
            positions: sportEntry['positions'] ?? [],
            jerseyNumber: sportEntry['jerseyNumber'] ?? null,
            side: sportEntry['side'] ?? null,
            metrics: sportEntry['metrics'] ?? [],
            team: sportEntry['team'] ?? null,
            clubTeam: sportEntry['clubTeam'] ?? null,
          }
        : null;

      const awards = Array.isArray(profile['awards']) ? profile['awards'] : [];
      const teamHistory = Array.isArray(profile['teamHistory']) ? profile['teamHistory'] : [];
      const connectedSources = Array.isArray(profile['connectedSources'])
        ? profile['connectedSources']
        : [];

      return {
        success: true,
        data: {
          userId,
          sport,
          evaluationFocus,
          identity,
          academics,
          sportData,
          seasonStats,
          awards,
          teamHistory,
          // connectedSources uses fallback keys: older docs use 'source'/'profileUrl',
          // newer docs use 'platform'/'url' after the migration in write-core-identity.
          connectedSources: connectedSources.map((s: Record<string, unknown>) => ({
            platform: s['platform'] ?? s['source'] ?? 'unknown',
            url: s['url'] ?? s['profileUrl'] ?? null,
          })),
          seasonCount: seasonStats.length,
          message:
            `Gathered scout report data for ${identity.firstName ?? 'athlete'} ` +
            `${identity.lastName ?? ''} (${sport}). ` +
            `Found ${seasonStats.length} season(s), ${awards.length} award(s), ` +
            `and ${connectedSources.length} connected source(s). ` +
            'Synthesize this into a structured scout report with Physical / Technical / Mental / Potential scores.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to gather scout report data';
      logger.error('[GenerateScoutReport] Error', { userId, sport, error: message });
      return { success: false, error: message };
    }
  }
}
