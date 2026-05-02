/**
 * @fileoverview Update Awards Tool — Partial-patch individual award records
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Applies a partial update to an individual award document in the Awards collection.
 * Only supplied fields are written; omitted fields remain unchanged.
 *
 * Auth: uses ProfileWriteAccessService — same access model as write_awards.
 * Cache: invalidates profile caches on success.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { createProfileWriteAccessService } from '../../../../../services/profile/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const AWARDS_COLLECTION = 'Awards';

const UpdateAwardsInputSchema = z.object({
  docId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  season: z.string().trim().min(1).optional(),
  year: z.string().trim().min(1).optional(),
  issuer: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class UpdateAwardsTool extends BaseTool {
  readonly name = 'update_awards';

  readonly description =
    'Partial-updates an individual award record. ' +
    'Only supplied fields are written; omitted fields remain unchanged.';

  readonly parameters = UpdateAwardsInputSchema;

  override readonly allowedAgents = ['data_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly entityGroup = 'user_tools' as const;
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  // ─── Execute ────────────────────────────────────────────────────────────

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateAwardsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, userId } = parsed.data;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    let userData: Record<string, unknown>;
    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:update_awards',
      });
      userData = accessGrant.targetUserData;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Not authorized to update awards.',
      };
    }

    context?.emitStage?.('submitting_job', {
      icon: 'database',
      phase: 'update_awards',
    });

    const docRef = this.db.collection(AWARDS_COLLECTION).doc(docId);
    const patch: Record<string, unknown> = {};

    // Build patch from supplied fields
    if (parsed.data.title !== undefined) patch['title'] = parsed.data.title;
    if (parsed.data.category !== undefined) patch['category'] = parsed.data.category;
    if (parsed.data.season !== undefined) patch['season'] = parsed.data.season;
    if (parsed.data.year !== undefined) patch['year'] = parsed.data.year;
    if (parsed.data.issuer !== undefined) patch['issuer'] = parsed.data.issuer;
    if (parsed.data.description !== undefined) patch['description'] = parsed.data.description;
    if (parsed.data.sport !== undefined) patch['sport'] = parsed.data.sport;

    if (Object.keys(patch).length === 0) {
      return {
        success: true,
        data: { docId, userId, message: 'No fields to update' },
      };
    }

    patch['updatedAt'] = new Date();

    try {
      await docRef.update(patch);

      // ── Cache invalidation ────────────────────────────────────────────
      const cache = getCacheService();
      await Promise.allSettled([
        cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
        invalidateProfileCaches(
          userId,
          typeof userData['unicode'] === 'string' ? userData['unicode'] : null
        ),
      ]);

      const patchedFields = Object.keys(patch).filter((k) => k !== 'updatedAt');
      logger.info('[UpdateAwardsTool] Award updated', { docId, userId, patchedFields });

      return {
        success: true,
        data: { docId, userId, patchedFields },
      };
    } catch (error) {
      logger.error('[UpdateAwardsTool] Failed to update award', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        userId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update award.',
      };
    }
  }
}
