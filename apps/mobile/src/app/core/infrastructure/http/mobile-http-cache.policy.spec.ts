import { describe, expect, it } from 'vitest';
import { CACHE_CONFIG } from '@nxt1/core/cache';

import {
  getMobileHttpCacheInvalidationPatterns,
  getMobileHttpCacheTtl,
  shouldUseMobileHttpCache,
} from './mobile-http-cache.policy';

describe('mobile-http-cache.policy', () => {
  it('uses short TTL for activity feed endpoints', () => {
    expect(getMobileHttpCacheTtl('/api/v1/activity/feed')).toBe(CACHE_CONFIG.SHORT_TTL);
  });

  it('uses medium TTL for profile endpoints', () => {
    expect(getMobileHttpCacheTtl('/api/v1/profile/user-123')).toBe(CACHE_CONFIG.MEDIUM_TTL);
  });

  it('bypasses cache for non-GET requests', () => {
    expect(shouldUseMobileHttpCache('POST', '/api/v1/activity/feed')).toBe(false);
  });

  it('bypasses cache when explicit no-cache headers are present', () => {
    expect(shouldUseMobileHttpCache('GET', '/api/v1/activity/feed', { 'X-No-Cache': '1' })).toBe(
      false
    );

    expect(
      shouldUseMobileHttpCache('GET', '/api/v1/activity/feed', {
        'Cache-Control': 'no-cache, max-age=0',
      })
    ).toBe(false);
  });

  it('never caches dynamic Agent X endpoints', () => {
    expect(shouldUseMobileHttpCache('GET', '/api/v1/agent-x/jobs')).toBe(false);
  });

  it('returns invalidation patterns for activity mutations', () => {
    expect(getMobileHttpCacheInvalidationPatterns('/api/v1/activity/archive/123')).toContain(
      '*activity*'
    );
  });

  it('returns invalidation patterns for usage mutations', () => {
    const patterns = getMobileHttpCacheInvalidationPatterns('/api/v1/usage/billing-mode');

    expect(patterns).toContain('*usage*');
    expect(patterns).toContain('*billing/budget*');
  });
});
