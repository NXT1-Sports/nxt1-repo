/**
 * @fileoverview Daily Pulse Updates — AI News Generator
 * @module @nxt1/functions/scheduled/dailyPulseUpdates
 *
 * Runs daily at 7 AM Eastern. Uses Perplexity Sonar (live web search) via
 * OpenRouter to find real sports recruiting articles, then scrapes og:image
 * from each source URL, generates AI summaries via DeepSeek Chat, and writes
 * them to Firestore `News/{id}`.
 *
 * Architecture:
 *   1. Call Perplexity `sonar` (online model) via OpenRouter to search for
 *      today's top high school / college sports recruiting articles.
 *   2. Parse the structured JSON response containing article metadata.
 *   3. For each article, generate an AI summary via a fast model.
 *   4. Write articles to Firestore with real publisher attribution.
 *
 * Required secrets (Firebase Secret Manager):
 *   - OPENROUTER_API_KEY: API key for OpenRouter
 *
 * @example
 * firebase functions:secrets:set OPENROUTER_API_KEY
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as cheerio from 'cheerio';

const OPENROUTER_API_KEY = defineSecret('OPENROUTER_API_KEY');

// ─── Constants ──────────────────────────────────────────────────────────────

const NEWS_COLLECTION = 'News';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** NUMBER OF DAYS BEFORE FIRESTORE TTL AUTO-DELETES AN ARTICLE. */
const ARTICLE_TTL_DAYS = 14;

/** Model for searching/discovering news — Perplexity has LIVE web search built in. */
const SEARCH_MODEL = 'perplexity/sonar';

/** Fast model for generating summaries (free / near-free via OpenRouter). */
const SUMMARY_MODEL = 'deepseek/deepseek-chat';

const TARGET_ARTICLE_COUNT = 15;
const MAX_RETRIES = 2;

// ─── Types ──────────────────────────────────────────────────────────────────

interface DiscoveredArticle {
  title: string;
  excerpt: string;
  source: string;
  sourceUrl: string;
  faviconUrl?: string;
  imageUrl?: string;
  sport: string;
  state: string;
  author?: string;
  publishedAt: string;
}

interface ArticleWithContent extends DiscoveredArticle {
  content: string;
  slug: string;
}

// ─── OpenRouter Helper ──────────────────────────────────────────────────────

async function callOpenRouter(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 4096
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://nxt1.com',
          'X-Title': 'NXT1 Pulse',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 300)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenRouter');

      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        logger.warn('[Pulse] Retry attempt', { attempt: attempt + 1, error: lastError.message });
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error('OpenRouter request failed');
}

// ─── Scraper Helper ──────────────────────────────────────────────────────────

interface ScrapedMetadata {
  imageUrl?: string;
  faviconUrl?: string;
}

/**
 * Scrapes og:image AND favicon from a source URL in a single HTTP request.
 * Falls back to Google Favicon API if no favicon found in HTML.
 */
