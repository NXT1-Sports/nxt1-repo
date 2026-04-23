/**
 * @fileoverview Write Team News Tool — Atomic writer for team news articles
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes syndicated or AI-generated news articles to the `News` collection
 * with `type: 'team'` for association with a specific team.
 *
 * Doc ID is a URL-based hash to prevent duplicate articles.
 * Repeated calls for the same URL perform an upsert (idempotent).
 *
 * Queried by: TeamTimeline (GET /api/v1/teams/:teamCode/timeline?filter=news)
 */

import crypto from 'crypto';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getCacheService } from '../../../../services/core/cache.service.js';
import { logger } from '../../../../utils/logger.js';
import { resolveCreatedAt } from './doc-date-utils.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const NEWS_COLLECTION = 'News';
const TEAMS_COLLECTION = 'Teams';
const MAX_ARTICLES_PER_CALL = 20;

const TeamNewsArticleSchema = z
  .object({
    headline: z.string().trim().min(1).optional(),
    source: z.string().trim().min(1).optional(),
    publishedAt: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1).optional(),
    excerpt: z.string().trim().min(1).optional(),
    imageUrl: z.string().trim().min(1).optional(),
    sourceLogoUrl: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
  })
  .passthrough();

const WriteTeamNewsInputSchema = z.object({
  teamId: z.string().trim().min(1),
  teamCode: z.string().trim().min(1),
  articles: z.array(TeamNewsArticleSchema).min(1).max(MAX_ARTICLES_PER_CALL),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteTeamNewsTool extends BaseTool {
  readonly name = 'write_team_news';

  readonly description =
    'Writes news articles to the News collection with type:"team" for a specific team.\n\n' +
    'Use this to surface team announcements, press coverage, or AI-generated news updates.\n\n' +
    'Doc ID is derived from the article URL hash — repeated calls for the same URL upsert safely.\n\n' +
    'Parameters:\n' +
    '- teamId (required): Team document ID.\n' +
    '- teamCode (required): Team code slug (used for cache invalidation).\n' +
    '- articles (required): Array of news articles:\n' +
    '  • headline (required): Article headline.\n' +
    '  • source (required): Publication name (e.g. "MaxPreps", "Team Website").\n' +
    '  • publishedAt (required): ISO 8601 date string.\n' +
    '  • url (optional): Original article URL (used for dedup).\n' +
    '  • excerpt (optional): Short summary or lede.\n' +
    '  • imageUrl (optional): Hero image URL.\n' +
    '  • sourceLogoUrl (optional): Source publication logo URL.\n' +
    '  • category (optional): Category tag (e.g. "game-recap", "roster", "awards").';

  readonly parameters = WriteTeamNewsInputSchema;

  override readonly allowedAgents = ['data_coordinator', 'strategy_coordinator'] as const;
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
    const parsed = WriteTeamNewsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { teamId, teamCode } = parsed.data;
    const rawArticles = parsed.data.articles;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      // Verify team exists
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        return { success: false, error: `Team ${teamId} not found.` };
      }

      const now = new Date().toISOString();
      const batch = this.db.batch();
      let written = 0;
      let skipped = 0;

      for (const rawArticle of rawArticles) {
        if (!rawArticle || typeof rawArticle !== 'object') {
          skipped++;
          continue;
        }
        const a = rawArticle as Record<string, unknown>;
        const headline = this.str(a, 'headline');
        const source = this.str(a, 'source');
        const publishedAt = this.str(a, 'publishedAt');

        if (!headline || !source || !publishedAt) {
          skipped++;
          continue;
        }

        const url = this.str(a, 'url') ?? undefined;
        const excerpt = this.str(a, 'excerpt') ?? undefined;
        const imageUrl = this.str(a, 'imageUrl') ?? undefined;
        const sourceLogoUrl = this.str(a, 'sourceLogoUrl') ?? undefined;
        const category = this.str(a, 'category') ?? undefined;

        // Derive doc ID from URL hash (deterministic dedup) or fallback to timestamp hash
        const hashInput = url ?? `${teamId}::${headline}::${publishedAt}`;
        const docId = `news_${crypto.createHash('sha1').update(hashInput).digest('hex').slice(0, 16)}`;

        const docRef = this.db.collection(NEWS_COLLECTION).doc(docId);
        batch.set(
          docRef,
          {
            teamId,
            type: 'team',
            headline,
            source,
            publishedAt,
            ...(url ? { url, articleUrl: url } : {}),
            ...(excerpt ? { excerpt } : {}),
            ...(imageUrl ? { imageUrl } : {}),
            ...(sourceLogoUrl ? { sourceLogoUrl } : {}),
            ...(category ? { category } : {}),
            createdAt: resolveCreatedAt(undefined, publishedAt, now),
            updatedAt: now,
          },
          { merge: true }
        );

        written++;
      }

      if (written === 0) {
        return { success: false, error: 'No valid articles after validation.' };
      }

      context?.emitStage?.('submitting_job', {
        icon: 'document',
        articleCount: written,
        phase: 'write_team_news',
      });
      await batch.commit();

      // Invalidate team timeline caches
      const cache = getCacheService();
      await cache.delByPrefix(`team:timeline:v1:${teamCode}:`);

      logger.info('[WriteTeamNewsTool] Articles written', { teamId, teamCode, written, skipped });

      return {
        success: true,
        data: {
          written,
          skipped,
          message: `Wrote ${written} news article(s)${skipped > 0 ? `, skipped ${skipped}` : ''}.`,
        },
      };
    } catch (err) {
      logger.error('[WriteTeamNewsTool] Failed', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write team news.',
      };
    }
  }
}
