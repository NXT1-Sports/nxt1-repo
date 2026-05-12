import { describe, expect, it } from 'vitest';
import { buildTrackedLinkUrl, extractTrackedDestinationUrl } from './browser.helpers';

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

describe('extractTrackedDestinationUrl', () => {
  it('extracts the destination from a tracked click URL', () => {
    const trackedUrl =
      'http://localhost:3000/api/v1/staging/analytics/track/click?destination=https%3A%2F%2Ffirebasestorage.googleapis.com%2Fv0%2Fb%2Fnxt-1-v2.firebasestorage.app%2Fo%2FUsers%252Fabc%252Fexports%252Ffile.pdf%3Falt%3Dmedia%26token%3D123&surface=message&source=markdown';

    expect(extractTrackedDestinationUrl(trackedUrl)).toBe(
      'https://firebasestorage.googleapis.com/v0/b/nxt-1-v2.firebasestorage.app/o/Users%2Fabc%2Fexports%2Ffile.pdf?alt=media&token=123'
    );
  });

  it('returns null for non-tracking URLs', () => {
    expect(extractTrackedDestinationUrl('https://nxt1sports.com/help')).toBeNull();
  });
});
