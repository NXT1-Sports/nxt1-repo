import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => {
  const createBucket = (name: string) => {
    const save = vi.fn().mockResolvedValue(undefined);
    const makePublic = vi.fn().mockResolvedValue(undefined);
    const exists = vi.fn().mockResolvedValue([false]);
    const download = vi.fn().mockResolvedValue([Buffer.from('')]);
    const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example/upload']);

    return {
      name,
      save,
      makePublic,
      exists,
      download,
      getSignedUrl,
      file: () => ({
        exists,
        download,
        save,
        makePublic,
        getSignedUrl,
      }),
    };
  };

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
        getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example/upload']),
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

const mockFetch = vi.fn();

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
    vi.stubGlobal('fetch', mockFetch);
    transportResolver.resolveProcessingUrl.mockImplementation(
      async ({ sourceUrl }: { sourceUrl: string }) => ({
        url: sourceUrl,
        source: 'unchanged' as const,
      })
    );
    mockFetch.mockImplementation(
      async () =>
        new Response(Buffer.from('graphic-image-bytes'), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      autoRetrievedSources: ['manual:lookup:user_profile_snapshot'],
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
        referenceImageUrl: expect.stringMatching(/^data:image\/png;base64,/),
        additionalImageUrls: [expect.stringMatching(/^data:image\/png;base64,/)],
      })
    );
  });

  it('passes logo-only assets to the image model as the primary reference', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['CROWN POINT'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));

    const logoUrl =
      'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Organizations/o/logo.png';

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
        referenceImageUrl: expect.stringMatching(/^data:image\/png;base64,/),
        additionalImageUrls: [],
      })
    );
  });

  it('ignores non-organization logo overlays', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['CROWN POINT'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));

    const result = await tool.execute({
      graphicType: 'team',
      textRequirements: ['CROWN POINT'],
      dimensions: '1080x1080',
      styleDescription: 'Elite sports look',
      userId: 'user-1',
      logoUrls: ['https://image.maxpreps.io/school-mascot/logo.gif'],
      autoRetrievedSources: ['manual:lookup:organization_profile_snapshot'],
      requiredAssets: {
        brandLogo: true,
      },
      applyMode: 'logo_overlay',
    });

    expect(result.success).toBe(false);
    expect(llm.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrl: undefined,
        additionalImageUrls: [],
      })
    );
  });

  it('strips trailing punctuation from subject photo URLs before resolution', async () => {
    const tool = new GenerateGraphicTool(llm as never, undefined, transportResolver as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['WELCOME'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));

    const result = await tool.execute(
      {
        graphicType: 'athlete',
        textRequirements: ['WELCOME'],
        dimensions: '1080x1080',
        styleDescription: 'Premium, modern',
        userId: 'user-1',
        subjectPhotoUrls: [
          'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/u/profile.png.',
        ],
      },
      {
        userId: 'u',
        threadId: 'thread-1',
        environment: 'staging',
      } as never
    );

    expect(transportResolver.resolveProcessingUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl:
          'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/u/profile.png',
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('storage-side test abort');
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
      autoRetrievedSources: ['manual:lookup:organization_profile_snapshot'],
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
      logoUrls: [
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Organizations/o/logo.png',
      ],
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

  it('requires retrieval markers or provided assets before generation', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    const result = await tool.execute({
      graphicType: 'team',
      textRequirements: ['WELCOME'],
      dimensions: '1080x1080',
      styleDescription: 'Premium, modern',
      userId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Brand/media preflight was skipped');
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
      autoRetrievedSources: ['manual:lookup:user_profile_snapshot'],
      athleteInfo: {
        name: 'Jordan Smith',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      notificationTitle: 'Your welcome graphic is ready',
      response: 'Your welcome graphic is ready in Agent X.',
    });
    expect(firebaseMocks.productionBucket.getSignedUrl).toHaveBeenCalledWith({
      version: 'v4',
      action: 'write',
      expires: expect.any(Number),
      contentType: 'image/png',
    });
    expect(mockFetch).toHaveBeenCalledWith('https://signed.example/upload', {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: expect.any(Uint8Array),
    });
  });

  it('resolves Firebase Storage welcome-photo URLs into provider-safe data URLs', async () => {
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
        referenceImageUrl: expect.stringMatching(/^data:image\/png;base64,/),
      })
    );
  });
});
