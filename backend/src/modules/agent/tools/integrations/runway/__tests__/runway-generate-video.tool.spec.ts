import { describe, expect, it, vi } from 'vitest';

import { RunwayGenerateVideoTool } from '../runway-generate-video.tool.js';

describe('RunwayGenerateVideoTool', () => {
  function stubMediaResolver(tool: RunwayGenerateVideoTool): void {
    (
      tool as unknown as {
        mediaResolver: {
          resolveProcessingUrl: (input: { sourceUrl: string }) => Promise<{ url: string }>;
        };
      }
    ).mediaResolver = {
      resolveProcessingUrl: vi.fn(async (input: { sourceUrl: string }) => ({
        url: input.sourceUrl,
      })),
    };
  }

  it('rejects prompt-only video generation so Runway only animates image artifacts', async () => {
    const bridge = {
      generateVideo: vi.fn(),
      textToVideo: vi.fn(),
    };
    const tool = new RunwayGenerateVideoTool(bridge as never);

    const result = await tool.execute({
      promptText: 'Cinematic 5-second intro title card animation for a highlight reel',
      duration: 5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires promptImage');
    expect(bridge.generateVideo).not.toHaveBeenCalled();
    expect(bridge.textToVideo).not.toHaveBeenCalled();
  });

  it('normalizes 16:9 ratio aliases to Runway accepted dimensions', async () => {
    const bridge = {
      generateVideo: vi.fn().mockResolvedValue({ id: 'task-1', status: 'PENDING' }),
    };
    const tool = new RunwayGenerateVideoTool(bridge as never);
    stubMediaResolver(tool);

    const result = await tool.execute({
      promptText: 'Animate the superhero title card.',
      promptImage: 'https://cdn.example.com/title-card.png',
      duration: 5,
      ratio: '16:9',
    });

    expect(result.success).toBe(true);
    expect(bridge.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        ratio: '1280:720',
      })
    );
  });

  it('normalizes vertical ratio aliases to Runway accepted dimensions', async () => {
    const bridge = {
      generateVideo: vi.fn().mockResolvedValue({ id: 'task-2', status: 'PENDING' }),
    };
    const tool = new RunwayGenerateVideoTool(bridge as never);
    stubMediaResolver(tool);

    const result = await tool.execute({
      promptText: 'Animate the vertical poster.',
      promptImage: 'https://cdn.example.com/poster.png',
      ratio: '9:16',
    });

    expect(result.success).toBe(true);
    expect(bridge.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        ratio: '720:1280',
      })
    );
  });
});
