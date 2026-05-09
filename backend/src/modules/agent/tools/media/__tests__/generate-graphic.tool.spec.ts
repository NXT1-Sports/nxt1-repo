import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GenerateGraphicTool } from '../generate-graphic.tool.js';

describe('GenerateGraphicTool', () => {
  const llm = {
    prompt: vi.fn(),
    generateImage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not hard-fail when required brand logo is missing', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['COMMITTED'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));

    const result = await tool.execute({
      graphicType: 'athlete',
      textRequirements: ['COMMITTED'],
      dimensions: '1080x1080',
      styleDescription: 'Bold sports look',
      userId: 'user-1',
      requiredAssets: {
        brandLogo: true,
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('Required brand logo not provided');
    expect(llm.generateImage).toHaveBeenCalledTimes(1);
  });

  it('does not hard-fail when assets were auto-retrieved without explicit approval', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['WELCOME'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));

    const result = await tool.execute({
      graphicType: 'athlete',
      textRequirements: ['WELCOME'],
      dimensions: '1080x1080',
      styleDescription: 'Premium, modern',
      userId: 'user-1',
      subjectPhotoUrls: [
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/u/profile.png',
      ],
      logoUrls: [
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Organizations/o/logo.png',
      ],
      autoRetrievedSources: ['conversation_history:profileImgs', 'conversation_history:logoUrl'],
      assetSelectionApproved: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('requires user confirmation');
    expect(llm.generateImage).toHaveBeenCalledTimes(1);
  });

  it('rejects the legacy subjectImageUrl field', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    const result = await tool.execute({
      graphicType: 'athlete',
      textRequirements: ['WELCOME'],
      dimensions: '1080x1080',
      styleDescription: 'Premium, modern',
      userId: 'user-1',
      subjectImageUrl: 'https://cdn.example.com/legacy.png',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unrecognized key');
    expect(llm.generateImage).not.toHaveBeenCalled();
  });
});
