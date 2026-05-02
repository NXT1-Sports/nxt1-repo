/**
 * @fileoverview Update Timeline Post Tool — Partial-patch user feed posts
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Applies a partial update to an existing post in the `Posts` collection
 * that was created by the authenticated user. Only non-null fields in the
 * request are written — omitted fields are left unchanged.
 *
 * Auth: verifies post.userId === context.userId before writing.
 * Cache: invalidates user feed and profile post caches on success.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { createProfileWriteAccessService } from '../../../../../services/profile/profile-write-access.service.js';
import { logger } from '../../../../../utils/logger.js';
import { sanitizeText } from '@nxt1/core/helpers';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const POSTS_COLLECTION = 'Posts';

const VALID_VISIBILITY = ['public', 'team', 'private'] as const;
const VALID_POST_TYPES = [
  'text',
  'photo',
  'video',
  'highlight',
  'stats',
  'achievement',
  'announcement',
] as const;

const UpdateTimelinePostInputSchema = z.object({
  postId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  content: z.string().trim().min(1).max(5000).optional(),
  type: z.enum(VALID_POST_TYPES).optional(),
  visibility: z.enum(VALID_VISIBILITY).optional(),
  isPinned: z.boolean().optional(),
  sportId: z.string().trim().min(1).optional(),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class UpdateTimelinePostTool extends BaseTool {
  readonly name = 'update_timeline_post';

  readonly description =
    "Applies a partial update to an existing post on the user's timeline.\n\n" +
    'Only the fields you supply are changed — omitted fields remain as-is.\n\n' +
    'Parameters:\n' +
    '- postId (required): Firestore document ID of the post to update.\n' +
    '- userId (required): Firebase UID of the post owner.\n' +
    '- content (optional): New post body text (sanitized automatically).\n' +
    '- type (optional): New post type — "text", "photo", "video", "highlight", "stats", "achievement", or "announcement".\n' +
    '- visibility (optional): New visibility — "public", "team", or "private".\n' +
    '- isPinned (optional): Pin or unpin the post.\n' +
    '- sportId (optional): New sport tag for the post.\n\n' +
    'The tool verifies the post belongs to userId before writing.\n' +
    'Use delete_timeline_post to remove a post entirely.';

  readonly parameters = UpdateTimelinePostInputSchema;

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
    const parsed = UpdateTimelinePostInputSchema.safeParse(input);
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
            action: 'update_timeline_post',
            requireDelegatedAthleteTarget: false,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Not authorized to update this post.';
          logger.warn('[UpdateTimelinePostTool] Delegated update denied', {
            actorUserId: context.userId,
            targetUserId: userId,
            error: message,
          });
          return { success: false, error: message };
        }
      }

      // ── Build patch object (only supplied fields) ─────────────────────
      const patch: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (parsed.data.content !== undefined) {
        patch['content'] = sanitizeText(parsed.data.content);
      }
      if (parsed.data.type !== undefined) {
        patch['type'] = parsed.data.type;
      }
      if (parsed.data.visibility !== undefined) {
        patch['visibility'] = parsed.data.visibility;
      }
      if (parsed.data.isPinned !== undefined) {
        patch['isPinned'] = parsed.data.isPinned;
      }
      if (parsed.data.sportId !== undefined) {
        patch['sportId'] = parsed.data.sportId;
        patch['sport'] = parsed.data.sportId;
      }

      context?.emitStage?.('submitting_job', {
        icon: 'document',
        phase: 'update_timeline_post',
      });

      await postRef.update(patch);

      // ── Cache invalidation ─────────────────────────────────────────────
      const cache = getCacheService();
      await Promise.allSettled([
        cache.delByPrefix(`feed:v1:${userId}:`),
        cache.delByPrefix(`profile:posts:${userId}:`),
        cache.delByPrefix(`user:timeline:${userId}:`),
      ]);

      logger.info('[UpdateTimelinePostTool] Post updated', {
        postId,
        userId,
        patchedFields: Object.keys(patch).filter((k) => k !== 'updatedAt'),
      });

      return {
        success: true,
        data: {
          postId,
          userId,
          patchedFields: Object.keys(patch).filter((k) => k !== 'updatedAt'),
          updatedAt: patch['updatedAt'],
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update post';
      logger.error('[UpdateTimelinePostTool] Failed to update post', {
        error: message,
        postId,
        userId,
      });
      return { success: false, error: message };
    }
  }
}
