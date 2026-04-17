/**
 * @fileoverview Write Awards Tool — Atomic writer for athlete award/honor records
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes award records to the root Awards collection.
 * Each award is keyed by user + slugified title + season/year so repeated syncs
 * from the same source merge cleanly without creating duplicates.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../services/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile/shared.js';
import { logger } from '../../../../utils/logger.js';

export const AWARDS_COLLECTION = 'Awards';
const MAX_AWARDS = 50;

export class WriteAwardsTool extends BaseTool {
  readonly name = 'write_awards';

  readonly description =
    'Writes athlete award and honor records to the Awards collection. ' +
    'Use this when a source lists honors, all-conference/all-state/all-america selections, ' +
    'MVP awards, academic awards, or any named recognition.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "maxpreps", "hudl").\n' +
    '- sourceUrl (optional): The URL that was scraped to extract this data.\n' +
    '- awards (required): Array of award objects.\n' +
    '  • title (required): Award name (e.g. "All-State First Team").\n' +
    '  • category (optional): Classification (e.g. "All-State", "MVP", "Academic").\n' +
    '  • season (optional): Season string (e.g. "2024-2025").\n' +
    '  • year (optional): Year string (e.g. "2024"). Used when season is unavailable.\n' +
    '  • issuer (optional): Organization that issued the award (e.g. "MaxPreps", "State Athletic Association").\n' +
    '  • description (optional): Additional context about the award.\n' +
    '  • sport (optional): Overrides targetSport for this specific award.';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      targetSport: { type: 'string' },
      source: { type: 'string' },
      sourceUrl: { type: 'string' },
      awards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: { type: 'string' },
            season: { type: 'string' },
            year: { type: 'string' },
            issuer: { type: 'string' },
            description: { type: 'string' },
            sport: { type: 'string' },
          },
          required: ['title'],
        },
      },
    },
    required: ['userId', 'targetSport', 'source', 'awards'],
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
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');
    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');

    const sourceUrl = this.str(input, 'sourceUrl') ?? undefined;
    const awards = input['awards'];
    if (!Array.isArray(awards) || awards.length === 0) {
      return { success: false, error: 'awards must be a non-empty array.' };
    }
    if (awards.length > MAX_AWARDS) {
      return { success: false, error: `awards exceeds maximum of ${MAX_AWARDS}.` };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    let userData: Record<string, unknown>;
    let accessGrant:
      | Awaited<
          ReturnType<
            ReturnType<
              typeof createProfileWriteAccessService
            >['assertCanManageAthleteProfileTarget']
          >
        >
      | undefined;
    try {
      accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:write_awards',
      });
      userData = accessGrant.targetUserData;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Not authorized to write award data.',
      };
    }

    const sportId = targetSport.trim().toLowerCase();
    if (
      accessGrant &&
      !accessGrant.isSelfWrite &&
      !resolveAuthorizedTargetSportSelection(userData, sportId, accessGrant)
    ) {
      return { success: false, error: 'Not authorized to write award data for this sport.' };
    }

    const awardsCol = this.db.collection(AWARDS_COLLECTION);
    let written = 0;
    let skipped = 0;

    try {
      context?.onProgress?.(`Writing ${awards.length} award(s)…`);

      await Promise.all(
        awards.map(async (entry) => {
          if (!entry || typeof entry !== 'object') {
            skipped++;
            return;
          }

          const award = entry as Record<string, unknown>;
          const title = this.str(award, 'title');
          if (!title) {
            skipped++;
            return;
          }

          const effectiveSport = this.str(award, 'sport')?.toLowerCase() ?? sportId;

          if (
            accessGrant &&
            !accessGrant.isSelfWrite &&
            !resolveAuthorizedTargetSportSelection(userData, effectiveSport, accessGrant)
          ) {
            skipped++;
            return;
          }

          const season = this.str(award, 'season') ?? undefined;
          const year = this.str(award, 'year') ?? undefined;
          const temporalKey = season ?? year ?? 'undated';

          // Deterministic doc ID — same award + season always maps to the same doc
          const docId = [userId, this.slug(title), this.slug(temporalKey)].join('_');

          const now = new Date().toISOString();
          const record: Record<string, unknown> = {
            id: docId,
            userId,
            sport: effectiveSport,
            title,
            source,
            extractedAt: now,
            updatedAt: now,
          };

          if (season) record['season'] = season;
          if (year) record['year'] = year;
          if (sourceUrl) record['sourceUrl'] = sourceUrl;

          const category = this.str(award, 'category');
          if (category) record['category'] = category;
          const issuer = this.str(award, 'issuer');
          if (issuer) record['issuer'] = issuer;
          const description = this.str(award, 'description');
          if (description) record['description'] = description;

          await awardsCol.doc(docId).set(record, { merge: true });
          written++;
        })
      );
    } catch (err) {
      logger.error('[WriteAwardsTool] Failed to write awards', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write awards.',
      };
    }

    try {
      context?.onProgress?.('Invalidating award caches…');
      const cache = getCacheService();
      await Promise.all([
        cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
        cache.del(`profile:sub:awards:${userId}`),
        cache.del(`profile:sub:awards:${userId}:${sportId}`),
        invalidateProfileCaches(
          userId,
          typeof userData['unicode'] === 'string' ? userData['unicode'] : null
        ),
      ]);
    } catch {
      // Non-fatal — cache invalidation failure should not fail the tool
    }

    return {
      success: true,
      data: {
        message: `Wrote ${written} award(s)${skipped ? `, skipped ${skipped}` : ''}.`,
        written,
        skipped,
      },
    };
  }

  private slug(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
