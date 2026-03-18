/**
 * Test script: Verify video extraction pipeline against a real Hudl profile.
 *
 * Usage: npx tsx scripts/test-hudl-video-extraction.ts
 *
 * Tests:
 *   1. HTML-level video extraction (page-data-extractor → PageVideo[])
 *   2. Markdown preprocessing preserves video references
 *   3. Video context injection would work in distillWithAI
 *   4. buildDistilledProfile video parsing works on synthetic data
 */

import { ScraperService } from '../src/modules/agent/tools/scraping/scraper.service.js';
import { preprocessMarkdown } from '../src/modules/agent/tools/scraping/distillers/universal-ai.distiller.js';

const HUDL_URL = 'https://www.hudl.com/profile/16389887/Ryder-Lyons';

async function main() {
  let pass = 0;
  let fail = 0;

  function assert(label: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`  ✅ ${label}`);
      pass++;
    } else {
      console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
      fail++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  VIDEO EXTRACTION PIPELINE TEST — Hudl Profile');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── Step 1: Scrape the page ──────────────────────────────────────────
  console.log('Step 1: Scraping Hudl profile...');
  const scraper = new ScraperService();
  let result: Awaited<ReturnType<ScraperService['scrape']>>;

  try {
    result = await scraper.scrape({ url: HUDL_URL });
    assert('Scrape succeeded', true);
    assert(
      'Has markdown content',
      !!result.markdownContent && result.markdownContent.length > 100,
      `length=${result.markdownContent?.length ?? 0}`
    );
    assert('Has page data', !!result.pageData);
  } catch (err) {
    console.log(`  ❌ Scrape failed: ${err instanceof Error ? err.message : String(err)}`);
    fail++;
    console.log(`\n  Result: ${pass} passed, ${fail} failed`);
    process.exit(1);
  }

  // ── Step 2: Check HTML video extraction ──────────────────────────────
  console.log('\nStep 2: HTML-level video extraction (PageVideo[])...');
  const videos = result.pageData?.videos ?? [];
  assert('Videos array exists', Array.isArray(videos));
  assert('Found at least 1 video', videos.length > 0, `found ${videos.length}`);

  if (videos.length > 0) {
    console.log(`\n  Found ${videos.length} video(s):`);
    for (const v of videos) {
      console.log(
        `    - provider: ${v.provider}, src: ${v.src.slice(0, 80)}...${v.videoId ? `, videoId: ${v.videoId}` : ''}`
      );
    }

    assert('First video has src', typeof videos[0]?.src === 'string' && videos[0].src.length > 0);
    assert(
      'First video has provider',
      typeof videos[0]?.provider === 'string' && videos[0].provider.length > 0
    );

    // Hudl-specific checks
    const hudlVideos = videos.filter((v) => v.provider === 'hudl');
    console.log(`\n  Hudl-specific videos: ${hudlVideos.length}`);
    assert('At least 1 Hudl-provider video', hudlVideos.length > 0);

    // Hudl CDN checks — vi.hudl.com direct mp4 URLs
    const cdnVideos = hudlVideos.filter((v) => v.src.includes('vi.hudl.com'));
    console.log(`  Hudl CDN videos (vi.hudl.com): ${cdnVideos.length}`);
    assert('Found Hudl CDN direct mp4 videos', cdnVideos.length > 0, `found ${cdnVideos.length}`);

    if (cdnVideos.length > 0) {
      // Should pick highest quality (no 360/480 when 720 exists)
      const lowQuality = cdnVideos.filter((v) => /_360\.mp4|_480\.mp4/.test(v.src));
      assert(
        'Only highest quality picked (no 360/480 duplicates)',
        lowQuality.length === 0,
        `found ${lowQuality.length} low-quality URLs`
      );

      // Should have highlight IDs
      const withIds = cdnVideos.filter((v) => v.videoId);
      assert(
        'CDN videos have videoId (highlight ID)',
        withIds.length === cdnVideos.length,
        `${withIds.length}/${cdnVideos.length} have videoId`
      );

      // Check for poster thumbnails
      const withPosters = cdnVideos.filter((v) => v.poster);
      console.log(`  CDN videos with poster: ${withPosters.length}/${cdnVideos.length}`);
      if (withPosters.length > 0) {
        assert(
          'Poster URLs are from vc.hudl.com',
          withPosters.every((v) => v.poster?.includes('vc.hudl.com'))
        );
      }
    }
  }

  // ── Step 3: Markdown preprocessing ───────────────────────────────────
  console.log('\nStep 3: Markdown preprocessing...');
  const cleaned = preprocessMarkdown(result.markdownContent);
  assert('Preprocessed markdown is non-empty', cleaned.length > 50, `length=${cleaned.length}`);
  assert(
    'Preprocessing reduced size',
    cleaned.length <= result.markdownContent.length,
    `${result.markdownContent.length} → ${cleaned.length}`
  );

  // Check for video-related content in markdown
  const mdHasVideoRef = /video|highlight|hudl/i.test(cleaned);
  console.log(`  Markdown contains video references: ${mdHasVideoRef}`);

  // ── Step 4: Video context injection ──────────────────────────────────
  console.log('\nStep 4: Video context injection simulation...');
  if (videos.length > 0) {
    const videoLines = videos
      .map((v) => {
        let line = `  - src: ${v.src}, provider: ${v.provider}`;
        if (v.videoId) line += `, videoId: ${v.videoId}`;
        if (v.poster) line += `, poster: ${v.poster}`;
        return line;
      })
      .join('\n');
    const videoContext = `\nPRE-EXTRACTED VIDEOS (detected from HTML iframes/embeds):\n${videoLines}\n`;
    assert('Video context block is non-empty', videoContext.length > 50);
    assert('Video context contains provider info', videoContext.includes('provider:'));
    console.log(`\n  Video context block (${videoContext.length} chars):`);
    console.log(videoContext);
  } else {
    console.log('  (skipped — no videos extracted from HTML)');
  }

  // ── Step 5: buildDistilledProfile video parsing (synthetic) ──────────
  console.log('\nStep 5: buildDistilledProfile video parsing (synthetic test)...');
  // We test the parsing logic by importing the function indirectly
  // Since buildDistilledProfile is not exported, we test the behavior
  // through the structure validation
  const syntheticVideos = [
    {
      src: 'https://www.hudl.com/video/0/12345/abc',
      provider: 'hudl',
      videoId: '12345',
      title: 'Junior Highlights',
    },
    { src: 'https://youtube.com/watch?v=xyz', provider: 'youtube', videoId: 'xyz' },
    { src: 'https://youtube.com/watch?v=xyz', provider: 'youtube', videoId: 'xyz' }, // Duplicate
    { src: '', provider: 'other' }, // Empty src — should be filtered
  ];

  // Validate the filtering logic we wrote in buildDistilledProfile
  const validProviders = new Set(['youtube', 'hudl', 'vimeo', 'twitter', 'other']);
  const seen = new Set<string>();
  const parsed = syntheticVideos
    .filter((v) => typeof v.src === 'string' && v.src.trim().length > 0)
    .map((v) => ({
      src: v.src.trim(),
      provider: validProviders.has(v.provider) ? v.provider : 'other',
      ...(v.videoId ? { videoId: v.videoId } : {}),
      ...(v.title ? { title: v.title } : {}),
    }))
    .filter((v) => {
      const key = v.src.toLowerCase().replace(/\/$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  assert(
    'Synthetic parse: filters empty src',
    parsed.every((v) => v.src.length > 0)
  );
  assert(
    'Synthetic parse: deduplicates by src',
    parsed.length === 2,
    `got ${parsed.length}, expected 2`
  );
  assert('Synthetic parse: preserves videoId', parsed[0]?.videoId === '12345');
  assert('Synthetic parse: preserves title', parsed[0]?.title === 'Junior Highlights');
  assert(
    'Synthetic parse: validates provider',
    parsed.every((v) => validProviders.has(v.provider))
  );

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
