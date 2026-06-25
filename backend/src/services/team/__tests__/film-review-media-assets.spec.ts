import { describe, expect, it } from 'vitest';
import {
  collectFilmReviewMediaAssetRefs,
  extractStoragePathFromUrl,
} from '../film-review-media-assets.js';

describe('film review media assets', () => {
  it('collects and dedupes linked cloudflare ids and firebase storage paths', () => {
    const refs = collectFilmReviewMediaAssetRefs({
      cloudflareVideoId: ' cf-primary ',
      storagePath: 'Teams/team-1/library/main.mp4',
      videoUrl: 'https://storage.googleapis.com/nxt1-test/Teams/team-1/library/main.mp4?sig=abc',
      sources: [
        {
          id: 'source-1',
          order: 0,
          videoUrl: 'https://watch.cloudflarestream.com/cf-primary',
          storagePath: 'Teams/team-1/library/main.mp4',
          cloudflareVideoId: 'cf-primary',
        },
        {
          id: 'source-2',
          order: 1,
          videoUrl:
            'https://firebasestorage.googleapis.com/v0/b/nxt1-test/o/Teams%2Fteam-1%2Flibrary%2Fclip-2.mp4?alt=media&token=abc',
          downloadUrl: 'https://storage.googleapis.com/nxt1-test/Teams/team-1/library/clip-2.mp4',
          cloudflareVideoId: 'cf-clip-2',
        },
      ],
      breakdownSource: {
        provider: 'csv',
        fileName: 'week-4.csv',
        mimeType: 'text/csv',
        storagePath: 'Teams/team-1/library/breakdowns/week-4.csv',
        rowCount: 42,
        playCount: 38,
        importedBy: 'coach-1',
        importedAt: '2026-06-18T00:00:00.000Z',
      },
    });

    expect(refs.cloudflareVideoIds).toEqual(['cf-primary', 'cf-clip-2']);
    expect(refs.storagePaths).toEqual([
      'Teams/team-1/library/main.mp4',
      'Teams/team-1/library/clip-2.mp4',
      'Teams/team-1/library/breakdowns/week-4.csv',
    ]);
  });

  it('extracts firebase object paths from supported url formats', () => {
    expect(
      extractStoragePathFromUrl(
        'https://firebasestorage.googleapis.com/v0/b/nxt1-test/o/Users%2Fdemo%2Fvideo.mp4?alt=media&token=abc'
      )
    ).toBe('Users/demo/video.mp4');

    expect(
      extractStoragePathFromUrl(
        'https://storage.googleapis.com/nxt1-test/Users/demo/video.mp4?X-Goog-Signature=abc'
      )
    ).toBe('Users/demo/video.mp4');

    expect(extractStoragePathFromUrl('gs://nxt1-test/Users/demo/video.mp4')).toBe(
      'Users/demo/video.mp4'
    );
  });
});
