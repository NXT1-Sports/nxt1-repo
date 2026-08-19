import { describe, expect, it, vi } from 'vitest';

import { GeminiFilesService } from '../gemini-files.service.js';

type TestableGeminiFilesService = {
  uploadFromUrl: GeminiFilesService['uploadFromUrl'];
  downloadVideoBytes: ReturnType<typeof vi.fn>;
  fileManager: { uploadFile: ReturnType<typeof vi.fn> };
  parseTotalTokenCountFromContextCacheError: (err: unknown) => number | null;
  buildOversizeVideoAnalysisError: (totalTokenCount: number) => Error;
};

function createService(buffer: Buffer): TestableGeminiFilesService {
  const service = new GeminiFilesService('test-key') as unknown as TestableGeminiFilesService;
  service.downloadVideoBytes = vi.fn().mockResolvedValue(buffer);
  service.fileManager = {
    uploadFile: vi.fn(),
  };
  return service;
}

function createBareService(): TestableGeminiFilesService {
  const service = new GeminiFilesService('test-key') as unknown as TestableGeminiFilesService;
  service.fileManager = {
    uploadFile: vi.fn(),
  };
  return service;
}

describe('GeminiFilesService.uploadFromUrl payload validation', () => {
  it('rejects tiny video payloads before uploading to Gemini Files', async () => {
    const service = createService(Buffer.from('not a real video'));

    await expect(service.uploadFromUrl('https://cdn.example.com/clip.mp4')).rejects.toThrow(
      'Downloaded video payload is too small'
    );
    expect(service.fileManager.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects HTML payloads before uploading to Gemini Files', async () => {
    const html = Buffer.from(`<!DOCTYPE html>${' '.repeat(20_000)}`);
    const service = createService(html);

    await expect(service.uploadFromUrl('https://cdn.example.com/clip.mp4')).rejects.toThrow(
      'looks like text/HTML/JSON'
    );
    expect(service.fileManager.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects unknown .bin payloads without a video container signature', async () => {
    const binary = Buffer.alloc(20_000, 0x7f);
    const service = createService(binary);

    await expect(service.uploadFromUrl('https://cdn.example.com/staged-video.bin')).rejects.toThrow(
      'does not have a recognized video container signature'
    );
    expect(service.fileManager.uploadFile).not.toHaveBeenCalled();
  });

  it('blocks private/internal URLs before backend fetch', async () => {
    const service = createBareService();

    await expect(service.uploadFromUrl('http://127.0.0.1/internal.mp4')).rejects.toThrow(
      'Internal/private addresses are not allowed'
    );
    expect(service.fileManager.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects Firebase Storage objects outside the requesting user scope', async () => {
    const service = createBareService();

    await expect(
      service.uploadFromUrl(
        'https://storage.googleapis.com/nxt-1-staging-v2.firebasestorage.app/Users/other-user/threads/thread-456/media/staged/video/clip.mp4?X-Goog-Signature=signed',
        { userId: 'user-123', threadId: 'thread-456' }
      )
    ).rejects.toThrow('outside the requesting user scope');
    expect(service.fileManager.uploadFile).not.toHaveBeenCalled();
  });
});

describe('GeminiFilesService oversized video diagnostics', () => {
  it('extracts total token count from context-cache oversize errors', () => {
    const service = createBareService();

    expect(
      service.parseTotalTokenCountFromContextCacheError(
        new Error(
          '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/cachedContents: [400 Bad Request] Cached content is too large. total_token_count=1054059, max_total_token_count=0'
        )
      )
    ).toBe(1054059);
  });

  it('builds an actionable oversize video analysis error', () => {
    const service = createBareService();

    expect(service.buildOversizeVideoAnalysisError(1054059).message).toContain(
      'Video is too large for full Gemini analysis in one request'
    );
    expect(service.buildOversizeVideoAnalysisError(1054059).message).toContain(
      '1,054,059 input tokens exceeds the 1,048,576 token limit for gemini-3.7-flash'
    );
  });
});
