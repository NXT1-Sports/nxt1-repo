import { describe, expect, it } from 'vitest';
import {
  bundleAgentXSelectedContexts,
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

    expect(parseAgentXSelectedContextDragPayload(payload)).toEqual([context]);
  });

  it('round-trips multiple selected contexts', () => {
    const secondaryContext: AgentXSelectedContext = {
      ...context,
      id: 'film-play:review-1:play-3',
      title: 'Corner route @ 02:31',
      metadata: {
        playNumber: 3,
        hasDrawing: false,
      },
    };

    const payload = serializeAgentXSelectedContextForDrag([context, secondaryContext]);

    expect(parseAgentXSelectedContextDragPayload(payload)).toEqual([context, secondaryContext]);
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

  it('accepts square and circle annotations', () => {
    expect(
      isAgentXSelectedContext({
        ...context,
        annotation: {
          kind: 'square',
          bounds: {
            minX: 0.2,
            minY: 0.2,
            maxX: 0.4,
            maxY: 0.4,
          },
          strokeCount: 1,
        },
      })
    ).toBe(true);

    expect(
      isAgentXSelectedContext({
        ...context,
        annotation: {
          kind: 'circle',
          bounds: {
            minX: 0.55,
            minY: 0.25,
            maxX: 0.8,
            maxY: 0.5,
          },
          strokeCount: 1,
        },
      })
    ).toBe(true);
  });

  it('auto-bundles large same-source drops without changing the context kind', () => {
    const contexts = Array.from({ length: 5 }, (_, index) => ({
      ...context,
      id: `film-play:review-1:play-${index + 1}`,
      title: `Play ${index + 1}`,
      annotation: undefined,
      timeRange: undefined,
      media: {
        videoUrl: 'https://media.nxt1.test/review-1.mp4',
        thumbnailUrl: 'https://media.nxt1.test/review-1.jpg',
      },
      metadata: {
        playNumber: index + 1,
      },
    }));

    const bundled = bundleAgentXSelectedContexts(contexts);

    expect(bundled).toHaveLength(1);
    expect(bundled[0]).toMatchObject({
      kind: 'film_play',
      source: {
        type: 'film_review',
        id: 'review-1',
      },
      title: '5 selected film plays',
      metadata: {
        bundleCount: 5,
      },
    });
    expect(bundled[0]?.entityRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'film_review', id: 'review-1' }),
        expect.objectContaining({ type: 'film_play', id: 'play-2' }),
      ])
    );
    expect(bundled[0]?.summary).toContain('From Week 4 Cutup.');
  });

  it('preserves source-level refs when bundling film plays from one review', () => {
    const contexts = Array.from({ length: 4 }, (_, index) => ({
      ...context,
      id: `film-play:review-1:play-${index + 1}`,
      title: `Play ${index + 1}`,
      annotation: undefined,
      timeRange: undefined,
      media: {
        videoUrl: 'https://media.nxt1.test/review-1.mp4',
        thumbnailUrl: 'https://media.nxt1.test/review-1.jpg',
      },
      entityRefs: [
        { type: 'film_review', id: 'review-1', label: 'Week 4 Cutup' },
        { type: 'film_play', id: `play-${index + 1}`, label: `Play ${index + 1}` },
        {
          type: 'film_review_source',
          id: `source-${index + 1}`,
          label: `Source ${index + 1}`,
        },
      ],
      metadata: {
        playNumber: index + 1,
        sourceId: `source-${index + 1}`,
      },
    }));

    const bundled = bundleAgentXSelectedContexts(contexts);

    expect(bundled).toHaveLength(1);
    expect(bundled[0]?.entityRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'film_review', id: 'review-1' }),
        expect.objectContaining({ type: 'film_play', id: 'play-1' }),
        expect.objectContaining({ type: 'film_play', id: 'play-4' }),
        expect.objectContaining({ type: 'film_review_source', id: 'source-1' }),
        expect.objectContaining({ type: 'film_review_source', id: 'source-4' }),
      ])
    );
    expect(
      bundled[0]?.entityRefs?.some((entry) => entry.id.startsWith('film-play:review-1:play-'))
    ).toBe(false);
  });

  it('keeps annotated contexts unbundled so per-play markings stay intact', () => {
    const contexts = Array.from({ length: 5 }, (_, index) => ({
      ...context,
      id: `film-play:review-1:annotated-${index + 1}`,
      title: `Annotated Play ${index + 1}`,
    }));

    const bundled = bundleAgentXSelectedContexts(contexts);

    expect(bundled).toHaveLength(5);
    expect(bundled.every((entry) => entry.annotation)).toBe(true);
  });
});
