import { describe, expect, it } from 'vitest';
import {
  enrichIntentWithSelectedContexts,
  normalizeSelectedContextsForPayload,
} from './chat-context.helpers.js';

describe('chat-context.helpers', () => {
  it('normalizes selected contexts and drops invalid entries', () => {
    const normalized = normalizeSelectedContextsForPayload([
      {
        id: ' film-play:review-1:12 ',
        kind: 'film_play',
        title: ' Fourth Quarter @ 01:12 ',
        summary: '  Boundary throw with drawn route  ',
        source: {
          type: 'film_review',
          id: ' review-1 ',
          label: ' State Championship Cutup ',
        },
        timeRange: {
          startSec: 72.12345,
          endSec: 78.54321,
        },
        entityRefs: [
          { type: 'player', id: ' athlete-24 ', label: ' QB ' },
          { type: 'player', id: '', label: 'invalid' },
        ],
        media: {
          videoUrl: ' https://cdn.example.com/cut.mp4 ',
          thumbnailUrl: ' https://cdn.example.com/thumb.jpg ',
          cloudflareVideoId: ' cf-video-123 ',
        },
        metadata: {
          hasDrawing: true,
          drawStrokeCount: 3,
          annotationSnapshotAttached: true,
          annotationSnapshotAttachmentName: 'state-championship-cutup-annotated-7212.jpg',
          currentTimeSec: 74.25,
        },
      },
      {
        id: '   ',
        kind: 'custom',
        title: 'invalid',
      },
    ]);

    expect(normalized).toEqual([
      {
        id: 'film-play:review-1:12',
        kind: 'film_play',
        title: 'Fourth Quarter @ 01:12',
        summary: 'Boundary throw with drawn route',
        source: {
          type: 'film_review',
          id: 'review-1',
          label: 'State Championship Cutup',
        },
        timeRange: {
          startSec: 72.123,
          endSec: 78.543,
        },
        entityRefs: [
          {
            type: 'player',
            id: 'athlete-24',
            label: 'QB',
          },
        ],
        metadata: {
          currentTimeSec: 74.25,
        },
      },
    ]);
  });

  it('strips media URLs from film review selected contexts before model prompts', () => {
    const normalized = normalizeSelectedContextsForPayload([
      {
        id: 'film-play:review-1:source-1',
        kind: 'film_play',
        title: 'Clip 1',
        source: {
          type: 'film_review',
          id: 'review-1',
          label: 'Wide Clip',
        },
        media: {
          videoUrl:
            'https://storage.googleapis.com/signed-film-review-clip.mp4?X-Goog-Signature=secret',
          thumbnailUrl: 'https://storage.googleapis.com/signed-thumb.jpg?X-Goog-Signature=secret',
          cloudflareVideoId: 'cf-video-123',
        },
        metadata: {
          itemType: 'film_review',
          sourceId: 'source-1',
        },
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.source).toMatchObject({ type: 'film_review', id: 'review-1' });
    expect(normalized[0]?.metadata).toMatchObject({ sourceId: 'source-1' });
    expect(normalized[0]?.media).toBeUndefined();
    expect(JSON.stringify(normalized)).not.toContain('X-Goog-Signature');
    expect(JSON.stringify(normalized)).not.toContain('signed-film-review-clip.mp4');
  });

  it('injects selected context summaries into intent text for the model', () => {
    const enriched = enrichIntentWithSelectedContexts('Break down this play.', [
      {
        id: 'film-play:review-1:12',
        kind: 'film_play',
        title: 'Fourth Quarter @ 01:12',
        summary: 'Boundary throw with drawn route',
        source: {
          type: 'film_review',
          label: 'State Championship Cutup',
        },
        timeRange: {
          startSec: 72,
          endSec: 78,
        },
        metadata: {
          currentTimeSec: 74.25,
          annotationSnapshotAttached: true,
          annotationSnapshotAttachmentName: 'fourth-quarter-annotated-7200.jpg',
        },
      },
    ]);

    expect(enriched).toContain('Break down this play.');
    expect(enriched).toContain('Selected contexts');
    expect(enriched).toContain(
      'film_play (State Championship Cutup): Fourth Quarter @ 01:12 @ 72s-78s'
    );
    expect(enriched).toContain('Boundary throw with drawn route');
    expect(enriched).toContain('prioritize these contexts');
    expect(enriched).not.toContain('User drawing annotation');
    expect(enriched).not.toContain('flattened annotated full-frame image attachment');
  });

  it('keeps truncated summary within dto max length constraints', () => {
    const normalized = normalizeSelectedContextsForPayload([
      {
        id: 'playbook-play:zone-attack:high-low-rip',
        kind: 'playbook_item',
        title: 'High-Low Rip',
        summary: 'a'.repeat(1000),
      },
    ]);

    expect(normalized).toHaveLength(1);
    const summary = normalized[0]?.summary ?? '';
    expect(summary.length).toBeLessThanOrEqual(600);
    expect(summary.endsWith('...')).toBe(true);
  });

  it('drops annotation payloads from selected contexts', () => {
    const normalized = normalizeSelectedContextsForPayload([
      {
        id: 'film-play:review-1:13',
        kind: 'film_play',
        title: 'Red zone clip',
        annotation: {
          kind: 'square',
          bounds: {
            minX: 0.22,
            minY: 0.31,
            maxX: 0.46,
            maxY: 0.55,
          },
          strokeCount: 1,
        },
      },
    ]);

    expect(normalized[0]?.annotation).toBeUndefined();
  });

  it('bundles large same-source selected contexts before applying the 12-context cap', () => {
    const normalized = normalizeSelectedContextsForPayload(
      Array.from({ length: 25 }, (_, index) => ({
        id: `film-play:review-1:${index + 1}`,
        kind: 'film_play' as const,
        title: `Play ${index + 1}`,
        source: {
          type: 'film_review' as const,
          id: 'review-1',
          label: 'Video 2026',
        },
        timeRange: {
          startSec: index,
          endSec: index + 5,
        },
      }))
    );

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      kind: 'film_play',
      title: '25 selected film plays',
      source: {
        type: 'film_review',
        id: 'review-1',
        label: 'Video 2026',
      },
      metadata: {
        bundleCount: 25,
      },
    });
    expect(normalized[0]?.entityRefs).toHaveLength(25);
    expect(normalized[0]?.timeRange).toBeUndefined();
    expect(normalized[0]?.summary).toContain('From Video 2026.');
  });
});
