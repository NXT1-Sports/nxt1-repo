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

import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { ScraperMediaService } from '../../integrations/social/scraper-media.service.js';
import {
  CLOUDFLARE_API_BASE_URL,
  getCloudflareHighlightPostId,
  normalizeCloudflareVideoForClient,
} from '../../../../../routes/core/upload/shared.js';
import { logger } from '../../../../../utils/logger.js';
import { resolveCreatedAt } from '../doc-date-utils.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const POSTS_COLLECTION = 'Posts';
const TEAMS_COLLECTION = 'Teams';
const MAX_POSTS_PER_CALL = 10;

const VALID_POST_TYPES = new Set(['text', 'image', 'video', 'announcement']);

const TeamPostEntrySchema = z
  .object({
    type: z.string().trim().min(1).optional(),
    content: z.string().trim().min(1).optional(),
    mediaUrls: z.array(z.string().trim().min(1)).optional(),
    title: z.string().trim().min(1).optional(),
    sportId: z.string().trim().min(1).optional(),
    isPinned: z.boolean().optional(),
  })
  .passthrough();

const WriteTeamPostInputSchema = z.object({
  teamId: z.string().trim().min(1),
  teamCode: z.string().trim().min(1),
  posts: z.array(TeamPostEntrySchema).min(1).max(MAX_POSTS_PER_CALL),
});

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
    '  • mediaUrls (REQUIRED when posting video or image): Array of image/video URLs. When the user\'s message contains an [Attached video: name — URL] annotation, you MUST extract that URL and pass it here with type set to "video". Never omit this field when media is present.\n' +
    '  • title (optional): Post title.\n' +
    '  • sportId (optional): Sport this post is related to.\n' +
    '  • isPinned (optional): Pin post to top of timeline.';

  readonly parameters = WriteTeamPostInputSchema;

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
    const parsed = WriteTeamPostInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { teamId, teamCode } = parsed.data;
    const rawPosts = parsed.data.posts;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      // Verify team exists and actor is authorized
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        return { success: false, error: `Team ${teamId} not found.` };
      }
      const teamData = (teamDoc.data() ?? {}) as Record<string, unknown>;
      const isAuthorized = await canManageTeamMutationForUser(
        this.db,
        context.userId,
        teamId,
        teamData
      );
      if (!isAuthorized) {
        return { success: false, error: 'Not authorized to post on behalf of this team.' };
      }

      // Resolve the team's default sport for post tagging.
      // Explicit sportId on each post overrides this; falls back to team sport.
      const teamSport =
        typeof teamData['sport'] === 'string' ? teamData['sport'].trim().toLowerCase() : undefined;

      const now = new Date().toISOString();
      const batch = this.db.batch();
      const pendingVideoReconciliations: Array<{
        docId: string;
        videoId: string;
        userId: string;
      }> = [];
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
        // Explicit sportId wins; fall back to team's sport so posts are always
        // visible on the team timeline's sport-filtered views.
        const resolvedSportId = (this.str(p, 'sportId') ?? teamSport)?.toLowerCase() ?? undefined;
        const isPinned = typeof p['isPinned'] === 'boolean' ? p['isPinned'] : false;

        const rawMediaUrls = Array.isArray(p['mediaUrls'])
          ? (p['mediaUrls'] as unknown[]).filter((u): u is string => typeof u === 'string')
          : [];

        const detectedVideoUrl = rawMediaUrls.find((url) => this.isLikelyVideoUrl(url));
        const sourceVideoUrl =
          type === 'video' ? (rawMediaUrls[0] ?? detectedVideoUrl) : detectedVideoUrl;
        const imageMediaUrls = rawMediaUrls.filter((url) => !this.isLikelyVideoUrl(url));
        const isVideoPost = !!sourceVideoUrl;
        const destinationBase = `Users/${context.userId}/posts`;

        if (isVideoPost && sourceVideoUrl) {
          // ── Video post: submit source URL directly to Cloudflare Stream.
          // Any post that includes video must be Cloudflare-backed; if CF
          // submission fails we skip the post so feed cards never render raw
          // signed Firebase URLs.

          context?.emitStage?.('uploading_assets', {
            icon: 'media',
            phase: 'submit_video_cloudflare',
          });

          logger.info('[WriteTeamPostTool] Submitting video to Cloudflare Stream', {
            teamId,
            teamCode,
            actorUserId: context.userId,
            sourceVideoUrl,
            backendUrl: (process.env['BACKEND_URL'] ?? '').replace(/\/$/, ''),
            environment: process.env['NODE_ENV'] ?? 'production',
          });

          const cfResult = await this.submitVideoToCloudflare(sourceVideoUrl, context.userId);

          if (!cfResult) {
            logger.warn('[WriteTeamPostTool] Skipping video post because CF submission failed', {
              teamId,
              actorUserId: context.userId,
            });
            skipped++;
            continue;
          }

          const cloudflareVideoId = cfResult.videoId;
          const docId = getCloudflareHighlightPostId(cloudflareVideoId);

          logger.info('[WriteTeamPostTool] Cloudflare submission completed', {
            teamId,
            teamCode,
            actorUserId: context.userId,
            cloudflareVideoId,
            readyToStream: cfResult.readyToStream,
            iframeUrl: cfResult.iframeUrl,
            hlsUrl: cfResult.hlsUrl,
            docId,
          });

          const docRef = this.db.collection(POSTS_COLLECTION).doc(docId);

          let promotedImages: string[] = imageMediaUrls;
          if (imageMediaUrls.length > 0) {
            const destinationPrefix = `${destinationBase}/${docRef.id}`;
            promotedImages = await ScraperMediaService.promoteMedia(
              imageMediaUrls,
              context.userId,
              destinationPrefix
            );
          }

          // If CF already processed the video (common for short clips), write
          // the post in ready state immediately to avoid the race condition
          // where the webhook fires before the Firestore doc is created.
          const alreadyReady = cfResult.readyToStream === true && !!cfResult.iframeUrl;
          if (alreadyReady) {
            logger.info('[WriteTeamPostTool] CF video already ready — writing post as playable', {
              teamId,
              cloudflareVideoId,
            });
          }

          batch.set(docRef, {
            teamId,
            userId: context.userId,
            type: 'video',
            content: content ?? '',
            ...(title ? { title } : {}),
            ...(resolvedSportId ? { sportId: resolvedSportId } : {}),
            isPinned,
            images: promotedImages,
            cloudflareVideoId,
            ...(alreadyReady
              ? {
                  cloudflareStatus: 'ready',
                  readyToStream: true,
                  mediaUrl: cfResult.iframeUrl,
                  videoUrl: cfResult.hlsUrl ?? undefined,
                  playback: {
                    hlsUrl: cfResult.hlsUrl ?? undefined,
                    iframeUrl: cfResult.iframeUrl,
                  },
                }
              : {
                  cloudflareStatus: 'inprogress',
                  readyToStream: false,
                  mediaUrl: null,
                  // Save embed URLs now — iframe works even while video is processing
                  ...(cfResult.iframeUrl ? { iframeUrl: cfResult.iframeUrl } : {}),
                  ...(cfResult.hlsUrl ? { videoUrl: cfResult.hlsUrl } : {}),
                  ...(cfResult.iframeUrl
                    ? {
                        playback: {
                          hlsUrl: cfResult.hlsUrl ?? undefined,
                          iframeUrl: cfResult.iframeUrl,
                        },
                      }
                    : {}),
                }),
            engagement: { likeCount: 0, commentCount: 0, shareCount: 0, viewCount: 0 },
            createdAt: resolveCreatedAt(undefined, undefined, now),
            updatedAt: now,
          });

          logger.info('[WriteTeamPostTool] Queued team post document write', {
            teamId,
            teamCode,
            postId: docId,
            actorUserId: context.userId,
            cloudflareVideoId,
            initialCloudflareStatus: alreadyReady ? 'ready' : 'inprogress',
            readyToStream: cfResult.readyToStream,
            mediaUrl: alreadyReady ? (cfResult.iframeUrl ?? null) : null,
          });

          if (!alreadyReady) {
            pendingVideoReconciliations.push({
              docId,
              videoId: cloudflareVideoId,
              userId: context.userId,
            });
          }
        } else {
          // ── Image / text / announcement post ────────────────────────────────
          // Promote thread-staged images to permanent storage so they survive
          // thread deletion. Writes canonical `images[]` field that the
          // firestore-posts adapter reads.
          const docRef = this.db.collection(POSTS_COLLECTION).doc();
          const destinationPrefix = `${destinationBase}/${docRef.id}`;

          let promotedImages: string[] = imageMediaUrls;
          if (imageMediaUrls.length > 0) {
            context?.emitStage?.('uploading_assets', {
              icon: 'upload',
              phase: 'upload_team_post_media',
            });
            promotedImages = await ScraperMediaService.promoteMedia(
              imageMediaUrls,
              context.userId,
              destinationPrefix
            );
          }

          batch.set(docRef, {
            teamId,
            userId: context.userId,
            type,
            content: content ?? '',
            ...(title ? { title } : {}),
            ...(resolvedSportId ? { sportId: resolvedSportId } : {}),
            isPinned,
            images: promotedImages,
            engagement: { likeCount: 0, commentCount: 0, shareCount: 0, viewCount: 0 },
            createdAt: resolveCreatedAt(undefined, undefined, now),
            updatedAt: now,
          });
        }

        written++;
      }

      if (written === 0) {
        return { success: false, error: 'No valid posts after validation.' };
      }

      context?.emitStage?.('submitting_job', {
        icon: 'document',
        written,
        phase: 'write_team_posts',
      });
      await batch.commit();

      logger.info('[WriteTeamPostTool] Batch commit completed', {
        teamId,
        teamCode,
        written,
        skipped,
        pendingVideoReconciliations: pendingVideoReconciliations.length,
      });

      await Promise.all(
        pendingVideoReconciliations.map((target) =>
          this.reconcileCloudflareVideoPost(target.docId, target.videoId, target.userId)
        )
      );

      // Invalidate team timeline and profile caches (all key variants)
      const cache = getCacheService();
      await Promise.all([
        cache.delByPrefix(`team:timeline:v1:${teamCode}:`),
        cache.delByPrefix(`team:profile:code:${teamCode}:`),
        cache.delByPrefix(`team:profile:id:${teamId}:`),
      ]);

      logger.info('[WriteTeamPostTool] Posts written', { teamId, teamCode, written, skipped });

      const pendingVideoCount = pendingVideoReconciliations.length;
      const processingNote =
        pendingVideoCount > 0
          ? `${pendingVideoCount} video post(s) are still processing in Cloudflare Stream and will become playable shortly.`
          : null;

      return {
        success: true,
        data: {
          written,
          skipped,
          pendingVideoCount,
          ...(processingNote ? { processingNote } : {}),
          message:
            `Created ${written} team post(s)${skipped > 0 ? `, skipped ${skipped}` : ''}.` +
            (processingNote ? ` ${processingNote}` : ''),
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

  /**
   * Heuristic media classifier for URLs supplied by Agent X.
   * Treats common video extensions and content-type hints as video.
   */
  private isLikelyVideoUrl(url: string): boolean {
    const normalized = url.toLowerCase();
    if (/(\.mp4|\.mov|\.m4v|\.webm|\.mkv)(\?|#|$)/.test(normalized)) {
      return true;
    }
    if (/(\?|&)(content-?type|mimeType)=video\//i.test(url)) {
      return true;
    }
    return /\/video\//.test(normalized);
  }

  /**
   * Submit a video URL to Cloudflare Stream via copy-from-URL.
   * Accepts any HTTPS URL (thread-staged Firebase, external scraped, etc.).
   * Returns the Cloudflare video UID, or null if CF is unconfigured / fails.
   * Failure is non-fatal — the post writes with the raw source URL as fallback.
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
        '[WriteTeamPostTool] Cloudflare not configured — video saved as Firebase URL only',
        { userId }
      );
      return null;
    }

    try {
      const webhookBackendUrl = (process.env['BACKEND_URL'] ?? '').replace(/\/$/, '');
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
            nxt1_context: 'agent_team_post',
            // nxt1_env: process.env['NODE_ENV'] ?? 'production',
            nxt1_env: 'staging',
            webhook_backend_url: (process.env['BACKEND_URL'] ?? '').replace(/\/$/, ''),
          },
        }),
      });

      logger.info('[WriteTeamPostTool] Cloudflare copy API responded', {
        userId,
        sourceVideoUrl: videoUrl,
        webhookBackendUrl,
        status: response.status,
        ok: response.ok,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        logger.warn('[WriteTeamPostTool] CF Stream copy API error (non-fatal)', {
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
        logger.warn('[WriteTeamPostTool] CF Stream copy API returned no video UID', { userId });
        return null;
      }

      const normalized = normalizeCloudflareVideoForClient(videoId, result ?? {}, customerCode);

      logger.info('[WriteTeamPostTool] Video submitted to Cloudflare Stream', {
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
      logger.warn('[WriteTeamPostTool] CF Stream submission failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
        userId,
      });
      return null;
    }
  }

  private async reconcileCloudflareVideoPost(
    docId: string,
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
        logger.warn('[WriteTeamPostTool] Immediate Cloudflare reconcile returned non-2xx', {
          userId,
          cloudflareVideoId: videoId,
          docId,
          status: response.status,
        });
        return;
      }

      const body = (await response.json()) as Record<string, unknown>;
      const result = body['result'] as Record<string, unknown> | null | undefined;

      if (!result) {
        logger.warn('[WriteTeamPostTool] Immediate Cloudflare reconcile returned no result', {
          userId,
          cloudflareVideoId: videoId,
          docId,
        });
        return;
      }

      const normalized = normalizeCloudflareVideoForClient(videoId, result, customerCode);
      if (!normalized.readyToStream || !normalized.playback.iframeUrl) {
        logger.info(
          '[WriteTeamPostTool] Immediate Cloudflare reconcile found video not ready yet',
          {
            userId,
            cloudflareVideoId: videoId,
            docId,
            status: normalized.status,
            readyToStream: normalized.readyToStream,
            iframeUrl: normalized.playback.iframeUrl,
          }
        );
        // Start a background poller — works even on localhost (no webhook needed)
        this.startBackgroundVideoPoller(docId, videoId, userId);
        return;
      }

      await this.db
        .collection(POSTS_COLLECTION)
        .doc(docId)
        .update({
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

      logger.info('[WriteTeamPostTool] Reconciled Cloudflare video immediately after post write', {
        userId,
        cloudflareVideoId: videoId,
        docId,
      });
    } catch (err) {
      logger.warn('[WriteTeamPostTool] Immediate Cloudflare reconcile failed', {
        userId,
        cloudflareVideoId: videoId,
        docId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Fire-and-forget background poller.
   * Polls Cloudflare every 15 seconds for up to 10 minutes until the video
   * becomes ready, then updates the Firestore post and invalidates caches.
   * Works on localhost (no webhook delivery required).
   */
  private startBackgroundVideoPoller(docId: string, videoId: string, userId: string): void {
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

    if (!accountId || !apiToken) return;

    const POLL_INTERVAL_MS = 15_000; // 15 seconds
    const MAX_ATTEMPTS = 40; // 10 minutes total
    let attempts = 0;

    const poll = async (): Promise<void> => {
      attempts++;
      try {
        const response = await fetch(
          `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream/${videoId}`,
          { headers: { Authorization: `Bearer ${apiToken}` } }
        );

        if (!response.ok) {
          logger.warn('[WriteTeamPostTool] Background poller got non-2xx from CF', {
            cloudflareVideoId: videoId,
            docId,
            status: response.status,
            attempt: attempts,
          });
          if (attempts < MAX_ATTEMPTS)
            setTimeout(() => {
              void poll();
            }, POLL_INTERVAL_MS);
          return;
        }

        const body = (await response.json()) as Record<string, unknown>;
        const result = body['result'] as Record<string, unknown> | null | undefined;
        if (!result) {
          if (attempts < MAX_ATTEMPTS)
            setTimeout(() => {
              void poll();
            }, POLL_INTERVAL_MS);
          return;
        }

        const normalized = normalizeCloudflareVideoForClient(videoId, result, customerCode);
        logger.info('[WriteTeamPostTool] Background poller check', {
          cloudflareVideoId: videoId,
          docId,
          attempt: attempts,
          status: normalized.status,
          readyToStream: normalized.readyToStream,
        });

        if (!normalized.readyToStream || !normalized.playback.iframeUrl) {
          if (attempts < MAX_ATTEMPTS)
            setTimeout(() => {
              void poll();
            }, POLL_INTERVAL_MS);
          return;
        }

        // Video is ready — update Firestore
        await this.db
          .collection(POSTS_COLLECTION)
          .doc(docId)
          .update({
            cloudflareStatus: normalized.status,
            readyToStream: true,
            mediaUrl: normalized.playback.iframeUrl,
            videoUrl: normalized.playback.hlsUrl,
            duration: normalized.durationSeconds,
            playback: normalized.playback,
            ...(normalized.thumbnailUrl
              ? { thumbnailUrl: normalized.thumbnailUrl, poster: normalized.thumbnailUrl }
              : {}),
            updatedAt: Timestamp.now(),
          });

        // Invalidate all caches for this team post
        const cache = getCacheService();
        const postDoc = await this.db.collection(POSTS_COLLECTION).doc(docId).get();
        const teamId = postDoc.data()?.['teamId'] as string | undefined;
        if (teamId) {
          const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
          const teamCode = teamDoc.data()?.['teamCode'] as string | undefined;
          if (teamCode) {
            await Promise.all([
              cache.delByPrefix(`team:timeline:v1:${teamCode}:`),
              cache.delByPrefix(`team:profile:code:${teamCode}:`),
              cache.delByPrefix(`team:profile:id:${teamId}:`),
            ]);
          }
        }

        logger.info('[WriteTeamPostTool] Background poller updated video post to ready', {
          cloudflareVideoId: videoId,
          docId,
          userId,
          attempts,
        });
      } catch (err) {
        logger.warn('[WriteTeamPostTool] Background poller error', {
          cloudflareVideoId: videoId,
          docId,
          attempt: attempts,
          error: err instanceof Error ? err.message : String(err),
        });
        if (attempts < MAX_ATTEMPTS)
          setTimeout(() => {
            void poll();
          }, POLL_INTERVAL_MS);
      }
    };

    // First retry after initial interval
    setTimeout(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    logger.info('[WriteTeamPostTool] Background video poller started', {
      cloudflareVideoId: videoId,
      docId,
      userId,
      pollIntervalMs: POLL_INTERVAL_MS,
      maxAttempts: MAX_ATTEMPTS,
    });
  }
}
