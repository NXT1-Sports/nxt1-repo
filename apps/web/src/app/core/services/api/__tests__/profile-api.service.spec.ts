import { describe, expect, it } from 'vitest';

import type { ProfilePost } from '@nxt1/core';
import { ProfileService } from '../profile-api.service';

function mapTimelineDoc(raw: Record<string, unknown>): ProfilePost {
  const service = Object.create(ProfileService.prototype) as Record<string, unknown>;
  const mapper = service['mapTimelineDoc'];

  if (typeof mapper !== 'function') {
    throw new Error('Expected ProfileService.mapTimelineDoc to be a function');
  }

  return (mapper as (payload: Record<string, unknown>) => ProfilePost).call(service, raw);
}

describe('ProfileService.mapTimelineDoc', () => {
  it('maps feed-item engagement to share and view counts only', () => {
    const mapped = mapTimelineDoc({
      id: 'post-1',
      postType: 'video',
      title: 'Friday Night Lights',
      content: 'Highlights from the game',
      media: [
        {
          url: 'https://cdn.example.com/highlight.mp4',
          thumbnailUrl: 'https://cdn.example.com/highlight.jpg',
          duration: 87,
        },
      ],
      engagement: {
        likeCount: 99,
        shareCount: 12,
        viewCount: 340,
      },
      isPinned: true,
      createdAt: '2026-06-01T10:00:00.000Z',
    });

    expect(mapped).toMatchObject({
      id: 'post-1',
      type: 'video',
      title: 'Friday Night Lights',
      body: 'Highlights from the game',
      thumbnailUrl: 'https://cdn.example.com/highlight.jpg',
      mediaUrl: 'https://cdn.example.com/highlight.mp4',
      shareCount: 12,
      viewCount: 340,
      duration: 87,
      isPinned: true,
      createdAt: '2026-06-01T10:00:00.000Z',
    });
    expect('likeCount' in mapped).toBe(false);
  });

  it('falls back image thumbnails to the media url and defaults share count to zero', () => {
    const mapped = mapTimelineDoc({
      _id: 'legacy-image-1',
      postType: 'image',
      content: 'Training photo',
      media: [
        {
          url: 'https://cdn.example.com/training.jpg',
        },
      ],
    });

    expect(mapped).toMatchObject({
      id: 'legacy-image-1',
      type: 'image',
      body: 'Training photo',
      thumbnailUrl: 'https://cdn.example.com/training.jpg',
      mediaUrl: 'https://cdn.example.com/training.jpg',
      shareCount: 0,
    });
    expect(mapped.viewCount).toBeUndefined();
    expect('likeCount' in mapped).toBe(false);
  });
});
