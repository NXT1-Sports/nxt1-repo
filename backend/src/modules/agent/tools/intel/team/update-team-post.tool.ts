/**
 * @fileoverview Update Team Post Tool — Partial-patch team-authored posts
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Applies a partial update to an existing post in the `Posts` collection
 * that was authored on behalf of a team. Only supplied fields are written;
 * omitted fields remain unchanged.
 *
 * Auth: verifies team.ownerId === context.userId AND post.teamId === teamId.
 * Cache: invalidates team timeline and profile caches on success.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const POSTS_COLLECTION = 'Posts';
const TEAMS_COLLECTION = 'Teams';

const VALID_POST_TYPES = new Set(['text', 'image', 'video', 'announcement']);

const UpdateTeamPostInputSchema = z.object({
  postId: z.string().trim().min(1),
  teamId: z.string().trim().min(1),
  teamCode: z.string().trim().min(1),
  content: z.string().trim().min(1).max(5000).optional(),
  title: z.string().trim().min(1).optional(),
  type: z.enum(['text', 'image', 'video', 'announcement']).optional(),
  isPinned: z.boolean().optional(),
  sportId: z.string().trim().min(1).optional(),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class UpdateTeamPostTool extends BaseTool {
  readonly name = 'update_team_post';

  readonly description =
    'Applies a partial update to an existing team-authored post.\n\n' +
    'Only the fields you supply are changed — omitted fields remain as-is.\n\n' +
    'Parameters:\n' +
    '- postId (required): Firestore document ID of the post to update.\n' +
    '- teamId (required): Team document ID.\n' +
    '- teamCode (required): Team code slug (used for cache invalidation).\n' +
    '- content (optional): New post body text.\n' +
    '- title (optional): New post title.\n' +
    '- type (optional): New post type — "text", "image", "video", or "announcement".\n' +
    '- isPinned (optional): Pin or unpin the post.\n' +
    '- sportId (optional): New sport tag for the post.\n\n' +
    'The tool verifies the actor is the team owner before writing.\n' +
    'Use delete_team_post to remove a post entirely.';

  readonly parameters = UpdateTeamPostInputSchema;

  override readonly allowedAgents = ['data_coordinator'] as const;
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
    const parsed = UpdateTeamPostInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { postId, teamId, teamCode } = parsed.data;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      // ── Auth: verify actor is team owner ─────────────────────────────
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        return { success: false, error: `Team ${teamId} not found.` };
      }
      const teamData = teamDoc.data() ?? {};
      const isAuthorized = await canManageTeamMutationForUser(
        this.db,
        context.userId,
        teamId,
        teamData
      );
      if (!isAuthorized) {
        return { success: false, error: 'Not authorized to update posts for this team.' };
      }

      // ── Verify post belongs to team ───────────────────────────────────
      const postRef = this.db.collection(POSTS_COLLECTION).doc(postId);
      const postSnap = await postRef.get();

      if (!postSnap.exists) {
        return { success: false, error: `Post ${postId} not found.` };
      }

      const postData = postSnap.data() ?? {};
      if (postData['teamId'] !== teamId) {
        return { success: false, error: 'Post does not belong to the specified team.' };
      }

      // ── Build patch ───────────────────────────────────────────────────
      const patch: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };

      if (parsed.data.content !== undefined) patch['content'] = parsed.data.content;
      if (parsed.data.title !== undefined) patch['title'] = parsed.data.title;
      if (parsed.data.type !== undefined && VALID_POST_TYPES.has(parsed.data.type)) {
        patch['type'] = parsed.data.type;
      }
      if (parsed.data.isPinned !== undefined) patch['isPinned'] = parsed.data.isPinned;
      if (parsed.data.sportId !== undefined) patch['sportId'] = parsed.data.sportId;

      context?.emitStage?.('submitting_job', {
        icon: 'document',
        phase: 'update_team_post',
      });

      await postRef.update(patch);

      // ── Cache invalidation ────────────────────────────────────────────
      const cache = getCacheService();
      await Promise.allSettled([
        cache.delByPrefix(`team:timeline:v1:${teamCode}:`),
        cache.delByPrefix(`team:profile:code:${teamCode}:`),
      ]);

      const patchedFields = Object.keys(patch).filter((k) => k !== 'updatedAt');
      logger.info('[UpdateTeamPostTool] Post updated', { postId, teamId, patchedFields });

      return {
        success: true,
        data: {
          postId,
          teamId,
          patchedFields,
          updatedAt: patch['updatedAt'],
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update team post';
      logger.error('[UpdateTeamPostTool] Failed', { error: message, postId, teamId });
      return { success: false, error: message };
    }
  }
}
