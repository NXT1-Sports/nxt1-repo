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
import { HELP_CATEGORIES, buildCanonicalProfilePath } from '@nxt1/core';
import { isIndexableProfile } from '@nxt1/core/seo';
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
let indexableProfileCache: { items: ProfileSitemapEntry[]; timestamp: number } | null = null;
const profileSitemapCache = new Map<number, TimestampedXmlCache>();

interface ProfileSitemapEntry {
  docId: string;
  data: FirebaseFirestore.DocumentData;
}

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

async function getIndexableProfiles(
  db: FirebaseFirestore.Firestore
): Promise<ProfileSitemapEntry[]> {
  const now = Date.now();
  if (isCacheFresh(indexableProfileCache, now)) {
    return indexableProfileCache!.items;
  }

  const entries: ProfileSitemapEntry[] = [];
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (true) {
    let query = db
      .collection('Users')
      .where('onboardingCompleted', '==', true)
      .orderBy(FieldPath.documentId())
      .select(
        'aboutMe',
        'activeSportIndex',
        'awards',
        'classOf',
        'connectedSources',
        'displayName',
        'firstName',
        'lastName',
        'location',
        'measurables',
        'profileImgs',
        'sports',
        'teamHistory',
        'unicode',
        'username',
        'verificationStatus',
        'sport',
        'updatedAt'
      )
      .limit(5000);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    snapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = doc.data();
      if (isIndexableProfile(data)) {
        entries.push({ docId: doc.id, data });
      }
    });

    if (snapshot.empty || snapshot.size < 5000) {
      break;
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;
    if (!lastDoc) break;
  }

  indexableProfileCache = { items: entries, timestamp: now };
  return entries;
}

function buildProfileUrl(
  baseUrl: string,
  docId: string,
  data: FirebaseFirestore.DocumentData
): string {
  const sports = Array.isArray(data['sports']) ? (data['sports'] as Array<{ sport?: string }>) : [];
  const activeSportIndex = Number(data['activeSportIndex']);
  const primarySport =
    sports[Number.isFinite(activeSportIndex) && activeSportIndex >= 0 ? activeSportIndex : 0]
      ?.sport ??
    sports[0]?.sport ??
    (data['sport'] as string | undefined) ??
    undefined;

  const firstName = (data['firstName'] as string | undefined)?.trim() ?? '';
  const lastName = (data['lastName'] as string | undefined)?.trim() ?? '';
  const displayName = (data['displayName'] as string | undefined)?.trim() ?? '';
  const username = (data['username'] as string | undefined)?.trim() ?? '';
  const unicode = (data['unicode'] as string | undefined) || docId;

  const athleteName =
    [firstName, lastName].filter(Boolean).join(' ') || displayName || username || 'NXT1 Athlete';

  return `${baseUrl}${buildCanonicalProfilePath({
    athleteName,
    sport: primarySport,
    unicode,
    id: docId,
  })}`;
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
    const indexableProfiles = await getIndexableProfiles(db);
    const profilePageCount = Math.ceil(indexableProfiles.length / PROFILE_SITEMAP_PAGE_SIZE);
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
      `[${requestId}] Sitemap index generated with ${sitemapEntries.length} sitemap files (profiles: ${indexableProfiles.length})`
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

    // 3) Public posts — TEMPORARILY DISABLED (UI not ready for public indexing)
    // Posts will be re-enabled once the post detail/card UI is refined
    // TODO: Re-enable public posts in sitemap once UI is production-ready
    // try {
    //   const postsSnapshot = await db
    //     .collection('Posts')
    //     .where('isPublic', '==', true)
    //     .select('userId', 'updatedAt', 'createdAt')
    //     .limit(10000)
    //     .get();
    //   ... (code omitted)
    // }

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
    const indexableProfiles = await getIndexableProfiles(db);
    const totalProfiles = indexableProfiles.length;
    const totalPages = Math.ceil(totalProfiles / PROFILE_SITEMAP_PAGE_SIZE);

    if (totalPages > 0 && page > totalPages) {
      res.status(404).send('Sitemap page not found');
      return;
    }

    const offset = (page - 1) * PROFILE_SITEMAP_PAGE_SIZE;
    const snapshot = indexableProfiles.slice(offset, offset + PROFILE_SITEMAP_PAGE_SIZE);

    const entries: SitemapEntry[] = [];

    snapshot.forEach(({ docId, data }) => {
      const loc = buildProfileUrl(baseUrl, docId, data);

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
