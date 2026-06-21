/**
 * @fileoverview Unit Tests — DynamicExportTool
 * @module @nxt1/backend/modules/agent/tools/data
 *
 * Tests input validation, CSV/PDF generation delegation, and error handling.
 * Firebase Storage is mocked to avoid network calls.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (must precede tool import) ─────────────────────────────────────────

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockExists = vi.fn().mockResolvedValue([true]);
const mockGetSignedUrl = vi
  .fn()
  .mockResolvedValue([
    'https://storage.googleapis.com/test-bucket/signed-export.pdf?X-Goog-Algorithm=GOOG4-RSA-SHA256',
  ]);
const mockFile = vi.fn().mockReturnValue({
  save: mockSave,
  exists: mockExists,
  getSignedUrl: mockGetSignedUrl,
});
const mockBucket = vi.fn().mockReturnValue({ file: mockFile, name: 'test-bucket' });
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: mockBucket }),
}));

import { DynamicExportTool } from '../../system/dynamic-export.tool.js';
import type { ToolExecutionContext } from '../../base.tool.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const context: ToolExecutionContext = {
  userId: 'user_123',
  threadId: 'thread_456',
  sessionId: 'session_789',
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

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgAAAAAgAB4iG8MwAAAABJRU5ErkJggg==';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DynamicExportTool', () => {
  let tool: DynamicExportTool;

  beforeEach(() => {
    vi.clearAllMocks();
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
        'https://storage.googleapis.com/test-bucket/signed-export.pdf'
      );
      expect(data['downloadUrl']).toContain('X-Goog-Algorithm=GOOG4-RSA-SHA256');
      expect(typeof data['sizeBytes']).toBe('number');
      expect(data['sizeBytes'] as number).toBeGreaterThan(0);

      // Verify storage path is thread-scoped
      const storagePath = data['storagePath'] as string;
      expect(storagePath).toContain('user_123');
      expect(storagePath).toContain('thread_456');
      expect(storagePath).toContain('.csv');
    });

    it('should pass correct content type metadata to Storage', async () => {
      await tool.execute(csvInput(), context);

      expect(mockSave).toHaveBeenCalledOnce();
      const [, opts] = mockSave.mock.calls[0];
      expect(opts.contentType).toBe('text/csv');
      expect(opts.resumable).toBe(false);
      expect(opts.validation).toBe(false);
      expect(opts.metadata.contentType).toBe('text/csv');
      expect(opts.metadata.metadata.firebaseStorageDownloadTokens).toMatch(/^[0-9a-f-]{36}$/i);
      expect(mockGetSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'read',
        expires: expect.any(Number),
        promptSaveAs: 'Top Prospects 2026.csv',
        responseType: 'text/csv',
      });
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
