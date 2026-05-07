import { describe, expect, it } from 'vitest';

import {
  checkMediaAcquisitionRouting,
  checkTwitterSingleTweetIntent,
} from '../media-acquisition.middleware.js';

describe('media-acquisition.middleware', () => {
  it('blocks scrape_webpage for X single-tweet URLs with corrective scrape_twitter call', () => {
    const result = checkMediaAcquisitionRouting(
      'scrape_webpage',
      'https://x.com/WEGOTNEXTHOOPS1/status/2016489040111972590'
    );

    expect(result).not.toBeNull();
    expect(result?.success).toBe(false);
    expect(result?.error ?? '').toContain('scrape_twitter({ mode: "single_tweet"');
  });

  it('allows scrape_twitter for X single-tweet URLs', () => {
    const result = checkMediaAcquisitionRouting(
      'scrape_twitter',
      'https://x.com/WEGOTNEXTHOOPS1/status/2016489040111972590'
    );

    expect(result).toBeNull();
  });

  it('blocks scrape_twitter for non-twitter URLs and returns corrective route', () => {
    const result = checkMediaAcquisitionRouting(
      'scrape_twitter',
      'https://www.instagram.com/p/ABC123xyz/'
    );

    expect(result).not.toBeNull();
    expect(result?.success).toBe(false);
    expect(result?.error ?? '').toContain('scrape_instagram({ url:');
  });

  it('requires /status/{id} permalink for single-tweet intent', () => {
    const result = checkTwitterSingleTweetIntent('https://x.com/WEGOTNEXTHOOPS1');

    expect(result).not.toBeNull();
    expect(result?.success).toBe(false);
    expect(result?.error ?? '').toContain('scrape_twitter({ mode: "profile_tweets"');
  });
});
