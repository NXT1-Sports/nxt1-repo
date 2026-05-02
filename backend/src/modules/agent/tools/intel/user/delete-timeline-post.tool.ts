/**
 * @fileoverview Delete Timeline Post Tool — Hard delete user feed posts
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Permanently removes a post from the `Posts` collection.
 * This is a hard delete — the document is irrecoverably erased.
 *
 * Auth: verifies post.userId === context.userId before deleting.
 * Cache: invalidates user feed and profile post caches on success.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { createProfileWriteAccessService } from '../../../../../services/profile/profile-write-access.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const POSTS_COLLECTION = 'Posts';

const DeleteTimelinePostInputSchema = z.object({
  postId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class DeleteTimelinePostTool extends BaseTool {
  readonly name = 'delete_timeline_post';

  readonly description =
    "Permanently deletes a post from the user's timeline.\n\n" +
    'This is a hard delete — the post cannot be recovered.\n\n' +
    'Parameters:\n' +
    '- postId (required): Firestore document ID of the post to delete.\n' +
    '- userId (required): Firebase UID of the post owner.\n\n' +
    'The tool verifies the post belongs to userId before deleting.\n' +
    'Use update_timeline_post to modify a post instead of deleting it.';

  readonly parameters = DeleteTimelinePostInputSchema;

  override readonly allowedAgents = ['data_coordinator', 'brand_coordinator'] as const;
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
    const parsed = DeleteTimelinePostInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { postId, userId } = parsed.data;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      // ── Auth: verify actor is the post owner ─────────────────────────
      const postRef = this.db.collection(POSTS_COLLECTION).doc(postId);
      const postSnap = await postRef.get();

      if (!postSnap.exists) {
        return { success: false, error: `Post ${postId} not found.` };
      }

      const postData = postSnap.data() ?? {};
      const postOwnerId = typeof postData['userId'] === 'string' ? postData['userId'] : null;

      if (postOwnerId !== userId) {
        return { success: false, error: 'Post does not belong to the specified userId.' };
      }

      // ── Delegated auth: allow if actor owns the post OR has active roster
      // scope over the post owner (coach/director managing a player's post).
      if (postOwnerId !== context.userId) {
        try {
          await createProfileWriteAccessService(this.db).assertCanManageProfileTarget({
            actorUserId: context.userId,
            targetUserId: userId,
            action: 'delete_timeline_post',
            requireDelegatedAthleteTarget: false,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Not authorized to delete this post.';
          logger.warn('[DeleteTimelinePostTool] Delegated delete denied', {
            actorUserId: context.userId,
            targetUserId: userId,
            error: message,
          });
          return { success: false, error: message };
        }
      }

      context?.emitStage?.('submitting_job', {
        icon: 'document',
        phase: 'delete_timeline_post',
      });

      await postRef.delete();

      // ── Cache invalidation ─────────────────────────────────────────────
      const cache = getCacheService();
      await Promise.allSettled([
        cache.delByPrefix(`feed:v1:${userId}:`),
        cache.delByPrefix(`profile:posts:${userId}:`),
        cache.delByPrefix(`user:timeline:${userId}:`),
      ]);

      logger.info('[DeleteTimelinePostTool] Post deleted', { postId, userId });

      return {
        success: true,
        data: {
          postId,
          userId,
          deleted: true,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete post';
      logger.error('[DeleteTimelinePostTool] Failed to delete post', {
        error: message,
        postId,
        userId,
      });
      return { success: false, error: message };
    }
  }
}
