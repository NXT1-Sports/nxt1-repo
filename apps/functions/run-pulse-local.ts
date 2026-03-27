#!/usr/bin/env npx tsx
/**
 * @fileoverview Local test runner for Daily Pulse Updates
 *
 * Runs the full pipeline locally against nxt-1-staging-v2 Firestore:
 *   1. Discovers articles via Perplexity Sonar (live web search via OpenRouter)
 *   2. Scrapes og:image from each real source URL
 *   3. Generates AI summaries via DeepSeek Chat (free/cheap)
 *   4. Writes to Firestore News collection
 *
 * Usage:
 *   npx tsx apps/functions/run-pulse-local.ts
 */

import admin from 'firebase-admin';
import * as cheerio from 'cheerio';

// ─── Configuration ──────────────────────────────────────────────────────────

const OPENROUTER_API_KEY =
  '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';

const STAGING_PROJECT_ID = 'nxt-1-staging-v2';
const STAGING_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@nxt-1-staging-v2.iam.gserviceaccount.com';
const STAGING_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDEhB4WPgixmn6L
EEmgW9QljJunxmRc4Z8oTL8i28UIP88kT4K0mkFFPWyBHiAAFT/HXQwEjylJs3oP
rS5d6PJtKE8PeakTvi2Gh8pepxWr4FerbmRg7xgSi80S2evfEcJhXxbUpah+0osY
9hp5k+bEcVSc11C5RHiCiAZGPKA0v2kIOef3lzqRFAAXtlm/U9fdWxXqzcJ+5koJ
V/eUxIym+jpCVBweOmce9jXYArCpcODAdiY2lu8Ls2Y90QQkxwdqDlB7ySxwDtGM
B27V2UWoYVimG6t6mUcMs3MItr5wVunYxzh6Mc+sQn2My6FW1x8LYwGqe1qAMxue
+ReEOYk/AgMBAAECggEABhReR+rgYvo4Gv5EgNkGbaj1cdHR7guu3FTPfvkUleY/
dsyc6xBwn39AeZggflAp+nV29zcknFqYlp6RdidMRLNACucFI465ItXVnWsG4Rve
KngOU+9hq8U2cXRbdzm57UA/WRHM7it+USXf+M3qED6/UuDYZvrmzYb+xrJ+dFM/
uvE6KK7P8NQQqnPUsG+HAyuYbGR8X0MhM/as2Kiy3UdaTTHx3s1kqakCqcLtXKb3
4ed3LRrIyucaMc6/5sp0FvDVdkm5zo8q4estfrUb9YvQyaShYXd7+jZ9cCHWRf/H
aFyFsnxTQImrYoTm4BXMiOQLOEgWpzgUe4D5ZgzA4QKBgQDs9eonGs91FRkXIjDk
uvc/Wtsc6Jz4pPQ6rM1P8AYQ0itjh8Br386i9o4I4tSBvhZhW54VDwCu1zGypQT6
G4bfixFAchrzQI11soOI8gwwFlMNKjctqM+3umRjSLDVTQkm/IzYCAj+Ru7Dyzm0
6/MWiUi5C48Cw0mUZdm639ixHwKBgQDUTkrQ+PDazh0w/YocaMb6x/6agGcclgPu
RMGaiHSNoyiqV01qErNMlEcNvHn9OXgaJXqO97zmiLzoMnea+2FAgX/yijGGnMo4
a/lFbEd53hhak+SdX4kb9F9kxfxjwsS2qHf8cabMnXYUQ3WXMOnjradenN0zBPq8
3+wsmH2D4QKBgB/2a8cqjqE0X1YHfqDbt04Ma1HS7pl7ZpYjiO4naioKr1+ViBcE
8VJ5/16jehamFU68lO4yP91VmZaHO8ygueidUY5n1crKAkrF8YgfXhV+bWVxNFAs
XRhjQ/dAbtnWsk1X84eQTeY+myY922LUEM4RZoXPUVMGFH633k6esxPxAoGAJiAd
LWPXFOP4uAh/2dQzD2wE28f9PFPwRsSQI+knTRwkvFpLK6ZKDpF+JQhYu9GrML7U
QIJaqOebTPNrKSjFcSkQSgTpGexkIDe7nuzv9QGeS/3NCznRzHRZASbQyTV7z/V2
/p2GP65zOvZWUp1VEy7nJIV076mQQYTQy71ipOECgYBqL33hYsKd6Xsys4q3zC9m
HjBE15OA/3d7u7tfScppGee0fQgL+UAVh6r36cp9stcdAh1BennHmvd6aruxyoWg
DagJNDZQYe9sSivE64oebeaN3IC4dE3yodx/m5qtBbJ+EDYwcHlaFOecgTsoeJCt
gGWk7Etp+QKSbylxlscw4A==
-----END PRIVATE KEY-----`;
const STAGING_STORAGE_BUCKET = 'nxt-1-staging-v2.firebasestorage.app';

// ─── Demo Parameters ────────────────────────────────────────────────────────

const DEMO_SPORT = 'Football';
const DEMO_STATE = 'Texas';

// ─── Constants (mirrored from dailyPulseUpdates.ts) ─────────────────────────

const NEWS_COLLECTION = 'News';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ARTICLE_TTL_DAYS = 14;
const SEARCH_MODEL = 'perplexity/sonar';
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

// ─── Firebase Init ──────────────────────────────────────────────────────────

const app = admin.initializeApp({
  credential: admin.credential.cert({
    projectId: STAGING_PROJECT_ID,
    clientEmail: STAGING_CLIENT_EMAIL,
    privateKey: STAGING_PRIVATE_KEY,
  }),
  storageBucket: STAGING_STORAGE_BUCKET,
});

const db = app.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ─── OpenRouter Helper ──────────────────────────────────────────────────────

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 4096
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`  → Calling ${model} (attempt ${attempt + 1})...`);
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
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
        throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 500)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      if (data.usage) {
        console.log(
          `  ✓ Tokens: ${data.usage.prompt_tokens} in / ${data.usage.completion_tokens} out`
        );
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenRouter');

      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`  ✗ Attempt ${attempt + 1} failed: ${lastError.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error('OpenRouter request failed');
}

