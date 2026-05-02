/**
 * @fileoverview Update Athlete Videos Tool — Partial-patch video posts
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

const UpdateAthleteVideosInputSchema = z.object({
  postId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  src: z.string().trim().min(1).optional(),
  provider: z.string().trim().min(1).optional(),
  poster: z.string().trim().min(1).optional(),
});

export class UpdateAthleteVideosTool extends BaseTool {
  readonly name = 'update_athlete_videos';
  readonly description = 'Partial-updates a video post.';
  readonly parameters = UpdateAthleteVideosInputSchema;
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
    const parsed = UpdateAthleteVideosInputSchema.safeParse(input);
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
        action: 'tool:update_athlete_videos',
      });
      userData = accessGrant.targetUserData;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Not authorized.' };
    }

    context?.emitStage?.('submitting_job', { icon: 'database', phase: 'update_athlete_videos' });

    const docRef = this.db.collection(POSTS_COLLECTION).doc(postId);
    const patch: Record<string, unknown> = {};

    if (parsed.data.title !== undefined) patch['title'] = parsed.data.title;
    if (parsed.data.src !== undefined) patch['src'] = parsed.data.src;
    if (parsed.data.provider !== undefined) patch['provider'] = parsed.data.provider;
    if (parsed.data.poster !== undefined) patch['poster'] = parsed.data.poster;

    if (Object.keys(patch).length === 0)
      return { success: true, data: { postId, userId, message: 'No fields to update' } };

    patch['updatedAt'] = new Date();

    try {
      await docRef.update(patch);
      const cache = getCacheService();
      await Promise.allSettled([
        cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
        invalidateProfileCaches(
          userId,
          typeof userData['unicode'] === 'string' ? userData['unicode'] : null
        ),
        cache.delByPrefix(`feed:v1:${userId}:`),
      ]);

      logger.info('[UpdateAthleteVideosTool] Video updated', { postId, userId });
      return { success: true, data: { postId, userId } };
    } catch (error) {
      logger.error('[UpdateAthleteVideosTool] Failed to update video', {
        err: error instanceof Error ? error.message : String(error),
        postId,
        userId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update video.',
      };
    }
  }
}
