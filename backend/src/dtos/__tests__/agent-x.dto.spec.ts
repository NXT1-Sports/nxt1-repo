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
      executionMode: 'plan',
      selectedContexts: [selectedContext],
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toHaveLength(0);
  });

  it('rejects invalid execution modes on enqueue requests', async () => {
    const dto = plainToClass(AgentEnqueueRequestDto, {
      intent: 'Break down this annotated play.',
      executionMode: 'fast',
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts valid effort levels and rejects invalid effort levels', async () => {
    const validDto = plainToClass(AgentChatRequestDto, {
      message: 'Run this on medium effort.',
      effortLevel: 'medium',
    });
    const invalidDto = plainToClass(AgentChatRequestDto, {
      message: 'Run this as cheaply as possible.',
      effortLevel: 'tiny',
    });

    await expect(
      validate(validDto, { whitelist: true, forbidNonWhitelisted: true })
    ).resolves.toHaveLength(0);
    await expect(
      validate(invalidDto, { whitelist: true, forbidNonWhitelisted: true })
    ).resolves.not.toHaveLength(0);
  });

  it('accepts bundled selected contexts with large entity ref sets', async () => {
    const dto = plainToClass(AgentChatRequestDto, {
      message: 'Review these selected plays.',
      selectedContexts: [
        {
          id: 'film-play:review-1:bundle',
          kind: 'film_play',
          title: '65 selected film plays',
          source: {
            type: 'film_review',
            id: 'review-1',
            label: 'Video 2026',
          },
          entityRefs: Array.from({ length: 65 }, (_, index) => ({
            type: 'film_play',
            id: `play-${index + 1}`,
            label: `Play ${index + 1}`,
          })),
          metadata: {
            bundleCount: 65,
          },
        },
      ],
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

  it('clamps selected context summaries over 600 chars before validation', async () => {
    const dto = plainToClass(AgentChatRequestDto, {
      message: 'Use this playbook context.',
      selectedContexts: [
        {
          ...selectedContext,
          summary: 'a'.repeat(1000),
        },
      ],
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toHaveLength(0);
    expect(dto.selectedContexts?.[0]?.summary?.length ?? 0).toBeLessThanOrEqual(600);
  });

  it('accepts Firebase video thumbnails as data-image payloads on chat attachments', async () => {
    const dto = plainToClass(AgentChatRequestDto, {
      message: 'Use this film clip.',
      attachments: [
        {
          id: '8a645788-9f51-4434-b5e9-c43a9d2c4c4d',
          url: 'https://storage.googleapis.com/bucket/highlight.mp4',
          storagePath: 'Users/user-1/threads/thread-1/media/video/highlight.mp4',
          name: 'highlight.mp4',
          mimeType: 'video/mp4',
          type: 'video',
          sizeBytes: 4096,
          thumbnailUrl: 'data:image/jpeg;base64,AAAA',
        },
      ],
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toHaveLength(0);
  });

  it('accepts data-image thumbnails on selected context media', async () => {
    const dto = plainToClass(AgentChatRequestDto, {
      message: 'Break down this play.',
      selectedContexts: [
        {
          ...selectedContext,
          media: {
            ...selectedContext.media,
            thumbnailUrl: 'data:image/jpeg;base64,AAAA',
          },
        },
      ],
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors).toHaveLength(0);
  });

  it('rejects non-image data urls on chat attachment thumbnails', async () => {
    const dto = plainToClass(AgentChatRequestDto, {
      message: 'Use this film clip.',
      attachments: [
        {
          id: '8a645788-9f51-4434-b5e9-c43a9d2c4c4d',
          url: 'https://storage.googleapis.com/bucket/highlight.mp4',
          storagePath: 'Users/user-1/threads/thread-1/media/video/highlight.mp4',
          name: 'highlight.mp4',
          mimeType: 'video/mp4',
          type: 'video',
          sizeBytes: 4096,
          thumbnailUrl: 'data:text/plain;base64,AAAA',
        },
      ],
    });

    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });

    expect(errors.length).toBeGreaterThan(0);
  });
});