// ─── Scraper ────────────────────────────────────────────────────────────────

async function scrapeOgImage(url: string): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        Accept: 'text/html',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return undefined;

    const html = await response.text();
    const $ = cheerio.load(html);

    const ogImage =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('link[rel="image_src"]').attr('href') ||
      $('meta[itemprop="image"]').attr('content');

    if (ogImage && ogImage.startsWith('http')) return ogImage;
  } catch {
    // Silent fail — image scraping is best-effort
  }
  return undefined;
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
- sport: "${sport}"
- state: "${state}"
- author: author name if known, or null
- publishedAt: publication date in ISO 8601 format

IMPORTANT: Only include articles with real, working URLs. Do not invent URLs.

Return ONLY a JSON array. No markdown, no extra text.`;
}

async function discoverArticles(sport: string, state: string): Promise<DiscoveredArticle[]> {
  console.log(`\n📡 Step 1: Discovering ${sport} articles in ${state}...`);

  const raw = await callOpenRouter(
    SEARCH_MODEL,
    'You are a high school sports news research assistant with live web access. Find REAL, currently-published articles with valid URLs. Return ONLY valid JSON arrays. No markdown fences, no explanation.',
    buildDiscoveryPrompt(sport, state),
    8192
  );

  // Extract JSON from response (handle markdown fences)
  let jsonStr = raw.trim();

  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  const startIdx = jsonStr.indexOf('[');
  const endIdx = jsonStr.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) {
    console.error('✗ No JSON array found in response');
    console.error('Raw response (first 1000 chars):', raw.slice(0, 1000));
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
      sport: String(a['sport'] ?? sport).trim(),
      state: String(a['state'] ?? state).trim(),
      author: a['author'] ? String(a['author']).trim() : undefined,
      publishedAt: String(a['publishedAt'] ?? new Date().toISOString()).trim(),
    });
  }

  console.log(`  ✓ Discovered ${articles.length} articles`);
  for (const a of articles) {
    console.log(`    • [${a.source}] ${a.title}`);
  }

  return articles;
}

// ─── Summary Generation ─────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100);
}

async function generateSummary(
  article: DiscoveredArticle,
  index: number,
  total: number
): Promise<ArticleWithContent> {
  console.log(`\n📝 [${index + 1}/${total}] Summarizing: ${article.title}`);

  const [content, scrapedImage] = await Promise.all([
    callOpenRouter(
      SUMMARY_MODEL,
      'You are a sports journalist writing for NXT1, a sports recruiting platform for high school athletes, coaches, and scouts. Write in an engaging, informative style.',
      `Write a 3-5 paragraph article summary based on this news:

