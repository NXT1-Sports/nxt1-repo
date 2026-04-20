/**
 * @fileoverview Write Athlete Videos Tool — Atomic writer for athlete video posts
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes distilled video links (Hudl, YouTube, Vimeo, etc.) to the
 * top-level `Posts` collection with `type: 'video'`.
 *
 * Each document follows the Posts schema: userId, type, visibility, sportId,
 * url, mediaUrl, thumbnailUrl, platform, stats, organizationId, teamId, etc.
 * Queried by the profile API: GET /api/v1/auth/profile/:userId/videos
 *
 * Deduplicates by normalized `src` URL so repeated scrapes of the same profile
 * don't create duplicate post entries.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../services/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile/shared.js';
import { SyncDiffService, type PreviousVideoEntry } from '../../sync/index.js';
import { getAnalyticsLoggerService } from '../../../../services/analytics-logger.service.js';
import { onDailySyncComplete } from '../../triggers/trigger.listeners.js';
import { logger } from '../../../../utils/logger.js';
import { normalizeVideoUrl } from './dedup-utils.js';
import { resolveCreatedAt } from './doc-date-utils.js';
import { PostVisibility } from '@nxt1/core';

// ─── Constants ──────────────────────────────────────────────────────────────

const POSTS_COLLECTION = 'Posts';
const MAX_VIDEOS = 100;

const VALID_PROVIDERS = new Set(['youtube', 'hudl', 'vimeo', 'twitter', 'other']);

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteAthleteVideosTool extends BaseTool {
  readonly name = 'write_athlete_videos';

  readonly description =
    'Writes athlete videos (Hudl, YouTube, Vimeo, etc.) to the Posts collection ' +
    'as video posts.\n\n' +
    'Call this after reading the "videos" section via read_distilled_section.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "hudl").\n' +
    '- sourceUrl (optional): The URL that was scraped to extract this data.\n' +
    '- profileUrl (optional): The athlete profile URL on the source platform.\n' +
    '- videos (required): Array of video objects:\n' +
    '  • src (required): Full embed or direct URL of the video.\n' +
    '  • provider (required): "youtube", "hudl", "vimeo", "twitter", or "other".\n' +
    '  • videoId (optional): Platform-specific video ID.\n' +
    '  • poster (optional): Thumbnail/poster image URL.\n' +
    '  • title (optional): Video title or description.';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      targetSport: { type: 'string' },
      source: { type: 'string' },
      sourceUrl: { type: 'string' },
      profileUrl: { type: 'string' },
      videos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            src: { type: 'string' },
            provider: {
              type: 'string',
              enum: ['youtube', 'hudl', 'vimeo', 'twitter', 'other'],
            },
            videoId: { type: 'string' },
            poster: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['src', 'provider'],
        },
      },
    },
    required: ['userId', 'targetSport', 'source', 'videos'],
  } as const;

  override readonly allowedAgents = [
    'data_coordinator',
    'performance_coordinator',
    'general',
  ] as const;
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
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');
    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');
    const sourceUrl = this.str(input, 'sourceUrl') ?? this.str(input, 'profileUrl') ?? undefined;

    const videos = input['videos'];
    if (!Array.isArray(videos) || videos.length === 0) {
      return { success: false, error: 'videos must be a non-empty array.' };
    }
    if (videos.length > MAX_VIDEOS) {
      return { success: false, error: `videos exceeds maximum of ${MAX_VIDEOS}.` };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:write_athlete_videos',
      });
      const userData = accessGrant.targetUserData;
      const sportId = targetSport.trim().toLowerCase();
      const authorizedSportSelection = resolveAuthorizedTargetSportSelection(
        userData,
        sportId,
        accessGrant
      );
      if (!accessGrant.isSelfWrite && !authorizedSportSelection) {
        return { success: false, error: 'Not authorized to write athlete videos for this sport.' };
      }
      const now = new Date().toISOString();

      context?.onProgress?.('Checking for duplicate videos…');

      // Fetch existing video posts for dedup
      const existingSnap = await this.db
        .collection(POSTS_COLLECTION)
        .where('userId', '==', userId)
        .where('type', '==', 'video')
        .where('sportId', '==', sportId)
        .get();

      const existingKeys = new Set<string>();
      const previousVideos: PreviousVideoEntry[] = [];
      for (const doc of existingSnap.docs) {
        const data = doc.data();
        const src = String(data['src'] ?? data['url'] ?? '');
        existingKeys.add(normalizeVideoUrl(src));
        previousVideos.push({
          src,
          provider: String(data['provider'] ?? data['platform'] ?? 'other'),
        });
      }

      let written = 0;
      let skipped = 0;

      const batch = this.db.batch();

      // ── Resolve organizationId / teamId from user's sports array (once) ──
      const sports = userData['sports'] as Array<Record<string, unknown>> | undefined;
      const sportEntry =
        authorizedSportSelection?.sportRecord ??
        sports?.find((s) => {
          const sportKey =
            typeof s['sport'] === 'string'
              ? s['sport'].toLowerCase()
              : typeof s['id'] === 'string'
                ? s['id'].toLowerCase()
                : null;
          return sportKey === sportId;
        });
      const sportTeam =
        sportEntry && typeof sportEntry['team'] === 'object' && sportEntry['team'] !== null
          ? (sportEntry['team'] as Record<string, unknown>)
          : undefined;
      const teamId =
        authorizedSportSelection?.teamId ??
        (sportEntry?.['teamId'] as string) ??
        (sportTeam?.['teamId'] as string) ??
        (userData['teamId'] as string) ??
        undefined;
      const organizationId =
        authorizedSportSelection?.organizationId ??
        (sportEntry?.['organizationId'] as string) ??
        (sportTeam?.['organizationId'] as string) ??
        (userData['organizationId'] as string) ??
        undefined;

      for (const video of videos) {
        if (!video || typeof video !== 'object') {
          skipped++;
          continue;
        }
        const v = video as Record<string, unknown>;

        const src = this.str(v, 'src');
        if (!src || src.trim().length === 0) {
          skipped++;
          continue;
        }

        const normalizedSrc = normalizeVideoUrl(src.trim());

        // Provider validation / fallback
        const rawProvider = this.str(v, 'provider') ?? 'other';
        const provider = VALID_PROVIDERS.has(rawProvider) ? rawProvider : 'other';

        // Dedup check
        if (existingKeys.has(normalizedSrc)) {
          skipped++;
          continue;
        }
        existingKeys.add(normalizedSrc);

        const videoId = this.str(v, 'videoId');
        const poster = this.str(v, 'poster');
        const title = this.str(v, 'title');
        const trimmedSrc = src.trim();

        const record: Record<string, unknown> = {
          // ── Identity & ownership ─────────────────────────────────
          userId,
          ownerType: 'user', // Backwards compat with existing queries
          sportId, // Must match profile route's sportId query
          // ── Referential integrity (Phase 5) ──────────────────────
          ...(teamId ? { teamId } : {}),
          ...(organizationId ? { organizationId } : {}),
          // ── Video data (canonical) ───────────────────────────────
          url: trimmedSrc, // VideoDoc canonical field
          mediaUrl: trimmedSrc, // Frontend mapTimelineDoc reads this
          src: trimmedSrc, // Legacy/internal reference
          type: 'video', // PostType
          visibility: PostVisibility.PUBLIC, // Video posts are public
          platform: provider, // hudl, youtube, etc.
          provider, // Legacy/internal reference
          source, // Scrape source slug
          isPublic: true, // Backwards compat
          tags: [], // Empty by default
          stats: { views: 0, likes: 0, shares: 0 },
          // Data lineage
          extractedAt: now,
          createdAt: resolveCreatedAt(undefined, undefined, now),
          updatedAt: now,
        };
        if (sourceUrl) record['sourceUrl'] = sourceUrl;

        if (videoId) record['videoId'] = videoId;
        if (poster) {
          record['poster'] = poster;
          record['thumbnailUrl'] = poster; // Frontend mapTimelineDoc reads this
        }
        if (title) record['title'] = title;

        const docRef = this.db.collection(POSTS_COLLECTION).doc();
        record['id'] = docRef.id;
        batch.set(docRef, record);
        written++;
      }

      if (written > 0) {
        context?.onProgress?.(`Writing ${written} video(s) to database…`);
        await batch.commit();
      }

      // Cache invalidation — route key format: profile:videos:{userId}[:{sportId}]:{limit}
      context?.onProgress?.('Invalidating video caches…');
      try {
        const cache = getCacheService();
        const defaultLimit = 20;
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          // Match route cache key with default limit (most common)
          cache.del(`profile:videos:${userId}:${sportId}:${defaultLimit}`),
          cache.del(`profile:videos:${userId}:${defaultLimit}`),
          invalidateProfileCaches(
            userId,
            typeof userData['unicode'] === 'string' ? userData['unicode'] : null
          ),
        ]);
      } catch {
        // Best-effort
      }

      // ── Delta computation & fire trigger for Agent X ──────────────────
      if (written > 0) {
        try {
          const diffService = new SyncDiffService();
          const extractedProfile = {
            platform: source,
            profileUrl: '',
            videos: (videos as Record<string, unknown>[])
              .filter(
                (v) =>
                  v &&
                  typeof v === 'object' &&
                  typeof (v as Record<string, unknown>)['src'] === 'string'
              )
              .map((v) => {
                const vid = v as Record<string, unknown>;
                return {
                  src: String(vid['src'] ?? ''),
                  provider: String(vid['provider'] ?? 'other') as
                    | 'youtube'
                    | 'hudl'
                    | 'vimeo'
                    | 'twitter'
                    | 'other',
                  videoId: typeof vid['videoId'] === 'string' ? vid['videoId'] : undefined,
                  title: typeof vid['title'] === 'string' ? vid['title'] : undefined,
                };
              }),
          };

          const delta = diffService.diff(
            userId,
            sportId,
            source,
            { videos: previousVideos },
            extractedProfile
          );

          if (!delta.isEmpty) {
            logger.info('[WriteAthleteVideos] Delta detected, firing sync trigger', {
              userId,
              sport: sportId,
              newVideos: delta.summary.newVideos,
            });
            onDailySyncComplete(delta).catch((err) => {
              logger.warn('[WriteAthleteVideos] Trigger dispatch failed', {
                userId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        } catch (err) {
          // Delta/trigger is non-critical — log and continue
          logger.warn('[WriteAthleteVideos] Delta computation failed', {
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (written > 0) {
        await getAnalyticsLoggerService().safeTrack({
          subjectId: userId,
          subjectType: 'user',
          domain: 'system',
          eventType: 'tool_write_completed',
          source: accessGrant.isSelfWrite ? 'user' : 'agent',
          actorUserId: context.userId,
          value: written,
          tags: ['videos', sportId, source],
          payload: {
            toolName: this.name,
            sportId,
            videosWritten: written,
            videosSkipped: skipped,
          },
          metadata: {
            initiatedBy: 'write-athlete-videos',
          },
        });
      }

      return {
        success: true,
        data: {
          userId,
          sportId,
          source,
          written,
          skipped,
          message: `Wrote ${written} video(s) for "${sportId}" from "${source}" (${skipped} skipped/duplicates).`,
        },
      };
    } catch (err) {
      logger.error('[WriteAthleteVideos] Failed to write athlete videos', {
        userId,
        sport: targetSport,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write athlete videos',
      };
    }
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  // normalizeVideoSrc replaced by shared normalizeVideoUrl from dedup-utils
}
