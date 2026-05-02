/**
 * @fileoverview Delete Awards Tool — Hard delete individual award records
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Hard deletes an individual award document from the Awards collection.
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

const DeleteAwardsInputSchema = z.object({
  docId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class DeleteAwardsTool extends BaseTool {
  readonly name = 'delete_awards';

  readonly description = 'Hard deletes an individual award record from the Awards collection.';

  readonly parameters = DeleteAwardsInputSchema;

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
    const parsed = DeleteAwardsInputSchema.safeParse(input);
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
        action: 'tool:delete_awards',
      });
      userData = accessGrant.targetUserData;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Not authorized to delete awards.',
      };
    }

    context?.emitStage?.('submitting_job', {
      icon: 'database',
      phase: 'delete_awards',
    });

    const docRef = this.db.collection(AWARDS_COLLECTION).doc(docId);

    try {
      await docRef.delete();

      // ── Cache invalidation ────────────────────────────────────────────
      const cache = getCacheService();
      await Promise.allSettled([
        cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
        invalidateProfileCaches(
          userId,
          typeof userData['unicode'] === 'string' ? userData['unicode'] : null
        ),
      ]);

      logger.info('[DeleteAwardsTool] Award deleted', { docId, userId });

      return {
        success: true,
        data: { docId, userId, deleted: true },
      };
    } catch (error) {
      logger.error('[DeleteAwardsTool] Failed to delete award', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        userId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete award.',
      };
    }
  }
}
