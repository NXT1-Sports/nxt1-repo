import { describe, expect, it } from 'vitest';

import type { ProfilePost } from '@nxt1/core/profile';
import { ProfileApiService } from '../profile-api.service';

function mapTimelineDoc(raw: Record<string, unknown>): ProfilePost {
  const service = Object.create(ProfileApiService.prototype) as Record<string, unknown>;
  const mapper = service['mapTimelineDoc'];

  if (typeof mapper !== 'function') {
    throw new Error('Expected ProfileApiService.mapTimelineDoc to be a function');
  }

  return (mapper as (payload: Record<string, unknown>) => ProfilePost).call(service, raw);
}

describe('ProfileApiService.mapTimelineDoc', () => {
  it('maps raw timeline stats to share and view counts only', () => {
    const mapped = mapTimelineDoc({
      id: 'mobile-post-1',
      type: 'video',
      title: 'Workout Clip',
      content: 'Offseason training',
      thumbnailUrl: 'https://cdn.example.com/workout.jpg',
      mediaUrl: 'https://cdn.example.com/workout.mp4',
      stats: {
        likes: 55,
        shares: 7,
        views: 204,
      },
      duration: 33,
      isPinned: false,
      createdAt: '2026-06-02T09:30:00.000Z',
    });

    expect(mapped).toMatchObject({
      id: 'mobile-post-1',
      type: 'video',
      title: 'Workout Clip',
      body: 'Offseason training',
      thumbnailUrl: 'https://cdn.example.com/workout.jpg',
      mediaUrl: 'https://cdn.example.com/workout.mp4',
      shareCount: 7,
      viewCount: 204,
      duration: 33,
      isPinned: false,
      createdAt: '2026-06-02T09:30:00.000Z',
    });
    expect('likeCount' in mapped).toBe(false);
  });

  it('defaults missing stats to zero shares with no views', () => {
    const mapped = mapTimelineDoc({
      _id: 'legacy-text-1',
      content: 'Text-only legacy update',
    });

    expect(mapped).toMatchObject({
      id: 'legacy-text-1',
      type: 'text',
      body: 'Text-only legacy update',
      shareCount: 0,
    });
    expect(mapped.viewCount).toBeUndefined();
    expect('likeCount' in mapped).toBe(false);
  });
});
