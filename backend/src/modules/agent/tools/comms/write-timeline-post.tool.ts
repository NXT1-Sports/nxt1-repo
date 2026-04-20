/**
 * @fileoverview Write Timeline Post Tool — Create Feed Posts from Agent X
 * @module @nxt1/backend/modules/agent/tools/comms
 *
 * Creates a post on a user's timeline with full media support.
 * Accepts signed Firebase Storage URLs from agent operations
 * (scraped media, generated images) and writes directly to the
 * Firestore `Posts` collection.
 *
 * Follows the same Firestore schema used by POST /api/v1/posts,
 * including automatic hashtag/mention extraction, content sanitization,
 * and feed cache invalidation.
 */

import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { AgentToolCategory, AgentIdentifier } from '@nxt1/core';
import {
  POSTS_COLLECTIONS,
  PostVisibility,
  POST_LIMITS,
  POSTS_CACHE_PREFIX,
} from '@nxt1/core/constants';
import { sanitizeContent, extractMentions } from '@nxt1/core/validation';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { ScraperMediaService } from '../integrations/social/scraper-media.service.js';
import { getCacheService } from '../../../../services/cache.service.js';
import { getAnalyticsLoggerService } from '../../../../services/analytics-logger.service.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const VALID_POST_TYPES = [
  'text',
  'photo',
  'video',
  'highlight',
  'stats',
  'achievement',
  'announcement',
] as const;

const VALID_VISIBILITY = ['public', 'team', 'private'] as const;

const VALIDATION = {
  MAX_IMAGES: POST_LIMITS.MEDIA_MAX,
  CONTENT_MIN: POST_LIMITS.CONTENT_MIN,
  CONTENT_MAX: POST_LIMITS.CONTENT_MAX,
} as const;

type ValidPostType = (typeof VALID_POST_TYPES)[number];
type ValidVisibility = (typeof VALID_VISIBILITY)[number];

// ─── Tool Class ────────────────────────────────────────────────────────────────

