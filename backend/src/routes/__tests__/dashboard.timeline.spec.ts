import { describe, expect, it } from 'vitest';
import { __dashboardFilmReviewTimelineTestUtils } from '../agent/dashboard.routes.js';

describe('dashboard film review timeline helpers', () => {
  it('parses string timestamps and alternate timeline keys from Gemini output', () => {
    const rawContent = JSON.stringify({
      timeline: [
        {
          label: 'Transition push left',
          start: '00:12',
          end: '00:18.5',
          confidenceScore: 0.84,
        },
      ],
    });

    const result = __dashboardFilmReviewTimelineTestUtils.parseAiTimelineResponse(
      rawContent,
      120,
      'basketball'
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: 'play-1',
        number: 1,
        label: 'Transition push left',
        startSec: 12,
        endSec: 18.5,
        confidence: 0.84,
      }),
    ]);
  });

  it('returns empty array for non-json model output', () => {
    const result = __dashboardFilmReviewTimelineTestUtils.parseAiTimelineResponse(
      'No clear plays detected.',
      90,
      'basketball'
    );

    expect(result).toEqual([]);
  });

  it('replaces cross-sport labels with neutral sequence labels', () => {
    const rawContent = JSON.stringify({
      plays: [
        {
          label: 'Wing Catch & Shoot 3-Pointer',
          startSec: 2,
          endSec: 5,
          confidence: 0.91,
        },
      ],
    });

    const result = __dashboardFilmReviewTimelineTestUtils.parseAiTimelineResponse(
      rawContent,
      90,
      'football'
    );

    expect(result).toEqual([
      expect.objectContaining({
        label: 'Sequence 1',
        startSec: 2,
        endSec: 5,
        confidence: 0.91,
      }),
    ]);
  });

  it('builds deterministic fallback segments that cover the review duration', () => {
    const result = __dashboardFilmReviewTimelineTestUtils.buildFallbackTimelineSegments(185);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'play-1',
        number: 1,
        label: 'Sequence 1',
        startSec: 0,
      })
    );
    expect(result.at(-1)?.endSec).toBe(185);
    expect(result.every((segment) => segment.endSec > segment.startSec)).toBe(true);
  });

  it('sanitizes nested annotation strokes from timeline payloads before persistence', () => {
    const result = __dashboardFilmReviewTimelineTestUtils.parseFilmReviewTimelineSegments(
      [
        {
          label: 'Drive and kick',
          startSec: 12,
          endSec: 18,
          annotation: {
            kind: 'freehand',
            strokes: [
              [
                { x: 0.1, y: 0.2 },
                { x: 0.15, y: 0.25 },
              ],
              [
                { x: 0.3, y: 0.4 },
                { x: 0.35, y: 0.45 },
              ],
            ],
          },
        },
      ],
      'basketball'
    );

    expect(result).toEqual([
      expect.objectContaining({
        annotation: expect.objectContaining({
          kind: 'freehand',
          strokeCount: 2,
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.15, y: 0.25 },
            { x: 0.3, y: 0.4 },
            { x: 0.35, y: 0.45 },
          ],
        }),
      }),
    ]);
    expect(result?.[0]?.annotation).not.toHaveProperty('strokes');
  });
});
