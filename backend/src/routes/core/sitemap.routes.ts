/**
 * @fileoverview Sitemap Routes
 * @module @nxt1/backend/routes/sitemap
 *
 * Dynamic sitemap generation for SEO.
 * Generates XML sitemap index + segmented sitemaps from active route/content data.
 *
 * Entries:
 * 1. Sitemap index (/sitemap.xml)
 * 2. Core pages sitemap (/sitemaps/core.xml)
 * 3. Paginated profile sitemaps (/sitemaps/profiles-:page.xml)
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { logger } from '../../utils/logger.js';
import { getHelpArticleModel } from '../../models/help-center/help-article.model.js';
import { HELP_CATEGORIES } from '@nxt1/core';
import mongoose from 'mongoose';
import { FieldPath } from 'firebase-admin/firestore';

const router: ExpressRouter = Router();

/**
 * Sitemap entry interface
 */
interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

interface SitemapIndexEntry {
  loc: string;
  lastmod?: string;
}

/**
 * Cache configuration
 */
const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hour
const PROFILE_SITEMAP_PAGE_SIZE = 2000;

interface TimestampedXmlCache {
  xml: string;
  timestamp: number;
}

let sitemapIndexCache: TimestampedXmlCache | null = null;
let coreSitemapCache: TimestampedXmlCache | null = null;
let profileCountCache: { count: number; timestamp: number } | null = null;
const profileSitemapCache = new Map<number, TimestampedXmlCache>();

function isCacheFresh(cache: { timestamp: number } | null, now: number): boolean {
  return !!cache && now - cache.timestamp < CACHE_DURATION;
}

function sendXml(res: Response, xml: string): void {
  res.set('Content-Type', 'application/xml');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(xml);
}

function getTodayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

async function getOnboardedProfileCount(db: FirebaseFirestore.Firestore): Promise<number> {
  const now = Date.now();
  if (isCacheFresh(profileCountCache, now)) {
    return profileCountCache!.count;
  }

  const usersQuery = db.collection('Users').where('onboardingCompleted', '==', true);
  const countQuery = usersQuery as {
    count?: () => { get: () => Promise<{ data: () => { count: number } }> };
  };

  if (typeof countQuery.count === 'function') {
    try {
      const aggregate = await countQuery.count().get();
      const count = Number(aggregate.data().count ?? 0);
      profileCountCache = { count, timestamp: now };
      return count;
    } catch (error) {
      logger.warn('[sitemap] Firestore count() failed, using paginated count fallback', { error });
    }
  } else {
    logger.debug('[sitemap] Firestore count() unsupported, using paginated count fallback');
  }

  // Fallback for environments where aggregate count is unavailable.
  let total = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let query = db
      .collection('Users')
      .where('onboardingCompleted', '==', true)
      .orderBy(FieldPath.documentId())
      .limit(5000);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    total += snapshot.size;

    if (snapshot.empty || snapshot.size < 5000) {
      break;
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;
    if (!lastDoc) break;
  }

  profileCountCache = { count: total, timestamp: now };
  return total;
}

function buildProfileUrl(
  baseUrl: string,
  docId: string,
  data: FirebaseFirestore.DocumentData
): string {
  const sport = (data['sport'] as string | undefined)?.toLowerCase() ?? 'athlete';
  const firstName = (data['firstName'] as string | undefined)?.trim() ?? '';
  const lastName = (data['lastName'] as string | undefined)?.trim() ?? '';
  const unicode = (data['unicode'] as string | undefined) || docId;
  const username = (data['username'] as string | undefined)?.trim() ?? '';

  const rawSlug =
    firstName || lastName ? `${firstName}-${lastName}` : username || `athlete-${unicode}`;
  const name = rawSlug
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const safeName = name || `athlete-${unicode.toLowerCase()}`;
  return `${baseUrl}/profile/${sport}/${safeName}/${unicode}`;
}

function coerceLastMod(value: unknown): string | undefined {
  if (!value) return undefined;

  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    return undefined;
  }

  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date.toISOString().split('T')[0];
  }

  return undefined;
}

/**
 * GET /sitemap.xml
 * Serve sitemap index (core sitemap + paginated profile sitemaps)
 */
