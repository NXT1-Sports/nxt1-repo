import { describe, expect, it } from 'vitest';
import {
  getUniversalFileClassification,
  getUniversalFilmReviewPayload,
  getUniversalPrimaryClassification,
} from './universal-file.model';

describe('universal file classification', () => {
  it('prefers universal classification fields over legacy documentSubtype aliases', () => {
    const classification = getUniversalFileClassification({
      type: 'file',
      documentSubtype: 'legacy_game_plan',
      classification: {
        primary: 'game_plan',
        route: 'game-plans',
        labels: ['strategy'],
      },
    });

    expect(classification).toEqual({
      primary: 'game-plans',
      route: 'game-plans',
      labels: ['strategy', 'game-plans'],
    });
    expect(
      getUniversalPrimaryClassification({
        type: 'file',
        documentSubtype: 'legacy_game_plan',
        classification: {
          primary: 'game_plan',
          route: 'game-plans',
        },
      })
    ).toBe('game-plans');
  });

  it('does not classify file records from documentSubtype alone anymore', () => {
    expect(
      getUniversalFileClassification({
        type: 'file',
        documentSubtype: 'callsheet',
        classification: undefined,
      })
    ).toBeNull();

    expect(
      getUniversalPrimaryClassification({
        type: 'file',
        documentSubtype: 'callsheet',
        classification: undefined,
      })
    ).toBeUndefined();
  });
});

describe('universal film review payload detection', () => {
  it('does not treat native asset payload containers as film reviews', () => {
    expect(
      getUniversalFilmReviewPayload({
        asset: {
          mimeType: 'video/mp4',
          kind: 'video',
          origin: 'files_upload',
          sizeBytes: 4096,
          url: 'https://cdn.example.com/practice-clip.mp4',
        },
      })
    ).toBeNull();
  });

  it('reads nested film review payloads from native file payload containers', () => {
    expect(
      getUniversalFilmReviewPayload({
        asset: {
          mimeType: 'video/mp4',
          kind: 'video',
          origin: 'files_upload',
          sizeBytes: 4096,
          url: 'https://cdn.example.com/practice-clip.mp4',
        },
        filmReview: {
          videoUrl: 'https://cdn.example.com/practice-clip.mp4',
          playlistId: 'playlist-special-teams',
        },
      })
    ).toMatchObject({
      videoUrl: 'https://cdn.example.com/practice-clip.mp4',
      playlistId: 'playlist-special-teams',
    });
  });
});
