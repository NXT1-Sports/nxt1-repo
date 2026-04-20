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
import { getCacheService } from '../../../../services/cache.service.js';
import { logger } from '../../../../utils/logger.js';
import { resolveCreatedAt } from './doc-date-utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const NEWS_COLLECTION = 'News';
const TEAMS_COLLECTION = 'Teams';
const MAX_ARTICLES_PER_CALL = 20;

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

  readonly parameters = {
    type: 'object',
    properties: {
      teamId: { type: 'string' },
      teamCode: { type: 'string' },
      articles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            headline: { type: 'string' },
            source: { type: 'string' },
            publishedAt: { type: 'string' },
            url: { type: 'string' },
            excerpt: { type: 'string' },
            imageUrl: { type: 'string' },
            sourceLogoUrl: { type: 'string' },
            category: { type: 'string' },
          },
          required: ['headline', 'source', 'publishedAt'],
        },
      },
    },
    required: ['teamId', 'teamCode', 'articles'],
  } as const;

  override readonly allowedAgents = ['data_coordinator', 'general'] as const;
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
    const teamId = this.str(input, 'teamId');
    if (!teamId) return this.paramError('teamId');
    const teamCode = this.str(input, 'teamCode');
    if (!teamCode) return this.paramError('teamCode');

    const rawArticles = input['articles'];
    if (!Array.isArray(rawArticles) || rawArticles.length === 0) {
      return { success: false, error: 'articles must be a non-empty array.' };
    }
    if (rawArticles.length > MAX_ARTICLES_PER_CALL) {
      return {
        success: false,
        error: `articles exceeds maximum of ${MAX_ARTICLES_PER_CALL}.`,
      };
    }

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

      context?.onProgress?.(`Writing ${written} news article(s)…`);
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
