/**
 * @fileoverview Write Athlete Images Tool — Atomic writer for athlete image posts
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes distilled image assets (action shots, headshots, team photos, graphics)
 * to the top-level `Posts` collection with `type: 'image'`.
 *
 * Each document follows the Posts schema: userId, type, visibility, sportId,
 * url, mediaUrl, thumbnailUrl, platform, stats, organizationId, teamId, etc.
 * Queried by the profile API: GET /api/v1/auth/profile/:userId/images
 *
 * Deduplicates by normalized URL so repeated scrapes of the same profile don't
 * create duplicate post entries.
 *
 * Pattern: mirrors WriteAthleteVideosTool exactly, substituting image fields.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../../services/profile/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import { logger } from '../../../../../utils/logger.js';
import { resolveCreatedAt } from '../doc-date-utils.js';
import { PostVisibility } from '@nxt1/core';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const POSTS_COLLECTION = 'Posts';
const MAX_IMAGES = 100;

const IMAGE_KIND_VALUES = [
  'action_shot',
  'headshot',
  'team_photo',
  'graphic',
  'banner',
  'unknown',
] as const;

type ImageKind = (typeof IMAGE_KIND_VALUES)[number];

const ImageEntrySchema = z
  .object({
    url: z.string().trim().min(1),
    kind: z.enum(IMAGE_KIND_VALUES).optional().default('unknown'),
    alt: z.string().trim().optional(),
    caption: z.string().trim().optional(),
    sourceUrl: z.string().trim().optional(),
    visionSummary: z.string().trim().optional(),
  })
  .passthrough();

const WriteAthleteImagesInputSchema = z.object({
  userId: z.string().trim().min(1),
  targetSport: z.string().trim().min(1),
  source: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1).optional(),
  images: z.array(ImageEntrySchema).min(1).max(MAX_IMAGES),
});

// ─── URL normalizer (images) ─────────────────────────────────────────────────

function normalizeImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Strip CDN sizing params that vary but refer to the same image
    parsed.searchParams.delete('w');
    parsed.searchParams.delete('h');
    parsed.searchParams.delete('width');
    parsed.searchParams.delete('height');
    parsed.searchParams.delete('size');
    parsed.searchParams.delete('q');
    parsed.searchParams.delete('quality');
    parsed.searchParams.delete('fit');
    parsed.searchParams.delete('format');
    parsed.searchParams.delete('auto');
    return parsed.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteAthleteImagesTool extends BaseTool {
  readonly name = 'write_athlete_images';

  readonly description =
    'Writes athlete images (action shots, headshots, team photos, graphics) to the ' +
    'Posts collection as image posts. Deduplicates by URL.\n\n' +
    'Call this after collecting images via extract_page_images, scrape_twitter, or ' +
    'scrape_instagram to persist them to the athlete profile.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "hudl", "twitter", "website").\n' +
    '- sourceUrl (optional): The URL that was scraped to extract this data.\n' +
    '- images (required): Array of image objects:\n' +
    '  • url (required): Full URL of the image.\n' +
    '  • kind (optional): "action_shot", "headshot", "team_photo", "graphic", "banner", or "unknown".\n' +
    '  • alt (optional): Alt text / description.\n' +
    '  • caption (optional): Caption for display.\n' +
    "  • sourceUrl (optional): Page the image was found on.'\n" +
    '  • visionSummary (optional): Full AI vision analysis text from analyze_image — persisted for profile enrichment and intel reports.';

  readonly parameters = WriteAthleteImagesInputSchema;

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
    const parsed = WriteAthleteImagesInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { userId, targetSport, source, images } = parsed.data;
    const sourceUrl = parsed.data.sourceUrl;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:write_athlete_images',
      });

      const userData = accessGrant.targetUserData;
      const sportId = targetSport.trim().toLowerCase();

      const authorizedSportSelection = resolveAuthorizedTargetSportSelection(
        userData,
        sportId,
        accessGrant
      );
      if (!accessGrant.isSelfWrite && !authorizedSportSelection) {
        return { success: false, error: 'Not authorized to write athlete images for this sport.' };
      }

      const now = new Date().toISOString();

      context?.emitStage?.('fetching_data', {
        icon: 'media',
        phase: 'check_duplicate_images',
      });

      // Fetch existing image posts for dedup
      const existingSnap = await this.db
        .collection(POSTS_COLLECTION)
        .where('userId', '==', userId)
        .where('type', '==', 'image')
        .where('sportId', '==', sportId)
        .get();

      const existingKeys = new Set<string>();
      for (const doc of existingSnap.docs) {
        const data = doc.data();
        const url = String(data['url'] ?? data['mediaUrl'] ?? '');
        existingKeys.add(normalizeImageUrl(url));
      }

      let written = 0;
      let skipped = 0;

      const batch = this.db.batch();

      // ── Resolve organizationId / teamId from user's sports array ──
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

      for (const image of images) {
        if (!image || typeof image !== 'object') {
          skipped++;
          continue;
        }

        const imageObj = image as Record<string, unknown>;
        const url = typeof imageObj['url'] === 'string' ? imageObj['url'].trim() : '';
        if (!url || url.length === 0) {
          skipped++;
          continue;
        }

        const normalizedUrl = normalizeImageUrl(url);

        // Dedup check
        if (existingKeys.has(normalizedUrl)) {
          skipped++;
          continue;
        }
        existingKeys.add(normalizedUrl);

        const kind: ImageKind = IMAGE_KIND_VALUES.includes(imageObj['kind'] as ImageKind)
          ? (imageObj['kind'] as ImageKind)
          : 'unknown';
        const alt = typeof imageObj['alt'] === 'string' ? imageObj['alt'] : undefined;
        const caption = typeof imageObj['caption'] === 'string' ? imageObj['caption'] : undefined;
        const itemSourceUrl =
          typeof imageObj['sourceUrl'] === 'string' ? imageObj['sourceUrl'] : sourceUrl;
        const visionSummary =
          typeof imageObj['visionSummary'] === 'string' ? imageObj['visionSummary'] : undefined;

        const record: Record<string, unknown> = {
          // ── Identity & ownership ─────────────────────────────────
          userId,
          ownerType: 'user',
          sportId,
          // ── Referential integrity ─────────────────────────────────
          ...(teamId ? { teamId } : {}),
          ...(organizationId ? { organizationId } : {}),
          // ── Image data (canonical) ───────────────────────────────
          url,
          mediaUrl: url, // Frontend mapTimelineDoc reads this
          type: 'image', // PostType
          visibility: PostVisibility.PUBLIC,
          platform: source,
          source,
          kind,
          isPublic: true,
          tags: [],
          stats: { views: 0, likes: 0, shares: 0 },
          // Data lineage
          extractedAt: now,
          createdAt: resolveCreatedAt(undefined, undefined, now),
          updatedAt: now,
        };

        if (alt) record['alt'] = alt;
        if (caption) record['caption'] = caption;
        if (itemSourceUrl) record['sourceUrl'] = itemSourceUrl;
        if (visionSummary) record['visionSummary'] = visionSummary;

        const docRef = this.db.collection(POSTS_COLLECTION).doc();
        record['id'] = docRef.id;
        batch.set(docRef, record);
        written++;
      }

      if (written > 0) {
        context?.emitStage?.('submitting_job', {
          icon: 'media',
          imageCount: written,
          phase: 'write_athlete_images',
        });
        await batch.commit();
      }

      // Cache invalidation
      context?.emitStage?.('persisting_result', {
        icon: 'database',
        phase: 'invalidate_image_caches',
      });

      try {
        const cache = getCacheService();
        const defaultLimit = 20;
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          cache.del(`profile:images:${userId}:${sportId}:${defaultLimit}`),
          cache.del(`profile:images:${userId}:${defaultLimit}`),
          invalidateProfileCaches(userId),
        ]);
      } catch (cacheErr) {
        logger.warn('[WriteAthleteImages] Cache invalidation failed (non-fatal)', {
          userId,
          error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
        });
      }

      logger.info('[WriteAthleteImages] Complete', {
        userId,
        sportId,
        source,
        written,
        skipped,
      });

      return {
        success: true,
        data: {
          written,
          skipped,
          total: images.length,
          userId,
          sportId,
          source,
          summary: `Wrote ${written} image(s), skipped ${skipped} duplicate(s).`,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to write athlete images';
      logger.error('[WriteAthleteImages] Error', { userId, error: message });
      return { success: false, error: message };
    }
  }
}