Title: ${article.title}
Source: ${article.source}
URL: ${article.sourceUrl}
Excerpt: ${article.excerpt}
Sport: ${article.sport}

Write the summary in your own words. Do NOT copy the original article verbatim. Focus on what matters to student-athletes, coaches, and recruiters. Include context about why this news matters for the high school recruiting landscape.

Return ONLY the article text (plain text paragraphs). No title, no metadata, no markdown headers.`,
      1024
    ),
    scrapeOgImage(article.sourceUrl),
  ]);

  const finalImage = scrapedImage || article.imageUrl;
  console.log(
    `  ${finalImage ? '🖼️  Image: ' + finalImage.slice(0, 80) + '...' : '⚠️  No image found'}`
  );

  return {
    ...article,
    imageUrl: finalImage,
    content: content.trim(),
    slug: slugify(article.title),
  };
}

// ─── Firestore Write ────────────────────────────────────────────────────────

async function writeArticlesToFirestore(articles: ArticleWithContent[]): Promise<number> {
  const now = new Date().toISOString();
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + ARTICLE_TTL_DAYS * 24 * 60 * 60 * 1000)
  );

  let written = 0;
  const batch = db.batch();

  for (const article of articles) {
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
  return written;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  NXT1 Daily Pulse — Local Demo Runner');
  console.log(`  Sport: ${DEMO_SPORT} | State: ${DEMO_STATE}`);
  console.log(`  Target: ${TARGET_ARTICLE_COUNT} articles`);
  console.log(`  Search Model: ${SEARCH_MODEL}`);
  console.log(`  Summary Model: ${SUMMARY_MODEL}`);
  console.log(`  Firestore: ${STAGING_PROJECT_ID} → ${NEWS_COLLECTION}`);
  console.log('═══════════════════════════════════════════════════════════');

  const startMs = Date.now();

  try {
    // Step 0: Delete old (hallucinated) articles from previous runs
    console.log('\n🗑️  Step 0: Cleaning old News articles...');
    const oldDocs = await db.collection(NEWS_COLLECTION).listDocuments();
    if (oldDocs.length > 0) {
      const deleteBatch = db.batch();
      for (const doc of oldDocs) deleteBatch.delete(doc);
      await deleteBatch.commit();
      console.log(`  ✓ Deleted ${oldDocs.length} old articles`);
    } else {
      console.log('  ✓ Collection already empty');
    }

    // Step 1: Discover
    const discovered = await discoverArticles(DEMO_SPORT, DEMO_STATE);

    if (discovered.length === 0) {
      console.error('\n✗ No articles discovered — aborting');
      process.exit(1);
    }

    // Step 2: Summarize + scrape images (5 at a time)
    const withContent: ArticleWithContent[] = [];
    const batchSize = 5;

    for (let i = 0; i < discovered.length; i += batchSize) {
      const batch = discovered.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((article, idx) => generateSummary(article, i + idx, discovered.length))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          withContent.push(result.value);
        } else {
          console.error(`  ✗ Summary failed: ${result.reason?.message ?? String(result.reason)}`);
        }
      }
    }

    // Step 3: Write to Firestore
    console.log(`\n💾 Step 3: Writing ${withContent.length} articles to Firestore...`);
    const written = await writeArticlesToFirestore(withContent);

    const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
    const withImages = withContent.filter((a) => a.imageUrl).length;

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✅ DONE');
    console.log(`  Discovered: ${discovered.length}`);
    console.log(`  Summarized: ${withContent.length}`);
    console.log(`  With Images: ${withImages}/${withContent.length}`);
    console.log(`  Written to Firestore: ${written}`);
    console.log(`  Duration: ${durationSec}s`);
    console.log('═══════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('\n✗ Pipeline failed:', err);
    process.exit(1);
  }

  process.exit(0);
}

main();
