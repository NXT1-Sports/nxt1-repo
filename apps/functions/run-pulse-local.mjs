#!/usr/bin/env node
/**
 * Local trigger for the dailyPulseUpdates pipeline.
 * Mirrors the Cloud Function logic exactly: Perplexity → Claude → Firestore.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// ─── Config ─────────────────────────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) { console.error('Missing OPENROUTER_API_KEY'); process.exit(1); }

const NEWS_COLLECTION = 'News';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ARTICLE_TTL_DAYS = 14;
const SEARCH_MODEL = 'perplexity/sonar';
const SUMMARY_MODEL = 'anthropic/claude-3.5-haiku';
const TARGET_ARTICLE_COUNT = 18;
const MAX_RETRIES = 2;

const saPath = new URL(
  '../../../nxt1-backend/assets/nxt-1-staging-v2-firebase-adminsdk-fbsvc-0e09aefb3e.json',
  import.meta.url
);
const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// ─── OpenRouter Helper ──────────────────────────────────────────────────────
async function callOpenRouter(model, systemPrompt, userMessage, maxTokens = 4096) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
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
        throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 300)}`);
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenRouter');
      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        console.log(`   ⚠️  Retry ${attempt + 1}...`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error('OpenRouter request failed');
}

// ─── Article Discovery ──────────────────────────────────────────────────────
function buildDiscoveryPrompt() {
  const today = new Date().toISOString().split('T')[0];
  return `Search the web for today's (${today}) top high school and college sports recruiting news articles. Find ${TARGET_ARTICLE_COUNT} real articles from legitimate sports news publishers.

Focus on:
- High school recruiting (football, basketball, baseball, soccer, volleyball, track, lacrosse, softball)
- College commitments and decommitments
- Transfer portal news
- Recruiting rankings updates
- Camp and combine results
- State and regional recruiting news

For EACH article, provide:
- title: The exact headline
- excerpt: 2-3 sentence summary
- source: Publisher name (e.g. "247Sports", "Rivals", "ESPN", "MaxPreps", "On3")
- sourceUrl: Full URL to the original article
- faviconUrl: The publisher's favicon URL (e.g. "https://247sports.com/favicon.ico")
- imageUrl: The article's og:image or hero image URL if available
- sport: The primary sport (e.g. "Football", "Basketball", "Baseball")
- state: The primary US state relevant to the story (e.g. "Texas", "Florida", "Ohio") or "National" if not state-specific
- author: Author name if available
- publishedAt: Publication date in ISO 8601 format

Return ONLY a JSON array of objects. No markdown, no explanation, just the raw JSON array.
Example: [{"title":"...","excerpt":"...","source":"...","sourceUrl":"...","sport":"...","state":"...","publishedAt":"..."}]`;
}

async function discoverArticles() {
  console.log('1. 🔍 Discovering articles via Perplexity sonar...');
  const raw = await callOpenRouter(
    SEARCH_MODEL,
    'You are a sports news research assistant. Return ONLY valid JSON arrays. No markdown fences, no explanation.',
    buildDiscoveryPrompt(),
    8192
  );

  let jsonStr = raw.trim();
  console.log(`   Raw response length: ${jsonStr.length} chars`);
  console.log(`   First 200 chars: ${jsonStr.slice(0, 200)}`);
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const startIdx = jsonStr.indexOf('[');
  const endIdx = jsonStr.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) throw new Error('No JSON array in response');
  jsonStr = jsonStr.slice(startIdx, endIdx + 1);
  const parsed = JSON.parse(jsonStr);

  const articles = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const title = String(item.title ?? '').trim();
    const sourceUrl = String(item.sourceUrl ?? '').trim();
    if (!title || !sourceUrl) continue;
    articles.push({
      title,
      excerpt: String(item.excerpt ?? '').trim(),
      source: String(item.source ?? 'Unknown').trim(),
      sourceUrl,
      faviconUrl: item.faviconUrl ? String(item.faviconUrl).trim() : null,
      imageUrl: item.imageUrl ? String(item.imageUrl).trim() : null,
      sport: String(item.sport ?? 'Football').trim(),
      state: String(item.state ?? 'National').trim(),
      author: item.author ? String(item.author).trim() : null,
      publishedAt: String(item.publishedAt ?? new Date().toISOString()).trim(),
    });
  }

  console.log(`   ✅ Discovered ${articles.length} articles\n`);
  return articles;
}

// ─── Summary Generation ─────────────────────────────────────────────────────
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100);
}

async function generateSummary(article) {
  const content = await callOpenRouter(
    SUMMARY_MODEL,
    'You are a sports journalist writing for NXT1, a sports recruiting platform used by high school and college athletes, coaches, and scouts. Write in an engaging, informative style.',
    `Write a 3-5 paragraph article summary based on this news:\n\nTitle: ${article.title}\nSource: ${article.source}\nURL: ${article.sourceUrl}\nExcerpt: ${article.excerpt}\nSport: ${article.sport}\n\nWrite the summary in your own words. Do NOT copy the original article verbatim. Focus on what matters to student-athletes, coaches, and recruiters. Include context about why this news matters for the recruiting landscape.\n\nReturn ONLY the article text (plain text paragraphs). No title, no metadata, no markdown headers.`,
    1024
  );
  return { ...article, content: content.trim(), slug: slugify(article.title) };
}

// ─── Firestore Write ────────────────────────────────────────────────────────
async function writeArticles(articles) {
  const now = new Date().toISOString();
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + ARTICLE_TTL_DAYS * 24 * 60 * 60 * 1000));

  // Dedup against existing
  const sourceUrls = articles.map((a) => a.sourceUrl);
  const existingUrls = new Set();
  for (let i = 0; i < sourceUrls.length; i += 30) {
    const chunk = sourceUrls.slice(i, i + 30);
    const snap = await db.collection(NEWS_COLLECTION).where('sourceUrl', 'in', chunk).select().get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.sourceUrl) existingUrls.add(data.sourceUrl);
    }
  }

  const newArticles = articles.filter((a) => !existingUrls.has(a.sourceUrl));
  if (newArticles.length === 0) { console.log('   All articles already exist'); return 0; }

  const batch = db.batch();
  for (const article of newArticles) {
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
  }
  await batch.commit();
  return newArticles.length;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('━━━ NXT1 Pulse — Manual Trigger ━━━\n');
  const startMs = Date.now();

  const discovered = await discoverArticles();
  if (discovered.length === 0) { console.log('No articles found.'); return; }

  console.log('2. ✍️  Generating AI summaries (5 at a time)...');
  const withContent = [];
  const batchSize = 5;
  for (let i = 0; i < discovered.length; i += batchSize) {
    const batch = discovered.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((a) => generateSummary(a)));
    for (const r of results) {
      if (r.status === 'fulfilled') withContent.push(r.value);
      else console.log(`   ⚠️  Summary failed: ${r.reason?.message ?? r.reason}`);
    }
    console.log(`   ${Math.min(i + batchSize, discovered.length)}/${discovered.length} processed`);
  }
  console.log(`   ✅ Generated ${withContent.length} summaries\n`);

  console.log('3. 💾 Writing to Firestore...');
  const written = await writeArticles(withContent);
  console.log(`   ✅ Wrote ${written} new articles\n`);

  const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`━━━ Done! ${written} articles in ${durationSec}s ━━━`);
}

main().catch((err) => { console.error('❌', err.message ?? err); process.exit(1); });
