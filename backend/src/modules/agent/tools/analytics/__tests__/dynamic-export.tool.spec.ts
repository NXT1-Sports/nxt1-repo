/**
 * @fileoverview Unit Tests — DynamicExportTool
 * @module @nxt1/backend/modules/agent/tools/data
 *
 * Tests input validation, CSV/PDF generation delegation, and error handling.
 * Firebase Storage is mocked to avoid network calls.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must precede tool import) ─────────────────────────────────────────

const {
  mockSave,
  mockExists,
  mockFile,
  mockBucket,
  mockStagingFile,
  mockStagingBucket,
  mockFetch,
} = vi.hoisted(() => {
  const mockSave = vi.fn().mockResolvedValue(undefined);
  const mockExists = vi.fn().mockResolvedValue([true]);
  const mockFile = vi.fn().mockReturnValue({ save: mockSave, exists: mockExists });
  const mockBucket = vi.fn().mockReturnValue({ file: mockFile, name: 'test-bucket' });
  const mockStagingFile = vi.fn().mockReturnValue({ save: mockSave, exists: mockExists });
  const mockStagingBucket = vi.fn().mockReturnValue({
    file: mockStagingFile,
    name: 'test-staging-bucket',
  });
  const mockFetch = vi.fn();

  return {
    mockSave,
    mockExists,
    mockFile,
    mockBucket,
    mockStagingFile,
    mockStagingBucket,
    mockFetch,
  };
});
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: mockBucket }),
}));
vi.mock('../../../../../utils/firebase-staging.js', () => ({
  stagingStorage: { bucket: mockStagingBucket },
}));
vi.mock('../../../../../utils/firebase.js', () => ({
  storage: { bucket: mockBucket },
}));

import { DynamicExportTool } from '../../system/dynamic-export.tool.js';
import type { ToolExecutionContext } from '../../base.tool.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const context: ToolExecutionContext = {
  userId: 'user_123',
  threadId: 'thread_456',
  sessionId: 'session_789',
};

const localRouteContext: ToolExecutionContext = {
  ...context,
  environment: 'staging',
  agentRouteBase: 'http://localhost:3000/api/v1/staging/agent-x',
};

function csvInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    format: 'csv',
    fileName: 'Top Prospects 2026',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'position', label: 'Position' },
      { key: 'rating', label: 'Rating' },
    ],
    rows: [
      ['John Doe', 'QB', '4.5'],
      ['Jane Smith', 'WR', '4.8'],
    ],
    ...overrides,
  };
}

function pdfInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    format: 'pdf',
    fileName: 'Scout Report',
    title: 'Scout Report — John Doe',
    description: 'Comprehensive evaluation for the 2026 class.',
    columns: [
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Value' },
    ],
    rows: [
      ['40-yard dash', '4.45s'],
      ['Vertical Jump', '36"'],
    ],
    bodyParagraphs: ['John Doe is an elite prospect out of Texas.'],
    bulletPoints: ['Strong arm', 'Good footwork', 'High football IQ'],
    ...overrides,
  };
}

function xlsxInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    format: 'xlsx',
    fileName: 'Callsheet Export',
    title: 'Callsheet Export',
    description: 'Generated from Agent X.',
    columns: [
      { key: 'play', label: 'Play' },
      { key: 'formation', label: 'Formation' },
      { key: 'situation', label: 'Situation' },
    ],
    rows: [
      ['Inside Zone', '11 Gun', '1st & 10'],
      ['Mesh', 'Trips Rt', '3rd & 6'],
    ],
    ...overrides,
  };
}

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DynamicExportTool', () => {
  let tool: DynamicExportTool;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const pngBytes = Uint8Array.from(
        Buffer.from(TINY_PNG_DATA_URL.split(',')[1] ?? '', 'base64')
      );

      return {
        ok: /^https?:\/\//i.test(url),
        headers: {
          get: (headerName: string) =>
            headerName.toLowerCase() === 'content-type' ? 'image/png' : null,
        },
        arrayBuffer: async () =>
          pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength),
      } as Response;
    });
    tool = new DynamicExportTool();
  });

  describe('metadata', () => {
    it('should have correct name and category', () => {
      expect(tool.name).toBe('dynamic_export');
      expect(tool.category).toBe('system');
      expect(tool.isMutation).toBe(true);
    });
  });

  // ── Input Validation ─────────────────────────────────────────────────────

  describe('validation', () => {
    it('should reject missing format', async () => {
      const result = await tool.execute({ fileName: 'test' }, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('format');
    });

    it('should accept uppercase format values', async () => {
      const result = await tool.execute(csvInput({ format: 'CSV' }), context);
      expect(result.success).toBe(true);
    });

    it('should reject invalid format', async () => {
      const result = await tool.execute({ format: 'docx', fileName: 'test' }, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('format');
    });

    it('should fallback fileName when missing', async () => {
      const result = await tool.execute(
        { format: 'csv', columns: [{ key: 'a', label: 'A' }], rows: [['x']] },
        context
      );
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['fileName']).toBe('export.csv');
    });

    it('should reject CSV without columns', async () => {
      const result = await tool.execute(csvInput({ columns: undefined }), context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('columns');
    });

    it('should reject CSV without rows', async () => {
      const result = await tool.execute(csvInput({ rows: undefined }), context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('rows');
    });

    it('should reject PDF without any content', async () => {
      const result = await tool.execute(
        {
          format: 'pdf',
          fileName: 'Empty',
          title: 'Nothing',
        },
        context
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('require at least one');
    });
  });

  // ── CSV Generation ───────────────────────────────────────────────────────

  describe('CSV export', () => {
    it('should generate CSV and upload to Firebase Storage', async () => {
      const result = await tool.execute(csvInput(), context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const data = result.data as Record<string, unknown>;
      expect(data['fileName']).toBe('Top Prospects 2026.csv');
      expect(data['mimeType']).toBe('text/csv');
      expect(data['format']).toBe('csv');
      expect(data['rowCount']).toBe(2);
      expect(data['columnCount']).toBe(3);
      expect(data['downloadUrl']).toContain(
        '/api/v1/agent-x/media-proxy/export/Top%20Prospects%202026.csv'
      );
      expect(data['downloadUrl']).toContain(
        'path=Users%2Fuser_123%2Fthreads%2Fthread_456%2Fexports%2F'
      );
      expect(data['downloadUrl']).toContain('mime=text%2Fcsv');
      expect(data['downloadUrl']).toContain('&exp=');
      expect(data['downloadUrl']).toContain('&sig=');
      expect(typeof data['sizeBytes']).toBe('number');
      expect(data['sizeBytes'] as number).toBeGreaterThan(0);

      // Verify storage path is thread-scoped
      const storagePath = data['storagePath'] as string;
      expect(storagePath).toContain('user_123');
      expect(storagePath).toContain('thread_456');
      expect(storagePath).toContain('.csv');
    });

    it('should prefer the request-specific agent route base when provided', async () => {
      const result = await tool.execute(csvInput(), localRouteContext);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['downloadUrl']).toContain(
        'http://localhost:3000/api/v1/staging/agent-x/media-proxy/export/Top%20Prospects%202026.csv'
      );
    });

    it('should write staging exports to the staging storage app', async () => {
      const result = await tool.execute(csvInput(), localRouteContext);

      expect(result.success).toBe(true);
      expect(mockStagingBucket).toHaveBeenCalledOnce();
      expect(mockStagingFile).toHaveBeenCalledOnce();
      expect(mockBucket).not.toHaveBeenCalled();
    });

    it('should pass correct content type metadata to Storage', async () => {
      await tool.execute(csvInput(), context);

      expect(mockSave).toHaveBeenCalledOnce();
      const [, opts] = mockSave.mock.calls[0];
      expect(opts.contentType).toBe('text/csv');
      expect(opts.resumable).toBe(false);
      expect(opts.validation).toBe(false);
      expect(opts.metadata.metadata.firebaseStorageDownloadTokens).toMatch(/^[0-9a-f-]{36}$/i);
    });
  });

  // ── XLSX Generation ──────────────────────────────────────────────────────

  describe('XLSX export', () => {
    it('should generate XLSX and upload to Firebase Storage', async () => {
      const result = await tool.execute(xlsxInput(), context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const data = result.data as Record<string, unknown>;
      expect(data['fileName']).toBe('Callsheet Export.xlsx');
      expect(data['mimeType']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(data['format']).toBe('xlsx');
      expect(data['rowCount']).toBe(2);
      expect(data['columnCount']).toBe(3);
    });

    it('should pass XLSX content type metadata to Storage', async () => {
      await tool.execute(xlsxInput(), context);

      expect(mockSave).toHaveBeenCalledOnce();
      const [, opts] = mockSave.mock.calls[0];
      expect(opts.contentType).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });
  });

  // ── PDF Generation ───────────────────────────────────────────────────────

  describe('PDF export', () => {
    it('should generate PDF and upload to Firebase Storage', async () => {
      const result = await tool.execute(pdfInput(), context);

      expect(result.success).toBe(true);

      const data = result.data as Record<string, unknown>;
      expect(data['fileName']).toBe('Scout Report.pdf');
      expect(data['mimeType']).toBe('application/pdf');
      expect(data['format']).toBe('pdf');
      expect(data['downloadUrl']).toContain(
        '/api/v1/agent-x/media-proxy/export/Scout%20Report.pdf'
      );
      expect(data['downloadUrl']).toContain('mime=application%2Fpdf');
      expect(typeof data['sizeBytes']).toBe('number');
      expect(data['sizeBytes'] as number).toBeGreaterThan(0);
    });

    it('should not duplicate file extension when fileName already includes one', async () => {
      const result = await tool.execute(pdfInput({ fileName: 'Scout Report.pdf' }), context);

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['fileName']).toBe('Scout Report.pdf');
    });

    it('should accept PDF with only body paragraphs (no table)', async () => {
      const result = await tool.execute(
        pdfInput({
          columns: undefined,
          rows: undefined,
          bodyParagraphs: ['This is a summary report.'],
        }),
        context
      );
      expect(result.success).toBe(true);
    });

    it('should accept PDF with only bullet points', async () => {
      const result = await tool.execute(
        pdfInput({
          columns: undefined,
          rows: undefined,
          bodyParagraphs: undefined,
          bulletPoints: ['Point A', 'Point B'],
        }),
        context
      );
      expect(result.success).toBe(true);
    });

    it('should accept PDF with only description', async () => {
      const result = await tool.execute(
        pdfInput({
          columns: undefined,
          rows: undefined,
          bodyParagraphs: undefined,
          bulletPoints: undefined,
          description: 'Just a description.',
        }),
        context
      );
      expect(result.success).toBe(true);
    });

    it('should accept PDF with imageUrls and no text/table body', async () => {
      const result = await tool.execute(
        pdfInput({
          columns: undefined,
          rows: undefined,
          bodyParagraphs: undefined,
          bulletPoints: undefined,
          description: undefined,
          imageUrls: [TINY_PNG_DATA_URL],
        }),
        context
      );
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['format']).toBe('pdf');
    });

    it('should accept PDF with imageUrl alias and invalid url field present', async () => {
      const result = await tool.execute(
        pdfInput({
          columns: undefined,
          rows: undefined,
          bodyParagraphs: undefined,
          bulletPoints: undefined,
          description: undefined,
          imageUrl: TINY_PNG_DATA_URL,
          url: 'not-a-url',
        }),
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['format']).toBe('pdf');
    });

    it('should accept PDF with both diagram and chart image URLs', async () => {
      const result = await tool.execute(
        pdfInput({
          columns: undefined,
          rows: undefined,
          bodyParagraphs: undefined,
          bulletPoints: undefined,
          description: undefined,
          imageUrls: [
            'https://cdn.example.com/diagram-1.png',
            'https://storage.googleapis.com/nxt1-media/charts/recruiting-funnel-chart.png',
          ],
        }),
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['format']).toBe('pdf');
      expect(data['fileName']).toBe('Scout Report.pdf');
    });

    it('should accept PDF when chart URL appears inline in bodyParagraphs', async () => {
      const result = await tool.execute(
        pdfInput({
          columns: undefined,
          rows: undefined,
          bulletPoints: undefined,
          bodyParagraphs: [
            'Recruiting funnel chart: https://storage.googleapis.com/nxt1-media/charts/funnel-2026.png',
          ],
          description: undefined,
        }),
        context
      );

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['format']).toBe('pdf');
    });
  });

  // ── File Name Sanitization ───────────────────────────────────────────────

  describe('file name handling', () => {
    it('should sanitize special characters from fileName', async () => {
      const result = await tool.execute(csvInput({ fileName: '../../../etc/passwd' }), context);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      // Traversal chars stripped
      expect(data['fileName']).not.toContain('..');
      expect(data['fileName']).not.toContain('/');
    });

    it('should fallback to "export" for empty fileName after sanitization', async () => {
      const result = await tool.execute(csvInput({ fileName: '///###' }), context);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data['fileName']).toBe('export.csv');
    });
  });

  // ── Storage Path ─────────────────────────────────────────────────────────

  describe('storage paths', () => {
    it('should use thread-scoped path when threadId is present', async () => {
      await tool.execute(csvInput(), context);

      expect(mockFile).toHaveBeenCalledOnce();
      const storagePath = mockFile.mock.calls[0][0] as string;
      expect(storagePath).toMatch(/^Users\/user_123\/threads\/thread_456\/exports\//);
    });

    it('should return error when no threadId', async () => {
      const result = await tool.execute(csvInput(), { userId: 'user_123' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('threadId');
    });

    it('should return error when no context', async () => {
      const result = await tool.execute(csvInput());

      expect(result.success).toBe(false);
    });
  });
});
