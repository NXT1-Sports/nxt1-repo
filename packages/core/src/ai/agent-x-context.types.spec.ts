import { describe, expect, it } from 'vitest';
import {
  isAgentXSelectedContext,
  parseAgentXSelectedContextDragPayload,
  serializeAgentXSelectedContextForDrag,
  type AgentXSelectedContext,
} from './agent-x-context.types';

describe('Agent X selected context drag payloads', () => {
  const context: AgentXSelectedContext = {
    id: 'film-play:review-1:play-2',
    kind: 'film_play',
    title: 'Slant window @ 02:14',
    summary: 'QB misses backside safety rotation',
    source: {
      type: 'film_review',
      id: 'review-1',
      label: 'Week 4 Cutup',
    },
    timeRange: {
      startSec: 134,
      endSec: 142,
    },
    entityRefs: [
      { type: 'film_review', id: 'review-1', label: 'Week 4 Cutup' },
      { type: 'film_play', id: 'play-2', label: 'Slant window' },
    ],
    media: {
      videoUrl: 'https://media.nxt1.test/review-1.mp4',
      thumbnailUrl: 'https://media.nxt1.test/review-1.jpg',
    },
    annotation: {
      kind: 'freehand',
      bounds: {
        minX: 0.1,
        minY: 0.2,
        maxX: 0.5,
        maxY: 0.7,
      },
      strokeCount: 1,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.7 },
      ],
    },
    metadata: {
      playNumber: 2,
      hasDrawing: true,
      drawBounds: '0.100,0.200,0.500,0.700',
    },
  };

  it('round-trips valid selected context JSON', () => {
    const payload = serializeAgentXSelectedContextForDrag(context);

    expect(parseAgentXSelectedContextDragPayload(payload)).toEqual(context);
  });

  it('rejects malformed JSON payloads', () => {
    expect(parseAgentXSelectedContextDragPayload('{bad-json')).toBeNull();
  });

  it('rejects unknown context kinds', () => {
    expect(
      parseAgentXSelectedContextDragPayload(
        JSON.stringify({ ...context, kind: 'unsupported_context' })
      )
    ).toBeNull();
  });

  it('rejects invalid nested media, timing, and metadata payloads', () => {
    expect(isAgentXSelectedContext({ ...context, timeRange: { startSec: -1 } })).toBe(false);
    expect(isAgentXSelectedContext({ ...context, media: { videoUrl: 123 } })).toBe(false);
    expect(
      isAgentXSelectedContext({
        ...context,
        annotation: {
          ...context.annotation,
          bounds: { minX: 0.8, minY: 0.2, maxX: 0.5, maxY: 0.7 },
        },
      })
    ).toBe(false);
    expect(isAgentXSelectedContext({ ...context, metadata: { tags: ['spread'] } })).toBe(false);
    expect(isAgentXSelectedContext({ ...context, metadata: { score: Number.NaN } })).toBe(false);
  });
});
