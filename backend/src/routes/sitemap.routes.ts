/**
 * @fileoverview Sitemap Routes
 * @module @nxt1/backend/routes/sitemap
 *
 * Dynamic sitemap generation for SEO.
 * Generates XML sitemap from Firestore data (user profiles, teams)
 * and MongoDB data (colleges).
 *
 * Entries:
 * 1. Static marketing / landing pages
 * 2. User profiles (athletes, coaches — from Firestore)
 * 3. Team profiles (from Firestore)
 * 4. Colleges (from MongoDB/Mongoose)
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { CollegeModel } from '../models/college.model.js';
import mongoose from 'mongoose';

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

/**
 * Cache configuration
 */
const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hour
let sitemapCache: { xml: string; timestamp: number } | null = null;

/**
 * GET /sitemap.xml
 * Generate and serve dynamic sitemap
 */
router.get('/sitemap.xml', async (req: Request, res: Response): Promise<void> => {
  const requestId = (req as { traceId?: string }).traceId || 'sitemap';

  try {
    // Check cache
    const now = Date.now();
    if (sitemapCache && now - sitemapCache.timestamp < CACHE_DURATION) {
      logger.debug(`[${requestId}] Serving cached sitemap`);
      res.set('Content-Type', 'application/xml');
      res.set('Cache-Control', 'public, max-age=3600'); // 1 hour
      res.send(sitemapCache.xml);
      return;
    }

    logger.info(`[${requestId}] Generating fresh sitemap`);

    const { db } = req.firebase!;
    const baseUrl = process.env['PUBLIC_URL'] || 'https://nxt1sports.com';

    // Collect all sitemap entries
    const entries: SitemapEntry[] = [];

    // ──────────────────────────────────────────
    // 1. Static & marketing pages
    // ──────────────────────────────────────────
    entries.push(
      // Core pages
      { loc: `${baseUrl}/`, changefreq: 'daily', priority: 1.0 },
      { loc: `${baseUrl}/explore`, changefreq: 'hourly', priority: 0.9 },
      { loc: `${baseUrl}/explore/discover`, changefreq: 'hourly', priority: 0.9 },
      { loc: `${baseUrl}/explore/pulse`, changefreq: 'hourly', priority: 0.9 },
      { loc: `${baseUrl}/colleges`, changefreq: 'daily', priority: 0.85 },
      { loc: `${baseUrl}/rankings`, changefreq: 'daily', priority: 0.85 },
      { loc: `${baseUrl}/news`, changefreq: 'hourly', priority: 0.85 },
      { loc: `${baseUrl}/scout-reports`, changefreq: 'daily', priority: 0.8 },
      { loc: `${baseUrl}/help-center`, changefreq: 'weekly', priority: 0.6 },
      { loc: `${baseUrl}/about`, changefreq: 'monthly', priority: 0.5 },
      { loc: `${baseUrl}/pricing`, changefreq: 'weekly', priority: 0.7 },

      // Persona landing pages
      { loc: `${baseUrl}/athletes`, changefreq: 'weekly', priority: 0.8 },
      { loc: `${baseUrl}/coaches`, changefreq: 'weekly', priority: 0.8 },
      { loc: `${baseUrl}/college-coaches`, changefreq: 'weekly', priority: 0.8 },
      { loc: `${baseUrl}/parents`, changefreq: 'weekly', priority: 0.8 },
      { loc: `${baseUrl}/scouts`, changefreq: 'weekly', priority: 0.8 },

      // Feature marketing pages
      { loc: `${baseUrl}/recruiting-athletes`, changefreq: 'weekly', priority: 0.75 },
      { loc: `${baseUrl}/content-creation-athletes`, changefreq: 'weekly', priority: 0.75 },
      { loc: `${baseUrl}/media-coverage`, changefreq: 'weekly', priority: 0.75 },
      { loc: `${baseUrl}/ai-athletes`, changefreq: 'weekly', priority: 0.75 },
      { loc: `${baseUrl}/recruiting-scouts-colleges`, changefreq: 'weekly', priority: 0.75 },
      { loc: `${baseUrl}/super-profiles`, changefreq: 'weekly', priority: 0.75 },
      { loc: `${baseUrl}/team-platform`, changefreq: 'weekly', priority: 0.75 },

      // Sport-vertical landing pages
      { loc: `${baseUrl}/football`, changefreq: 'weekly', priority: 0.8 },
      { loc: `${baseUrl}/basketball`, changefreq: 'weekly', priority: 0.8 }
    );

    // ──────────────────────────────────────────
    // 2. User profiles (athletes, coaches, etc.)
    // ──────────────────────────────────────────
    try {
      const usersSnapshot = await db
        .collection('Users')
        .where('onboardingCompleted', '==', true)
        .select('id', 'updatedAt')
        .limit(5000) // Limit for performance
        .get();

      logger.info(`[${requestId}] Found ${usersSnapshot.size} user profiles`);

      usersSnapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const data = doc.data();
        const userId = doc.id;
        const updatedAt = data['updatedAt'];

        // Convert Firestore timestamp to ISO string
        let lastmod: string | undefined;
        if (updatedAt) {
          if (updatedAt.toDate) {
            lastmod = updatedAt.toDate().toISOString().split('T')[0];
          } else if (typeof updatedAt === 'string') {
            lastmod = new Date(updatedAt).toISOString().split('T')[0];
          }
        }

        // Use canonical /profile/ path — NOT vanity /@handle which triggers redirects
        entries.push({
          loc: `${baseUrl}/profile/${userId}`,
          lastmod,
          changefreq: 'weekly',
          priority: 0.8,
        });
      });
    } catch (error) {
      logger.error(`[${requestId}] Error fetching user profiles`, { error });
      // Continue with other entries even if users fail
    }

    // ──────────────────────────────────────────
    // 3. Team profiles (from Firestore)
    // ──────────────────────────────────────────
    try {
      const teamsSnapshot = await db
        .collection('Teams')
        .where('isActive', '==', true)
        .select('slug', 'updatedAt')
        .limit(5000)
        .get();

      logger.info(`[${requestId}] Found ${teamsSnapshot.size} teams`);

      teamsSnapshot.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const data = doc.data();
        const slug = data['slug'];
        if (!slug) return; // Skip teams without a slug

        const updatedAt = data['updatedAt'];
        let lastmod: string | undefined;
        if (updatedAt) {
          if (updatedAt.toDate) {
            lastmod = updatedAt.toDate().toISOString().split('T')[0];
          } else if (typeof updatedAt === 'string') {
            lastmod = new Date(updatedAt).toISOString().split('T')[0];
          }
        }

        entries.push({
          loc: `${baseUrl}/team/${slug}`,
          lastmod,
          changefreq: 'weekly',
          priority: 0.7,
        });
      });
    } catch (error) {
      logger.error(`[${requestId}] Error fetching teams`, { error });
    }

    // ──────────────────────────────────────────
    // 4. Colleges (from MongoDB)
    // ──────────────────────────────────────────
    try {
      // Only query MongoDB if the connection is established (readyState === 1)
      if (mongoose.connection.readyState === 1) {
        const colleges = await CollegeModel.find({}, '_id').lean().limit(5000).exec();

        logger.info(`[${requestId}] Found ${colleges.length} colleges`);

        for (const college of colleges) {
          entries.push({
            loc: `${baseUrl}/colleges/${college._id.toString()}`,
            changefreq: 'monthly',
            priority: 0.7,
          });
        }
      } else {
        logger.debug(`[${requestId}] MongoDB not connected — skipping colleges`);
      }
    } catch (error) {
      logger.error(`[${requestId}] Error fetching colleges`, { error });
    }

    // ──────────────────────────────────────────
    // 5. Generate XML
    // ──────────────────────────────────────────
    const xml = generateSitemapXml(entries);

    // Update cache
    sitemapCache = {
      xml,
      timestamp: now,
    };

    logger.info(`[${requestId}] Sitemap generated successfully with ${entries.length} URLs`);

    // Send response
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600'); // 1 hour
    res.send(xml);
  } catch (error) {
    logger.error(`[${requestId}] Sitemap generation failed`, { error });
    res
      .status(500)
      .send('<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate sitemap</error>');
  }
});

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
