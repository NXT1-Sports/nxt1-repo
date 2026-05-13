/**
 * @fileoverview List Game Plans Tool
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Read-only access to team game plans stored in Firestore `TeamGamePlans`.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { TeamGamePlanDoc, TeamGamePlanPhase, TeamGamePlanStatus } from '@nxt1/core';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAM_GAMEPLANS_COLLECTION = 'TeamGamePlans';
const TEAMS_COLLECTION = 'Teams';

const ListGameplansInputSchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  phase: z.enum(['pregame', 'in-game', 'postgame', 'scouting']).optional(),
  opponentName: z.string().trim().min(1).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toSummary(doc: TeamGamePlanDoc): Record<string, unknown> {
  return {
    id: doc.id,
    teamId: doc.teamId,
    sport: doc.sport,
    title: doc.title,
    phase: doc.phase,
    status: doc.status,
    season: doc.season,
    division: doc.division,
    gameDate: doc.gameDate,
    opponentId: doc.opponentId,
    opponentName: doc.opponentName,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
    updatedBy: doc.updatedBy,
    createdBy: doc.createdBy,
    linkedPlayCount: doc.linkedPlays?.length ?? 0,
    adjustmentTriggerCount: doc.adjustmentTriggers?.length ?? 0,
    halftimePriorityCount: doc.halftimePriorities?.length ?? 0,
    customSectionCount: doc.customSections?.length ?? 0,
  };
}

export class ListGameplansTool extends BaseTool {
  readonly name = 'list_gameplans';
  readonly description =
    'List saved game plans for a team or for the current user. Supports filtering by sport, phase, status, and opponent.';

  readonly parameters = ListGameplansInputSchema;
  override readonly allowedAgents = ['strategy_coordinator'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'team_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ListGameplansInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const payload = parsed.data;
    const limit = payload.limit ?? 25;
    const includeArchived = payload.includeArchived === true;
    const normalizedSport = normalizeText(payload.sport)?.toLowerCase();
    const normalizedOpponent = normalizeText(payload.opponentName)?.toLowerCase();

    try {
      let candidates: TeamGamePlanDoc[] = [];

      if (payload.teamId) {
        const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(payload.teamId).get();
        if (!teamDoc.exists) {
          return { success: false, error: `Team ${payload.teamId} not found.` };
        }

        const authorized = await canManageTeamMutationForUser(
          this.db,
          context.userId,
          payload.teamId,
          teamDoc.data() ?? {}
        );

        if (!authorized) {
          return { success: false, error: 'Not authorized to view game plans for this team.' };
        }

        const snap = await this.db
          .collection(TEAM_GAMEPLANS_COLLECTION)
          .where('teamId', '==', payload.teamId)
          .limit(Math.max(limit * 4, 80))
          .get();

        candidates = snap.docs.map((doc) => doc.data() as TeamGamePlanDoc);
      } else {
        const [updatedBySnap, createdBySnap] = await Promise.all([
          this.db
            .collection(TEAM_GAMEPLANS_COLLECTION)
            .where('updatedBy', '==', context.userId)
            .limit(Math.max(limit * 3, 60))
            .get(),
          this.db
            .collection(TEAM_GAMEPLANS_COLLECTION)
            .where('createdBy', '==', context.userId)
            .limit(Math.max(limit * 3, 60))
            .get(),
        ]);

        const byId = new Map<string, TeamGamePlanDoc>();
        for (const doc of [...updatedBySnap.docs, ...createdBySnap.docs]) {
          const value = doc.data() as TeamGamePlanDoc;
          byId.set(value.id, value);
        }
        candidates = [...byId.values()];
      }

      const filtered = candidates
        .filter((item) => (includeArchived ? true : item.status !== 'archived'))
        .filter((item) =>
          payload.status ? item.status === (payload.status as TeamGamePlanStatus) : true
        )
        .filter((item) =>
          payload.phase ? item.phase === (payload.phase as TeamGamePlanPhase) : true
        )
        .filter((item) => (normalizedSport ? item.sport.toLowerCase() === normalizedSport : true))
        .filter((item) => {
          if (!normalizedOpponent) return true;
          const opponent = (item.opponentName ?? '').toLowerCase();
          return opponent.includes(normalizedOpponent);
        })
        .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
        .slice(0, limit);

      return {
        success: true,
        markdown:
          filtered.length === 0
            ? 'No game plans matched your filters.'
            : `Found **${filtered.length}** game plan(s).`,
        data: {
          gamePlans: filtered.map(toSummary),
          count: filtered.length,
          filtersApplied: {
            teamId: payload.teamId,
            sport: normalizedSport,
            status: payload.status,
            phase: payload.phase,
            opponentName: normalizedOpponent,
            includeArchived,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list game plans',
      };
    }
  }
}