async function scrapeArticleMetadata(url: string): Promise<ScrapedMetadata> {
  let faviconUrl: string | undefined;

  try {
    const parsedUrl = new URL(url);
    const origin = parsedUrl.origin;

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 NXTPulseBot/1.0',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      // Even if the page fails, we can still get favicon via Google API
      faviconUrl = `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=64`;
      return { faviconUrl };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // --- Extract og:image ---
    let imageUrl: string | undefined;

    // First try to find a real semantic image in the article body (filters out most header logos)
    let bodyImage =
      $('article img').first().attr('src') ||
      $('figure img').first().attr('src') ||
      $('.article-content img').first().attr('src');

    if (bodyImage) {
      if (bodyImage.startsWith('//')) bodyImage = `https:${bodyImage}`;
      else if (bodyImage.startsWith('/')) bodyImage = `${origin}${bodyImage}`;
      else if (!bodyImage.startsWith('http')) bodyImage = `${origin}/${bodyImage}`;

      // Basic heuristic to avoid header/footer logos that might sneak in
      if (
        !bodyImage.toLowerCase().includes('logo') &&
        !bodyImage.toLowerCase().includes('spinner')
      ) {
        imageUrl = bodyImage;
      }
    }

    if (!imageUrl) {
      const ogImage =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        $('link[rel="image_src"]').attr('href') ||
        $('meta[itemprop="image"]').attr('content');

      if (ogImage && ogImage.startsWith('http')) {
        // Prevent known generic fallback logos from being used
        const lowerOg = ogImage.toLowerCase();
        const isGenericLogo =
          lowerOg.includes('default') ||
          lowerOg.includes('logo') ||
          lowerOg.includes('placeholder');

        if (!isGenericLogo) {
          imageUrl = ogImage;
        }
      }
    }

    // --- Extract favicon ---
    // Prefer standard favicon assets first, then touch icons as fallback.
    const faviconHref =
      $('link[rel="icon"]').attr('href') ||
      $('link[rel="shortcut icon"]').attr('href') ||
      $('link[rel="apple-touch-icon"]').attr('href');

    if (faviconHref) {
      // Resolve relative URLs to absolute
      if (faviconHref.startsWith('http')) {
        faviconUrl = faviconHref;
      } else if (faviconHref.startsWith('//')) {
        faviconUrl = `https:${faviconHref}`;
      } else if (faviconHref.startsWith('/')) {
        faviconUrl = `${origin}${faviconHref}`;
      } else {
        faviconUrl = `${origin}/${faviconHref}`;
      }
    }

    // Fallback: Google Favicon API (extremely reliable)
    if (!faviconUrl) {
      faviconUrl = `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=64`;
    }

    return { imageUrl, faviconUrl };
  } catch (err) {
    logger.warn('[Pulse] Failed to scrape article metadata', { url, error: String(err) });

    // Best-effort fallback for favicon even on fetch failure
    try {
      const hostname = new URL(url).hostname;
      faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      /* invalid URL, give up */
    }

    return { faviconUrl };
  }
}

// ─── Article Discovery ──────────────────────────────────────────────────────

function buildDiscoveryPrompt(sport: string, state: string): string {
  return `Find up to ${TARGET_ARTICLE_COUNT} recent news articles about high school ${sport} in ${state}. Include articles about:
- High school ${sport} recruiting (offers, commitments, rankings)
- High school ${sport} players, teams, games, scores, and results in ${state}
- Offseason workouts, spring practice, camps, combines, and showcases
- UIL/state association news, realignment, reclassification
- Scouting reports and prospect evaluations for high school athletes
- Signing day and early commitment news

Exclude NFL, NBA, MLB, and major college conference news (SEC, Big Ten, etc.). Focus ONLY on high school and youth athletes.

For each article return a JSON object with these fields:
- title: exact headline
- excerpt: 2-3 sentence summary  
- source: publisher name (e.g. "MaxPreps", "247Sports", "Rivals", "On3", "VYPE")
- sourceUrl: the full real URL to the article
- imageUrl: The primary hero image URL of the article (must be a valid photograph of the subject, NOT a generic site logo). Return null if not found.
- sport: "${sport}"
- state: "${state}"
- author: author name if known, or null
- publishedAt: publication date in ISO 8601 format

IMPORTANT: Only include articles with real, working URLs. Do not invent URLs.

Return ONLY a JSON array. No markdown, no extra text.`;
}