router.get('/sitemap.xml', async (req: Request, res: Response): Promise<void> => {
  const requestId = (req as { traceId?: string }).traceId || 'sitemap-index';

  try {
    const now = Date.now();
    if (isCacheFresh(sitemapIndexCache, now)) {
      logger.debug(`[${requestId}] Serving cached sitemap index`);
      sendXml(res, sitemapIndexCache!.xml);
      return;
    }

    logger.info(`[${requestId}] Generating fresh sitemap index`);

    const { db } = req.firebase!;
    const baseUrl = process.env['PUBLIC_URL'] || 'https://nxt1sports.com';
    const profileCount = await getOnboardedProfileCount(db);
    const profilePageCount = Math.ceil(profileCount / PROFILE_SITEMAP_PAGE_SIZE);
    const today = getTodayIsoDate();

    const sitemapEntries: SitemapIndexEntry[] = [
      { loc: `${baseUrl}/sitemaps/core.xml`, lastmod: today },
    ];

    for (let page = 1; page <= profilePageCount; page += 1) {
      sitemapEntries.push({
        loc: `${baseUrl}/sitemaps/profiles-${page}.xml`,
        lastmod: today,
      });
    }

    const xml = generateSitemapIndexXml(sitemapEntries);
    sitemapIndexCache = { xml, timestamp: now };

    logger.info(
      `[${requestId}] Sitemap index generated with ${sitemapEntries.length} sitemap files (profiles: ${profileCount})`
    );

    sendXml(res, xml);
  } catch (error) {
    logger.error(`[${requestId}] Sitemap index generation failed`, { error });
    res
      .status(500)
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate sitemap index</error>'
      );
  }
});

/**
 * GET /sitemaps/core.xml
 * Generate and serve dynamic sitemap for non-profile content
 */
router.get('/sitemaps/core.xml', async (req: Request, res: Response): Promise<void> => {
  const requestId = (req as { traceId?: string }).traceId || 'sitemap-core';

  try {
    const now = Date.now();
    if (isCacheFresh(coreSitemapCache, now)) {
      logger.debug(`[${requestId}] Serving cached core sitemap`);
      sendXml(res, coreSitemapCache!.xml);
      return;
    }

    logger.info(`[${requestId}] Generating fresh core sitemap`);

    const { db } = req.firebase!;
    const baseUrl = process.env['PUBLIC_URL'] || 'https://nxt1sports.com';

    const entries: SitemapEntry[] = [];

    // 1) Static public pages.
    entries.push(
      { loc: `${baseUrl}/`, changefreq: 'daily', priority: 1.0 },
      { loc: `${baseUrl}/programs`, changefreq: 'weekly', priority: 0.85 },
      { loc: `${baseUrl}/agent-x`, changefreq: 'daily', priority: 0.8 },
      { loc: `${baseUrl}/help-center`, changefreq: 'weekly', priority: 0.75 },
      { loc: `${baseUrl}/terms`, changefreq: 'monthly', priority: 0.4 },
      { loc: `${baseUrl}/privacy`, changefreq: 'monthly', priority: 0.4 }
    );

    // 2) Help Center categories + published articles.
    try {
      for (const category of HELP_CATEGORIES) {
        entries.push({
          loc: `${baseUrl}/help-center/category/${category.id}`,
          changefreq: 'weekly',
          priority: 0.65,
        });
      }

      if (mongoose.connection.readyState === 1) {
        const HelpArticleModel = getHelpArticleModel();
        const articles = await HelpArticleModel.find({ isPublished: true }, 'slug updatedAt')
          .lean()
          .exec();

        logger.info(`[${requestId}] Found ${articles.length} published help articles`);

        for (const article of articles) {
          const slug = article.slug as string | undefined;
          if (!slug) continue;

          entries.push({
            loc: `${baseUrl}/help-center/article/${slug}`,
            lastmod: coerceLastMod(article.updatedAt),
            changefreq: 'monthly',
            priority: 0.7,
          });
        }
      } else {
        logger.debug(`[${requestId}] MongoDB not connected — skipping help articles`);
      }
    } catch (error) {
      logger.error(`[${requestId}] Error fetching help center entries`, { error });
    }

    // 3) Public posts (/post/:unicode/:id).
    try {
      const postsSnapshot = await db
        .collection('Posts')
        .where('isPublic', '==', true)
        .select('userId', 'updatedAt', 'createdAt')
        .limit(10000)
        .get();

      logger.info(`[${requestId}] Found ${postsSnapshot.size} public posts`);

      const userIds = new Set<string>();
      postsSnapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const data = doc.data();
        const userId = data['userId'] as string | undefined;
        if (userId) userIds.add(userId);
      });

      const userUnicodeMap = new Map<string, string>();
      const userIdChunks = chunkArray([...userIds], 30);

      for (const chunk of userIdChunks) {
        if (chunk.length === 0) continue;

        const usersSnapshot = await db
          .collection('Users')
          .where(FieldPath.documentId(), 'in', chunk)
          .select('unicode')
          .get();

        usersSnapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
          const unicode = doc.get('unicode') as string | undefined;
          if (unicode) {
            userUnicodeMap.set(doc.id, unicode);
          }
        });
      }

      postsSnapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const data = doc.data();
        const userId = data['userId'] as string | undefined;
        if (!userId) return;

        const unicode = userUnicodeMap.get(userId);
        if (!unicode) return;

        entries.push({
          loc: `${baseUrl}/post/${encodeURIComponent(unicode)}/${encodeURIComponent(doc.id)}`,
          lastmod: coerceLastMod(data['updatedAt'] ?? data['createdAt']),
          changefreq: 'daily',
          priority: 0.65,
        });
      });
    } catch (error) {
      logger.error(`[${requestId}] Error fetching public posts`, { error });
    }

    const xml = generateSitemapXml(entries);
    coreSitemapCache = { xml, timestamp: now };

    logger.info(`[${requestId}] Core sitemap generated successfully with ${entries.length} URLs`);
    sendXml(res, xml);
  } catch (error) {
    logger.error(`[${requestId}] Core sitemap generation failed`, { error });
    res
      .status(500)
      .send('<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate core sitemap</error>');
  }
});

