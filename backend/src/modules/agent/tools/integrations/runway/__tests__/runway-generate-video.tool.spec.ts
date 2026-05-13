import { describe, expect, it, vi } from 'vitest';

import { RunwayGenerateVideoTool } from '../runway-generate-video.tool.js';

describe('RunwayGenerateVideoTool', () => {
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
});
