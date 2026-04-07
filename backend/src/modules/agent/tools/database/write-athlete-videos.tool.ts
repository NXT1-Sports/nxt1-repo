/**
 * @fileoverview Write Athlete Videos Tool — Atomic writer for highlight/profile videos
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes distilled video links (Hudl highlights, YouTube, Vimeo, etc.) to the
 * top-level `Videos` collection.
 *
 * Each document follows the VideoDoc schema: ownerType, userId, sportId, type,
 * url, mediaUrl, thumbnailUrl, platform, isPublic, tags, stats, etc.
 * Queried by the profile API: GET /api/v1/auth/profile/:userId/videos
 *
 * Deduplicates by normalized `src` URL so repeated scrapes of the same profile
 * don't create duplicate video entries.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile.routes.js';
import { SyncDiffService, type PreviousVideoEntry } from '../../sync/index.js';
import { onDailySyncComplete } from '../../triggers/trigger.listeners.js';
import { logger } from '../../../../utils/logger.js';
import { normalizeVideoUrl } from './dedup-utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const VIDEOS_COLLECTION = 'Videos';
const USERS_COLLECTION = 'Users';
const MAX_VIDEOS = 100;

const VALID_PROVIDERS = new Set(['youtube', 'hudl', 'vimeo', 'twitter', 'other']);

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteAthleteVideosTool extends BaseTool {
  readonly name = 'write_athlete_videos';

  readonly description =
    'Writes athlete highlight and profile videos (Hudl, YouTube, Vimeo, etc.) to the Videos collection.\n\n' +
    'Call this after reading the "videos" section via read_distilled_section.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "hudl").\n' +
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

  override readonly allowedAgents = ['data_coordinator', 'performance_coordinator'] as const;
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

    const videos = input['videos'];
    if (!Array.isArray(videos) || videos.length === 0) {
      return { success: false, error: 'videos must be a non-empty array.' };
    }
    if (videos.length > MAX_VIDEOS) {
      return { success: false, error: `videos exceeds maximum of ${MAX_VIDEOS}.` };
    }

    // Validate user exists
    const userDoc = await this.db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) {
      return { success: false, error: `User "${userId}" not found.` };
    }
    const userData = userDoc.data() as Record<string, unknown>;

    try {
      const sportId = targetSport.trim().toLowerCase();
      const now = new Date().toISOString();

      context?.onProgress?.('Checking for duplicate videos…');

      // Fetch existing videos for dedup
      const existingSnap = await this.db
        .collection(VIDEOS_COLLECTION)
        .where('userId', '==', userId)
        .where('ownerType', '==', 'user')
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
          ownerType: 'user', // Required: profile route filters on this
          sportId, // Must match profile route's sportId query
          // ── Video data (canonical) ───────────────────────────────
          url: trimmedSrc, // VideoDoc canonical field
          mediaUrl: trimmedSrc, // Frontend mapTimelineDoc reads this
          src: trimmedSrc, // Legacy/internal reference
          type: 'highlight', // ProfilePostType — scraped videos are highlights
          platform: provider, // VideoDoc field (hudl, youtube, etc.)
          provider, // Legacy/internal reference
          source, // Scrape source slug
          isPublic: true, // Scraped highlights are public
          tags: [], // Empty by default
          stats: { views: 0, likes: 0, shares: 0 },
          createdAt: now,
          updatedAt: now,
        };

        if (videoId) record['videoId'] = videoId;
        if (poster) {
          record['poster'] = poster;
          record['thumbnailUrl'] = poster; // Frontend mapTimelineDoc reads this
        }
        if (title) record['title'] = title;

        const docRef = this.db.collection(VIDEOS_COLLECTION).doc();
        record['id'] = docRef.id;
        batch.set(docRef, record);
        written++;
      }

      if (written > 0) {
        context?.onProgress?.(`Writing ${written} video(s) to database…`);
        await batch.commit();
      }

      // Cache invalidation — route key format: profile:sub:videos:{userId}[:{sportId}]:{limit}
      context?.onProgress?.('Invalidating video caches…');
      try {
        const cache = getCacheService();
        const defaultLimit = 20;
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          // Match route cache key with default limit (most common)
          cache.del(`profile:sub:videos:${userId}:${sportId}:${defaultLimit}`),
          cache.del(`profile:sub:videos:${userId}:${defaultLimit}`),
          invalidateProfileCaches(
            userId,
            typeof userData['username'] === 'string' ? userData['username'] : undefined,
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
