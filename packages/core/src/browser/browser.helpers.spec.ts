import { describe, expect, it } from 'vitest';
import { buildTrackedLinkUrl } from './browser.helpers';

describe('buildTrackedLinkUrl', () => {
  it('builds a tracked click URL with encoded destination and metadata', () => {
    const url = buildTrackedLinkUrl('https://nxt1sports.com', 'https://example.com/article?id=42', {
      surface: 'post',
      source: 'feed_share',
      subjectType: 'user',
      subjectId: 'user_123',
    });

    expect(url).toBe(
      'https://nxt1sports.com/api/v1/analytics/track/click?destination=https%3A%2F%2Fexample.com%2Farticle%3Fid%3D42&surface=post&source=feed_share&subjectType=user&subjectId=user_123'
    );
  });

  it('preserves the staging API prefix when the tracking base points at staging', () => {
    const url = buildTrackedLinkUrl(
      'http://localhost:3000/api/v1/staging',
      'https://example.com/export.csv',
      {
        surface: 'message',
        source: 'markdown',
      }
    );

    expect(url).toBe(
      'http://localhost:3000/api/v1/staging/analytics/track/click?destination=https%3A%2F%2Fexample.com%2Fexport.csv&surface=message&source=markdown'
    );
  });

  it('falls back to the original destination when the tracking base is invalid', () => {
    const destination = 'https://nxt1sports.com/post/post_123';

    expect(buildTrackedLinkUrl('', destination, { surface: 'post' })).toBe(destination);
  });
});
