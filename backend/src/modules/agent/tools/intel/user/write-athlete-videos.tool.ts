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

import {
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../../services/profile/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import {
  CLOUDFLARE_API_BASE_URL,
  buildCloudflarePlaybackUrls,
  getCloudflareHighlightPostId,
  normalizeCloudflareVideoForClient,
} from '../../../../../routes/core/upload/shared.js';
import { logger } from '../../../../../utils/logger.js';
import { normalizeVideoUrl } from '../dedup-utils.js';
import { resolveCreatedAt } from '../doc-date-utils.js';
import { PostVisibility } from '@nxt1/core';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const POSTS_COLLECTION = 'Posts';
const MAX_VIDEOS = 100;
const MAX_BACKEND_CLOUDFLARE_UPLOAD_BYTES = 512 * 1024 * 1024;

const VALID_PROVIDERS = new Set(['youtube', 'hudl', 'vimeo', 'twitter', 'cloudflare', 'other']);

type ExistingVideoPost = {
  readonly ref: DocumentReference;
  readonly data: DocumentData;
};

type CloudflarePlaybackFields = {
  readonly hlsUrl: string | null;
  readonly dashUrl: string | null;
  readonly iframeUrl: string | null;
};

type FirebaseStorageReference = {
  readonly bucketName?: string;
  readonly storagePath: string;
};

export type CloudflareVideoPostFields = {
  readonly cloudflareVideoId: string;
  readonly cloudflareStatus: string;
  readonly readyToStream: boolean;
  readonly mediaUrl: string | null;
  readonly iframeUrl: string;
  readonly videoUrl: string;
  readonly playback: CloudflarePlaybackFields;
  readonly thumbnailUrl: string;
  readonly poster: string;
  readonly duration?: number;
};

const CLOUDFLARE_STATUS_READY = 'ready';
const CLOUDFLARE_STATUS_IN_PROGRESS = 'inprogress';

const cloudflareVideoKey = (cloudflareVideoId: string): string =>
  `cloudflare:${cloudflareVideoId.trim()}`;

const cloudflareDefaultIframeUrl = (cloudflareVideoId: string): string =>
  `https://iframe.videodelivery.net/${cloudflareVideoId}`;

const cloudflareDefaultHlsUrl = (cloudflareVideoId: string): string =>
  `https://videodelivery.net/${cloudflareVideoId}/manifest/video.m3u8`;

const cloudflareDefaultDashUrl = (cloudflareVideoId: string): string =>
  `https://videodelivery.net/${cloudflareVideoId}/manifest/video.mpd`;

const cloudflareDefaultThumbnailUrl = (cloudflareVideoId: string): string =>
  `https://videodelivery.net/${cloudflareVideoId}/thumbnails/thumbnail.jpg`;

const storageVideoKey = (storagePath: string): string => `storage:${storagePath.trim()}`;

function trimString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function playbackString(
  playback: Record<string, unknown> | undefined,
  ...keys: readonly string[]
): string | null {
  if (!playback) return null;
  for (const key of keys) {
    const value = trimString(playback[key]);
    if (value) return value;
  }
  return null;
}

export function resolveCloudflareVideoPostFields(
  video: Record<string, unknown>,
  customerCode: string | undefined
): CloudflareVideoPostFields | null {
  const cloudflareVideoId = trimString(video['cloudflareVideoId']);
  if (!cloudflareVideoId) return null;

  const playback =
    typeof video['playback'] === 'object' && video['playback'] !== null
      ? (video['playback'] as Record<string, unknown>)
      : undefined;
  const directHlsUrl = trimString(video['hlsUrl']) ?? playbackString(playback, 'hlsUrl', 'hls');
  const directDashUrl = trimString(video['dashUrl']) ?? playbackString(playback, 'dashUrl', 'dash');
  const directIframeUrl =
    trimString(video['iframeUrl']) ?? playbackString(playback, 'iframeUrl', 'iframe');
  const generatedPlayback = buildCloudflarePlaybackUrls(cloudflareVideoId, customerCode, {
    ...(directHlsUrl ? { hls: directHlsUrl } : {}),
    ...(directDashUrl ? { dash: directDashUrl } : {}),
  });
  const iframeUrl =
    directIframeUrl ?? generatedPlayback.iframeUrl ?? cloudflareDefaultIframeUrl(cloudflareVideoId);
  const hlsUrl =
    directHlsUrl ?? generatedPlayback.hlsUrl ?? cloudflareDefaultHlsUrl(cloudflareVideoId);
  const dashUrl =
    directDashUrl ?? generatedPlayback.dashUrl ?? cloudflareDefaultDashUrl(cloudflareVideoId);
  const providedStatus = trimString(video['cloudflareStatus']) ?? trimString(video['status']);
  const readyToStream =
    typeof video['readyToStream'] === 'boolean'
      ? video['readyToStream']
      : providedStatus
        ? providedStatus === CLOUDFLARE_STATUS_READY
        : true;
  const cloudflareStatus =
    providedStatus ?? (readyToStream ? CLOUDFLARE_STATUS_READY : CLOUDFLARE_STATUS_IN_PROGRESS);
  const thumbnailUrl =
    trimString(video['thumbnailUrl']) ??
    trimString(video['poster']) ??
    trimString(video['previewUrl']) ??
    cloudflareDefaultThumbnailUrl(cloudflareVideoId);
  const duration = finiteNumber(video['durationSeconds']) ?? finiteNumber(video['duration']);

  return {
    cloudflareVideoId,
    cloudflareStatus,
    readyToStream,
    mediaUrl: readyToStream ? iframeUrl : null,
    iframeUrl,
    videoUrl: hlsUrl,
    playback: {
      hlsUrl,
      dashUrl,
      iframeUrl,
    },
    thumbnailUrl,
    poster: thumbnailUrl,
    ...(duration !== undefined ? { duration } : {}),
  };
}

export function shouldImportVideoSourceToCloudflare(
  sourceUrl: string,
  provider: string | null | undefined
): boolean {
  const normalized = sourceUrl.toLowerCase();
  if (provider === 'cloudflare') return false;
  if (/(^|\.)storage\.googleapis\.com$/i.test(safeHostname(sourceUrl))) return true;
  if (/(^|\.)firebasestorage\.googleapis\.com$/i.test(safeHostname(sourceUrl))) return true;
  if (/(^|\.)firebasestorage\.app$/i.test(safeHostname(sourceUrl))) return true;
  if (/\/(uploads|threads)\/[^?#]*\/video\//i.test(normalized)) return true;
  return /\.(mp4|mov|m4v|webm|mkv)(\?|#|$)/i.test(sourceUrl);
}

export function parseFirebaseStorageReference(
  urlOrPath: string,
  fallbackBucketName?: string
): FirebaseStorageReference | null {
  const raw = urlOrPath.trim();
  if (!raw) return null;

  if (raw.startsWith('Users/')) {
    return { ...(fallbackBucketName ? { bucketName: fallbackBucketName } : {}), storagePath: raw };
  }

  try {
    const parsed = new URL(raw);
    if (parsed.hostname === 'storage.googleapis.com') {
      const pathWithoutLeadingSlash = parsed.pathname.slice(1);
      const slashIdx = pathWithoutLeadingSlash.indexOf('/');
      if (slashIdx === -1) return null;
      return {
        bucketName: pathWithoutLeadingSlash.slice(0, slashIdx),
        storagePath: decodeURIComponent(pathWithoutLeadingSlash.slice(slashIdx + 1)),
      };
    }

    if (parsed.hostname === 'firebasestorage.googleapis.com') {
      const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (!match) return null;
      return {
        bucketName: match[1],
        storagePath: decodeURIComponent(match[2]),
      };
    }

    if (parsed.hostname.endsWith('.firebasestorage.app')) {
      const storagePath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
      return storagePath ? { bucketName: parsed.hostname, storagePath } : null;
    }
  } catch {
    return null;
  }

  return null;
}

function safeHostname(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return '';
  }
}

const VideoEntrySchema = z
  .object({
    src: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1).optional(),
    mediaUrl: z.string().trim().min(1).optional(),
    storagePath: z.string().trim().min(1).optional(),
    provider: z.string().trim().min(1).optional(),
    videoId: z.string().trim().min(1).optional(),
    poster: z.string().trim().min(1).optional(),
    thumbnailUrl: z.string().trim().min(1).optional(),
    cloudflareVideoId: z.string().trim().min(1).optional(),
    cloudflareStatus: z.string().trim().min(1).optional(),
    readyToStream: z.boolean().optional(),
    durationSeconds: z.union([z.number(), z.string().trim().min(1)]).optional(),
    duration: z.union([z.number(), z.string().trim().min(1)]).optional(),
    playback: z
      .object({
        hlsUrl: z.string().trim().min(1).optional(),
        hls: z.string().trim().min(1).optional(),
        dashUrl: z.string().trim().min(1).optional(),
        dash: z.string().trim().min(1).optional(),
        iframeUrl: z.string().trim().min(1).optional(),
        iframe: z.string().trim().min(1).optional(),
      })
      .passthrough()
      .optional(),
    title: z.string().trim().min(1).optional(),
    playlistId: z.string().trim().min(1).optional(),
    playlistName: z.string().trim().min(1).optional(),
    visionSummary: z.string().trim().optional(),
  })
  .passthrough();

const WriteAthleteVideosInputSchema = z.object({
  userId: z.string().trim().min(1),
  targetSport: z.string().trim().min(1),
  source: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1).optional(),
  profileUrl: z.string().trim().min(1).optional(),
  videos: z.array(VideoEntrySchema).min(1).max(MAX_VIDEOS),
});

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
    '  • poster / thumbnailUrl (optional): Thumbnail/poster image URL.\n' +
    '  • cloudflareVideoId / cloudflareStatus / readyToStream / playback (optional): Required when the video came from an Agent X Cloudflare upload. Preserve these fields so the profile streams through Cloudflare instead of storing a raw download URL.\n' +
    '  • storagePath (optional): Firebase/GCS object path for uploaded videos; pass it when available so expired signed URLs can be re-signed before Cloudflare import.\n' +
    'Direct uploaded video URLs are imported to Cloudflare Stream before the profile feed post is written. The tool will not create a feed card backed only by a raw Firebase/GCS signed URL.\n' +
    '  • playlistId / playlistName (optional): Library playlist grouping.\n' +
    '  • title (optional): Video title or description.';

  readonly parameters = WriteAthleteVideosInputSchema;

  override readonly allowedAgents = [
    'data_coordinator',
    'performance_coordinator',
    'strategy_coordinator',
  ] as const;
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
    const parsed = WriteAthleteVideosInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { userId, targetSport, source, videos } = parsed.data;
    const sourceUrl = parsed.data.sourceUrl ?? parsed.data.profileUrl;

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

      context?.emitStage?.('fetching_data', {
        icon: 'media',
        phase: 'check_duplicate_videos',
      });

      // Fetch existing video posts for dedup
      const existingSnap = await this.db
        .collection(POSTS_COLLECTION)
        .where('userId', '==', userId)
        .where('type', '==', 'video')
        .where('sportId', '==', sportId)
        .get();

      const existingByKey = new Map<string, ExistingVideoPost>();
      for (const doc of existingSnap.docs) {
        const data = doc.data();
        const src = String(data['src'] ?? data['url'] ?? '');
        const normalizedSrc = normalizeVideoUrl(src);
        if (normalizedSrc) existingByKey.set(normalizedSrc, { ref: doc.ref, data });
        const storageReference = parseFirebaseStorageReference(src);
        if (storageReference) {
          existingByKey.set(storageVideoKey(storageReference.storagePath), { ref: doc.ref, data });
        }
        const cloudflareVideoId = trimString(data['cloudflareVideoId']);
        if (cloudflareVideoId) {
          existingByKey.set(cloudflareVideoKey(cloudflareVideoId), { ref: doc.ref, data });
        }
      }
      const processedKeys = new Set<string>();

      let written = 0;
      let updated = 0;
      let skipped = 0;
      let failedCloudflareImports = 0;
      const pendingVideoReconciliations: Array<{ docId: string; videoId: string }> = [];

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

        let cloudflareFields = resolveCloudflareVideoPostFields(
          v,
          process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE']
        );
        const src =
          this.str(v, 'src') ??
          this.str(v, 'url') ??
          this.str(v, 'mediaUrl') ??
          cloudflareFields?.iframeUrl ??
          null;
        if (!src || src.trim().length === 0) {
          skipped++;
          continue;
        }

        const rawProvider = this.str(v, 'provider') ?? 'other';
        const storageReference =
          parseFirebaseStorageReference(src) ??
          parseFirebaseStorageReference(this.str(v, 'storagePath') ?? '');
        if (!cloudflareFields && shouldImportVideoSourceToCloudflare(src, rawProvider)) {
          context?.emitStage?.('uploading_assets', {
            icon: 'media',
            phase: 'import_video_cloudflare',
          });
          cloudflareFields = storageReference
            ? await this.uploadStorageVideoToCloudflare(
                storageReference,
                userId,
                this.str(v, 'title')
              )
            : await this.submitVideoToCloudflare(src, userId);
          if (!cloudflareFields) {
            failedCloudflareImports++;
            skipped++;
            continue;
          }
        }

        const normalizedSrc = normalizeVideoUrl(src.trim());

        // Provider validation / fallback
        const provider = cloudflareFields
          ? 'cloudflare'
          : VALID_PROVIDERS.has(rawProvider)
            ? rawProvider
            : 'other';

        // Dedup check
        const existingVideo =
          (cloudflareFields
            ? existingByKey.get(cloudflareVideoKey(cloudflareFields.cloudflareVideoId))
            : undefined) ??
          (storageReference
            ? existingByKey.get(storageVideoKey(storageReference.storagePath))
            : undefined) ??
          existingByKey.get(normalizedSrc);
        const cfKey = cloudflareFields
          ? cloudflareVideoKey(cloudflareFields.cloudflareVideoId)
          : null;
        const objectKey = storageReference ? storageVideoKey(storageReference.storagePath) : null;

        if (existingVideo) {
          if (
            cloudflareFields &&
            !this.hasEquivalentCloudflareFields(existingVideo.data, cloudflareFields)
          ) {
            batch.set(
              existingVideo.ref,
              {
                ...cloudflareFields,
                platform: 'cloudflare',
                provider: 'cloudflare',
                updatedAt: now,
              },
              { merge: true }
            );
            existingByKey.set(
              cloudflareVideoKey(cloudflareFields.cloudflareVideoId),
              existingVideo
            );
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
        if (
          !normalizedSrc ||
          processedKeys.has(normalizedSrc) ||
          (cfKey && processedKeys.has(cfKey)) ||
          (objectKey && processedKeys.has(objectKey))
        ) {
          skipped++;
          continue;
        }
        processedKeys.add(normalizedSrc);
        if (cfKey) processedKeys.add(cfKey);
        if (objectKey) processedKeys.add(objectKey);

        const videoId = this.str(v, 'videoId');
        const poster = this.str(v, 'poster');
        const title = this.str(v, 'title');
        const playlistId = this.str(v, 'playlistId');
        const playlistName = this.str(v, 'playlistName');
        const visionSummary = this.str(v, 'visionSummary');
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
          mediaUrl: cloudflareFields ? cloudflareFields.mediaUrl : trimmedSrc, // Frontend mapTimelineDoc reads this
          src: trimmedSrc, // Legacy/internal reference
          type: 'video', // PostType
          visibility: PostVisibility.PUBLIC, // Video posts are public
          platform: provider, // hudl, youtube, etc.
          provider, // Legacy/internal reference
          source, // Scrape source slug
          isPublic: true, // Backwards compat
          tags: [], // Empty by default
          stats: { views: 0, shares: 0 },
          // Data lineage
          extractedAt: now,
          createdAt: resolveCreatedAt(undefined, undefined, now),
          updatedAt: now,
        };
        if (sourceUrl) record['sourceUrl'] = sourceUrl;
        if (storageReference) record['storagePath'] = storageReference.storagePath;

        if (cloudflareFields) {
          Object.assign(record, cloudflareFields);
        }

        if (videoId) record['videoId'] = videoId;
        if (poster && !cloudflareFields) {
          record['poster'] = poster;
          record['thumbnailUrl'] = poster; // Frontend mapTimelineDoc reads this
        }
        if (title) record['title'] = title;
        if (playlistId) record['playlistId'] = playlistId;
        if (playlistName) record['playlistName'] = playlistName;
        if (visionSummary) record['visionSummary'] = visionSummary;

        const docRef = cloudflareFields
          ? this.db
              .collection(POSTS_COLLECTION)
              .doc(getCloudflareHighlightPostId(cloudflareFields.cloudflareVideoId))
          : this.db.collection(POSTS_COLLECTION).doc();
        record['id'] = docRef.id;
        batch.set(docRef, record);
        if (cloudflareFields && !cloudflareFields.readyToStream) {
          pendingVideoReconciliations.push({
            docId: docRef.id,
            videoId: cloudflareFields.cloudflareVideoId,
          });
        }
        written++;
      }

      if (written > 0 || updated > 0) {
        context?.emitStage?.('submitting_job', {
          icon: 'media',
          videoCount: written,
          updatedCount: updated,
          phase: 'write_athlete_videos',
        });
        await batch.commit();
      }

      for (const pending of pendingVideoReconciliations) {
        void this.reconcileCloudflareVideoPost(pending.docId, pending.videoId, userId);
      }

      // Cache invalidation — route key format: profile:videos:{userId}[:{sportId}]:{limit}
      context?.emitStage?.('persisting_result', {
        icon: 'database',
        phase: 'invalidate_video_caches',
      });
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

      if (written === 0 && updated === 0 && failedCloudflareImports > 0) {
        return {
          success: false,
          data: {
            userId,
            sportId,
            source,
            written,
            updated,
            skipped,
            failedCloudflareImports,
          },
          error:
            'No profile videos were written because the attached video source could not be prepared for streaming.',
        };
      }

      return {
        success: true,
        data: {
          userId,
          sportId,
          source,
          written,
          updated,
          skipped,
          failedCloudflareImports,
          message: `Wrote ${written} video(s) and updated ${updated} video(s) for "${sportId}" from "${source}" (${skipped} skipped/duplicates, ${failedCloudflareImports} Cloudflare import failure(s)).`,
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

  private hasEquivalentCloudflareFields(
    existing: DocumentData,
    fields: CloudflareVideoPostFields
  ): boolean {
    return (
      existing['cloudflareVideoId'] === fields.cloudflareVideoId &&
      existing['cloudflareStatus'] === fields.cloudflareStatus &&
      existing['readyToStream'] === fields.readyToStream &&
      existing['mediaUrl'] === fields.mediaUrl &&
      existing['videoUrl'] === fields.videoUrl &&
      existing['thumbnailUrl'] === fields.thumbnailUrl
    );
  }

  private async uploadStorageVideoToCloudflare(
    storageReference: FirebaseStorageReference,
    userId: string,
    title: string | null
  ): Promise<CloudflareVideoPostFields | null> {
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

    if (!accountId || !apiToken) {
      logger.warn('[WriteAthleteVideos] Cloudflare not configured; skipping uploaded video post', {
        userId,
      });
      return null;
    }

    if (!storageReference.storagePath.startsWith(`Users/${userId}/`)) {
      throw new Error('Uploaded video storage path is outside the target athlete scope.');
    }

    try {
      const bucket = storageReference.bucketName
        ? getStorage().bucket(storageReference.bucketName)
        : getStorage().bucket();
      const file = bucket.file(storageReference.storagePath) as {
        getMetadata: () => Promise<[Record<string, unknown>, ...unknown[]]>;
        download: () => Promise<[Buffer]>;
      };
      const [metadata] = await file.getMetadata();
      const sizeBytes = Number(metadata['size'] ?? 0);
      if (Number.isFinite(sizeBytes) && sizeBytes > MAX_BACKEND_CLOUDFLARE_UPLOAD_BYTES) {
        logger.warn('[WriteAthleteVideos] Uploaded video too large for backend Cloudflare import', {
          userId,
          storagePath: storageReference.storagePath,
          sizeBytes,
          maxBytes: MAX_BACKEND_CLOUDFLARE_UPLOAD_BYTES,
        });
        return null;
      }

      const [buffer] = await file.download();
      const contentType =
        typeof metadata['contentType'] === 'string' ? metadata['contentType'] : 'video/mp4';
      const fileName = storageReference.storagePath.split('/').pop() ?? `${Date.now()}.mp4`;
      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(buffer)], { type: contentType }), fileName);
      form.set(
        'meta',
        JSON.stringify({
          nxt1_user_id: userId,
          nxt1_context: 'agent_athlete_profile_video',
          nxt1_env: process.env['NODE_ENV'] ?? 'staging',
          nxt1_file_name: fileName,
          nxt1_mime_type: contentType,
          ...(title ? { name: title } : {}),
          webhook_backend_url: (process.env['BACKEND_URL'] ?? '').replace(/\/$/, ''),
        })
      );

      const response = await fetch(`${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        body: form,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.warn('[WriteAthleteVideos] Cloudflare file upload rejected athlete video import', {
          userId,
          storagePath: storageReference.storagePath,
          status: response.status,
          body: body.slice(0, 500),
        });
        return null;
      }

      const body = (await response.json()) as Record<string, unknown>;
      return this.resolveCloudflareFieldsFromApiResult(body, userId, customerCode);
    } catch (err) {
      logger.warn('[WriteAthleteVideos] Backend Cloudflare upload failed', {
        userId,
        storagePath: storageReference.storagePath,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async submitVideoToCloudflare(
    videoUrl: string,
    userId: string
  ): Promise<CloudflareVideoPostFields | null> {
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];

    if (!accountId || !apiToken) {
      logger.warn('[WriteAthleteVideos] Cloudflare not configured; skipping raw video post', {
        userId,
      });
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
            nxt1_context: 'agent_athlete_profile_video',
            nxt1_env: process.env['NODE_ENV'] ?? 'staging',
            webhook_backend_url: (process.env['BACKEND_URL'] ?? '').replace(/\/$/, ''),
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.warn('[WriteAthleteVideos] Cloudflare copy API rejected athlete video import', {
          userId,
          status: response.status,
          body: body.slice(0, 300),
        });
        return null;
      }

      const body = (await response.json()) as Record<string, unknown>;
      return this.resolveCloudflareFieldsFromApiResult(body, userId, customerCode);
    } catch (err) {
      logger.warn('[WriteAthleteVideos] Cloudflare athlete video import failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private resolveCloudflareFieldsFromApiResult(
    body: Record<string, unknown>,
    userId: string,
    customerCode: string | undefined
  ): CloudflareVideoPostFields | null {
    const result = body['result'] as Record<string, unknown> | null | undefined;
    const videoId = trimString(result?.['uid']);
    if (!videoId) {
      logger.warn('[WriteAthleteVideos] Cloudflare API returned no video UID', { userId });
      return null;
    }

    const normalized = normalizeCloudflareVideoForClient(videoId, result ?? {}, customerCode);
    return resolveCloudflareVideoPostFields(
      {
        cloudflareVideoId: videoId,
        cloudflareStatus: normalized.status,
        readyToStream: normalized.readyToStream,
        ...(normalized.thumbnailUrl ? { thumbnailUrl: normalized.thumbnailUrl } : {}),
        ...(normalized.durationSeconds !== null
          ? { durationSeconds: normalized.durationSeconds }
          : {}),
        playback: normalized.playback,
      },
      customerCode
    );
  }

  private async reconcileCloudflareVideoPost(
    docId: string,
    videoId: string,
    userId: string
  ): Promise<void> {
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];
    if (!accountId || !apiToken) return;

    try {
      const response = await fetch(
        `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream/${videoId}`,
        {
          headers: { Authorization: `Bearer ${apiToken}` },
        }
      );
      if (!response.ok) {
        this.startBackgroundVideoPoller(docId, videoId, userId);
        return;
      }

      const body = (await response.json()) as Record<string, unknown>;
      const result = body['result'] as Record<string, unknown> | null | undefined;
      if (!result) {
        this.startBackgroundVideoPoller(docId, videoId, userId);
        return;
      }

      const normalized = normalizeCloudflareVideoForClient(videoId, result, customerCode);
      if (!normalized.readyToStream || !normalized.playback.iframeUrl) {
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
            ? { thumbnailUrl: normalized.thumbnailUrl, poster: normalized.thumbnailUrl }
            : {}),
          updatedAt: new Date().toISOString(),
        });
      await this.invalidateVideoCaches(userId);
    } catch (err) {
      logger.warn('[WriteAthleteVideos] Immediate Cloudflare reconcile failed', {
        userId,
        cloudflareVideoId: videoId,
        docId,
        error: err instanceof Error ? err.message : String(err),
      });
      this.startBackgroundVideoPoller(docId, videoId, userId);
    }
  }

  private startBackgroundVideoPoller(docId: string, videoId: string, userId: string): void {
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
    const customerCode = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'];
    if (!accountId || !apiToken) return;

    const pollIntervalMs = 15_000;
    const maxAttempts = 40;
    let attempts = 0;

    const poll = async (): Promise<void> => {
      attempts++;
      try {
        const response = await fetch(
          `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream/${videoId}`,
          {
            headers: { Authorization: `Bearer ${apiToken}` },
          }
        );
        if (!response.ok) {
          if (attempts < maxAttempts) setTimeout(() => void poll(), pollIntervalMs);
          return;
        }

        const body = (await response.json()) as Record<string, unknown>;
        const result = body['result'] as Record<string, unknown> | null | undefined;
        if (!result) {
          if (attempts < maxAttempts) setTimeout(() => void poll(), pollIntervalMs);
          return;
        }

        const normalized = normalizeCloudflareVideoForClient(videoId, result, customerCode);
        if (!normalized.readyToStream || !normalized.playback.iframeUrl) {
          if (attempts < maxAttempts) setTimeout(() => void poll(), pollIntervalMs);
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
              ? { thumbnailUrl: normalized.thumbnailUrl, poster: normalized.thumbnailUrl }
              : {}),
            updatedAt: new Date().toISOString(),
          });
        await this.invalidateVideoCaches(userId);
      } catch (err) {
        logger.warn('[WriteAthleteVideos] Background Cloudflare poll failed', {
          userId,
          cloudflareVideoId: videoId,
          docId,
          attempt: attempts,
          error: err instanceof Error ? err.message : String(err),
        });
        if (attempts < maxAttempts) setTimeout(() => void poll(), pollIntervalMs);
      }
    };

    setTimeout(() => void poll(), pollIntervalMs);
  }

  private async invalidateVideoCaches(userId: string): Promise<void> {
    try {
      const cache = getCacheService();
      await Promise.all([cache.del(`profile:videos:${userId}*`), invalidateProfileCaches(userId)]);
    } catch {
      // Best-effort.
    }
  }

  // normalizeVideoSrc replaced by shared normalizeVideoUrl from dedup-utils
}
