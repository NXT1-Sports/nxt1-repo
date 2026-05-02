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
import { z } from 'zod';
import { sanitizeText } from '@nxt1/core/helpers';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { ScraperMediaService } from '../../integrations/social/scraper-media.service.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import {
  CLOUDFLARE_API_BASE_URL,
  getCloudflareHighlightPostId,
  normalizeCloudflareVideoForClient,
} from '../../../../../routes/core/upload/shared.js';
import { getAnalyticsLoggerService } from '../../../../../services/core/analytics-logger.service.js';
import { createProfileWriteAccessService } from '../../../../../services/profile/profile-write-access.service.js';
import { logger } from '../../../../../utils/logger.js';

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

function extractMentions(content: string): string[] {
  return [
    ...new Set(
      Array.from(content.matchAll(/(^|[^\w])@([a-zA-Z0-9._]{1,30})/g), (match) => match[2])
    ),
  ];
}

// ─── Tool Class ────────────────────────────────────────────────────────────────

export class WriteTimelinePostTool extends BaseTool {
  readonly name = 'write_timeline_post';
  readonly description =
    "Create a new post on the user's timeline/feed. " +
    'Use this to publish scraped content, AI-generated graphics, highlight announcements, ' +
    "achievement updates, or any content to the user's social feed. " +
    'Supports images (up to 10 prepared media URLs) and a single video URL. ' +
    'Content is automatically sanitized. Do NOT include hashtags in the content — NXT1 does not use hashtags.\n\n' +
    'Post types:\n' +
    '- text: Plain text post\n' +
    '- photo: Post with images attached\n' +
    '- video: Post with video attached\n' +
    '- highlight: Highlight reel announcement\n' +
    '- stats: Stats update or milestone\n' +
    '- achievement: Achievement or badge earned\n' +
    '- announcement: General announcement\n\n' +
    'Image and video URLs must be HTTPS CDN-hosted media URLs ' +
    '(from generate_image, scrape_twitter, scrape_instagram, or other agent tools).\n\n' +
    'Sport tagging:\n' +
    'Pass `sportId` (lowercase, e.g. "football", "basketball") so the post ' +
    'is filed under the correct sport profile. If omitted, it falls back to ' +
    "the user's currently active sport. Posts without a sportId are NOT " +
    'visible on any sport profile timeline.';

  readonly parameters = z.object({
    userId: z.string().trim().min(1),
    content: z.string().min(VALIDATION.CONTENT_MIN).max(VALIDATION.CONTENT_MAX),
    type: z.enum(VALID_POST_TYPES),
    visibility: z.enum(VALID_VISIBILITY),
    images: z.array(z.string().trim().min(1)).max(VALIDATION.MAX_IMAGES).optional(),
    videoUrl: z.string().trim().min(1).optional(),
    teamId: z.string().trim().min(1).optional(),
    /**
     * Sport identifier this post belongs to (lowercase, e.g. "football").
     * Required so the post is filtered onto the correct sport profile when
     * the user has multiple sports. If omitted, the tool resolves it from
     * the user's currently active sport (`Users/{userId}.sports[activeSportIndex].sport`).
     */
    sportId: z.string().trim().min(1).optional(),
  });

  readonly isMutation = true;
  readonly category: AgentToolCategory = 'communication';

