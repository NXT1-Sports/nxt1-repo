/**
 * @fileoverview Delete Season Stats Tool — Hard delete PlayerStats documents
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Permanently removes a `PlayerStats` document for a specific athlete,
 * sport, and season. This is a hard delete — the document is irrecoverably erased.
 *
 * Doc ID pattern: `{userId}_{sportId}_{season}`
 *
 * Auth: uses ProfileWriteAccessService — same access model as write_season_stats.
 * Cache: invalidates profile stats caches on success.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../../services/profile/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const PLAYER_STATS_COLLECTION = 'PlayerStats';

const DeleteSeasonStatsInputSchema = z.object({
  userId: z.string().trim().min(1),
  sportId: z.string().trim().min(1),
  season: z.string().trim().min(1),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class DeleteSeasonStatsTool extends BaseTool {
  readonly name = 'delete_season_stats';

  readonly description =
    'Permanently deletes a PlayerStats document for a specific athlete, sport, and season.\n\n' +
    'This is a hard delete — all stats and game logs for that season are irrecoverably removed.\n\n' +
    'Doc ID is derived from {userId}_{sportId}_{season}.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID of the athlete.\n' +
    '- sportId (required): Sport key (e.g. "football").\n' +
    '- season (required): Season label (e.g. "2024-2025").\n\n' +
    'Use update_season_stats to modify individual stat entries instead.';

  readonly parameters = DeleteSeasonStatsInputSchema;

  override readonly allowedAgents = ['data_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteSeasonStatsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { userId, sportId, season } = parsed.data;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      // ── Auth ─────────────────────────────────────────────────────────
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:delete_season_stats',
      });

      const userData = accessGrant.targetUserData;
      const normalizedSportId = sportId.trim().toLowerCase();

      if (
        !accessGrant.isSelfWrite &&
        !resolveAuthorizedTargetSportSelection(userData, normalizedSportId, accessGrant)
      ) {
        return { success: false, error: 'Not authorized to delete season stats for this sport.' };
      }

      const docId = `${userId}_${normalizedSportId}_${season.trim()}`;
      const docRef = this.db.collection(PLAYER_STATS_COLLECTION).doc(docId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return { success: false, error: `PlayerStats document ${docId} not found.` };
      }

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        phase: 'delete_season_stats',
      });

      await docRef.delete();

      // ── Cache invalidation ────────────────────────────────────────────
      const cache = getCacheService();
      await Promise.allSettled([
        cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
        invalidateProfileCaches(
          userId,
          typeof userData['unicode'] === 'string' ? userData['unicode'] : null
        ),
        cache.delByPrefix(`stats:${userId}:`),
        cache.delByPrefix(`player-stats:${userId}:`),
      ]);

      logger.info('[DeleteSeasonStatsTool] Document deleted', {
        docId,
        userId,
        sportId: normalizedSportId,
        season,
      });

      return {
        success: true,
        data: {
          docId,
          userId,
          sportId: normalizedSportId,
          season,
          deleted: true,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete season stats';
      logger.error('[DeleteSeasonStatsTool] Failed', { error: message, userId, sportId, season });
      return { success: false, error: message };
    }
  }
}