/**
 * GET /sitemaps/profiles-:page.xml
 * Generate and serve one page of canonical profile URLs.
 */
router.get('/sitemaps/profiles-:page.xml', async (req: Request, res: Response): Promise<void> => {
  const requestId = (req as { traceId?: string }).traceId || 'sitemap-profiles';
  const pageParam = req.params['page'];
  const pageRaw = Array.isArray(pageParam) ? (pageParam[0] ?? '') : (pageParam ?? '');
  const page = Number.parseInt(pageRaw, 10);

  if (!Number.isFinite(page) || page < 1) {
    res.status(400).send('Invalid sitemap page');
    return;
  }

  try {
    const now = Date.now();
    const cachedPage = profileSitemapCache.get(page) ?? null;
    if (isCacheFresh(cachedPage, now)) {
      logger.debug(`[${requestId}] Serving cached profile sitemap page ${page}`);
      sendXml(res, cachedPage!.xml);
      return;
    }

    const { db } = req.firebase!;
    const baseUrl = process.env['PUBLIC_URL'] || 'https://nxt1sports.com';
    const totalProfiles = await getOnboardedProfileCount(db);
    const totalPages = Math.ceil(totalProfiles / PROFILE_SITEMAP_PAGE_SIZE);

    if (totalPages > 0 && page > totalPages) {
      res.status(404).send('Sitemap page not found');
      return;
    }

    const offset = (page - 1) * PROFILE_SITEMAP_PAGE_SIZE;
    const snapshot = await db
      .collection('Users')
      .where('onboardingCompleted', '==', true)
      .orderBy(FieldPath.documentId())
      .select('unicode', 'username', 'firstName', 'lastName', 'sport', 'updatedAt')
      .offset(offset)
      .limit(PROFILE_SITEMAP_PAGE_SIZE)
      .get();

    const entries: SitemapEntry[] = [];

    snapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = doc.data();
      const loc = buildProfileUrl(baseUrl, doc.id, data);

      entries.push({
        loc,
        lastmod: coerceLastMod(data['updatedAt']),
        changefreq: 'weekly',
        priority: 0.8,
      });
    });

    const xml = generateSitemapXml(entries);
    profileSitemapCache.set(page, { xml, timestamp: now });

    logger.info(
      `[${requestId}] Profile sitemap page ${page} generated successfully with ${entries.length} URLs`
    );

    sendXml(res, xml);
  } catch (error) {
    logger.error(`[${requestId}] Profile sitemap generation failed`, {
      error,
      page,
    });
    res
      .status(500)
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate profile sitemap</error>'
      );
  }
});

function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Generate XML sitemap index from sitemap entries
 */
function generateSitemapIndexXml(entries: readonly SitemapIndexEntry[]): string {
  const sitemapEntries = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`];

      if (entry.lastmod) {
        parts.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      }

      return `  <sitemap>\n${parts.join('\n')}\n  </sitemap>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</sitemapindex>`;
}

/**
 * Generate XML string from sitemap entries
 */
function generateSitemapXml(entries: SitemapEntry[]): string {
  const urlEntries = entries
    .map((entry) => {
      const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`];

      if (entry.lastmod) {
        parts.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      }
      if (entry.changefreq) {
        parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      }
      if (entry.priority !== undefined) {
        parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      }

      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default router;