async function discoverArticles(
  apiKey: string,
  sport: string,
  state: string
): Promise<DiscoveredArticle[]> {
  logger.info('[Pulse] Discovering articles via Perplexity Sonar', { sport, state });

  const raw = await callOpenRouter(
    apiKey,
    SEARCH_MODEL,
    'You are a high school sports news research assistant with live web access. Find REAL, currently-published articles with valid URLs. Return ONLY valid JSON arrays. No markdown fences, no explanation.',
    buildDiscoveryPrompt(sport, state),
    8192
  );

  // Extract JSON from response (handle markdown fences if present)
  let jsonStr = raw.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Find the array boundaries
  const startIdx = jsonStr.indexOf('[');
  const endIdx = jsonStr.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) {
    logger.error('[Pulse] No JSON array found in response', { raw: raw.slice(0, 500) });
    throw new Error('Failed to parse article discovery response');
  }
  jsonStr = jsonStr.slice(startIdx, endIdx + 1);

  const parsed = JSON.parse(jsonStr) as unknown[];

  const articles: DiscoveredArticle[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;

    const title = String(a['title'] ?? '').trim();
    const sourceUrl = String(a['sourceUrl'] ?? '').trim();
    if (!title || !sourceUrl) continue;

    articles.push({
      title,
      excerpt: String(a['excerpt'] ?? '').trim(),
      source: String(a['source'] ?? 'Unknown').trim(),
      sourceUrl,
      faviconUrl: a['faviconUrl'] ? String(a['faviconUrl']).trim() : undefined,
      imageUrl: a['imageUrl'] ? String(a['imageUrl']).trim() : undefined,
      sport: String(a['sport'] ?? 'Football').trim(),
      state: String(a['state'] ?? 'National').trim(),
      author: a['author'] ? String(a['author']).trim() : undefined,
      publishedAt: String(a['publishedAt'] ?? new Date().toISOString()).trim(),
    });
  }

  logger.info('[Pulse] Discovered articles', { count: articles.length });
  return articles;
}

// ─── Summary Generation ─────────────────────────────────────────────────────

