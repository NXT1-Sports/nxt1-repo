import { describe, expect, it } from 'vitest';

import { UrlClassifierService } from '../url-classifier.service.js';

const svc = new UrlClassifierService();

describe('UrlClassifierService.classify()', () => {
  // ── Twitter / X ─────────────────────────────────────────────────────────

  it('classifies a Twitter single-tweet URL', () => {
    const result = svc.classify('https://x.com/WEGOTNEXTHOOPS1/status/2016489040111972590');
    expect(result.platform).toBe('twitter');
    expect(result.assetKind).toBe('single_tweet');
    expect(result.strategy).toBe('scrape_twitter_single_tweet');
    expect(result.isSocialBlocked).toBe(true);
    expect(result.correctiveExample).toContain('single_tweet');
  });

  it('classifies a twitter.com single-tweet URL (legacy domain)', () => {
    const result = svc.classify('https://twitter.com/SomeUser/status/1234567890');
    expect(result.strategy).toBe('scrape_twitter_single_tweet');
  });

  it('classifies a Twitter profile URL', () => {
    const result = svc.classify('https://x.com/SomeAthlete');
    expect(result.platform).toBe('twitter');
    expect(result.assetKind).toBe('profile');
    expect(result.strategy).toBe('scrape_twitter_profile');
    expect(result.isSocialBlocked).toBe(true);
  });

  it('classifies a Twitter profile URL with trailing slash', () => {
    const result = svc.classify('https://x.com/SomeAthlete/');
    expect(result.strategy).toBe('scrape_twitter_profile');
  });

  // ── Instagram ────────────────────────────────────────────────────────────

  it('classifies an Instagram post URL', () => {
    const result = svc.classify('https://www.instagram.com/p/ABC123xyz/');
    expect(result.platform).toBe('instagram');
    expect(result.assetKind).toBe('video');
    expect(result.strategy).toBe('scrape_instagram');
    expect(result.isSocialBlocked).toBe(true);
  });

  it('classifies an Instagram reel URL', () => {
    const result = svc.classify('https://instagram.com/reel/DEF456abc/');
    expect(result.strategy).toBe('scrape_instagram');
  });

  it('classifies an Instagram profile URL', () => {
    const result = svc.classify('https://instagram.com/someathlete');
    expect(result.platform).toBe('instagram');
    expect(result.assetKind).toBe('profile');
    expect(result.strategy).toBe('scrape_instagram');
  });

  // ── YouTube ──────────────────────────────────────────────────────────────

  it('classifies a YouTube watch URL', () => {
    const result = svc.classify('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.platform).toBe('youtube');
    expect(result.assetKind).toBe('video');
    expect(result.strategy).toBe('analyze_video_direct');
    expect(result.isSocialBlocked).toBe(false);
  });

  it('classifies a youtu.be short URL', () => {
    const result = svc.classify('https://youtu.be/dQw4w9WgXcQ');
    expect(result.platform).toBe('youtube');
    expect(result.strategy).toBe('analyze_video_direct');
  });

  // ── Direct media ─────────────────────────────────────────────────────────

  it('classifies a direct MP4 URL', () => {
    const result = svc.classify('https://cdn.example.com/highlight.mp4');
    expect(result.assetKind).toBe('video');
    expect(result.strategy).toBe('stage_direct_video');
    expect(result.isSocialBlocked).toBe(false);
  });

  it('classifies a direct MP4 URL with query params', () => {
    const result = svc.classify('https://cdn.example.com/clip.mp4?v=abc123&token=xyz');
    expect(result.assetKind).toBe('video');
    expect(result.strategy).toBe('stage_direct_video');
  });

  it('classifies a public Hudl video page as extract_hudl_video', () => {
    const result = svc.classify('https://www.hudl.com/video/3/3850048/59f919f1f32752222c7b22b7');
    expect(result.platform).toBe('hudl');
    expect(result.strategy).toBe('extract_hudl_video');
    expect(result.correctiveExample).toContain('extract_hudl_video');
  });

  it('classifies non-video Hudl surfaces as live_view_required fallback', () => {
    const result = svc.classify('https://www.hudl.com/library/12345');
    expect(result.platform).toBe('hudl');
    expect(result.strategy).toBe('live_view_required');
  });

  it('classifies a direct JPG URL', () => {
    const result = svc.classify('https://example.com/photo.jpg');
    expect(result.assetKind).toBe('image');
    expect(result.strategy).toBe('stage_direct_image');
  });

  it('classifies a direct WebP URL', () => {
    const result = svc.classify('https://example.com/headshot.webp');
    expect(result.strategy).toBe('stage_direct_image');
  });

  it('classifies an HLS manifest URL', () => {
    const result = svc.classify('https://stream.example.com/live/index.m3u8');
    expect(result.assetKind).toBe('stream');
    expect(result.strategy).toBe('stage_direct_stream');
  });

  it('classifies a DASH manifest URL', () => {
    const result = svc.classify('https://stream.example.com/live/manifest.mpd');
    expect(result.strategy).toBe('stage_direct_stream');
  });

  // ── Generic web pages ────────────────────────────────────────────────────

  it('classifies a college athletics page as firecrawl_scrape', () => {
    const result = svc.classify('https://gophersports.com/sports/football/roster/john-doe');
    expect(result.strategy).toBe('firecrawl_scrape');
    expect(result.isSocialBlocked).toBe(false);
  });

  it('falls back to firecrawl_scrape for unknown URLs', () => {
    const result = svc.classify('https://somerandomain.example.com/page');
    expect(result.strategy).toBe('firecrawl_scrape');
  });

  // ── isSocialBlocked helper ───────────────────────────────────────────────

  it('reports isSocialBlocked=false for non-social URLs', () => {
    const result = svc.classify('https://vimeo.com/123456');
    expect(result.isSocialBlocked).toBe(false);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('handles non-parseable URL gracefully (no throw)', () => {
    expect(() => svc.classify('not-a-url')).not.toThrow();
    const result = svc.classify('not-a-url');
    expect(result.strategy).toBe('firecrawl_scrape');
  });

  it('is case-insensitive for hostnames', () => {
    const result = svc.classify('https://X.COM/SomeUser/status/1234567890');
    expect(result.strategy).toBe('scrape_twitter_single_tweet');
  });
});
