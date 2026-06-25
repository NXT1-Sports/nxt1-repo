import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockParse, mockPdfGetText, mockPdfDestroy } = vi.hoisted(() => ({
  mockParse: vi.fn(),
  mockPdfGetText: vi.fn(),
  mockPdfDestroy: vi.fn(),
}));

vi.mock('@mendable/firecrawl-js', () => ({
  default: class MockFirecrawl {
    parse = mockParse;
  },
}));

vi.mock('pdf-parse', () => ({
  PDFParse: class MockPdfParse {
    getText = mockPdfGetText;
    destroy = mockPdfDestroy;
  },
}));

import type { ToolExecutionContext } from '../../base.tool.js';
import { ParseDocumentTool } from '../parse-document.tool.js';

const mockFetch = vi.fn();

describe('ParseDocumentTool', () => {
  const context: ToolExecutionContext = {
    userId: 'user-123',
    threadId: 'thread-456',
    environment: 'staging',
    emitStage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockPdfDestroy.mockResolvedValue(undefined);
    mockPdfGetText.mockResolvedValue({ text: 'Fallback PDF text' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('parses supported documents with Firecrawl and returns markdown', async () => {
    const tool = new ParseDocumentTool('test-firecrawl-key');
    const markdown = '# Parsed Document\n\nThis came from Firecrawl.';

    mockFetch.mockResolvedValue(
      new Response(Buffer.from('pdf-bytes'), {
        status: 200,
        headers: { 'content-length': '9', 'content-type': 'application/pdf' },
      })
    );
    mockParse.mockResolvedValue({
      markdown,
      metadata: {
        title: 'Sample Report',
        numPages: 4,
        contentType: 'application/pdf',
      },
      images: ['https://cdn.firecrawl.dev/image-1.png'],
    });

    const result = await tool.execute(
      {
        url: 'https://storage.googleapis.com/test-bucket/documents/report.pdf?sig=1',
        storagePath: 'Users/user-123/uploads/report.pdf',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.markdown).toBe(markdown);
    expect(result.data).toEqual(
      expect.objectContaining({
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        source: 'firecrawl',
        cacheHit: false,
        metadata: {
          title: 'Sample Report',
          contentType: 'application/pdf',
          pageCount: 4,
          pageCountSource: 'firecrawl',
          parseMode: 'ocr',
          extractedImages: ['https://cdn.firecrawl.dev/image-1.png'],
          extractedImageCount: 1,
          containsImages: true,
          imageDetectionSource: 'firecrawl',
          visionAssetSource: 'firecrawl_images',
          requiresVisionReview: false,
          visionReviewReason: null,
          recommendedNextAction: null,
          suggestedVisionPages: null,
        },
      })
    );
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'report.pdf',
        contentType: 'application/pdf',
      }),
      {
        formats: ['markdown', 'images'],
        parsers: [{ type: 'pdf', mode: 'ocr' }],
        timeout: 180000,
      }
    );
  });

  it('resolves a signed document URL from storagePath when url is omitted', async () => {
    const getSignedUrl = vi
      .fn()
      .mockResolvedValue(['https://signed.example.com/report-from-storage.pdf']);
    const file = { getSignedUrl };
    const bucket = { file: vi.fn().mockReturnValue(file) };
    const tool = new ParseDocumentTool(
      'test-firecrawl-key',
      () => ({ bucket: () => bucket }) as never
    );
    const markdown = '# Parsed From Storage Path';

    mockFetch.mockResolvedValue(
      new Response(Buffer.from('pdf-bytes'), {
        status: 200,
        headers: { 'content-length': '9', 'content-type': 'application/pdf' },
      })
    );
    mockParse.mockResolvedValue({
      markdown,
      metadata: { title: 'Storage Path Report', numPages: 2, contentType: 'application/pdf' },
      images: [],
    });

    const result = await tool.execute(
      {
        storagePath: 'Users/user-123/uploads/report-from-storage.pdf',
        fileName: 'report-from-storage.pdf',
        mimeType: 'application/pdf',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(bucket.file).toHaveBeenCalledWith('Users/user-123/uploads/report-from-storage.pdf');
    expect(getSignedUrl).toHaveBeenCalledWith({
      version: 'v4',
      action: 'read',
      expires: expect.any(Number),
    });
    expect(mockFetch).toHaveBeenCalledWith('https://signed.example.com/report-from-storage.pdf', {
      signal: undefined,
    });
    expect(result.markdown).toBe(markdown);
  });

  it.skip('falls back to local PDF parsing when Firecrawl parse fails', async () => {
    const tool = new ParseDocumentTool('test-firecrawl-key');

    mockFetch.mockResolvedValue(
      new Response(Buffer.from('pdf-bytes'), {
        status: 200,
        headers: { 'content-length': '9', 'content-type': 'application/pdf' },
      })
    );
    mockParse.mockRejectedValue(new Error('Firecrawl parse failed'));
    mockPdfGetText.mockResolvedValue({ text: 'Recovered fallback PDF text' });

    const result = await tool.execute(
      {
        url: 'https://storage.googleapis.com/test-bucket/documents/fallback.pdf?sig=2',
        storagePath: 'Users/user-123/uploads/fallback.pdf',
        fileName: 'fallback.pdf',
        mimeType: 'application/pdf',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.markdown).toBe('Recovered fallback PDF text');
    expect(result.data).toEqual(
      expect.objectContaining({
        source: 'fallback',
        cacheHit: false,
        metadata: expect.objectContaining({
          parseMode: 'fallback',
          pageCount: null,
          containsImages: null,
          imageDetectionSource: 'unknown',
          visionAssetSource: 'none',
          recommendedNextAction: null,
        }),
      })
    );
    expect(mockPdfGetText).toHaveBeenCalledTimes(1);
    expect(mockPdfDestroy).toHaveBeenCalledTimes(1);
  });

  it('returns cached results on repeated requests for the same attachment', async () => {
    const tool = new ParseDocumentTool('test-firecrawl-key');
    const markdown = '# Cached Result';
    const input = {
      url: 'https://storage.googleapis.com/test-bucket/documents/cached.pdf?sig=3',
      storagePath: 'Users/user-123/uploads/cached.pdf',
      fileName: 'cached.pdf',
      mimeType: 'application/pdf',
    };

    mockFetch.mockResolvedValue(
      new Response(Buffer.from('pdf-bytes'), {
        status: 200,
        headers: { 'content-length': '9', 'content-type': 'application/pdf' },
      })
    );
    mockParse.mockResolvedValue({
      markdown,
      metadata: { numPages: 2, contentType: 'application/pdf' },
      images: [],
    });

    const first = await tool.execute(input, context);
    const second = await tool.execute(input, context);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.data).toEqual(expect.objectContaining({ cacheHit: false }));
    expect(second.data).toEqual(expect.objectContaining({ cacheHit: true }));
    expect(second.markdown).toBe(markdown);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it.skip('falls back locally when Firecrawl is unavailable because no API key is configured', async () => {
    const tool = new ParseDocumentTool('');

    mockFetch.mockResolvedValue(
      new Response(Buffer.from('pdf-bytes'), {
        status: 200,
        headers: { 'content-length': '9', 'content-type': 'application/pdf' },
      })
    );
    mockPdfGetText.mockResolvedValue({ text: 'Local fallback without Firecrawl key' });

    const result = await tool.execute(
      {
        url: 'https://storage.googleapis.com/test-bucket/documents/no-key.pdf?sig=4',
        storagePath: 'Users/user-123/uploads/no-key.pdf',
        fileName: 'no-key.pdf',
        mimeType: 'application/pdf',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.markdown).toBe('Local fallback without Firecrawl key');
    expect(result.data).toEqual(
      expect.objectContaining({
        source: 'fallback',
        cacheHit: false,
        metadata: expect.objectContaining({
          parseMode: 'fallback',
          pageCount: null,
          containsImages: null,
          visionAssetSource: 'none',
        }),
      })
    );
    expect(mockParse).not.toHaveBeenCalled();
  });

  it('marks diagram-heavy PDFs for vision review when OCR returns extracted images', async () => {
    const tool = new ParseDocumentTool('test-firecrawl-key');

    mockFetch.mockResolvedValue(
      new Response(Buffer.from('pdf-bytes'), {
        status: 200,
        headers: { 'content-length': '9', 'content-type': 'application/pdf' },
      })
    );
    mockParse.mockResolvedValue({
      markdown: 'Inside Zone Install\nQB read \u25cb\u25cb\u25a1\u25cb\u25cb route structure',
      metadata: { numPages: 4, contentType: 'application/pdf', title: 'Playbook' },
      images: ['https://cdn.firecrawl.dev/play-1.png'],
    });

    const result = await tool.execute(
      {
        url: 'https://storage.googleapis.com/test-bucket/documents/playbook.pdf?sig=5',
        storagePath: 'Users/user-123/uploads/playbook.pdf',
        fileName: 'playbook.pdf',
        mimeType: 'application/pdf',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        source: 'firecrawl',
        metadata: expect.objectContaining({
          parseMode: 'ocr',
          pageCount: 4,
          containsImages: true,
          visionAssetSource: 'firecrawl_images',
          requiresVisionReview: true,
          recommendedNextAction: 'analyze_image',
          suggestedVisionPages: null,
        }),
      })
    );
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'playbook.pdf' }),
      expect.objectContaining({ parsers: [{ type: 'pdf', mode: 'ocr' }], timeout: 180000 })
    );
  });

  it('recommends render_pdf_pages for diagram-heavy PDFs without extracted image assets', async () => {
    const tool = new ParseDocumentTool('test-firecrawl-key');

    mockFetch.mockResolvedValue(
      new Response(Buffer.from('pdf-bytes'), {
        status: 200,
        headers: { 'content-length': '9', 'content-type': 'application/pdf' },
      })
    );
    mockParse.mockResolvedValue({
      markdown: 'Half-court set diagram\n○○□○○ screen spacing rotation',
      metadata: { numPages: 12, contentType: 'application/pdf', title: 'Concept Install' },
      images: [],
    });

    const result = await tool.execute(
      {
        url: 'https://storage.googleapis.com/test-bucket/documents/concept-install.pdf?sig=6',
        storagePath: 'Users/user-123/uploads/concept-install.pdf',
        fileName: 'concept-install.pdf',
        mimeType: 'application/pdf',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        source: 'firecrawl',
        metadata: expect.objectContaining({
          parseMode: 'ocr',
          pageCount: 12,
          containsImages: false,
          visionAssetSource: 'rendered_pages_required',
          requiresVisionReview: true,
          recommendedNextAction: 'render_pdf_pages',
          suggestedVisionPages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        }),
      })
    );
  });
});
