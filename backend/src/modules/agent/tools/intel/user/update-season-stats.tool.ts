/**
 * @fileoverview Update Season Stats Tool — Partial-patch PlayerStats documents
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Merges updated stat entries into an existing `PlayerStats` document.
 * Each supplied stat entry overwrites the matching `field` key entry in the
 * existing `stats` array — all other existing entries are preserved.
 *
 * Doc ID pattern: `{userId}_{sportId}_{season}` — identify the target doc
 * by providing these three identifiers.
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

const StatEntrySchema = z
  .object({
    field: z.string().trim().min(1),
    label: z.string().trim().min(1).optional(),
    value: z.union([z.string(), z.number()]).optional(),
    unit: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
  })
  .passthrough();

const UpdateSeasonStatsInputSchema = z.object({
  userId: z.string().trim().min(1),
  sportId: z.string().trim().min(1),
  season: z.string().trim().min(1),
  stats: z.array(StatEntrySchema).min(1).max(100),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class UpdateSeasonStatsTool extends BaseTool {
  readonly name = 'update_season_stats';

  readonly description =
    'Merges updated stat entries into an existing PlayerStats document.\n\n' +
    'Each supplied stat entry is matched by its `field` key and overwrites the\n' +
    'existing entry — all other stats in the document are preserved.\n\n' +
    'Doc ID is derived from {userId}_{sportId}_{season}.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID of the athlete.\n' +
    '- sportId (required): Sport key (e.g. "football").\n' +
    '- season (required): Season label (e.g. "2024-2025").\n' +
    '- stats (required): Array of stat entries to merge-update:\n' +
    '  • field (required): Machine key matching an existing stat (e.g. "passing_yards").\n' +
    '  • label (optional): Human-readable label override.\n' +
    '  • value (optional): New stat value.\n' +
    '  • unit (optional): Unit string override.\n' +
    '  • category (optional): Category override.\n\n' +
    'Use delete_season_stats to remove an entire season document.';

  readonly parameters = UpdateSeasonStatsInputSchema;

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
    const parsed = UpdateSeasonStatsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { userId, sportId, season, stats } = parsed.data;

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
        action: 'tool:update_season_stats',
      });

      const userData = accessGrant.targetUserData;
      const normalizedSportId = sportId.trim().toLowerCase();

      if (
        !accessGrant.isSelfWrite &&
        !resolveAuthorizedTargetSportSelection(userData, normalizedSportId, accessGrant)
      ) {
        return { success: false, error: 'Not authorized to update season stats for this sport.' };
      }

      const docId = `${userId}_${normalizedSportId}_${season.trim()}`;
      const docRef = this.db.collection(PLAYER_STATS_COLLECTION).doc(docId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return {
          success: false,
          error: `PlayerStats document ${docId} not found. Use write_season_stats to create it first.`,
        };
      }

      const existingData = docSnap.data() ?? {};
      const existingStats: Record<string, unknown>[] = Array.isArray(existingData['stats'])
        ? existingData['stats']
        : [];

      // Merge: new entries overwrite by field key
      const mergedMap = new Map<string, Record<string, unknown>>();
      for (const s of existingStats) {
        const key = String((s as Record<string, unknown>)['field'] ?? '');
        if (key) mergedMap.set(key, s as Record<string, unknown>);
      }

      let merged = 0;
      for (const entry of stats) {
        const existing = mergedMap.get(entry.field) ?? {};
        const updated: Record<string, unknown> = { ...existing, ...entry };
        mergedMap.set(entry.field, updated);
        merged++;
      }

      const mergedStats = Array.from(mergedMap.values());
      const now = new Date().toISOString();

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        phase: 'update_season_stats',
        mergedCount: merged,
      });

      await docRef.update({
        stats: mergedStats,
        updatedAt: now,
      });

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

      logger.info('[UpdateSeasonStatsTool] Stats merged', {
        docId,
        userId,
        merged,
        totalStats: mergedStats.length,
      });

      return {
        success: true,
        data: {
          docId,
          userId,
          sportId: normalizedSportId,
          season,
          mergedCount: merged,
          totalStats: mergedStats.length,
          updatedAt: now,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update season stats';
      logger.error('[UpdateSeasonStatsTool] Failed', {
        error: message,
        userId,
        sportId,
        season,
      });
      return { success: false, error: message };
    }
  }
}
