/**
 * @fileoverview Agent X DTO validation tests
 */

import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AgentChatRequestDto, AgentEnqueueRequestDto } from '../agent-x.dto.js';

describe('Agent X selected context DTO validation', () => {
  const selectedContext = {
    id: 'film-play:review-1:72',
    kind: 'film_play',
    title: 'Fourth Quarter @ 01:12',
    summary: 'Boundary throw with circled ball carrier',
    source: {
      type: 'film_review',
      id: 'review-1',
      label: 'State Championship Cutup',
    },
    timeRange: {
      startSec: 72.12,
      endSec: 78.54,
    },
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
      strokeCount: 2,
      points: [
        { x: 0.123, y: 0.235 },
        { x: 0.543, y: 0.765 },
      ],
    },
    metadata: {
      hasDrawing: true,
      drawBounds: '0.123,0.235,0.543,0.765',
      drawStrokeCount: 2,
      annotationSnapshotAttached: true,
      annotationSnapshotAttachmentName: 'fourth-quarter-annotated-7200.jpg',
    },
  } as const;

  it('accepts annotated selected contexts on chat requests', async () => {
    const dto = plainToClass(AgentChatRequestDto, {
      message: 'Can you see who I circled in this play?',
      selectedContexts: [selectedContext],
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toHaveLength(0);
  });

  it('accepts annotated selected contexts on enqueue requests', async () => {
    const dto = plainToClass(AgentEnqueueRequestDto, {
      intent: 'Break down this annotated play.',
      selectedContexts: [selectedContext],
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toHaveLength(0);
  });

  it('rejects annotation points outside normalized bounds', async () => {
    const dto = plainToClass(AgentChatRequestDto, {
      message: 'Check this circle.',
      selectedContexts: [
        {
          ...selectedContext,
          annotation: {
            ...selectedContext.annotation,
            points: [{ x: 1.2, y: 0.4 }],
          },
        },
      ],
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects malformed Cloudflare video IDs in selected context media', async () => {
    const dto = plainToClass(AgentChatRequestDto, {
      message: 'Break down this film.',
      selectedContexts: [
        {
          ...selectedContext,
          media: {
            ...selectedContext.media,
            cloudflareVideoId: 'bad id<script>',
          },
        },
      ],
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.length).toBeGreaterThan(0);
  });
});
