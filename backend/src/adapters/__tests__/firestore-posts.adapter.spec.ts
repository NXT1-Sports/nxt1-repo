import { describe, expect, it } from 'vitest';
import type { FeedAuthor } from '@nxt1/core/posts';
import type { FirestorePostDoc } from '../firestore-posts.adapter.js';
import { firestorePostToFeedPost } from '../firestore-posts.adapter.js';

function createTimestamp(iso: string) {
  return {
    toDate: () => new Date(iso),
  };
}

function createAuthor(): FeedAuthor {
  return {
    uid: 'user-1',
    profileCode: 'user-1',
    displayName: 'Kitty Keller',
    firstName: 'Kitty',
    lastName: 'Keller',
  };
}

function createDoc(overrides: Partial<FirestorePostDoc> = {}): FirestorePostDoc {
  const timestamp = createTimestamp('2026-04-22T00:00:00.000Z');

  return {
    userId: 'user-1',
    content: 'Perfect spiral to the corner of the end zone',
    type: 'video',
    visibility: 'public',
    createdAt: timestamp as never,
    updatedAt: timestamp as never,
    stats: {
      shares: 0,
      views: 0,
    },
    ...overrides,
  };
}

describe('firestorePostToFeedPost', () => {
  it('derives a Cloudflare thumbnail when the video has no persisted thumbnail fields', () => {
    const result = firestorePostToFeedPost(
      'post-1',
      createDoc({
        cloudflareVideoId: 'video-123',
        mediaUrl: 'https://videodelivery.net/video-123/iframe',
        playback: {
          iframeUrl: 'https://videodelivery.net/video-123/iframe',
        },
      }),
      createAuthor()
    );

    expect(result.media).toHaveLength(1);
    expect(result.media[0]).toMatchObject({
      type: 'video',
      thumbnailUrl: 'https://videodelivery.net/video-123/thumbnails/thumbnail.jpg',
    });
  });

  it('prefers a persisted thumbnail over the derived Cloudflare thumbnail', () => {
    const result = firestorePostToFeedPost(
      'post-1',
      createDoc({
        cloudflareVideoId: 'video-123',
        mediaUrl: 'https://videodelivery.net/video-123/iframe',
        thumbnailUrl:
          'https://customer-123.cloudflarestream.com/video-123/thumbnails/thumbnail.jpg',
        playback: {
          iframeUrl: 'https://videodelivery.net/video-123/iframe',
        },
      }),
      createAuthor()
    );

    expect(result.media[0]).toMatchObject({
      type: 'video',
      thumbnailUrl: 'https://customer-123.cloudflarestream.com/video-123/thumbnails/thumbnail.jpg',
    });
  });
});
