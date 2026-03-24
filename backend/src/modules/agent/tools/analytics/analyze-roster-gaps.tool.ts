/**
 * @fileoverview Analyze Roster Gaps Tool — Team depth chart analysis
 * @module @nxt1/backend/modules/agent/tools/analytics
 *
 * Reads a team's roster from Firestore and returns a structured breakdown
 * of positional coverage, class-year distribution, and identified gaps.
 * The LLM uses this data to produce actionable recruiting recommendations.
 *
 * Designed for:
 * - **Coaches / Directors** — Identifying where to focus recruiting efforts.
 * - **Recruiters** — Understanding program needs before outreach.
 *
 * Data flow:
 * 1. Look up the team document to get roster member UIDs.
 * 2. Batch-read member profiles.
 * 3. Aggregate by position, class year, and measurables.
 * 4. Return the structured summary for LLM analysis.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const TEAMS_COLLECTION = 'Teams';
const USERS_COLLECTION = 'Users';
const MAX_ROSTER_SIZE = 200;

// ─── Types ──────────────────────────────────────────────────────────────────

interface PositionGroup {
  readonly position: string;
  readonly count: number;
  readonly athletes: readonly {
    readonly userId: string;
    readonly name: string;
    readonly classOf: number | null;
    readonly height: string | null;
    readonly weight: string | null;
  }[];
}

interface ClassYearBreakdown {
  readonly classOf: number;
  readonly count: number;
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class AnalyzeRosterGapsTool extends BaseTool {
  readonly name = 'analyze_roster_gaps';

  readonly description =
    'Reads a team roster and produces a structured breakdown of positional depth, ' +
    'class-year distribution, and roster composition.\n\n' +
    'Use this when a coach or director asks about roster needs, depth chart gaps, ' +
    'or where to focus recruiting efforts. After receiving the data, synthesize it ' +
    'into actionable recommendations prioritized by urgency.\n\n' +
    'Parameters:\n' +
    '- teamId (required): Firestore document ID of the team.\n' +
    '- sport (required): Sport key (e.g. "football", "basketball").\n' +
    '- graduatingYear (optional): Class year to consider as graduating/leaving. Defaults to current year.';

  readonly parameters = {
    type: 'object',
    properties: {
      teamId: {
        type: 'string',
        description: 'Firestore document ID of the team to analyze.',
      },
      sport: {
        type: 'string',
        description: 'Sport key (e.g. "football", "basketball").',
      },
      graduatingYear: {
        type: 'number',
        description:
          'Class year to treat as graduating (players leaving the roster). ' +
          'Defaults to the current calendar year.',
      },
    },
    required: ['teamId', 'sport'],
  } as const;

  override readonly allowedAgents = ['recruiting_coordinator', 'performance_coordinator'] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    // ── Input validation ──────────────────────────────────────────────────
    const teamId = this.str(input, 'teamId');
    if (!teamId) return this.paramError('teamId');

    const sport = this.str(input, 'sport');
    if (!sport) return this.paramError('sport');

    const graduatingYear = this.num(input, 'graduatingYear') ?? new Date().getFullYear();

    logger.debug('[AnalyzeRosterGaps] Analyzing', { teamId, sport, graduatingYear });

    try {
      // ── 1. Read team document ──────────────────────────────────────────
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        return { success: false, error: `Team "${teamId}" not found.` };
      }

      const teamData = teamDoc.data() as Record<string, unknown>;
      const teamName = (teamData['name'] as string) ?? teamId;

      // Roster may be stored as an array of member objects or UIDs
      const rosterRaw = Array.isArray(teamData['roster'])
        ? teamData['roster']
        : Array.isArray(teamData['members'])
          ? teamData['members']
          : [];

      const memberUids: string[] = rosterRaw
        .slice(0, MAX_ROSTER_SIZE)
        .map((entry: unknown) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object' && 'userId' in entry) {
            return (entry as Record<string, unknown>)['userId'] as string;
          }
          if (entry && typeof entry === 'object' && 'uid' in entry) {
            return (entry as Record<string, unknown>)['uid'] as string;
          }
          return null;
        })
        .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0);

      if (memberUids.length === 0) {
        return {
          success: true,
          data: {
            teamId,
            teamName,
            sport,
            totalAthletes: 0,
            positionGroups: [],
            classYearBreakdown: [],
            graduatingCount: 0,
            message: `Team "${teamName}" has no roster members. Add athletes to analyze gaps.`,
          },
        };
      }

      // ── 2. Batch-read member profiles ──────────────────────────────────
      // Firestore getAll supports up to 500 refs per call
      const refs = memberUids.map((uid) => this.db.collection(USERS_COLLECTION).doc(uid));
      const memberDocs = await this.db.getAll(...refs);

      // ── 3. Aggregate by position and class year ────────────────────────
      const positionMap = new Map<string, PositionGroup['athletes'][number][]>();
      const classYearMap = new Map<number, number>();
      let graduatingCount = 0;

      for (const doc of memberDocs) {
        if (!doc.exists) continue;
        const data = doc.data() as Record<string, unknown>;

        const classOf = typeof data['classOf'] === 'number' ? data['classOf'] : null;

        const firstName = (data['firstName'] as string) ?? '';
        const lastName = (data['lastName'] as string) ?? '';
        const name =
          `${firstName} ${lastName}`.trim() || ((data['displayName'] as string) ?? doc.id);

        // Find sport-specific positions
        const sportsArr = Array.isArray(data['sports']) ? data['sports'] : [];
        const sportEntry = sportsArr.find(
          (s: Record<string, unknown>) =>
            typeof s['sport'] === 'string' && s['sport'].toLowerCase() === sport.toLowerCase()
        ) as Record<string, unknown> | undefined;

        const positions: string[] = Array.isArray(sportEntry?.['positions'])
          ? (sportEntry['positions'] as string[])
          : ['Unspecified'];

        const athleteInfo = {
          userId: doc.id,
          name,
          classOf,
          height: (data['height'] as string) ?? null,
          weight: (data['weight'] as string) ?? null,
        };

        // Count graduating athletes
        if (classOf !== null && classOf <= graduatingYear) {
          graduatingCount++;
        }

        // Class year distribution
        if (classOf !== null) {
          classYearMap.set(classOf, (classYearMap.get(classOf) ?? 0) + 1);
        }

        // Position groups
        for (const pos of positions) {
          const normalized = pos.trim() || 'Unspecified';
          if (!positionMap.has(normalized)) {
            positionMap.set(normalized, []);
          }
          positionMap.get(normalized)!.push(athleteInfo);
        }
      }

      // ── 4. Build structured output ─────────────────────────────────────
      const positionGroups: PositionGroup[] = Array.from(positionMap.entries())
        .map(([position, athletes]) => ({ position, count: athletes.length, athletes }))
        .sort((a, b) => a.position.localeCompare(b.position));

      const classYearBreakdown: ClassYearBreakdown[] = Array.from(classYearMap.entries())
        .map(([classOf, count]) => ({ classOf, count }))
        .sort((a, b) => a.classOf - b.classOf);

      return {
        success: true,
        data: {
          teamId,
          teamName,
          sport,
          totalAthletes: memberUids.length,
          positionGroups,
          classYearBreakdown,
          graduatingYear,
          graduatingCount,
          message:
            `Roster analysis for ${teamName} (${sport}): ${memberUids.length} athletes across ` +
            `${positionGroups.length} position group(s). ${graduatingCount} athlete(s) graduating ` +
            `in ${graduatingYear}. Identify thin position groups and recommend recruiting priorities.`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze roster';
      logger.error('[AnalyzeRosterGaps] Error', { teamId, sport, error: message });
      return { success: false, error: message };
    }
  }
}