export class WriteTimelinePostTool extends BaseTool {
  readonly name = 'write_timeline_post';
  readonly description =
    "Create a new post on the user's timeline/feed. " +
    'Use this to publish scraped content, AI-generated graphics, highlight announcements, ' +
    "achievement updates, or any content to the user's social feed. " +
    'Supports images (up to 10 Firebase Storage signed URLs) and a single video URL. ' +
    'Content is automatically sanitized and hashtags/mentions are auto-extracted.\n\n' +
    'Post types:\n' +
    '- text: Plain text post\n' +
    '- photo: Post with images attached\n' +
    '- video: Post with video attached\n' +
    '- highlight: Highlight reel announcement\n' +
    '- stats: Stats update or milestone\n' +
    '- achievement: Achievement or badge earned\n' +
    '- announcement: General announcement\n\n' +
    'Image and video URLs must be HTTPS Firebase Storage signed URLs ' +
    '(from generate_image, scrape_twitter, scrape_instagram, or other agent tools).';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'The Firestore UID of the user who owns the post.',
      },
      content: {
        type: 'string',
        description:
          `Post text content (${VALIDATION.CONTENT_MIN}-${VALIDATION.CONTENT_MAX} chars). ` +
          'Supports #hashtags and @mentions which are auto-extracted.',
      },
      type: {
        type: 'string',
        enum: [...VALID_POST_TYPES],
        description:
          'Post type. Use "photo" when attaching images, "video" for video, ' +
          '"text" for plain text, or a semantic type like "achievement", "stats", "highlight".',
      },
      visibility: {
        type: 'string',
        enum: [...VALID_VISIBILITY],
        description:
          'Post visibility: "public" (everyone), "team" (team members only), "private" (only the user).',
      },
      images: {
        type: 'array',
        items: { type: 'string' },
        maxItems: VALIDATION.MAX_IMAGES,
        description:
          `Array of image URLs (max ${VALIDATION.MAX_IMAGES}). ` +
          'Must be HTTPS Firebase Storage signed URLs from agent uploads ' +
          '(scraped media or generated graphics).',
      },
      videoUrl: {
        type: 'string',
        description:
          'Single video URL. Must be an HTTPS Firebase Storage signed URL from agent uploads.',
      },
      teamId: {
        type: 'string',
        description: 'Optional team ID to associate the post with a team.',
      },
    },
    required: ['userId', 'content', 'type', 'visibility'],
  };

  readonly isMutation = true;
  readonly category: AgentToolCategory = 'communication';
  override readonly allowedAgents: readonly (AgentIdentifier | '*')[] = [
    'data_coordinator',
    'brand_media_coordinator',
    'recruiting_coordinator',
    'general',
  ];

  constructor(private readonly db: Firestore) {
    super();
  }

  // ─── Execute ───────────────────────────────────────────────────────────────

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // ── Required parameters ──────────────────────────────────────────────
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');

    const content = this.str(input, 'content');
    if (!content) return this.paramError('content');

    const type = this.str(input, 'type') as ValidPostType | null;
    if (!type || !VALID_POST_TYPES.includes(type)) {
      return {
        success: false,
        error: `Parameter "type" must be one of: ${VALID_POST_TYPES.join(', ')}.`,
      };
    }

    const visibility = this.str(input, 'visibility') as ValidVisibility | null;
    if (!visibility || !VALID_VISIBILITY.includes(visibility)) {
      return {
        success: false,
        error: `Parameter "visibility" must be one of: ${VALID_VISIBILITY.join(', ')}.`,
      };
    }

    // ── Content validation ───────────────────────────────────────────────
    if (content.length < VALIDATION.CONTENT_MIN) {
      return {
        success: false,
        error: `Content must be at least ${VALIDATION.CONTENT_MIN} character(s).`,
      };
    }
    if (content.length > VALIDATION.CONTENT_MAX) {
      return {
        success: false,
        error: `Content must not exceed ${VALIDATION.CONTENT_MAX} characters.`,
      };
    }

    // ── Optional media validation ────────────────────────────────────────
    const images = this.validateImages(input);
    if (images.error) {
      return { success: false, error: images.error };
    }

    const videoUrl = this.str(input, 'videoUrl');
    if (videoUrl && !this.isValidMediaUrl(videoUrl)) {
      return {
        success: false,
        error:
          'videoUrl must be a valid HTTPS URL. HTTP, localhost, and private network URLs are not allowed.',
      };
    }

    const teamId = this.str(input, 'teamId');

    // ── Build Firestore document ─────────────────────────────────────────
    try {
      context?.onProgress?.('Preparing post content…');
      const sanitized = sanitizeContent(content);
      const mentions = extractMentions(content);

      const visibilityMap: Record<ValidVisibility, PostVisibility> = {
        public: PostVisibility.PUBLIC,
        team: PostVisibility.TEAM,
        private: PostVisibility.PRIVATE,
      };
      const postVisibility = visibilityMap[visibility];

      // ── Media promotion: copy from thread staging → permanent post path ──
      // Thread-staged media lives under users/{userId}/threads/{threadId}/media/
      // and expires with the thread. Published posts need permanent copies at
      // users/{userId}/posts/{postId}/ so they survive thread deletion.
      const postIdForMedia = this.db.collection(POSTS_COLLECTIONS.POSTS).doc().id;
      const destinationPrefix = `Users/${userId}/posts/${postIdForMedia}`;

      let promotedImages = images.urls;
      let promotedVideoUrl = videoUrl;

      if (context?.userId) {
        if (images.urls.length > 0) {
          context.onProgress?.('Uploading media to permanent storage…');
          promotedImages = await ScraperMediaService.promoteMedia(
            images.urls,
            context.userId,
            destinationPrefix
          );
          if (promotedImages.length !== images.urls.length) {
            logger.warn('[WriteTimelinePostTool] Some images failed promotion', {
              original: images.urls.length,
              promoted: promotedImages.length,
            });
          }
        }
        if (videoUrl) {
          const [promoted] = await ScraperMediaService.promoteMedia(
            [videoUrl],
            context.userId,
            destinationPrefix
          );
          promotedVideoUrl = promoted ?? videoUrl;
        }
      }

      const now = Timestamp.now();
      const postDoc = {
        userId,
        content: sanitized,
        type,
        visibility: postVisibility,
        teamId: teamId ?? undefined,
        images: promotedImages,
        videoUrl: promotedVideoUrl ?? undefined,
        externalLinks: [],
        mentions,
        location: teamId ?? undefined,
        isPinned: false,
        createdAt: now,
        updatedAt: now,
        stats: {
          likes: 0,
          shares: 0,
          views: 0,
        },
      };

      context?.onProgress?.('Publishing post to timeline…');
      const docRef = await this.db.collection(POSTS_COLLECTIONS.POSTS).doc(postIdForMedia);
      await docRef.set(postDoc);
      const postId = docRef.id;

      logger.info('[WriteTimelinePostTool] Post created', {
        postId,
        userId,
        type,
        visibility,
        imageCount: images.urls.length,
        hasVideo: !!videoUrl,
        mentionCount: mentions.length,
      });

      // ── Cache invalidation ─────────────────────────────────────────────
      context?.onProgress?.('Invalidating feed caches…');
      await this.invalidateFeedCaches(postVisibility, userId, teamId ?? undefined);

      // Track profile-post creation in user's engagement record.
      // Posts live on the athlete's profile only (not a social feed), so we
      // track shares and views only — no likes or comments.
      void getAnalyticsLoggerService().safeTrack({
        subjectId: userId,
        subjectType: 'user',
        domain: 'engagement',
        eventType: 'content_viewed',
        source: 'agent',
        actorUserId: context?.userId ?? userId,
        sessionId: context?.sessionId ?? null,
        threadId: context?.threadId ?? null,
        tags: [type, visibility],
        payload: {
          postId,
          contentType: type,
          visibility,
          views: 0,
          shares: 0,
        },
        metadata: { initiatedBy: 'write_timeline_post' },
      });

      return {
        success: true,
        data: {
          postId,
          userId,
          type,
          visibility,
          imageCount: images.urls.length,
          videoUrl: videoUrl ?? null,
          mentions,
          createdAt: now.toDate().toISOString(),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create post';
      logger.error('[WriteTimelinePostTool] Failed to create post', {
        error: message,
        userId,
        type,
      });
      return { success: false, error: message };
    }
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Validate the images array from input.
   * Returns validated URL array or an error string.
   */
  private validateImages(input: Record<string, unknown>): { urls: string[]; error?: string } {
    const raw = input['images'];
    if (raw === undefined || raw === null) {
      return { urls: [] };
    }

    if (!Array.isArray(raw)) {
      return { urls: [], error: 'Parameter "images" must be an array of URL strings.' };
    }

    if (raw.length > VALIDATION.MAX_IMAGES) {
      return {
        urls: [],
        error: `Maximum ${VALIDATION.MAX_IMAGES} images allowed per post.`,
      };
    }

    const urls: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      const url = typeof raw[i] === 'string' ? (raw[i] as string).trim() : '';
      if (!url) {
        return { urls: [], error: `images[${i}] must be a non-empty string.` };
      }
      if (!this.isValidMediaUrl(url)) {
        return {
          urls: [],
          error: `images[${i}] must be a valid HTTPS URL. HTTP, localhost, and private network URLs are not allowed.`,
        };
      }
      urls.push(url);
    }

    return { urls };
  }

  /**
   * Validate that a URL is a safe, HTTPS media URL.
   * Blocks HTTP, localhost, private IPs, and .local/.internal domains (SSRF protection).
   */
  private isValidMediaUrl(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Must be HTTPS
      if (parsed.protocol !== 'https:') return false;

      const hostname = parsed.hostname.toLowerCase();

      // Block localhost and loopback
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        hostname === '0.0.0.0'
      ) {
        return false;
      }

      // Block private network ranges
      if (
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)
      ) {
        return false;
      }

      // Block internal/local domains
      if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Invalidate feed caches after creating a post.
   * Mirrors the invalidation logic in posts.routes.ts.
   */
  private async invalidateFeedCaches(
    visibility: PostVisibility,
    userId: string,
    teamId?: string
  ): Promise<void> {
    try {
      const cache = getCacheService();
      const patterns = [
        `${POSTS_CACHE_PREFIX}feed:${visibility}:${teamId || 'all'}:*`,
        `${POSTS_CACHE_PREFIX}feed:${visibility}:*`,
      ];

      for (const pattern of patterns) {
        await cache.del(pattern);
      }

      // Invalidate the user's profile timeline cache so the new post
      // appears immediately on profile and team pages.
      await cache.delByPrefix(`profile:sub:timeline:v2:${userId}`);
    } catch (err) {
      // Cache invalidation failure is non-fatal — feed will refresh on TTL expiry
      logger.warn('[WriteTimelinePostTool] Feed cache invalidation failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
        visibility,
        teamId,
      });
    }
  }
}
