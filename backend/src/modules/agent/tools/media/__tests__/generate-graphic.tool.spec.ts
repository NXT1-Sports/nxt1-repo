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

import { GenerateGraphicTool, coerceGraphicInput } from '../generate-graphic.tool.js';

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

  it('allows explicitly supplied external logo overlays', async () => {
    const tool = new GenerateGraphicTool(llm as never);

    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['CROWN POINT'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));

    const externalLogoUrl = 'https://image.maxpreps.io/school-mascot/logo.gif';

    const result = await tool.execute({
      graphicType: 'team',
      textRequirements: ['CROWN POINT'],
      dimensions: '1080x1080',
      styleDescription: 'Elite sports look',
      userId: 'user-1',
      logoUrls: [externalLogoUrl],
      autoRetrievedSources: ['manual:lookup:organization_profile_snapshot'],
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

// ─── coerceGraphicInput ────────────────────────────────────────────────────

describe('coerceGraphicInput', () => {
  describe('array coercion', () => {
    it('parses a JSON-stringified array for textRequirements', () => {
      const result = coerceGraphicInput({ textRequirements: '["COMMITTED", "2026"]' });
      expect(result['textRequirements']).toEqual(['COMMITTED', '2026']);
    });

    it('parses JSON-stringified arrays for every array field', () => {
      const input = {
        subjectPhotoUrls: '["https://example.com/photo.png"]',
        logoUrls: '["https://example.com/logo.png"]',
        videoSourceUrls: '["https://example.com/video.mp4"]',
        autoRetrievedSources: '["manual:lookup:user_profile_snapshot"]',
        themeColors: '["#FF0000","#00FF00"]',
      };
      const result = coerceGraphicInput(input);
      expect(result['subjectPhotoUrls']).toEqual(['https://example.com/photo.png']);
      expect(result['logoUrls']).toEqual(['https://example.com/logo.png']);
      expect(result['videoSourceUrls']).toEqual(['https://example.com/video.mp4']);
      expect(result['autoRetrievedSources']).toEqual(['manual:lookup:user_profile_snapshot']);
      expect(result['themeColors']).toEqual(['#FF0000', '#00FF00']);
    });

    it('leaves native arrays untouched', () => {
      const arr = ['COMMITTED'];
      const result = coerceGraphicInput({ textRequirements: arr });
      expect(result['textRequirements']).toBe(arr);
    });

    it('leaves a non-JSON string untouched so Zod can report the error', () => {
      const result = coerceGraphicInput({ textRequirements: 'not-json' });
      expect(result['textRequirements']).toBe('not-json');
    });

    it('leaves a malformed JSON string untouched', () => {
      const result = coerceGraphicInput({ textRequirements: '[broken' });
      expect(result['textRequirements']).toBe('[broken');
    });
  });

  describe('object coercion', () => {
    it('parses a JSON-stringified object for athleteInfo', () => {
      const result = coerceGraphicInput({
        athleteInfo: '{"name":"Jordan","sport":"Basketball","position":"PG"}',
      });
      expect(result['athleteInfo']).toEqual({
        name: 'Jordan',
        sport: 'Basketball',
        position: 'PG',
      });
    });

    it('parses a JSON-stringified object for teamInfo', () => {
      const result = coerceGraphicInput({ teamInfo: '{"name":"Lakers","sport":"Basketball"}' });
      expect(result['teamInfo']).toEqual({ name: 'Lakers', sport: 'Basketball' });
    });

    it('parses a JSON-stringified object for requiredAssets', () => {
      const result = coerceGraphicInput({
        requiredAssets: '{"subjectPhoto":true,"brandLogo":false}',
      });
      expect(result['requiredAssets']).toEqual({ subjectPhoto: true, brandLogo: false });
    });

    it('leaves a native object untouched', () => {
      const obj = { name: 'Jordan' };
      const result = coerceGraphicInput({ athleteInfo: obj });
      expect(result['athleteInfo']).toBe(obj);
    });

    it('leaves malformed object JSON untouched', () => {
      const result = coerceGraphicInput({ athleteInfo: '{broken' });
      expect(result['athleteInfo']).toBe('{broken');
    });
  });

  describe('boolean coercion', () => {
    it('coerces the string "true" to boolean true for assetSelectionApproved', () => {
      const result = coerceGraphicInput({ assetSelectionApproved: 'true' });
      expect(result['assetSelectionApproved']).toBe(true);
    });

    it('coerces the string "false" to boolean false for assetSelectionApproved', () => {
      const result = coerceGraphicInput({ assetSelectionApproved: 'false' });
      expect(result['assetSelectionApproved']).toBe(false);
    });

    it('leaves a native boolean untouched', () => {
      expect(coerceGraphicInput({ assetSelectionApproved: true })['assetSelectionApproved']).toBe(
        true
      );
      expect(coerceGraphicInput({ assetSelectionApproved: false })['assetSelectionApproved']).toBe(
        false
      );
    });

    it('does not coerce non-boolean-like strings', () => {
      const result = coerceGraphicInput({ assetSelectionApproved: 'yes' });
      expect(result['assetSelectionApproved']).toBe('yes');
    });
  });

  describe('non-mutating behaviour', () => {
    it('does not mutate the original input object', () => {
      const original = { textRequirements: '["A"]' };
      coerceGraphicInput(original);
      expect(original.textRequirements).toBe('["A"]');
    });

    it('passes through unknown fields unchanged', () => {
      const result = coerceGraphicInput({ unknownField: 'value', textRequirements: ['A'] });
      expect(result['unknownField']).toBe('value');
    });
  });
});

// ─── execute() — stringified-input integration tests ──────────────────────

describe('GenerateGraphicTool.execute with stringified inputs', () => {
  const llm = {
    prompt: vi.fn(),
    generateImage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(Buffer.from('img'), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      )
    );
    llm.prompt.mockResolvedValue({ parsedOutput: { displayText: ['COMMITTED'] } });
    llm.generateImage.mockRejectedValue(new Error('storage-side test abort'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts textRequirements as a JSON string and reaches the image-generation step', async () => {
    const tool = new GenerateGraphicTool(llm as never);
    const result = await tool.execute({
      graphicType: 'athlete',
      textRequirements: '["COMMITTED"]',
      dimensions: '1080x1080',
      styleDescription: 'Bold sports look',
      userId: 'user-1',
      autoRetrievedSources: '["manual:lookup:user_profile_snapshot"]',
    });
    // The coercion should succeed; only the downstream storage call fails.
    expect(result.error).not.toMatch(/\[textRequirements\]/);
    expect(result.error).not.toMatch(/expected array/i);
    expect(llm.generateImage).toHaveBeenCalledTimes(1);
  });

  it('accepts athleteInfo as a JSON string', async () => {
    const tool = new GenerateGraphicTool(llm as never);
    const result = await tool.execute({
      graphicType: 'athlete',
      textRequirements: ['COMMITTED'],
      athleteInfo: '{"name":"Jordan Smith","sport":"Basketball"}',
      dimensions: '1080x1080',
      styleDescription: 'Bold sports look',
      userId: 'user-1',
      autoRetrievedSources: ['manual:lookup:user_profile_snapshot'],
    });
    expect(result.error).not.toMatch(/\[athleteInfo\]/);
    expect(result.error).not.toMatch(/expected object/i);
    expect(llm.generateImage).toHaveBeenCalledTimes(1);
  });

  it('accepts assetSelectionApproved as a string "false"', async () => {
    const tool = new GenerateGraphicTool(llm as never);
    const result = await tool.execute({
      graphicType: 'athlete',
      textRequirements: ['COMMITTED'],
      dimensions: '1080x1080',
      styleDescription: 'Bold sports look',
      userId: 'user-1',
      assetSelectionApproved: 'false',
      autoRetrievedSources: ['manual:lookup:user_profile_snapshot'],
    });
    expect(result.error).not.toMatch(/\[assetSelectionApproved\]/);
    expect(result.error).not.toMatch(/expected boolean/i);
    expect(llm.generateImage).toHaveBeenCalledTimes(1);
  });

  it('accepts all stringified structured fields simultaneously', async () => {
    const tool = new GenerateGraphicTool(llm as never);
    const result = await tool.execute({
      graphicType: 'athlete',
      textRequirements: '["COMMITTED", "CLASS OF 2026"]',
      athleteInfo: '{"name":"Jordan Smith","sport":"Basketball","position":"PG"}',
      subjectPhotoUrls: '["https://example.com/photo.png"]',
      autoRetrievedSources: '["manual:lookup:user_profile_snapshot"]',
      assetSelectionApproved: 'true',
      requiredAssets: '{"subjectPhoto":true,"brandLogo":false}',
      dimensions: '1080x1080',
      styleDescription: 'Bold sports look',
      userId: 'user-1',
    });
    // All coercions should succeed; only downstream storage fails.
    expect(result.error).not.toMatch(/expected array|expected object|expected boolean/i);
    expect(llm.generateImage).toHaveBeenCalledTimes(1);
  });

  it('returns a field-path error for genuinely invalid input after coercion', async () => {
    const tool = new GenerateGraphicTool(llm as never);
    const result = await tool.execute({
      // dimensions is required but omitted → Zod should report it
      graphicType: 'athlete',
      textRequirements: ['OK'],
      styleDescription: 'Bold',
      userId: 'user-1',
    } as never);
    expect(result.success).toBe(false);
    expect(result.error).toContain('[dimensions]');
  });
});

