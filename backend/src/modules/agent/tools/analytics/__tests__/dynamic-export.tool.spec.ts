/**
 * @fileoverview Unit Tests — DynamicExportTool
 * @module @nxt1/backend/modules/agent/tools/data
 *
 * Tests input validation, CSV/PDF generation delegation, and error handling.
 * Firebase Storage is mocked to avoid network calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';

// ── Mocks (must precede tool import) ─────────────────────────────────────────

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockExists = vi.fn().mockResolvedValue([true]);
const mockFile = vi.fn().mockReturnValue({ save: mockSave, exists: mockExists });
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

const originalFetch = globalThis.fetch;
const TEST_PRIVATE_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
  type: 'pkcs8',
  format: 'pem',
});

function mockJsonResponse(body: Record<string, unknown>, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    headers: { get: vi.fn(() => 'application/json') },
  } as unknown as Response;
}

function installSuccessfulFetchMock(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return mockJsonResponse({
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3599,
      });
    }
    if (url.startsWith('https://storage.googleapis.com/upload/storage/v1/')) {
      return mockJsonResponse({ name: 'uploaded-object' });
    }
    if (url.startsWith('https://storage.googleapis.com/storage/v1/')) {
      return mockJsonResponse({ name: 'uploaded-object' });
    }
    if (init?.method === 'GET') {
      return mockJsonResponse({}, 404);
    }
    return mockJsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DynamicExportTool', () => {
  let tool: DynamicExportTool;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['FIREBASE_CLIENT_EMAIL'] = 'test-exporter@example.iam.gserviceaccount.com';
    process.env['FIREBASE_PRIVATE_KEY'] = TEST_PRIVATE_KEY.replace(/\n/g, '\\n');
    process.env['FIREBASE_PROJECT_ID'] = 'test-project';
    process.env['FIREBASE_STORAGE_BUCKET'] = 'test-bucket';
    installSuccessfulFetchMock();
    tool = new DynamicExportTool();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    delete process.env['FIREBASE_CLIENT_EMAIL'];
    delete process.env['FIREBASE_PRIVATE_KEY'];
    delete process.env['FIREBASE_PROJECT_ID'];
    delete process.env['FIREBASE_STORAGE_BUCKET'];
    delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
    delete process.env['GOOGLE_PRIVATE_KEY'];
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

    it('should reject invalid format', async () => {
      const result = await tool.execute({ format: 'docx', fileName: 'test' }, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('format');
    });

    it('should reject missing fileName', async () => {
      const result = await tool.execute({ format: 'csv' }, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('fileName');
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
        'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/'
      );
      expect(data['downloadUrl']).toContain('?alt=media&token=');
      expect(typeof data['sizeBytes']).toBe('number');
      expect(data['sizeBytes'] as number).toBeGreaterThan(0);

      // Verify storage path is thread-scoped
      const storagePath = data['storagePath'] as string;
      expect(storagePath).toContain('user_123');
      expect(storagePath).toContain('thread_456');
      expect(storagePath).toContain('.csv');
    });

    it('should pass correct content type metadata to Storage', async () => {
      const fetchMock = installSuccessfulFetchMock();
      await tool.execute(csvInput(), context);

      const uploadCall = fetchMock.mock.calls.find(([url]) =>
        String(url).startsWith('https://storage.googleapis.com/upload/storage/v1/')
      );
      expect(uploadCall).toBeDefined();
      const [, opts] = uploadCall!;
      expect(opts?.headers).toMatchObject({
        authorization: 'Bearer test-access-token',
      });
      expect(String((opts?.headers as Record<string, string>)['content-type'])).toContain(
        'multipart/related'
      );
      expect(Buffer.isBuffer(opts?.body)).toBe(true);
      expect((opts?.body as Buffer).toString('utf8')).toContain('"contentType":"text/csv"');
      expect((opts?.body as Buffer).toString('utf8')).toContain('firebaseStorageDownloadTokens');
    });

    it('should retry transient Google token fetch failures during upload', async () => {
      vi.useFakeTimers();
      try {
        const legacyTokenEndpoint = ['https://www.googleapis.com', 'oauth2', 'v4', 'token'].join(
          '/'
        );
        let uploadAttempts = 0;
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url === 'https://oauth2.googleapis.com/token') {
            return mockJsonResponse({ access_token: 'token' });
          }
          if (url.startsWith('https://storage.googleapis.com/upload/storage/v1/')) {
            uploadAttempts += 1;
            if (uploadAttempts === 1) {
              throw new Error(
                `Invalid response body while trying to fetch ${legacyTokenEndpoint}: Premature close`
              );
            }
            return mockJsonResponse({ name: 'uploaded-object' });
          }
          if (url.startsWith('https://storage.googleapis.com/storage/v1/')) {
            return mockJsonResponse({ name: 'uploaded-object' });
          }
          return mockJsonResponse({});
        });
        vi.stubGlobal('fetch', fetchMock);

        const resultPromise = tool.execute(csvInput(), {
          ...context,
          operationId: 'op_export_retry',
        });
        await vi.advanceTimersByTimeAsync(500);
        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(uploadAttempts).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should retry transient Google token fetch failures during upload verification', async () => {
      vi.useFakeTimers();
      try {
        let metadataAttempts = 0;
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url === 'https://oauth2.googleapis.com/token') {
            return mockJsonResponse({ access_token: 'test-access-token' });
          }
          if (url.startsWith('https://storage.googleapis.com/upload/storage/v1/')) {
            return mockJsonResponse({ name: 'uploaded-object' });
          }
          if (url.startsWith('https://storage.googleapis.com/storage/v1/')) {
            metadataAttempts += 1;
            if (metadataAttempts === 1) {
              throw new Error('request to https://oauth2.googleapis.com/token aborted');
            }
            return mockJsonResponse({ name: 'uploaded-object' });
          }
          return mockJsonResponse({});
        });
        vi.stubGlobal('fetch', fetchMock);

        const resultPromise = tool.execute(csvInput(), {
          ...context,
          operationId: 'op_export_verify_retry',
        });
        await vi.advanceTimersByTimeAsync(500);
        const result = await resultPromise;

        expect(result.success).toBe(true);
        expect(metadataAttempts).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should log safe credential diagnostics without leaking credential values', async () => {
      const previousEnv = {
        GOOGLE_APPLICATION_CREDENTIALS: process.env['GOOGLE_APPLICATION_CREDENTIALS'],
        GOOGLE_PRIVATE_KEY: process.env['GOOGLE_PRIVATE_KEY'],
      };
      const tmpDir = mkdtempSync(join(tmpdir(), 'dynamic-export-auth-'));
      const credentialsPath = join(tmpDir, 'credentials.json');
      const fakePrivateKey =
        '-----BEGIN PRIVATE KEY-----\\nTEST_PRIVATE_KEY_BODY\\n-----END PRIVATE KEY-----\\n';
      writeFileSync(
        credentialsPath,
        JSON.stringify({
          type: 'service_account',
          client_email: 'exporter@example.iam.gserviceaccount.com',
          private_key: fakePrivateKey.replace(/\\n/g, '\n'),
          token_uri: 'https://www.googleapis.com/oauth2/v4/token',
        })
      );

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        process.env['GOOGLE_APPLICATION_CREDENTIALS'] = credentialsPath;
        process.env['GOOGLE_PRIVATE_KEY'] = fakePrivateKey;
        process.env['FIREBASE_PRIVATE_KEY'] = TEST_PRIVATE_KEY.replace(/\n/g, '\\n');

        const result = await tool.execute(csvInput(), context);
        const logs = logSpy.mock.calls.map((call) => String(call[0])).join('\n');

        expect(result.success).toBe(true);
        expect(logs).toContain('"GooglePrivateKeyLooksPem": true');
        expect(logs).toContain('"applicationCredentialsUsesLegacyTokenUri": true');
        expect(logs).toContain('"applicationCredentialsHasClientEmail": true');
        expect(logs).not.toContain('TEST_PRIVATE_KEY_BODY');
        expect(logs).not.toContain('exporter@example.iam.gserviceaccount.com');
        expect(logs).not.toContain(credentialsPath);
      } finally {
        logSpy.mockRestore();
        if (previousEnv.GOOGLE_APPLICATION_CREDENTIALS === undefined) {
          delete process.env['GOOGLE_APPLICATION_CREDENTIALS'];
        } else {
          process.env['GOOGLE_APPLICATION_CREDENTIALS'] =
            previousEnv.GOOGLE_APPLICATION_CREDENTIALS;
        }
        if (previousEnv.GOOGLE_PRIVATE_KEY === undefined) {
          delete process.env['GOOGLE_PRIVATE_KEY'];
        } else {
          process.env['GOOGLE_PRIVATE_KEY'] = previousEnv.GOOGLE_PRIVATE_KEY;
        }
        rmSync(tmpDir, { recursive: true, force: true });
      }
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
      const result = await tool.execute(csvInput(), context);

      expect(result.success).toBe(true);
      const storagePath = (result.data as Record<string, unknown>)['storagePath'] as string;
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
