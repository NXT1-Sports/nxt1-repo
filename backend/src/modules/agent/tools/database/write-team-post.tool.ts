/**
 * @fileoverview Write Team Post Tool — Atomic writer for team-authored posts
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes posts to the `Posts` collection with a `teamId` field, enabling
 * the posts to appear in the team timeline.
 *
 * Supports post types: text, image, announcement, highlight.
 *
 * Doc ID is auto-generated (no dedup — each post is a unique creation).
 *
 * Queried by: TeamTimeline (GET /api/v1/teams/:teamCode/timeline?filter=media)
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import { logger } from '../../../../utils/logger.js';
import { resolveCreatedAt } from './doc-date-utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const POSTS_COLLECTION = 'Posts';
const TEAMS_COLLECTION = 'Teams';
const MAX_POSTS_PER_CALL = 10;

const VALID_POST_TYPES = new Set(['text', 'image', 'video', 'announcement']);

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteTeamPostTool extends BaseTool {
  readonly name = 'write_team_post';

  readonly description =
    'Creates posts in the Posts collection on behalf of a team.\n\n' +
    'Use this to publish team announcements, share highlight media, or post text updates.\n\n' +
    'Each call creates new post documents — no deduplication applied.\n\n' +
    'Parameters:\n' +
    '- teamId (required): Team document ID.\n' +
    '- teamCode (required): Team code slug (used for cache invalidation).\n' +
    '- posts (required): Array of posts to create:\n' +
    '  • type (required): "text" | "image" | "video" | "announcement".\n' +
    '  • content (required for text/announcement): Post body text.\n' +
    '  • mediaUrls (optional): Array of image/video URLs.\n' +
    '  • title (optional): Post title.\n' +
    '  • sportId (optional): Sport this post is related to.\n' +
    '  • isPinned (optional): Pin post to top of timeline.';

  readonly parameters = {
    type: 'object',
    properties: {
      teamId: { type: 'string' },
      teamCode: { type: 'string' },
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['text', 'image', 'video', 'announcement'],
            },
            content: { type: 'string' },
            mediaUrls: { type: 'array', items: { type: 'string' } },
            title: { type: 'string' },
            sportId: { type: 'string' },
            isPinned: { type: 'boolean' },
          },
          required: ['type'],
        },
      },
    },
    required: ['teamId', 'teamCode', 'posts'],
  } as const;

  override readonly allowedAgents = ['data_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const teamId = this.str(input, 'teamId');
    if (!teamId) return this.paramError('teamId');
    const teamCode = this.str(input, 'teamCode');
    if (!teamCode) return this.paramError('teamCode');

    const rawPosts = input['posts'];
    if (!Array.isArray(rawPosts) || rawPosts.length === 0) {
      return { success: false, error: 'posts must be a non-empty array.' };
    }
    if (rawPosts.length > MAX_POSTS_PER_CALL) {
      return { success: false, error: `posts exceeds maximum of ${MAX_POSTS_PER_CALL}.` };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      // Verify team exists and actor is authorized
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        return { success: false, error: `Team ${teamId} not found.` };
      }
      const teamOwnerId = teamDoc.data()?.['ownerId'] as string | undefined;
      if (teamOwnerId && teamOwnerId !== context.userId) {
        return { success: false, error: 'Not authorized to post on behalf of this team.' };
      }

      const now = new Date().toISOString();
      const batch = this.db.batch();
      let written = 0;
      let skipped = 0;

      for (const rawPost of rawPosts) {
        if (!rawPost || typeof rawPost !== 'object') {
          skipped++;
          continue;
        }
        const p = rawPost as Record<string, unknown>;
        const type = this.str(p, 'type');

        if (!type || !VALID_POST_TYPES.has(type)) {
          skipped++;
          continue;
        }

        const content = this.str(p, 'content') ?? undefined;
        const title = this.str(p, 'title') ?? undefined;
        const sportId = this.str(p, 'sportId') ?? undefined;
        const isPinned = typeof p['isPinned'] === 'boolean' ? p['isPinned'] : false;

        // Build media array
        const mediaUrls = Array.isArray(p['mediaUrls'])
          ? (p['mediaUrls'] as unknown[]).filter((u): u is string => typeof u === 'string')
          : [];

        const docRef = this.db.collection(POSTS_COLLECTION).doc();
        batch.set(docRef, {
          teamId,
          userId: context.userId, // actor who triggered the write
          type,
          content: content ?? '',
          ...(title ? { title } : {}),
          ...(sportId ? { sportId } : {}),
          isPinned,
          mediaUrls,
          media: mediaUrls.map((url, idx) => ({
            id: `${docRef.id}-media-${idx}`,
            type: type === 'video' ? 'video' : 'image',
            url,
          })),
          engagement: { likeCount: 0, commentCount: 0, shareCount: 0, viewCount: 0 },
          createdAt: resolveCreatedAt(undefined, undefined, now),
          updatedAt: now,
        });

        written++;
      }

      if (written === 0) {
        return { success: false, error: 'No valid posts after validation.' };
      }

      context?.onProgress?.(`Writing ${written} team post(s)…`);
      await batch.commit();

      // Invalidate team timeline and profile caches
      const cache = getCacheService();
      await Promise.all([
        cache.delByPrefix(`team:timeline:v1:${teamCode}:`),
        cache.delByPrefix(`team:profile:code:${teamCode}:`),
      ]);

      logger.info('[WriteTeamPostTool] Posts written', { teamId, teamCode, written, skipped });

      return {
        success: true,
        data: {
          written,
          skipped,
          message: `Created ${written} team post(s)${skipped > 0 ? `, skipped ${skipped}` : ''}.`,
        },
      };
    } catch (err) {
      logger.error('[WriteTeamPostTool] Failed', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write team posts.',
      };
    }
  }
}
