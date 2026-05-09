/**
 * @fileoverview Write Rankings Tool — Atomic writer for athlete ranking snapshots
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes source-specific ranking snapshots to the root Rankings collection.
 * Each snapshot is keyed by user + sport + source + ranking provider + effective date,
 * so repeated syncs for the same ranking merge cleanly while historical updates can
 * still be stored as separate records when the effective date changes.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../../services/profile/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import { ContextBuilder } from '../../../memory/context-builder.js';
import { resolveCreatedAt } from '../doc-date-utils.js';
import { z } from 'zod';

const RANKINGS_COLLECTION = 'Rankings';
const MAX_RANKINGS = 30;

const RankingValueSchema = z.union([z.number(), z.string().trim().min(1)]);

const RankingEntrySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    nationalRank: RankingValueSchema.optional(),
    stateRank: RankingValueSchema.optional(),
    positionRank: RankingValueSchema.optional(),
    stars: RankingValueSchema.optional(),
    score: RankingValueSchema.optional(),
    classOf: RankingValueSchema.optional(),
    sport: z.string().trim().min(1).optional(),
    rankedAt: z.string().trim().min(1).optional(),
    date: z.string().trim().min(1).optional(),
  })
  .passthrough();

const WriteRankingsInputSchema = z.object({
  userId: z.string().trim().min(1),
  targetSport: z.string().trim().min(1),
  source: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1).optional(),
  profileUrl: z.string().trim().min(1).optional(),
  rankings: z.array(RankingEntrySchema).min(1).max(MAX_RANKINGS),
});

export class WriteRankingsTool extends BaseTool {
  readonly name = 'write_rankings';

  readonly description =
    'Writes athlete ranking snapshots to the Rankings collection. ' +
    'Use this when a source exposes national, state, position, star, or rating data.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "247sports", "on3").\n' +
    '- sourceUrl (optional): The URL that was scraped to extract this data.\n' +
    '- profileUrl (optional): Alias for sourceUrl.\n' +
    '- rankings (required): Array of ranking snapshot objects.\n' +
    '  • name (required): Ranking provider/display name (e.g. "247Sports").\n' +
    '  • nationalRank, stateRank, positionRank (optional): Numeric ranks.\n' +
    '  • stars, score, classOf (optional): Rating metadata.\n' +
    '  • sport (optional): Overrides targetSport.\n' +
    '  • rankedAt or date (optional): ISO timestamp for when the ranking applied.';

  readonly parameters = WriteRankingsInputSchema;

  override readonly allowedAgents = ['data_coordinator'] as const;
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
    const parsed = WriteRankingsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { userId, targetSport, source } = parsed.data;
    const sourceUrl = parsed.data.sourceUrl ?? parsed.data.profileUrl;
    const rankings = parsed.data.rankings;

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
        action: 'tool:write_rankings',
      });
      userData = accessGrant.targetUserData;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Not authorized to write ranking data.',
      };
    }

    const sportId = targetSport.trim().toLowerCase();
    if (
      accessGrant &&
      !accessGrant.isSelfWrite &&
      !resolveAuthorizedTargetSportSelection(userData, sportId, accessGrant)
    ) {
      return { success: false, error: 'Not authorized to write ranking data for this sport.' };
    }
    const rankingsCol = this.db.collection(RANKINGS_COLLECTION);
    let written = 0;
    let skipped = 0;

    try {
      for (const entry of rankings) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const effectiveSport =
          this.str(entry as Record<string, unknown>, 'sport')?.toLowerCase() ?? sportId;
        if (
          accessGrant &&
          !accessGrant.isSelfWrite &&
          !resolveAuthorizedTargetSportSelection(userData, effectiveSport, accessGrant)
        ) {
          return {
            success: false,
            error: 'Not authorized to write ranking data for this sport.',
          };
        }
      }

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        rankingCount: rankings.length,
        phase: 'write_rankings',
      });

      await Promise.all(
        rankings.map(async (entry) => {
          if (!entry || typeof entry !== 'object') {
            skipped++;
            return;
          }

          const ranking = entry as Record<string, unknown>;
          const name = this.str(ranking, 'name');
          if (!name) {
            skipped++;
            return;
          }

          const effectiveSport = this.str(ranking, 'sport')?.toLowerCase() ?? sportId;
          const rankedAt =
            this.parseIsoDate(this.str(ranking, 'rankedAt')) ??
            this.parseIsoDate(this.str(ranking, 'date')) ??
            new Date().toISOString();

          const hasRankingSignal =
            this.num(ranking, 'nationalRank') !== null ||
            this.num(ranking, 'stateRank') !== null ||
            this.num(ranking, 'positionRank') !== null ||
            this.num(ranking, 'stars') !== null ||
            this.num(ranking, 'score') !== null;

          if (!hasRankingSignal) {
            skipped++;
            return;
          }

          const docId = [
            userId,
            effectiveSport,
            this.slug(source),
            this.slug(name),
            rankedAt.slice(0, 10),
          ].join('_');

          const docRef = rankingsCol.doc(docId);
          const existingData = (await docRef.get()).data();

          const record: Record<string, unknown> = {
            id: docId,
            userId,
            sportId: effectiveSport,
            sport: effectiveSport,
            name,
            source,
            rankedAt,
            date: rankedAt,
            createdAt: resolveCreatedAt(existingData?.['createdAt'], rankedAt, rankedAt),
            updatedAt: rankedAt,
            provider: source,
            extractedAt: new Date().toISOString(),
            verified: false,
          };

          if (sourceUrl) record['sourceUrl'] = sourceUrl;

          const nationalRank = this.num(ranking, 'nationalRank');
          if (nationalRank !== null) record['nationalRank'] = nationalRank;
          const stateRank = this.num(ranking, 'stateRank');
          if (stateRank !== null) record['stateRank'] = stateRank;
          const positionRank = this.num(ranking, 'positionRank');
          if (positionRank !== null) record['positionRank'] = positionRank;
          const stars = this.num(ranking, 'stars');
          if (stars !== null) record['stars'] = stars;
          const score = this.num(ranking, 'score');
          if (score !== null) record['score'] = score;
          const classOf = this.num(ranking, 'classOf');
          if (classOf !== null) record['classOf'] = classOf;

          await docRef.set(record, { merge: true });
          written++;
        })
      );

      context?.emitStage?.('persisting_result', {
        icon: 'database',
        phase: 'invalidate_ranking_caches',
      });
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          cache.del(`profile:sub:rankings:${userId}`),
          cache.del(`profile:sub:rankings:${userId}:${sportId}`),
          invalidateProfileCaches(
            userId,
            typeof userData['unicode'] === 'string' ? userData['unicode'] : null
          ),
        ]);
        const contextBuilder = new ContextBuilder();
        await contextBuilder.invalidateContext(userId);
      } catch {
        // Best-effort
      }

      return {
        success: true,
        data: {
          userId,
          sportId,
          source,
          written,
          skipped,
          message: `Wrote ${written} ranking snapshot(s) for sport "${sportId}" (${skipped} skipped).`,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write rankings',
      };
    }
  }

  private slug(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'ranking'
    );
  }

  private parseIsoDate(value: string | null): string | null {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
  }
}