/** Strip markdown code fences and normalize whitespace from AI HTML output. */
function sanitizeHtmlContent(raw: string): string {
  let html = raw.trim();
  // Remove ```html ... ``` or ``` ... ``` wrappers
  html = html.replace(/^```(?:html)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  return html.trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100);
}

async function generateSummary(
  apiKey: string,
  article: DiscoveredArticle
): Promise<ArticleWithContent> {
  const [content, metadata] = await Promise.all([
    callOpenRouter(
      apiKey,
      SUMMARY_MODEL,
      `You are a sports journalist writing for NXT1, a sports recruiting platform used by high school and college athletes, coaches, and scouts. Write in an engaging, informative style that is easy to read and well-structured.`,
      `Write a well-structured article summary based on this news:

Title: ${article.title}
Source: ${article.source}
URL: ${article.sourceUrl}
Excerpt: ${article.excerpt}
Sport: ${article.sport}

Write the summary in your own words. Do NOT copy the original article verbatim. Focus on what matters to student-athletes, coaches, and recruiters. Include context about why this news matters for the recruiting landscape.

FORMAT RULES:
- Return clean HTML only (no markdown, no code fences).
- Use <h2> tags for 2-3 section subtitles that break up the article naturally.
- Wrap every paragraph in <p> tags.
- Aim for 4-6 paragraphs grouped under the subtitles.
- Keep subtitles short and compelling (3-6 words).
- Do NOT include the article title — it is already displayed separately.
- Do NOT include any metadata, source attribution, or author names.`,
      1024
    ),
    scrapeArticleMetadata(article.sourceUrl),
  ]);

  return {
    ...article,
    imageUrl: article.imageUrl || metadata.imageUrl,
    faviconUrl: metadata.faviconUrl || article.faviconUrl,
    content: sanitizeHtmlContent(content),
    slug: slugify(article.title),
  };
}

// ─── Firestore Write ────────────────────────────────────────────────────────

async function writeArticlesToFirestore(articles: ArticleWithContent[]): Promise<number> {
  const db = admin.firestore();
  const now = new Date().toISOString();
  let written = 0;

  // Pre-fetch existing sourceUrls in a single query to avoid N+1 reads
  const sourceUrls = articles.map((a) => a.sourceUrl);
  const existingUrls = new Set<string>();

  // Firestore `in` queries max out at 30 values; chunk accordingly
  const chunkSize = 30;
  for (let i = 0; i < sourceUrls.length; i += chunkSize) {
    const chunk = sourceUrls.slice(i, i + chunkSize);
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('sourceUrl', 'in', chunk)
      .select() // metadata-only, no field reads
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data['sourceUrl']) existingUrls.add(data['sourceUrl'] as string);
    }
  }

  // Filter to new articles only, then write in batches of 500
  const newArticles = articles.filter((a) => !existingUrls.has(a.sourceUrl));
  if (newArticles.length === 0) return 0;

  // Compute TTL expiration timestamp for Firestore native TTL policy
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + ARTICLE_TTL_DAYS * 24 * 60 * 60 * 1000)
  );

  const batchLimit = 500;
  for (let i = 0; i < newArticles.length; i += batchLimit) {
    const chunk = newArticles.slice(i, i + batchLimit);
    const batch = db.batch();

    for (const article of chunk) {
      const ref = db.collection(NEWS_COLLECTION).doc();
      batch.set(ref, {
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
        source: article.source,
        sourceUrl: article.sourceUrl,
        faviconUrl: article.faviconUrl ?? null,
        imageUrl: article.imageUrl ?? null,
        sport: article.sport,
        state: article.state,
        author: article.author ?? null,
        publishedAt: article.publishedAt,
        createdAt: now,
        expiresAt,
        viewCount: 0,
      });
      written++;
    }

    await batch.commit();
  }

  return written;
}

// ─── Scheduled Function ─────────────────────────────────────────────────────

/**
 * Daily Pulse Updates — 7:00 AM ET, every day.
 *
 * 1. Discovers 15-20 real HS sports articles via Perplexity Sonar (live web search)
 * 2. Scrapes og:image from each source URL via cheerio
 * 3. Generates AI summaries via DeepSeek Chat
 * 4. Writes to Firestore `News/{id}` with real publisher attribution
 */
export const dailyPulseUpdates = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'America/New_York',
    retryCount: 2,
    timeoutSeconds: 300,
    memory: '512MiB',
    secrets: [OPENROUTER_API_KEY],
  },
  async () => {
    logger.info('[Pulse] Starting daily pulse updates');
    const startMs = Date.now();

    try {
      const apiKey = OPENROUTER_API_KEY.value();
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY secret is not configured');
      }

      // TODO: In production, derive unique [sport]-[state] buckets from active users.
      // For now, we run a single bucket.
      const sport = 'Football';
      const state = 'Texas';

      // Step 1: Discover articles via DeepSeek R1 web search
      const discovered = await discoverArticles(apiKey, sport, state);

      if (discovered.length === 0) {
        logger.warn('[Pulse] No articles discovered — skipping');
        return;
      }

      // Step 2: Generate AI summaries (process in parallel, 5 at a time)
      const withContent: ArticleWithContent[] = [];
      const batchSize = 5;

      for (let i = 0; i < discovered.length; i += batchSize) {
        const batch = discovered.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map((article) => generateSummary(apiKey, article))
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            withContent.push(result.value);
          } else {
            logger.warn('[Pulse] Summary generation failed', {
              error: result.reason?.message ?? String(result.reason),
            });
          }
        }
      }

      logger.info('[Pulse] Generated summaries', {
        attempted: discovered.length,
        succeeded: withContent.length,
      });

      // Step 3: Write to Firestore
      const written = await writeArticlesToFirestore(withContent);

      const durationMs = Date.now() - startMs;
      logger.info('[Pulse] Daily pulse updates completed', {
        discovered: discovered.length,
        summarized: withContent.length,
        written,
        durationMs,
      });
    } catch (error) {
      const durationMs = Date.now() - startMs;
      logger.error('[Pulse] Daily pulse updates failed', { error, durationMs });
      throw error; // Re-throw so Cloud Scheduler retries
    }
  }
);
