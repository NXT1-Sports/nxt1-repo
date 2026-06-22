import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyzeImageTool } from '../analyze-image.tool.js';
import type { ToolExecutionContext } from '../../base.tool.js';

const TEST_CONTEXT = {
  userId: 'user-1',
  threadId: 'thread-1',
  operationId: 'op-1',
  emitStage: vi.fn(),
} satisfies ToolExecutionContext;

describe('AnalyzeImageTool', () => {
  const llm = {
    complete: vi.fn(),
  };

  const resolver = {
    resolveProcessingUrl: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resolver.resolveProcessingUrl.mockImplementation(({ sourceUrl }: { sourceUrl: string }) =>
      Promise.resolve({ url: sourceUrl, source: 'direct' })
    );
    llm.complete.mockResolvedValue({ content: 'Image is suitable for a recruiting graphic.' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(Buffer.from('fake-image'), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads images and sends data URLs to the vision model', async () => {
    const tool = new AnalyzeImageTool(llm as never, resolver as never);

    const result = await tool.execute(
      {
        imageUrls: ['https://storage.googleapis.com/bucket/path/player.jpg?X-Goog-Signature=abc'],
        prompt: 'Rate this image for a highlight intro.',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(resolver.resolveProcessingUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://storage.googleapis.com/bucket/path/player.jpg?X-Goog-Signature=abc',
        fallbackToFirebaseStaging: true,
        preferFreshFirebaseSignedUrl: true,
      })
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://storage.googleapis.com/bucket/path/player.jpg?X-Goog-Signature=abc',
      expect.objectContaining({ redirect: 'follow' })
    );
    expect(llm.complete).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'image_url',
              image_url: expect.objectContaining({
                url: expect.stringMatching(/^data:image\/jpeg;base64,/),
              }),
            }),
          ]),
        }),
      ]),
      expect.objectContaining({ tier: 'vision_analysis' })
    );
  });

  it('skips broken images and analyzes remaining images', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(Buffer.from('valid-image'), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      );

    const tool = new AnalyzeImageTool(llm as never, resolver as never);

    const result = await tool.execute(
      {
        imageUrls: ['https://example.com/missing.jpg', 'https://example.com/player.png'],
        prompt: 'Pick the best image.',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect((result.data as { imageCount: number }).imageCount).toBe(1);
    expect((result.data as { skippedImages: unknown[] }).skippedImages).toHaveLength(1);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it('returns an actionable error when no images can be accessed', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not found', { status: 404 }));
    const tool = new AnalyzeImageTool(llm as never, resolver as never);

    const result = await tool.execute(
      {
        imageUrls: ['https://example.com/missing.jpg'],
        prompt: 'Analyze this image.',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('could not access any of the image URLs');
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('allows large images through vision preparation without a hard byte cap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(Buffer.from('large-image'), {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(17_729_181),
          },
        })
      )
    );

    const tool = new AnalyzeImageTool(llm as never, resolver as never);

    const result = await tool.execute(
      {
        imageUrls: ['https://example.com/large-player.jpg'],
        prompt: 'Analyze this large football image.',
      },
      TEST_CONTEXT
    );

    expect(result.success).toBe(true);
    expect(llm.complete).toHaveBeenCalledOnce();
  });
});
