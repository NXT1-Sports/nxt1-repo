import { describe, expect, it } from 'vitest';
import { __dashboardFilmReviewTimelineTestUtils } from '../agent/dashboard.routes.js';

describe('dashboard film review timeline helpers', () => {
  it('unwraps nested multipart image payloads before storage', () => {
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
    const multipartBody = Buffer.from(
      '--boundary-123\r\n' +
        'Content-Type: application/json\r\n\r\n' +
        '{"contentType":"image/jpeg","cacheControl":"private, max-age=0"}\r\n' +
        '--boundary-123\r\n' +
        'Content-Disposition: form-data; name="file"; filename="player.jpeg"\r\n' +
        'Content-Type: image/jpeg\r\n\r\n',
      'latin1'
    );
    const closing = Buffer.from('\r\n--boundary-123--\r\n', 'latin1');
    const malformedFile = {
      buffer: Buffer.concat([multipartBody, jpegBytes, closing]),
      mimetype: 'application/octet-stream',
      originalname: 'upload.bin',
      size: multipartBody.length + jpegBytes.length + closing.length,
    } as Express.Multer.File;

    const normalized =
      __dashboardFilmReviewTimelineTestUtils.normalizeAgentUploadFile(malformedFile);

    expect(normalized.mimeType).toBe('image/jpeg');
    expect(normalized.originalName).toBe('player.jpeg');
    expect(normalized.buffer.equals(jpegBytes)).toBe(true);
    expect(normalized.sizeBytes).toBe(jpegBytes.length);
  });

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

  it('scopes Gemini timeline cache to the requesting user and film review', () => {
    const result = __dashboardFilmReviewTimelineTestUtils.buildFilmReviewTimelineCacheOptions(
      'user-123',
      'review-456'
    );

    expect(result).toEqual({
      userId: 'user-123',
      contextCacheScopeId: 'film-review:review-456',
      enableContextCache: true,
    });
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
            activeFromSec: 12.4,
            activeUntilSec: 14.4,
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
          activeFromSec: 12.4,
          activeUntilSec: 14.4,
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

  it('keeps batch breakdown imports attached to their uploaded source clips', () => {
    const result = __dashboardFilmReviewTimelineTestUtils.normalizeImportedBreakdownTimeline(
      {
        uploadMode: 'batch_clips',
        sources: [
          {
            id: 'clip-1',
            order: 0,
            videoUrl: 'https://example.com/clip-1.mp4',
            title: 'Clip 1',
            durationSec: 14,
          },
          {
            id: 'clip-2',
            order: 1,
            videoUrl: 'https://example.com/clip-2.mp4',
            title: 'Clip 2',
            durationSec: 9,
          },
        ],
        timeline: [],
      },
      [
        {
          id: 'hudl-play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 8,
        },
        {
          id: 'hudl-play-2',
          number: 2,
          label: 'Boot Pass',
          startSec: 8,
          endSec: 16,
        },
      ],
      ['No explicit video start/end columns were found; play timing was estimated from row order.']
    );

    expect(result.warnings).toEqual([
      'No explicit video start/end columns were found; play timing was estimated from row order.',
    ]);
    expect(result.timeline).toEqual([
      expect.objectContaining({
        id: 'hudl-play-1',
        number: 1,
        label: 'Inside Zone',
        startSec: 0,
        endSec: 14,
        sourceId: 'clip-1',
      }),
      expect.objectContaining({
        id: 'hudl-play-2',
        number: 2,
        label: 'Boot Pass',
        startSec: 0,
        endSec: 9,
        sourceId: 'clip-2',
      }),
    ]);
  });

  it('groups wide and tight batch clips into one imported play row', () => {
    const result = __dashboardFilmReviewTimelineTestUtils.normalizeImportedBreakdownTimeline(
      {
        uploadMode: 'batch_clips',
        sources: [
          {
            id: 'clip-13-wide',
            order: 0,
            videoUrl: 'https://example.com/clip-13-wide.mp4',
            title: 'Clip 13 Wide',
            durationSec: 12,
            cameraAngle: 'wide',
            angleGroupId: 'angle-clip-13',
          },
          {
            id: 'clip-13-tight',
            order: 1,
            videoUrl: 'https://example.com/clip-13-tight.mp4',
            title: 'Clip 13 Tight',
            durationSec: 11,
            cameraAngle: 'tight',
            angleGroupId: 'angle-clip-13',
          },
        ],
        timeline: [],
      },
      [
        {
          id: 'hudl-play-13',
          number: 13,
          label: 'Power Read',
          startSec: 0,
          endSec: 8,
        },
      ],
      []
    );

    expect(result.warnings).toEqual([]);
    expect(result.timeline).toEqual([
      expect.objectContaining({
        id: 'hudl-play-13',
        number: 1,
        label: 'Power Read',
        startSec: 0,
        endSec: 12,
        sourceId: 'clip-13-wide',
        sourceIds: ['clip-13-wide', 'clip-13-tight'],
      }),
    ]);
  });
});
