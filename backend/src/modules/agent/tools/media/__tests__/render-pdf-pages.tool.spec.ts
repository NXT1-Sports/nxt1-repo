import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockDomMatrix {}
class MockImageData {}
class MockPath2D {}

const {
  mockGetDocument,
  mockLoadingTaskDestroy,
  mockGetPage,
  mockRender,
  mockPageCleanup,
  mockCreateCanvas,
  mockToBuffer,
} = vi.hoisted(() => ({
  mockGetDocument: vi.fn(),
  mockLoadingTaskDestroy: vi.fn(),
  mockGetPage: vi.fn(),
  mockRender: vi.fn(),
  mockPageCleanup: vi.fn(),
  mockCreateCanvas: vi.fn(),
  mockToBuffer: vi.fn(),
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: mockGetDocument,
}));

import { AgentMediaLifecycleService } from '../agent-media-lifecycle.service.js';
import type { ToolExecutionContext } from '../../base.tool.js';
import { RenderPdfPagesTool } from '../render-pdf-pages.tool.js';

const mockFetch = vi.fn();
const mockCanvasBindings = {
  DOMMatrix: MockDomMatrix,
  ImageData: MockImageData,
  Path2D: MockPath2D,
  createCanvas: mockCreateCanvas,
};

describe('RenderPdfPagesTool', () => {
  const context: ToolExecutionContext = {
    userId: 'user-123',
    threadId: 'thread-456',
    environment: 'staging',
    emitStage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(AgentMediaLifecycleService, 'saveBufferAndSignRead').mockImplementation(
      async ({ storagePath }) => ({
        url: `https://signed.example/${encodeURIComponent(storagePath)}`,
        expiresAt: Date.now() + 60_000,
      })
    );

    mockRender.mockReturnValue({ promise: Promise.resolve() });
    mockPageCleanup.mockImplementation(() => undefined);
    mockToBuffer.mockReturnValue(Buffer.from('png-bytes'));
    mockCreateCanvas.mockImplementation((width: number, height: number) => ({
      width,
      height,
      getContext: () => ({
        fillStyle: '#ffffff',
        fillRect: vi.fn(),
      }),
      toBuffer: mockToBuffer,
    }));
    mockGetPage.mockImplementation(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 800 * scale, height: 600 * scale }),
      render: mockRender,
      cleanup: mockPageCleanup,
    }));
    mockLoadingTaskDestroy.mockResolvedValue(undefined);
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: mockGetPage,
      }),
      destroy: mockLoadingTaskDestroy,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders selected PDF pages and stages them as signed images', async () => {
    const tool = new RenderPdfPagesTool(
      () => ({
        bucket: () => ({
          file: vi.fn(),
        }),
      }),
      mockCanvasBindings
    );

    mockFetch.mockResolvedValue(
      new Response(Buffer.from('pdf-bytes'), {
        status: 200,
        headers: { 'content-length': '9', 'content-type': 'application/pdf' },
      })
    );

    const result = await tool.execute(
      {
        url: 'https://storage.googleapis.com/test-bucket/documents/playbook.pdf?sig=1',
        fileName: 'playbook.pdf',
        mimeType: 'application/pdf',
        pages: [1, 3],
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        pageCount: 3,
        selectedPages: [1, 3],
        renderedPageCount: 2,
        selectionMode: 'explicit',
        visionCoverage: 'partial',
        recommendedNextAction: 'analyze_image',
        imageUrls: expect.arrayContaining([
          expect.stringContaining('playbook-page-001.png'),
          expect.stringContaining('playbook-page-003.png'),
        ]),
      })
    );
    expect(mockGetPage).toHaveBeenCalledTimes(2);
    expect(AgentMediaLifecycleService.saveBufferAndSignRead).toHaveBeenCalledTimes(2);
  });

  it('returns save-and-enrich recovery guidance when PDF exceeds inline render limit', async () => {
    const download = vi.fn().mockResolvedValue([Buffer.alloc(24 * 1024 * 1024 + 1)]);
    const tool = new RenderPdfPagesTool(
      () => ({
        bucket: () => ({
          file: vi.fn().mockReturnValue({ download }),
        }),
      }),
      mockCanvasBindings
    );

    const result = await tool.execute(
      {
        storagePath: 'Users/user-123/uploads/pdf/unbound/large-playbook.pdf',
        fileName: 'large-playbook.pdf',
        mimeType: 'application/pdf',
        pages: [1],
      },
      context
    );

    expect(result.success).toBe(false);
    expect(result.isValidationError).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        recovery: expect.objectContaining({
          workflow: 'save_to_files_then_enrich_document_notes',
          nextTool: 'create_universal_team_document',
          afterCreateNextTool: 'enrich_document_notes',
          sourceFile: expect.objectContaining({
            storagePath: 'Users/user-123/uploads/pdf/unbound/large-playbook.pdf',
            fileName: 'large-playbook.pdf',
            mimeType: 'application/pdf',
            origin: 'agent_chat_input',
          }),
        }),
      })
    );
    expect(mockGetDocument).not.toHaveBeenCalled();
  });

  it('auto-selects a bounded subset for larger PDFs when pages are omitted', async () => {
    const tool = new RenderPdfPagesTool(
      () => ({
        bucket: () => ({
          file: vi.fn(),
        }),
      }),
      mockCanvasBindings
    );

    mockFetch.mockResolvedValue(
      new Response(Buffer.from('pdf-bytes'), {
        status: 200,
        headers: { 'content-length': '9', 'content-type': 'application/pdf' },
      })
    );
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 12,
        getPage: mockGetPage,
      }),
      destroy: mockLoadingTaskDestroy,
    });

    const result = await tool.execute(
      {
        url: 'https://storage.googleapis.com/test-bucket/documents/large-playbook.pdf?sig=2',
        fileName: 'large-playbook.pdf',
        mimeType: 'application/pdf',
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        pageCount: 12,
        selectedPages: [1, 2, 6, 11, 12],
        selectionMode: 'auto_subset',
        renderedPageCount: 5,
        visionCoverage: 'partial',
      })
    );
  });

  it('downloads the PDF directly from storagePath when url is omitted', async () => {
    const download = vi.fn().mockResolvedValue([Buffer.from('pdf-bytes')]);
    const bucket = {
      file: vi.fn().mockReturnValue({ download }),
    };
    const tool = new RenderPdfPagesTool(() => ({ bucket: () => bucket }), mockCanvasBindings);

    const result = await tool.execute(
      {
        storagePath: 'Users/user-123/uploads/playbook.pdf',
        fileName: 'playbook.pdf',
        mimeType: 'application/pdf',
        pages: [2],
      },
      context
    );

    expect(result.success).toBe(true);
    expect(bucket.file).toHaveBeenCalledWith('Users/user-123/uploads/playbook.pdf');
    expect(download).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('prefers storagePath over url so owned PDFs do not depend on expiring links', async () => {
    const download = vi.fn().mockResolvedValue([Buffer.from('pdf-bytes')]);
    const bucket = {
      file: vi.fn().mockReturnValue({ download }),
    };
    const tool = new RenderPdfPagesTool(() => ({ bucket: () => bucket }), mockCanvasBindings);

    const result = await tool.execute(
      {
        url: 'https://storage.googleapis.com/test-bucket/documents/playbook.pdf?X-Goog-Date=20200101T000000Z&X-Goog-Expires=60&X-Goog-Signature=expired',
        storagePath: 'Users/user-123/uploads/playbook.pdf',
        fileName: 'playbook.pdf',
        mimeType: 'application/pdf',
        pages: [1],
      },
      context
    );

    expect(result.success).toBe(true);
    expect(bucket.file).toHaveBeenCalledWith('Users/user-123/uploads/playbook.pdf');
    expect(download).toHaveBeenCalledTimes(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('requires active user and thread context', async () => {
    const tool = new RenderPdfPagesTool(
      () => ({
        bucket: () => ({
          file: vi.fn(),
        }),
      }),
      mockCanvasBindings
    );

    const result = await tool.execute({
      url: 'https://storage.googleapis.com/test-bucket/documents/playbook.pdf?sig=3',
      fileName: 'playbook.pdf',
      mimeType: 'application/pdf',
      pages: [1],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires active user and thread context');
  });
});
