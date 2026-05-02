/**
 * @fileoverview Delete Rankings Tool — Hard delete rankings
 * @module @nxt1/backend/modules/agent/tools/intel
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { createProfileWriteAccessService } from '../../../../../services/profile/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const RANKINGS_COLLECTION = 'Rankings';

const DeleteRankingsInputSchema = z.object({
  docId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

export class DeleteRankingsTool extends BaseTool {
  readonly name = 'delete_rankings';
  readonly description = 'Hard deletes rankings.';
  readonly parameters = DeleteRankingsInputSchema;
  override readonly allowedAgents = ['data_coordinator'] as const;
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
    const parsed = DeleteRankingsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { docId, userId } = parsed.data;
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    let userData: Record<string, unknown>;
    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:delete_rankings',
      });
      userData = accessGrant.targetUserData;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Not authorized.' };
    }

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'delete_rankings' });

    const docRef = this.db.collection(RANKINGS_COLLECTION).doc(docId);

    try {
      await docRef.delete();
      const cache = getCacheService();
      await Promise.allSettled([
        cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
        invalidateProfileCaches(
          userId,
          typeof userData['unicode'] === 'string' ? userData['unicode'] : null
        ),
      ]);

      logger.info('[DeleteRankingsTool] Rankings deleted', { docId, userId });
      return { success: true, data: { docId, userId, deleted: true } };
    } catch (error) {
      logger.error('[DeleteRankingsTool] Failed to delete rankings', {
        err: error instanceof Error ? error.message : String(error),
        docId,
        userId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete rankings.',
      };
    }
  }
}
