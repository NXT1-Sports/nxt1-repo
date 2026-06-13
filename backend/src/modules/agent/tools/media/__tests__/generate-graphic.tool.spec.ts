import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => {
  const createBucket = (name: string) => ({
    name,
    file: () => ({
      exists: vi.fn().mockResolvedValue([false]),
      download: vi.fn().mockResolvedValue([Buffer.from('')]),
      save: vi.fn().mockResolvedValue(undefined),
      makePublic: vi.fn().mockResolvedValue(undefined),
    }),
  });

  return {
    productionBucket: createBucket('nxt1-test-bucket'),
    stagingBucket: createBucket('nxt1-staging-test-bucket'),
  };
});

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      name: 'nxt1-test-bucket',
      file: () => ({
        exists: vi.fn().mockResolvedValue([false]),
        download: vi.fn().mockResolvedValue([Buffer.from('')]),
        save: vi.fn().mockResolvedValue(undefined),
        makePublic: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('not found')),
}));

vi.mock('../../../../../utils/firebase.js', () => ({
  storage: {
    bucket: () => firebaseMocks.productionBucket,
  },
}));

vi.mock('../../../../../utils/firebase-staging.js', () => ({
  stagingStorage: {
    bucket: () => firebaseMocks.stagingBucket,
  },
}));

import { GenerateGraphicTool } from '../generate-graphic.tool.js';

describe('GenerateGraphicTool', () => {
  const llm = {
    prompt: vi.fn(),
    generateImage: vi.fn(),
  };
  const transportResolver = {
    resolveProcessingUrl: vi.fn(async ({ sourceUrl }: { sourceUrl: string }) => ({
      url: sourceUrl,
      source: 'unchanged' as const,
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    transportResolver.resolveProcessingUrl.mockImplementation(
      async ({ sourceUrl }: { sourceUrl: string }) => ({
        url: sourceUrl,
        source: 'unchanged' as const,
      })
    );
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
    expect(llm.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrl:
          'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/u/profile.png',
        additionalImageUrls: [
          'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Organizations/o/logo.png',
        ],
      })
    );
  });

  it('passes logo-only assets to the image model as the primary reference', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['CROWN POINT'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));

    const logoUrl = 'https://image.maxpreps.io/school-mascot/logo.gif';

    const result = await tool.execute({
      graphicType: 'team',
      textRequirements: ['CROWN POINT'],
      dimensions: '1080x1080',
      styleDescription: 'Elite sports look',
      userId: 'user-1',
      logoUrls: [logoUrl],
      requiredAssets: {
        brandLogo: true,
      },
      applyMode: 'logo_overlay',
    });

    expect(result.success).toBe(false);
    expect(llm.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrl: logoUrl,
        additionalImageUrls: [],
      })
    );
  });

  it('forbids empty photo and logo placeholders when team graphics have no assets', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['CROWN POINT', 'HIGHLIGHTS'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));

    const result = await tool.execute({
      graphicType: 'team',
      textRequirements: ['CROWN POINT', 'HIGHLIGHTS'],
      dimensions: '1920x1080',
      styleDescription: 'premium red and black broadcast highlight intro',
      userId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(llm.generateImage).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(llm.generateImage).mock.calls[0]?.[0]?.prompt;
    expect(prompt).toContain('Do NOT create empty photo frames');
    expect(prompt).toContain('Do NOT create logo boxes');
    expect(prompt).toContain('No empty photo frames, blank media panels, logo wells');
    expect(prompt).not.toContain('Logo placeholders/clear zones exist');
  });

  it('prevents visible empty logo containers when logos will be composited', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['CROWN POINT', 'HIGHLIGHTS'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));

    await tool.execute({
      graphicType: 'team',
      textRequirements: ['CROWN POINT', 'HIGHLIGHTS'],
      dimensions: '1920x1080',
      styleDescription: 'premium red and black broadcast highlight intro',
      userId: 'user-1',
      logoUrls: ['https://image.maxpreps.io/school-mascot/logo.gif'],
      applyMode: 'logo_overlay',
    });

    const prompt = vi.mocked(llm.generateImage).mock.calls[0]?.[0]?.prompt;
    expect(prompt).toContain('Do NOT draw empty logo boxes');
    expect(prompt).toContain('do not render a visible empty container');
    expect(prompt).not.toContain('Logo placeholders/clear zones exist');
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

  it('returns producer-facing notification copy for completed welcome graphics', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['WELCOME'] } });
    llm.generateImage.mockResolvedValue({
      imageBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==',
      mimeType: 'image/png',
      model: 'cheap-image-model',
      latencyMs: 1800,
      costUsd: 0.01,
      textContent: ['WELCOME'],
    });

    const result = await tool.execute({
      graphicType: 'athlete',
      textRequirements: ['WELCOME'],
      dimensions: '1080x1080',
      styleDescription: 'Premium, modern',
      userId: 'user-1',
      athleteInfo: {
        name: 'Jordan Smith',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      notificationTitle: 'Your welcome graphic is ready',
      response: 'Your welcome graphic is ready in Agent X.',
    });
  });

  it('resolves Firebase Storage welcome-photo URLs before calling the image model', async () => {
    const tool = new GenerateGraphicTool(llm as never, undefined, transportResolver as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['WELCOME'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));
    transportResolver.resolveProcessingUrl.mockResolvedValueOnce({
      url: 'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/u/profile.png?X-Goog-Signature=signed-photo',
      source: 'direct',
    });

    const result = await tool.execute(
      {
        graphicType: 'athlete',
        textRequirements: ['WELCOME'],
        dimensions: '1080x1080',
        styleDescription: 'Premium, modern',
        userId: 'user-1',
        subjectPhotoUrls: [
          'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/u/profile.png',
        ],
      },
      {
        userId: 'u',
        threadId: 'thread-1',
        environment: 'staging',
      }
    );

    expect(result.success).toBe(false);
    expect(transportResolver.resolveProcessingUrl).toHaveBeenCalledWith({
      sourceUrl:
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/u/profile.png',
      fallbackToFirebaseStaging: true,
      stageMediaKind: 'image',
      executionContext: {
        userId: 'u',
        threadId: 'thread-1',
        environment: 'staging',
      },
    });
    expect(llm.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrl:
          'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/u/profile.png?X-Goog-Signature=signed-photo',
      })
    );
  });
});
