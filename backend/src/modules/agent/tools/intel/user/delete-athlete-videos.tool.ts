/**
 * @fileoverview Delete Athlete Videos Tool — Hard delete video posts
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

const POSTS_COLLECTION = 'Posts';

const DeleteAthleteVideosInputSchema = z.object({
  postId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

export class DeleteAthleteVideosTool extends BaseTool {
  readonly name = 'delete_athlete_videos';
  readonly description = 'Hard deletes a video post.';
  readonly parameters = DeleteAthleteVideosInputSchema;
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
    const parsed = DeleteAthleteVideosInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { postId, userId } = parsed.data;
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    let userData: Record<string, unknown>;
    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:delete_athlete_videos',
      });
      userData = accessGrant.targetUserData;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Not authorized.' };
    }

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'delete_athlete_videos' });

    const docRef = this.db.collection(POSTS_COLLECTION).doc(postId);

    try {
      await docRef.delete();
      const cache = getCacheService();
      await Promise.allSettled([
        cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
        invalidateProfileCaches(
          userId,
          typeof userData['unicode'] === 'string' ? userData['unicode'] : null
        ),
        cache.delByPrefix(`feed:v1:${userId}:`),
      ]);

      logger.info('[DeleteAthleteVideosTool] Video deleted', { postId, userId });
      return { success: true, data: { postId, userId, deleted: true } };
    } catch (error) {
      logger.error('[DeleteAthleteVideosTool] Failed to delete video', {
        err: error instanceof Error ? error.message : String(error),
        postId,
        userId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete video.',
      };
    }
  }
}
