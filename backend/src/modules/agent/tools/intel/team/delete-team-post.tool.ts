/**
 * @fileoverview Delete Team Post Tool — Hard delete team-authored posts
 * @module @nxt1/backend/modules/agent/tools/intel
 *
 * Permanently removes a team-authored post from the `Posts` collection.
 * This is a hard delete — the document is irrecoverably erased.
 *
 * Auth: verifies team.ownerId === context.userId AND post.teamId === teamId.
 * Cache: invalidates team timeline and profile caches on success.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const POSTS_COLLECTION = 'Posts';
const TEAMS_COLLECTION = 'Teams';

const DeleteTeamPostInputSchema = z.object({
  postId: z.string().trim().min(1),
  teamId: z.string().trim().min(1),
  teamCode: z.string().trim().min(1),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class DeleteTeamPostTool extends BaseTool {
  readonly name = 'delete_team_post';

  readonly description =
    'Permanently deletes a team-authored post from the Posts collection.\n\n' +
    'This is a hard delete — the post cannot be recovered.\n\n' +
    'Parameters:\n' +
    '- postId (required): Firestore document ID of the post to delete.\n' +
    '- teamId (required): Team document ID.\n' +
    '- teamCode (required): Team code slug (used for cache invalidation).\n\n' +
    'The tool verifies the actor is the team owner and the post belongs to the team.\n' +
    'Use update_team_post to modify a post instead of deleting it.';

  readonly parameters = DeleteTeamPostInputSchema;

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
    const parsed = DeleteTeamPostInputSchema.safeParse(input);
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
      const teamOwnerId = teamData['ownerId'] as string | undefined;
      if (teamOwnerId !== context.userId) {
        return { success: false, error: 'Not authorized to delete posts for this team.' };
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

      const cloudflareVideoId =
        typeof postData['cloudflareVideoId'] === 'string' ? postData['cloudflareVideoId'] : null;

      context?.emitStage?.('submitting_job', {
        icon: 'document',
        phase: 'delete_team_post',
      });

      await postRef.delete();

      // Best-effort: delete linked Cloudflare Stream asset for video posts.
      if (cloudflareVideoId) {
        const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
        const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
        if (accountId && apiToken) {
          try {
            await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${cloudflareVideoId}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${apiToken}`,
                  'Content-Type': 'application/json',
                },
              }
            );
          } catch (cfErr) {
            logger.warn('[DeleteTeamPostTool] Cloudflare Stream asset deletion failed', {
              postId,
              teamId,
              cloudflareVideoId,
              error: cfErr instanceof Error ? cfErr.message : String(cfErr),
            });
          }
        }
      }

      // ── Cache invalidation ────────────────────────────────────────────
      const cache = getCacheService();
      const cacheCodes = new Set<string>();
      cacheCodes.add(teamCode);
      const canonicalTeamCode =
        typeof teamData['teamCode'] === 'string' ? teamData['teamCode'].trim() : '';
      const teamSlug = typeof teamData['slug'] === 'string' ? teamData['slug'].trim() : '';
      if (canonicalTeamCode) cacheCodes.add(canonicalTeamCode);
      if (teamSlug) cacheCodes.add(teamSlug);

      await Promise.allSettled(
        [...cacheCodes].flatMap((code) => [
          cache.delByPrefix(`team:timeline:v1:${code}:`),
          cache.delByPrefix(`team:profile:code:${code}:`),
        ])
      );

      logger.info('[DeleteTeamPostTool] Post deleted', { postId, teamId });

      return {
        success: true,
        data: {
          postId,
          teamId,
          deleted: true,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete team post';
      logger.error('[DeleteTeamPostTool] Failed', { error: message, postId, teamId });
      return { success: false, error: message };
    }
  }
}
