import { describe, expect, it } from 'vitest';

import { buildVideoThumbnailMap, injectVideoPosters } from '../inject-video-posters.js';

describe('injectVideoPosters', () => {
  it('does not add a duplicate poster fragment when a video link already has one', () => {
    const videoUrl = 'https://cdn.example.com/final-video.mp4';
    const thumbnailUrl = 'https://cdn.example.com/final-video-thumbnail.jpg';
    const markdown = `[View Video](${videoUrl}#poster=${encodeURIComponent(thumbnailUrl)})`;
    const thumbnails = buildVideoThumbnailMap([{ url: videoUrl, thumbnailUrl }]);

    expect(injectVideoPosters(markdown, thumbnails)).toBe(markdown);
  });
});
