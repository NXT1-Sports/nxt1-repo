/**
 * @fileoverview Delete Game Plan Tool
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Soft-delete (archive) game plans from Firestore `TeamGamePlans`.
 * Sets status to 'archived' and records deletion context.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { TeamGamePlanDoc } from '@nxt1/core';
import { logger } from '../../../../../utils/logger.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAM_GAMEPLANS_COLLECTION = 'TeamGamePlans';
const TEAMS_COLLECTION = 'Teams';

const DeleteGameplanInputSchema = z.object({
  gamePlanId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

export class DeleteGameplanTool extends BaseTool {
  readonly name = 'delete_gameplan';
  readonly description =
    'Archive a game plan (soft-delete). Sets status to "archived" and preserves history. ' +
    'The plan can be restored by changing status back to "active" or "draft".';

  readonly parameters = DeleteGameplanInputSchema;
  override readonly allowedAgents = ['strategy_coordinator'] as const;
  readonly isMutation = true;
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
    const parsed = DeleteGameplanInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { gamePlanId, reason } = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_GAMEPLANS_COLLECTION).doc(gamePlanId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return { success: false, error: `Game plan ${gamePlanId} not found.` };
      }

      const gamePlan = doc.data() as TeamGamePlanDoc;
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(gamePlan.teamId).get();

      if (!teamDoc.exists) {
        return { success: false, error: `Team ${gamePlan.teamId} not found.` };
      }

      const isAuthorized = await canManageTeamMutationForUser(
        this.db,
        context.userId,
        gamePlan.teamId,
        teamDoc.data() ?? {}
      );

      if (!isAuthorized) {
        return { success: false, error: 'Not authorized to delete game plans for this team.' };
      }

      context.emitStage?.('deleting_resource', {
        icon: 'delete',
        phase: 'delete_gameplan',
        gamePlanId,
        title: gamePlan.title,
      });

      const now = new Date().toISOString();

      // Soft-delete: update status to archived, preserve all data
      await docRef.update({
        status: 'archived',
        updatedBy: context.userId,
        updatedAt: now,
        ...(reason ? { archivedReason: reason.trim() } : {}),
        archivedAt: now,
        archivedBy: context.userId,
      });

      // Invalidate cache
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(`intel:team:${gamePlan.teamId}`),
          cache.del(`team:gameplans:${gamePlan.teamId}:${gamePlan.sport}`),
          cache.del(`team:profile:${gamePlan.teamId}`),
        ]);
      } catch {
        // Best effort only.
      }

      logger.info('[DeleteGameplanTool] Game plan archived', {
        gamePlanId,
        teamId: gamePlan.teamId,
        title: gamePlan.title,
        reason: reason || 'unspecified',
        archivedBy: context.userId,
      });

      const opponentLabel = gamePlan.opponentName ? ` vs. ${gamePlan.opponentName}` : '';

      return {
        success: true,
        markdown:
          `Archived game plan **${gamePlan.title}**${opponentLabel}. ` +
          `Status changed to archived. You can restore it later by updating the status.`,
        data: {
          gamePlan: {
            id: gamePlanId,
            title: gamePlan.title,
            sport: gamePlan.sport,
            phase: gamePlan.phase,
            opponentName: gamePlan.opponentName,
            gameDate: gamePlan.gameDate,
            status: 'archived',
          },
          message: `Archived game plan "${gamePlan.title}"${opponentLabel}.`,
        },
      };
    } catch (error) {
      logger.error('[DeleteGameplanTool] Failed to delete game plan', {
        gamePlanId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete game plan',
      };
    }
  }
}
