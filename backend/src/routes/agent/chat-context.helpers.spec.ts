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
        annotation: {
          kind: 'freehand',
          bounds: {
            minX: 0.12345,
            minY: 0.23456,
            maxX: 0.54321,
            maxY: 0.76543,
          },
          strokeCount: 3,
          points: [
            { x: 0.12345, y: 0.23456 },
            { x: 0.54321, y: 0.76543 },
          ],
        },
        metadata: {
          hasDrawing: true,
          drawStrokeCount: 3,
          annotationSnapshotAttached: true,
          annotationSnapshotAttachmentName: 'state-championship-cutup-annotated-7212.jpg',
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
        media: {
          videoUrl: 'https://cdn.example.com/cut.mp4',
          thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
          cloudflareVideoId: 'cf-video-123',
        },
        annotation: {
          kind: 'freehand',
          bounds: {
            minX: 0.123,
            minY: 0.235,
            maxX: 0.543,
            maxY: 0.765,
          },
          strokeCount: 3,
          points: [
            { x: 0.123, y: 0.235 },
            { x: 0.543, y: 0.765 },
          ],
        },
        metadata: {
          hasDrawing: true,
          drawStrokeCount: 3,
          annotationSnapshotAttached: true,
          annotationSnapshotAttachmentName: 'state-championship-cutup-annotated-7212.jpg',
        },
      },
    ]);
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
        annotation: {
          kind: 'freehand',
          bounds: {
            minX: 0.1,
            minY: 0.2,
            maxX: 0.5,
            maxY: 0.7,
          },
          strokeCount: 2,
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.5, y: 0.7 },
          ],
        },
        metadata: {
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
    expect(enriched).toContain('User drawing annotation: freehand, 2 stroke(s)');
    expect(enriched).toContain('normalized bounds x=0.1-0.5, y=0.2-0.7');
    expect(enriched).toContain(
      'flattened annotated frame image attachment named "fourth-quarter-annotated-7200.jpg"'
    );
    expect(enriched).toContain('primary visual reference for the user-drawn circle/marking');
    expect(enriched).toContain('raw video frame does not visibly contain the overlay');
    expect(enriched).toContain('prioritize these contexts');
  });
});