  readonly entityGroup = 'user_tools' as const;
  override readonly allowedAgents: readonly (AgentIdentifier | '*')[] = [
    'data_coordinator',
    'brand_coordinator',
    'recruiting_coordinator',
    'strategy_coordinator',
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

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    // ── Roster-based write authorization ────────────────────────────────
    // Self-writes are always allowed. Delegated writes (coach/director acting
    // on a player's feed) require the actor to be an active team manager
    // sharing an active roster scope with the target user.
    if (userId !== context.userId) {
      try {
        await createProfileWriteAccessService(this.db).assertCanManageProfileTarget({
          actorUserId: context.userId,
          targetUserId: userId,
          action: 'write_timeline_post',
          requireDelegatedAthleteTarget: false,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Not authorized to post on this timeline.';
        logger.warn('[WriteTimelinePostTool] Delegated write denied', {
          actorUserId: context.userId,
          targetUserId: userId,
          error: message,
        });
        return { success: false, error: message };
      }
    }

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
    const explicitSportId = this.str(input, 'sportId');

    // Resolve sportId: explicit param wins, otherwise fall back to the user's
    // currently active sport. Without this the post is invisible on every
    // sport profile because the timeline endpoint filters by `sportId`.
    const sportId = await this.resolveSportId(userId, explicitSportId);
    if (!sportId) {
      return {
        success: false,
        error:
          "No sport could be resolved for this post. Pass a sportId (e.g. 'football') or ensure the user has a sport on their profile. Posts without a sportId are not visible on any sport profile timeline.",
      };
    }

    // ── Build Firestore document ─────────────────────────────────────────
    try {
      context?.emitStage?.('submitting_job', {
        icon: 'document',
        phase: 'prepare_post_content',
      });
      const sanitized = sanitizeText(content);
      const mentions = extractMentions(content);

      const visibilityMap: Record<ValidVisibility, PostVisibility> = {
        public: PostVisibility.PUBLIC,
        team: PostVisibility.TEAM,
        private: PostVisibility.PRIVATE,
      };
      const postVisibility = visibilityMap[visibility];

      // ── Media promotion: copy from thread staging → permanent post path ──
      // Images are promoted to posts/{postId}/ so they survive thread deletion.
      // Videos are NOT promoted to Firebase — Cloudflare Stream is the source
      // of truth for video playback, so the thread-staged URL is submitted
      // directly to CF. This avoids a redundant Firebase copy that is never served.
      const postIdForMedia = this.db.collection(POSTS_COLLECTIONS.POSTS).doc().id;
      const destinationPrefix = `Users/${userId}/posts/${postIdForMedia}`;

      let promotedImages = images.urls;

      if (context?.userId && images.urls.length > 0) {
        context.emitStage?.('uploading_assets', {
          icon: 'upload',
          phase: 'upload_post_media',
        });
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

      // ── Cloudflare Stream: submit video for transcoding ───────────────────
      // Any post carrying a videoUrl must be Cloudflare-backed. We submit the
      // thread-staged URL directly to CF and fail the write if submission fails
      // so feed cards never fall back to rendering raw signed Firebase URLs.
      let cloudflareVideoId: string | null = null;
      let cfResult: {
        videoId: string;
        readyToStream: boolean;
        iframeUrl: string | null;
        hlsUrl: string | null;
      } | null = null;
      let finalDocId = postIdForMedia;

      if (videoUrl) {
        context?.emitStage?.('uploading_assets', {
          icon: 'media',
          phase: 'submit_video_cloudflare',
        });
        cfResult = await this.submitVideoToCloudflare(videoUrl, userId);
        if (!cfResult) {
          return {
            success: false,
            error:
              'Unable to submit video to Cloudflare Stream. Post was not created to avoid broken playback. Please retry.',
          };
        }
        cloudflareVideoId = cfResult.videoId;
        finalDocId = getCloudflareHighlightPostId(cfResult.videoId);

        // If CF already processed the video (common for short clips), log it.
        // The postDoc below will write it in ready state immediately.
        if (cfResult.readyToStream && cfResult.iframeUrl) {
          logger.info('[WriteTimelinePostTool] CF video already ready — writing post as playable', {
            userId,
            cloudflareVideoId,
          });
        }
      }

      const now = Timestamp.now();
      const postDoc = {
        userId,
        content: sanitized,
        type,
        visibility: postVisibility,
        teamId: teamId ?? undefined,
        // Sport scoping: required for the post to surface on the matching
        // sport profile (queried via `where('sportId', '==', sportId)` in
        // backend/src/services/profile/timeline.service.ts).
        sportId: sportId ?? undefined,
        sport: sportId ?? undefined,
        images: promotedImages,
        ...(cloudflareVideoId
          ? (() => {
              // If CF already processed the video (common for short clips),
              // write the post in ready state so it's immediately playable.
              // This avoids the race condition where the webhook fires before
              // the Firestore doc exists.
              const alreadyReady = cfResult?.readyToStream === true && !!cfResult?.iframeUrl;
              return alreadyReady
                ? {
                    cloudflareVideoId,
                    cloudflareStatus: 'ready',
                    readyToStream: true,
                    mediaUrl: cfResult!.iframeUrl,
                    videoUrl: cfResult!.hlsUrl ?? undefined,
                    playback: {
                      hlsUrl: cfResult!.hlsUrl ?? undefined,
                      iframeUrl: cfResult!.iframeUrl,
                    },
                  }
                : {
                    cloudflareVideoId,
                    cloudflareStatus: 'inprogress',
                    readyToStream: false,
                    mediaUrl: null,
                  };
            })()
          : {}),
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

      context?.emitStage?.('submitting_job', {
        icon: 'document',
        phase: 'publish_timeline_post',
      });
      const docRef = this.db.collection(POSTS_COLLECTIONS.POSTS).doc(finalDocId);
      await docRef.set(postDoc);

      if (cloudflareVideoId && cfResult && !cfResult.readyToStream) {
        await this.reconcileCloudflareVideoPost(docRef, cloudflareVideoId, userId);
      }

      const postId = docRef.id;

      logger.info('[WriteTimelinePostTool] Post created', {
        postId,
        userId,
        type,
        visibility,
        sportId: sportId ?? null,
        imageCount: images.urls.length,
        hasVideo: !!videoUrl,
        mentionCount: mentions.length,
      });

      // ── Cache invalidation ─────────────────────────────────────────────
      context?.emitStage?.('persisting_result', {
        icon: 'database',
        phase: 'invalidate_feed_caches',
      });
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
          sportId: sportId ?? null,
          imageCount: images.urls.length,
          videoUrl: videoUrl ?? null,
          mentions,
          createdAt: now.toDate().toISOString(),
          ...(cloudflareVideoId
            ? {
                cloudflareVideoId,
                processingNote:
                  'Video is processing via Cloudflare Stream and will be playable within 1–2 minutes.',
              }
            : {}),
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

  /**   * Resolve the sport this post should be tagged with.
   *
   * Priority:
   *   1. Explicit `sportId` arg (already lowercased upstream by the caller).
   *   2. The user's currently active sport on `Users/{userId}` —
   *      `sports[activeSportIndex].sport`, falling back to the first sport
   *      that has `isPrimary` true, then to `sports[0]`.
   *
   * Returned value is always lowercased to match the storage convention
   * used by `where('sportId', '==', sportId.toLowerCase())` in the
   * timeline / sub-feed routes.
   */
  private async resolveSportId(
    userId: string,
    explicit?: string | null
  ): Promise<string | undefined> {
    if (explicit && explicit.trim()) {
      return explicit.trim().toLowerCase();
    }

    try {
      const userDoc = await this.db.collection('Users').doc(userId).get();
      if (!userDoc.exists) return undefined;
      const data = userDoc.data() ?? {};
      const sports = Array.isArray(data['sports'])
        ? (data['sports'] as Array<Record<string, unknown>>)
        : [];
      if (sports.length === 0) return undefined;

      const activeIndex =
        typeof data['activeSportIndex'] === 'number' ? (data['activeSportIndex'] as number) : -1;
      const candidate =
        (activeIndex >= 0 && activeIndex < sports.length ? sports[activeIndex] : null) ??
        sports.find((s) => s['isPrimary'] === true) ??
        sports[0];

      const sport = typeof candidate?.['sport'] === 'string' ? candidate['sport'] : undefined;
      return sport ? sport.toLowerCase() : undefined;
    } catch (err) {
      logger.warn('[WriteTimelinePostTool] Failed to resolve sportId from user doc', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  /**   * Validate the images array from input.
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

  /**
   * Submit a video URL to Cloudflare Stream via copy-from-URL.
   * Accepts any HTTPS URL (thread-staged Firebase, external scraped, etc.).
   * Returns the Cloudflare video UID, or null if CF is unconfigured / fails.
   * Failure is non-fatal — the post still saves with the raw source URL as fallback.
   */
  private async submitVideoToCloudflare(
    videoUrl: string,
    userId: string
  ): Promise<{
    videoId: string;
    readyToStream: boolean;
    iframeUrl: string | null;
    hlsUrl: string | null;
  } | null> {
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

    if (!accountId || !apiToken) {
      logger.warn(
        '[WriteTimelinePostTool] Cloudflare not configured — video saved as Firebase URL only',
        { userId }
      );
      return null;
    }

    try {
      const response = await fetch(`${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream/copy`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: videoUrl,
          meta: {
            nxt1_user_id: userId,
            nxt1_context: 'agent_post',
            nxt1_env: process.env['NODE_ENV'] ?? 'production',
            webhook_backend_url: (process.env['BACKEND_URL'] ?? '').replace(/\/$/, ''),
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        logger.warn('[WriteTimelinePostTool] CF Stream copy API error (non-fatal)', {
          status: response.status,
          userId,
          body: text.slice(0, 200),
        });
        return null;
      }

      const body = (await response.json()) as Record<string, unknown>;
      const result = body['result'] as Record<string, unknown> | null | undefined;
      const videoId = typeof result?.['uid'] === 'string' ? (result['uid'] as string) : null;

      if (!videoId) {
        logger.warn('[WriteTimelinePostTool] CF Stream copy API returned no video UID', {
          userId,
        });
        return null;
      }

      const normalized = normalizeCloudflareVideoForClient(videoId, result ?? {}, customerCode);

      logger.info('[WriteTimelinePostTool] Video submitted to Cloudflare Stream', {
        userId,
        cloudflareVideoId: videoId,
        readyToStream: normalized.readyToStream,
      });

      return {
        videoId,
        readyToStream: normalized.readyToStream,
        iframeUrl: normalized.playback.iframeUrl,
        hlsUrl: normalized.playback.hlsUrl,
      };
    } catch (err) {
      logger.warn('[WriteTimelinePostTool] CF Stream submission failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
        userId,
      });
      return null;
    }
  }

  private async reconcileCloudflareVideoPost(
    docRef: FirebaseFirestore.DocumentReference,
    videoId: string,
    userId: string
  ): Promise<void> {
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

    if (!accountId || !apiToken) {
      return;
    }

    try {
      const response = await fetch(
        `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream/${videoId}`,
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
        }
      );

      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as Record<string, unknown>;
      const result = body['result'] as Record<string, unknown> | null | undefined;

      if (!result) {
        return;
      }

      const normalized = normalizeCloudflareVideoForClient(videoId, result, customerCode);
      if (!normalized.readyToStream || !normalized.playback.iframeUrl) {
        return;
      }

      await docRef.update({
        cloudflareStatus: normalized.status,
        readyToStream: true,
        mediaUrl: normalized.playback.iframeUrl,
        videoUrl: normalized.playback.hlsUrl,
        duration: normalized.durationSeconds,
        playback: normalized.playback,
        ...(normalized.thumbnailUrl
          ? {
              thumbnailUrl: normalized.thumbnailUrl,
              poster: normalized.thumbnailUrl,
            }
          : {}),
        updatedAt: Timestamp.now(),
      });

      logger.info(
        '[WriteTimelinePostTool] Reconciled Cloudflare video immediately after post write',
        {
          userId,
          cloudflareVideoId: videoId,
        }
      );
    } catch (err) {
      logger.warn('[WriteTimelinePostTool] Immediate Cloudflare reconcile failed', {
        userId,
        cloudflareVideoId: videoId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
