import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentMediaLifecycleService } from '../../modules/agent/tools/media/agent-media-lifecycle.service.js';
import { parseHudlBreakdownBuffer } from '../../services/team/hudl-breakdown-import.service.js';
import { scheduleUniversalFileSemanticSync } from '../../services/team/universal-file-semantic.service.js';
import { resetFeatureFlagsService } from '../../config/feature-flags/feature-flags.service.js';

const getSignedUrlWithTimeoutMock = vi.fn();
const notifyDirectFileShareMock = vi.fn().mockResolvedValue({
  dispatched: true,
  notificationId: 'notif-1',
});

vi.mock('../../middleware/auth/auth.middleware.js', () => ({
  appGuard: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../middleware/rate-limit/rate-limit.middleware.js', () => ({
  uploadRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./shared.js', () => ({
  chatService: null,
  agentUpload: {
    single: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
  agentSingleFileUpload: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../services/team/team-files-index.service.js', () => ({
  upsertTeamFileFromAttachment: vi.fn(),
}));

vi.mock('../../services/team/roster-entry.service.js', () => ({
  RosterEntryService: vi.fn().mockImplementation(() => ({
    getActiveOrPendingRosterEntry: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('../../utils/gcs-signed-url.js', () => ({
  getSignedUrlWithTimeout: getSignedUrlWithTimeoutMock,
}));

vi.mock('../../modules/agent/tools/media/agent-media-lifecycle.service.js', () => ({
  AgentMediaLifecycleService: {
    extractStoragePathFromUrl: vi.fn().mockReturnValue(null),
    isFirebaseDownloadTokenUrl: vi.fn().mockReturnValue(false),
    requiresDurablePromotion: vi.fn().mockReturnValue(false),
    promoteOwnedObjectToDurableUploadPath: vi.fn(),
    buildStoragePath: vi.fn(),
    saveBufferAndSignRead: vi.fn(),
    ensureFirebaseDownloadUrl: async (params: {
      bucket: { file: (path: string) => { getSignedUrl: () => Promise<[string]> } };
      storagePath: string;
    }) => {
      const [signedUrl] = await getSignedUrlWithTimeoutMock(() =>
        params.bucket.file(params.storagePath).getSignedUrl()
      );
      return signedUrl;
    },
  },
}));

vi.mock('../../services/team/universal-file-semantic.service.js', () => ({
  buildFilmReviewSemanticText: vi.fn().mockReturnValue('Film review semantic text'),
  deleteUniversalFileSemanticIndex: vi.fn(),
  scheduleUniversalFileSemanticSync: vi.fn(),
  UniversalFileSemanticService: vi.fn(),
}));

vi.mock('../core/upload/shared.js', () => ({
  fetchCloudflareDownloadStatus: vi.fn(),
  requestCloudflareVideoDownloadRender: vi.fn(),
}));

vi.mock('../../services/team/hudl-breakdown-import.service.js', () => ({
  parseHudlBreakdownBuffer: vi.fn(),
}));

vi.mock('../../services/communications/file-share-notifications.js', () => ({
  notifyDirectFileShare: notifyDirectFileShareMock,
}));

const { default: filesRoutes } = await import('./files.routes.js');
const { getSignedUrlWithTimeout } = await import('../../utils/gcs-signed-url.js');
const { logger } = await import('../../utils/logger.js');
const { upsertTeamFileFromAttachment } =
  await import('../../services/team/team-files-index.service.js');

type SeedRecord = Record<string, unknown>;
type MockSignedUrlResponse = string | Error;
type MockSignedUrlBucket = {
  file: (path: string) => {
    getSignedUrl: (options: {
      version: 'v4';
      action: 'read';
      expires: number;
      responseDisposition?: string;
      responseType?: string;
    }) => Promise<[string]>;
  };
};

function cloneRecord(record: SeedRecord): SeedRecord {
  return JSON.parse(JSON.stringify(record)) as SeedRecord;
}

function applyDocUpdate(record: SeedRecord, update: Record<string, unknown>): SeedRecord {
  const nextRecord = cloneRecord(record);

  for (const [path, value] of Object.entries(update)) {
    const segments = path.split('.');
    let cursor: Record<string, unknown> = nextRecord;

    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index] as string;
      const existing = cursor[segment];
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }

    cursor[segments[segments.length - 1] as string] = cloneRecord({ value }).value;
  }

  return nextRecord;
}

function createMockFirestore(seed: Record<string, Record<string, SeedRecord>>) {
  const store = new Map<string, SeedRecord>();
  let beforeNextTransaction: (() => void) | undefined;

  for (const [collectionName, docs] of Object.entries(seed)) {
    for (const [docId, record] of Object.entries(docs)) {
      store.set(`${collectionName}/${docId}`, cloneRecord(record));
    }
  }

  const createDocRef = (path: string) => ({
    async get() {
      const record = store.get(path);
      return {
        id: path.split('/').pop() ?? '',
        exists: record !== undefined,
        data: () => (record ? cloneRecord(record) : undefined),
      };
    },
    async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
      const current = store.get(path) ?? {};
      store.set(path, options?.merge ? { ...current, ...cloneRecord(data) } : cloneRecord(data));
    },
    async update(data: Record<string, unknown>) {
      const current = store.get(path) ?? {};
      store.set(path, applyDocUpdate(current, data));
    },
  });

  const createCollectionRef = (collectionName: string) => ({
    doc(docId: string) {
      return createDocRef(`${collectionName}/${docId}`);
    },
    where(field: string, _operator: '==', value: unknown) {
      const getMatchingDocs = async () => {
        const docs = [...store.entries()]
          .filter(([path, record]) => {
            const [pathCollectionName] = path.split('/');
            return pathCollectionName === collectionName && record[field] === value;
          })
          .map(([path, record]) => ({
            id: path.split('/').pop() ?? '',
            ref: createDocRef(path),
            data: () => cloneRecord(record),
          }));

        return { docs };
      };

      return {
        limit(_count: number) {
          return {
            get: getMatchingDocs,
          };
        },
        get: getMatchingDocs,
      };
    },
  });

  return {
    async runTransaction(
      callback: (transaction: {
        get: (reference: ReturnType<typeof createDocRef>) => Promise<unknown>;
        set: (
          reference: ReturnType<typeof createDocRef>,
          data: Record<string, unknown>,
          options?: { merge?: boolean }
        ) => void;
      }) => Promise<unknown>
    ) {
      beforeNextTransaction?.();
      beforeNextTransaction = undefined;
      const pendingWrites: Promise<void>[] = [];
      const result = await callback({
        get: (reference) => reference.get(),
        set: (reference, data, options) => {
          pendingWrites.push(reference.set(data, options));
        },
      });
      await Promise.all(pendingWrites);
      return result;
    },
    collection(collectionName: string) {
      return createCollectionRef(collectionName);
    },
    beforeNextTransaction(callback: () => void) {
      beforeNextTransaction = callback;
    },
    mutateRecord(path: string, update: (current: SeedRecord) => SeedRecord) {
      const current = store.get(path);
      if (current) store.set(path, update(cloneRecord(current)));
    },
    getRecord(path: string) {
      const record = store.get(path);
      return record ? cloneRecord(record) : undefined;
    },
  };
}

function createSignedUrlBucket(
  signedUrls: Record<string, MockSignedUrlResponse>
): MockSignedUrlBucket {
  return {
    file(path: string) {
      return {
        getSignedUrl: vi.fn(async () => {
          const signedUrl = signedUrls[path];
          if (signedUrl instanceof Error) {
            throw signedUrl;
          }

          return [
            signedUrl ??
              `https://storage.googleapis.com/mock-bucket/${encodeURIComponent(path)}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=test`,
          ];
        }),
      };
    },
  };
}

function createApp(
  db: ReturnType<typeof createMockFirestore>,
  optionsOrBucket?:
    | MockSignedUrlBucket
    | {
        readonly requestMutator?: (req: express.Request) => void;
        readonly storage?: unknown;
      }
) {
  const resolvedOptions =
    optionsOrBucket && 'file' in optionsOrBucket
      ? {
          storage: {
            bucket: () => optionsOrBucket,
          },
        }
      : optionsOrBucket;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    resolvedOptions?.requestMutator?.(req);
    (req as express.Request & { user?: Record<string, unknown> }).user = {
      uid: 'owner-1',
      displayName: 'Owner One',
      photoURL: 'https://example.com/owner.png',
    };
    req.firebase = {
      db: db as never,
      auth: {} as never,
      storage: (resolvedOptions?.storage ?? {
        bucket: () => createSignedUrlBucket({}),
      }) as never,
    };
    next();
  });
  app.use('/api/v1/agent', filesRoutes);
  return app;
}

const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n' +
    '2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\n' +
    '3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>> endobj\n' +
    'trailer <</Root 1 0 R>>\n%%EOF',
  'latin1'
);

function createDownloadBucket(download: () => Promise<[Buffer]>): MockSignedUrlBucket {
  return {
    file: vi.fn().mockReturnValue({
      download: vi.fn(download),
      getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/file']),
    }),
  };
}

describe('POST /api/v1/agent/files/:fileId/preview-sessions', () => {
  beforeEach(async () => {
    resetFeatureFlagsService();
    const { DocumentPreviewService } = await import('../../modules/document-preview/index.js');
    DocumentPreviewService.clearManifestCache();
  });

  it('returns feature_disabled when the preview sessions feature flag is disabled', async () => {
    const db = createMockFirestore({
      AppConfig: {
        featureFlags: {
          flags: {
            'agent.files.preview.sessions.enabled': false,
          },
        },
      },
      UniversalFiles: {
        document1: {
          title: 'Practice Report.pdf',
          normalizedTitle: 'practice report.pdf',
          type: 'file',
          payloadKind: 'native',
          status: 'ready',
          ownerUserId: 'owner-1',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          payload: {
            asset: {
              mimeType: 'application/pdf',
              kind: 'pdf',
              origin: 'files_upload',
              sizeBytes: 1024,
              url: 'https://example.com/practice-report.pdf',
              storagePath: 'users/owner-1/practice-report.pdf',
            },
          },
          createdAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
        },
      },
    });

    const response = await request(createApp(db)).post(
      '/api/v1/agent/files/document1/preview-sessions'
    );

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        available: false,
        reason: 'feature_disabled',
      },
    });
  });

  it('authorizes and returns a preview manifest when preview sessions are active', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        document1: {
          title: 'Practice Report.pdf',
          normalizedTitle: 'practice report.pdf',
          type: 'file',
          payloadKind: 'native',
          status: 'ready',
          ownerUserId: 'owner-1',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          payload: {
            asset: {
              mimeType: 'application/pdf',
              kind: 'pdf',
              origin: 'files_upload',
              sizeBytes: 1024,
              url: 'https://example.com/practice-report.pdf',
              storagePath: 'users/owner-1/practice-report.pdf',
            },
          },
          createdAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
        },
      },
    });

    const response = await request(
      createApp(
        db,
        createDownloadBucket(async () => [MINIMAL_PDF])
      )
    ).post('/api/v1/agent/files/document1/preview-sessions');

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.available).toBe(true);
    expect(response.body.data.manifest.pageCount).toBe(1);
    expect(response.body.data.manifest).toMatchObject({
      documentId: 'document1',
      documentType: 'pdf',
      fileName: 'Practice Report.pdf',
      mimeType: 'application/pdf',
    });
    expect(response.body.data.preview).toMatchObject({
      documentType: 'pdf',
      status: 'ready',
    });
  });

  it('reports available:false when the source file cannot be read', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        sheetBroken: {
          title: 'Roster.xlsx',
          normalizedTitle: 'roster.xlsx',
          type: 'file',
          payloadKind: 'native',
          status: 'ready',
          ownerUserId: 'owner-1',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          payload: {
            asset: {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              kind: 'csv',
              origin: 'files_upload',
              sizeBytes: 1024,
              url: 'https://example.com/roster.xlsx',
              storagePath: 'users/owner-1/roster.xlsx',
            },
          },
          createdAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
        },
      },
    });

    const response = await request(
      createApp(
        db,
        createDownloadBucket(async () => {
          throw new Error('storage unavailable');
        })
      )
    ).post('/api/v1/agent/files/sheetBroken/preview-sessions');

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data).toMatchObject({ available: false, reason: 'render_failed' });
    expect(response.body.data.manifest).toBeUndefined();
  });

  it('rejects forbidden users attempting to negotiate a preview session', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        documentSecret: {
          title: 'Classified.pdf',
          normalizedTitle: 'classified.pdf',
          type: 'file',
          payloadKind: 'native',
          status: 'ready',
          ownerUserId: 'other-user',
          readAccessKeys: ['user:other-user'],
          writeAccessKeys: ['user:other-user'],
          payload: {
            asset: {
              mimeType: 'application/pdf',
              kind: 'pdf',
              origin: 'files_upload',
              sizeBytes: 1024,
              url: 'https://example.com/secret.pdf',
              storagePath: 'users/other-user/secret.pdf',
            },
          },
          createdAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
        },
      },
    });

    const response = await request(createApp(db)).post(
      '/api/v1/agent/files/documentSecret/preview-sessions'
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});

describe('GET /api/v1/agent/files/:fileId/download', () => {
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  function seedDocx(overrides: { title?: string; readAccessKeys?: string[] } = {}) {
    return createMockFirestore({
      UniversalFiles: {
        doc1: {
          title: overrides.title ?? 'Spring Playbook',
          normalizedTitle: 'spring playbook',
          type: 'file',
          payloadKind: 'native',
          status: 'ready',
          ownerUserId: 'owner-1',
          readAccessKeys: overrides.readAccessKeys ?? ['user:owner-1'],
          writeAccessKeys: overrides.readAccessKeys ?? ['user:owner-1'],
          payload: {
            asset: {
              mimeType: DOCX_MIME,
              kind: 'doc',
              origin: 'agent_chat_output',
              sizeBytes: 999,
              url: 'https://example.com/spring-playbook.docx',
              storagePath: 'Users/owner-1/threads/t1/exports/spring.docx',
            },
          },
          createdAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
        },
      },
    });
  }

  function bucketReturning(stored: Buffer) {
    return {
      file: vi.fn().mockReturnValue({ download: vi.fn().mockResolvedValue([stored]) }),
    } as unknown as MockSignedUrlBucket;
  }

  it('returns the real bytes with an attachment header and the extension from the MIME type', async () => {
    const real = Buffer.from('PK\u0003\u0004real-docx-bytes', 'latin1');
    const response = await request(createApp(seedDocx(), bucketReturning(real)))
      .get('/api/v1/agent/files/doc1/download')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain(DOCX_MIME);
    expect(response.headers['content-disposition']).toContain(
      'attachment; filename="Spring Playbook.docx"'
    );
    expect(Buffer.compare(response.body as Buffer, real)).toBe(0);
  });

  it('strips multipart framing so the download is the actual document', async () => {
    const real = Buffer.from('PK\u0003\u0004real-docx-bytes', 'latin1');
    const boundary = 'boundary123';
    const wrapped = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: ${DOCX_MIME}\r\n\r\n`, 'latin1'),
      real,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1'),
    ]);

    const response = await request(createApp(seedDocx(), bucketReturning(wrapped)))
      .get('/api/v1/agent/files/doc1/download')
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(Buffer.compare(response.body as Buffer, real)).toBe(0);
  });

  it('keeps non-ASCII titles header-safe', async () => {
    const response = await request(
      createApp(
        seedDocx({ title: 'Game Plan \u2014 Week 3.docx' }),
        bucketReturning(Buffer.from('x'))
      )
    ).get('/api/v1/agent/files/doc1/download');

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('filename="Game Plan _ Week 3.docx"');
    expect(response.headers['content-disposition']).toContain(
      "filename*=UTF-8''Game%20Plan%20%E2%80%94%20Week%203.docx"
    );
  });

  it('rejects users without read access', async () => {
    const response = await request(
      createApp(
        seedDocx({ readAccessKeys: ['user:someone-else'] }),
        bucketReturning(Buffer.from('x'))
      )
    ).get('/api/v1/agent/files/doc1/download');

    expect(response.status).toBe(403);
  });

  it('returns 404 for unknown files', async () => {
    const response = await request(
      createApp(createMockFirestore({ UniversalFiles: {} }), bucketReturning(Buffer.from('x')))
    ).get('/api/v1/agent/files/missing/download');

    expect(response.status).toBe(404);
  });
});

describe('GET /api/v1/agent/files/:fileId/preview/spreadsheet-range', () => {
  it('returns spreadsheet range data for authorized users', async () => {
    const csvContent = 'Name,Position\nJohn,QB\nMarcus,WR\n';
    const db = createMockFirestore({
      UniversalFiles: {
        sheet1: {
          title: 'Roster.csv',
          normalizedTitle: 'roster.csv',
          type: 'file',
          payloadKind: 'native',
          status: 'ready',
          ownerUserId: 'owner-1',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          payload: {
            asset: {
              mimeType: 'text/csv',
              kind: 'csv',
              origin: 'files_upload',
              sizeBytes: csvContent.length,
              url: 'https://example.com/roster.csv',
              storagePath: 'users/owner-1/roster.csv',
            },
          },
          createdAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
        },
      },
    });

    const mockBucket: MockSignedUrlBucket = {
      file: vi.fn().mockReturnValue({
        download: vi.fn().mockResolvedValue([Buffer.from(csvContent, 'utf-8')]),
        getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/roster.csv']),
      }),
    };

    const response = await request(createApp(db, mockBucket)).get(
      '/api/v1/agent/files/sheet1/preview/spreadsheet-range?startRow=1&endRow=3&startCol=1&endCol=2'
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.cells).toHaveLength(6);
    expect(response.body.data.cells[0]).toMatchObject({ row: 1, col: 1, value: 'Name' });
  });

  function seedRangeSheet(
    overrides: Record<string, unknown> = {},
    flags?: Record<string, boolean>
  ) {
    return createMockFirestore({
      ...(flags ? { AppConfig: { featureFlags: { flags } } } : {}),
      UniversalFiles: {
        sheet1: {
          title: 'Roster.csv',
          normalizedTitle: 'roster.csv',
          type: 'file',
          payloadKind: 'native',
          status: 'ready',
          ownerUserId: 'owner-1',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          payload: {
            asset: {
              mimeType: 'text/csv',
              kind: 'csv',
              origin: 'files_upload',
              sizeBytes: 20,
              url: 'https://example.com/roster.csv',
              storagePath: 'users/owner-1/roster.csv',
            },
          },
          createdAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
          ...overrides,
        },
      },
    });
  }

  const csvBucket = () => createDownloadBucket(async () => [Buffer.from('Name,Pos\nJohn,QB\n')]);

  it.each([['startRow=abc'], ['endCol=1.5'], ['startCol=-1'], ['endRow=0']])(
    'returns 400 for invalid range params (%s)',
    async (query) => {
      const response = await request(createApp(seedRangeSheet(), csvBucket())).get(
        `/api/v1/agent/files/sheet1/preview/spreadsheet-range?${query}`
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    }
  );

  it('clamps oversized ranges instead of failing', async () => {
    const response = await request(createApp(seedRangeSheet(), csvBucket())).get(
      '/api/v1/agent/files/sheet1/preview/spreadsheet-range?startRow=1&endRow=100000&startCol=1&endCol=100000'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.cells).toHaveLength(4);
  });

  it('returns 404 for an unknown sheet without leaking internals', async () => {
    const response = await request(createApp(seedRangeSheet(), csvBucket())).get(
      '/api/v1/agent/files/sheet1/preview/spreadsheet-range?sheetId=nope'
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: 'Worksheet not found.' });
  });

  it('applies the preview feature flag and readiness guards', async () => {
    resetFeatureFlagsService();
    const disabled = await request(
      createApp(seedRangeSheet({}, { 'agent.files.preview.sessions.enabled': false }), csvBucket())
    ).get('/api/v1/agent/files/sheet1/preview/spreadsheet-range');
    expect(disabled.status).toBe(403);
    expect(disabled.body.reason).toBe('feature_disabled');

    resetFeatureFlagsService();
    const notReady = await request(
      createApp(seedRangeSheet({ status: 'processing' }), csvBucket())
    ).get('/api/v1/agent/files/sheet1/preview/spreadsheet-range');
    expect(notReady.status).toBe(409);
    expect(notReady.body.reason).toBe('source_not_ready');
  });

  it('rejects unauthorized users requesting spreadsheet range', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        sheetSecret: {
          title: 'Secret.csv',
          normalizedTitle: 'secret.csv',
          type: 'file',
          payloadKind: 'native',
          status: 'ready',
          ownerUserId: 'other-user',
          readAccessKeys: ['user:other-user'],
          writeAccessKeys: ['user:other-user'],
          payload: {
            asset: {
              mimeType: 'text/csv',
              kind: 'csv',
              origin: 'files_upload',
              sizeBytes: 10,
              url: 'https://example.com/secret.csv',
              storagePath: 'users/other-user/secret.csv',
            },
          },
          createdAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
        },
      },
    });

    const response = await request(createApp(db)).get(
      '/api/v1/agent/files/sheetSecret/preview/spreadsheet-range'
    );

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});

describe('PATCH /api/v1/agent/files/:fileId/preview/spreadsheet-cells', () => {
  function seedEditableSheet(overrides: Record<string, unknown> = {}) {
    return createMockFirestore({
      UniversalFiles: {
        sheet1: {
          title: 'Roster.csv',
          normalizedTitle: 'roster.csv',
          type: 'file',
          payloadKind: 'native',
          status: 'ready',
          ownerUserId: 'owner-1',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          payload: {
            asset: {
              mimeType: 'text/csv',
              kind: 'csv',
              origin: 'files_upload',
              sizeBytes: 18,
              url: 'https://example.com/roster.csv',
              storagePath: 'users/owner-1/roster.csv',
            },
          },
          createdAt: '2026-09-27T00:00:00.000Z',
          updatedAt: '2026-09-27T00:00:00.000Z',
          ...overrides,
        },
      },
    });
  }

  function editableCsvBucket() {
    const save = vi.fn().mockResolvedValue(undefined);
    const bucket = {
      file: vi.fn().mockReturnValue({
        download: vi.fn().mockResolvedValue([Buffer.from('Name,Pos\nJohn,QB\n')]),
        getMetadata: vi.fn().mockResolvedValue([{ generation: '3', contentType: 'text/csv' }]),
        save,
        getSignedUrl: vi.fn().mockResolvedValue(['https://signed.example.com/roster.csv']),
      }),
    };
    return { bucket: bucket as unknown as MockSignedUrlBucket, save };
  }

  it('saves edited cells and bumps the file revision', async () => {
    const db = seedEditableSheet();
    const { bucket, save } = editableCsvBucket();

    const response = await request(createApp(db, bucket))
      .patch('/api/v1/agent/files/sheet1/preview/spreadsheet-cells')
      .send({ edits: [{ row: 2, col: 2, value: 'WR' }] });

    expect(response.status).toBe(200);
    expect(response.body.data.cells).toEqual([
      expect.objectContaining({ row: 2, col: 2, value: 'WR', formattedValue: 'WR' }),
    ]);
    const saved = (save.mock.calls[0]![0] as Buffer).toString('utf-8');
    expect(saved).toBe('Name,Pos\nJohn,WR\n');
    const record = db.getRecord('UniversalFiles/sheet1') as Record<string, unknown>;
    expect(record['updatedByUserId']).toBe('owner-1');
    expect(record['updatedAt']).not.toBe('2026-09-27T00:00:00.000Z');
  });

  it('rejects invalid edit payloads', async () => {
    const { bucket } = editableCsvBucket();
    const response = await request(createApp(seedEditableSheet(), bucket))
      .patch('/api/v1/agent/files/sheet1/preview/spreadsheet-cells')
      .send({ edits: [{ row: 0, col: 1, value: 'x' }] });

    expect(response.status).toBe(400);
  });

  it('forbids users who can only read the file', async () => {
    const { bucket, save } = editableCsvBucket();
    const response = await request(
      createApp(seedEditableSheet({ writeAccessKeys: ['user:other-user'] }), bucket)
    )
      .patch('/api/v1/agent/files/sheet1/preview/spreadsheet-cells')
      .send({ edits: [{ row: 1, col: 1, value: 'x' }] });

    expect(response.status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/agent/files/folders/:folderId/share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifyDirectFileShareMock.mockResolvedValue({ dispatched: true, notificationId: 'notif-1' });
  });

  it('propagates a new direct user share to inherited descendants and dispatches a notification', async () => {
    const db = createMockFirestore({
      TeamFileFolders: {
        root: {
          teamId: 'team-1',
          name: 'Root',
          normalizedName: 'root',
          createdByUserId: 'owner-1',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
        child: {
          teamId: 'team-1',
          name: 'Child',
          normalizedName: 'child',
          parentId: 'root',
          createdByUserId: 'owner-1',
          acl: { mode: 'copied_from_folder', sourceFolderId: 'root' },
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      },
      UniversalFiles: {
        fileA: {
          teamId: 'team-1',
          folderId: 'child',
          title: 'Practice Plan',
          acl: { mode: 'copied_from_folder', sourceFolderId: 'child' },
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });

    const response = await request(createApp(db))
      .post('/api/v1/agent/files/folders/root/share')
      .send({
        action: 'add',
        permission: 'read',
        principalType: 'user',
        principalId: 'user-2',
      });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.folder.readAccessKeys).toContain('user:user-2');
    expect(db.getRecord('TeamFileFolders/child')).toMatchObject({
      readAccessKeys: ['user:owner-1', 'user:user-2'],
      writeAccessKeys: ['user:owner-1'],
      updatedByUserId: 'owner-1',
    });
    expect(db.getRecord('UniversalFiles/fileA')).toMatchObject({
      readAccessKeys: ['user:owner-1', 'user:user-2'],
      writeAccessKeys: ['user:owner-1'],
      updatedByUserId: 'owner-1',
    });
    expect(notifyDirectFileShareMock).toHaveBeenCalledOnce();
    expect(notifyDirectFileShareMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        resourceType: 'folder',
        resourceId: 'root',
        recipientUserId: 'user-2',
        sharerUserId: 'owner-1',
        permission: 'read',
      })
    );
  });
});

describe('POST /api/v1/agent/files/:fileId/film-review/breakdown-import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports a breakdown for a user-scoped film review without requiring teamId', async () => {
    vi.mocked(parseHudlBreakdownBuffer).mockResolvedValue({
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Opening Drive',
          startSec: 5,
          endSec: 15,
        },
      ],
      rowCount: 1,
      sheetName: 'Sheet1',
      warnings: [],
    });
    vi.mocked(AgentMediaLifecycleService.buildStoragePath).mockReturnValue(
      'media/owner-1/breakdown.xlsx'
    );
    vi.mocked(AgentMediaLifecycleService.saveBufferAndSignRead).mockResolvedValue({
      storagePath: 'media/owner-1/breakdown.xlsx',
      signedUrl: 'https://example.com/breakdown.xlsx',
    });

    const db = createMockFirestore({
      UniversalFiles: {
        review1: {
          title: 'Film Review',
          type: 'file',
          payloadKind: 'native',
          createdByUserId: 'owner-1',
          updatedByUserId: 'owner-1',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          payload: {
            kind: 'binary',
            mimeType: 'video/mp4',
            url: 'https://example.com/review.mp4',
            filmReview: {
              id: 'review1',
              title: 'Film Review',
              sport: 'football',
              status: 'ready',
              videoUrl: 'https://example.com/review.mp4',
              createdBy: 'owner-1',
              updatedBy: 'owner-1',
              createdAt: '2026-07-10T00:00:00.000Z',
              updatedAt: '2026-07-10T00:00:00.000Z',
              timeline: [],
            },
          },
          createdAt: '2026-07-10T00:00:00.000Z',
          updatedAt: '2026-07-10T00:00:00.000Z',
        },
      },
    });

    const app = createApp(db, {
      requestMutator: (req) => {
        (req as express.Request & { file?: Record<string, unknown> }).file = {
          originalname: 'breakdown.xlsx',
          mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: Buffer.from('sheet'),
        };
      },
      storage: {
        bucket: () => ({ name: 'test-bucket' }),
      },
    });

    const response = await request(app).post(
      '/api/v1/agent/files/review1/film-review/breakdown-import'
    );

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.playCount).toBe(1);
    expect(AgentMediaLifecycleService.saveBufferAndSignRead).toHaveBeenCalled();
    expect(scheduleUniversalFileSemanticSync).toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/agent/files/:fileId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mirrors summary and notes into artifact metadata for uploaded binary files', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        samplePdf: {
          teamId: 'team-1',
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          title: 'Sample.pdf',
          normalizedTitle: 'sample.pdf',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'application/pdf',
              kind: 'doc',
              origin: 'files_upload',
              sizeBytes: 2048,
              url: 'https://cdn.example.com/sample.pdf',
              storagePath: 'teams/team-1/sample.pdf',
            },
          },
          status: 'ready',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
          lastSeenAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });

    const response = await request(createApp(db)).patch('/api/v1/agent/files/samplePdf').send({
      teamId: 'team-1',
      summary: 'Fresh PDF summary.',
      textContent: 'Fresh PDF notes for the inline viewer.',
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(db.getRecord('UniversalFiles/samplePdf')).toMatchObject({
      summary: 'Fresh PDF summary.',
      artifactSummary: 'Fresh PDF summary.',
      artifactNotes: 'Fresh PDF notes for the inline viewer.',
      updatedByUserId: 'owner-1',
    });
  });
});

describe('POST /api/v1/agent/files/:fileId/film-review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a film review for a user-scoped uploaded video without teamId', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        userVideo: {
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          title: 'My Upload.mp4',
          normalizedTitle: 'my upload.mp4',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'video/mp4',
              kind: 'video',
              origin: 'files_upload',
              sizeBytes: 4096,
              url: 'https://cdn.example.com/my-upload.mp4',
              storagePath: 'Users/owner-1/uploads/video/my-upload.mp4',
            },
          },
          status: 'ready',
          sport: 'football',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
          lastSeenAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });

    const response = await request(createApp(db))
      .post('/api/v1/agent/files/userVideo/film-review')
      .send({
        sport: 'football',
        title: 'My Upload Breakdown',
        videoUrl: 'https://cdn.example.com/my-upload.mp4',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.filmReview).toEqual(
      expect.objectContaining({
        id: 'userVideo',
        createdBy: 'owner-1',
        readAccessKeys: ['user:owner-1'],
        writeAccessKeys: ['user:owner-1'],
      })
    );
    expect(response.body.data.filmReview).not.toHaveProperty('teamId');
    expect(db.getRecord('UniversalFiles/userVideo')).toMatchObject({
      payload: expect.objectContaining({
        filmReview: expect.objectContaining({
          videoUrl: 'https://cdn.example.com/my-upload.mp4',
        }),
      }),
      writeAccessKeys: ['user:owner-1'],
    });
  });

  it('preserves wide and tight camera angle metadata on multi-source film review creation', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        userVideo: {
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          title: 'Game 1 Wide.mp4',
          normalizedTitle: 'game 1 wide.mp4',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'video/mp4',
              kind: 'video',
              origin: 'files_upload',
              sizeBytes: 4096,
              url: 'https://cdn.example.com/game-1-wide.mp4',
              storagePath: 'Users/owner-1/uploads/video/game-1-wide.mp4',
            },
          },
          status: 'ready',
          sport: 'football',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });

    const sources = [
      {
        id: 'source-1',
        order: 0,
        title: 'Game 1 Wide',
        videoUrl: 'https://cdn.example.com/game-1-wide.mp4',
        cameraAngle: 'wide',
        angleGroupId: 'angle-game-1',
        angleDetectionSource: 'filename',
      },
      {
        id: 'source-2',
        order: 1,
        title: 'Game 1 Tight',
        videoUrl: 'https://cdn.example.com/game-1-tight.mp4',
        cameraAngle: 'tight',
        angleGroupId: 'angle-game-1',
        angleDetectionSource: 'filename',
      },
    ];

    const response = await request(createApp(db))
      .post('/api/v1/agent/files/userVideo/film-review')
      .send({
        sport: 'football',
        title: 'Game 1 Multi Angle',
        videoUrl: 'https://cdn.example.com/game-1-wide.mp4',
        sources,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.filmReview.sources).toEqual(sources);
    expect(db.getRecord('UniversalFiles/userVideo')).toMatchObject({
      payload: {
        filmReview: {
          sources,
        },
      },
    });
  });

  it('persists playlist selection as the library folder on file-backed film review creation', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        userVideo: {
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          title: 'Practice Clip.mp4',
          normalizedTitle: 'practice clip.mp4',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'video/mp4',
              kind: 'video',
              origin: 'files_upload',
              sizeBytes: 4096,
              url: 'https://cdn.example.com/practice-clip.mp4',
              storagePath: 'Users/owner-1/uploads/video/practice-clip.mp4',
            },
          },
          status: 'ready',
          sport: 'football',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
          lastSeenAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });

    const response = await request(createApp(db))
      .post('/api/v1/agent/files/userVideo/film-review')
      .send({
        sport: 'football',
        title: 'Practice Breakdown',
        videoUrl: 'https://cdn.example.com/practice-clip.mp4',
        playlistId: 'playlist-special-teams',
        playlistName: 'Special Teams',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.filmReview).toMatchObject({
      playlistId: 'playlist-special-teams',
      playlistName: 'Special Teams',
    });
    expect(db.getRecord('UniversalFiles/userVideo')).toMatchObject({
      folderId: 'playlist-special-teams',
      payload: {
        filmReview: {
          playlistId: 'playlist-special-teams',
          playlistName: 'Special Teams',
        },
      },
    });
  });

  it('returns 403 when file write access is revoked before review creation commits', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        userVideo: {
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          title: 'My Upload.mp4',
          normalizedTitle: 'my upload.mp4',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'video/mp4',
              kind: 'video',
              origin: 'files_upload',
              sizeBytes: 4096,
              url: 'https://cdn.example.com/my-upload.mp4',
            },
          },
          status: 'ready',
          sport: 'football',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });
    db.beforeNextTransaction(() => {
      db.mutateRecord('UniversalFiles/userVideo', (current) => ({
        ...current,
        ownerUserId: 'other-user',
        createdByUserId: 'other-user',
        writeAccessKeys: ['user:other-user'],
      }));
    });

    const response = await request(createApp(db))
      .post('/api/v1/agent/files/userVideo/film-review')
      .send({
        sport: 'football',
        title: 'My Upload Breakdown',
        videoUrl: 'https://cdn.example.com/my-upload.mp4',
      });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, code: 'ACCESS_DENIED' });
    expect(db.getRecord('UniversalFiles/userVideo')?.['payload']).not.toHaveProperty('filmReview');
  });
});

describe('POST /api/v1/agent/film-reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists playlist selection on uploaded film review creation', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        uploadedReviewFile: {
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          title: 'Practice Clip.mp4',
          normalizedTitle: 'practice clip.mp4',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'video/mp4',
              kind: 'video',
              origin: 'files_upload',
              sizeBytes: 4096,
              url: 'https://cdn.example.com/practice-clip.mp4',
              storagePath: 'Users/owner-1/uploads/video/practice-clip.mp4',
            },
          },
          status: 'ready',
          sport: 'football',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
          lastSeenAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });
    vi.mocked(upsertTeamFileFromAttachment).mockResolvedValue('uploadedReviewFile');

    const response = await request(createApp(db))
      .post('/api/v1/agent/film-reviews')
      .send({
        sport: 'football',
        title: 'Practice Breakdown',
        videoUrl: 'https://cdn.example.com/practice-clip.mp4',
        playlistId: 'playlist-special-teams',
        playlistName: 'Special Teams',
        attachment: {
          id: 'attachment-1',
          url: 'https://cdn.example.com/practice-clip.mp4',
          storagePath: 'Users/owner-1/uploads/video/practice-clip.mp4',
          name: 'Practice Clip.mp4',
          mimeType: 'video/mp4',
          type: 'video',
          sizeBytes: 4096,
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.filmReview).toMatchObject({
      id: 'uploadedReviewFile',
      playlistId: 'playlist-special-teams',
      playlistName: 'Special Teams',
    });
    expect(vi.mocked(upsertTeamFileFromAttachment)).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadTarget: 'file',
      })
    );
    expect(db.getRecord('UniversalFiles/uploadedReviewFile')).toMatchObject({
      folderId: 'playlist-special-teams',
      payload: {
        filmReview: {
          playlistId: 'playlist-special-teams',
          playlistName: 'Special Teams',
        },
      },
    });
  });
});

describe('PATCH /api/v1/agent/files/:fileId/film-review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a user-scoped film review without teamId and preserves owner write keys', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        userReview: {
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          updatedByUserId: 'owner-1',
          title: 'My Film Review',
          normalizedTitle: 'my film review',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'video/mp4',
              kind: 'video',
              origin: 'files_upload',
              sizeBytes: 4096,
              url: 'https://cdn.example.com/review.mp4',
              storagePath: 'Users/owner-1/uploads/video/review.mp4',
            },
            filmReview: {
              uploadMode: 'single_video',
              videoUrl: 'https://cdn.example.com/review.mp4',
              source: 'team_files',
              schemaVersion: 2,
              timeline: [
                {
                  id: 'play-1',
                  number: 1,
                  label: 'Inside Zone',
                  startSec: 10,
                  endSec: 18,
                },
              ],
              timelineState: 'ready',
            },
          },
          status: 'ready',
          sport: 'football',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
          lastSeenAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });

    const response = await request(createApp(db))
      .patch('/api/v1/agent/files/userReview/film-review')
      .send({
        timeline: [
          {
            id: 'play-1',
            number: 1,
            label: 'Outside Zone',
            startSec: 10,
            endSec: 18,
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.filmReview).toEqual(
      expect.objectContaining({
        id: 'userReview',
        createdBy: 'owner-1',
        readAccessKeys: ['user:owner-1'],
        writeAccessKeys: ['user:owner-1'],
        timeline: [expect.objectContaining({ label: 'Outside Zone' })],
      })
    );
    expect(db.getRecord('UniversalFiles/userReview')).toMatchObject({
      payload: expect.objectContaining({
        filmReview: expect.objectContaining({
          timeline: [expect.objectContaining({ label: 'Outside Zone' })],
          reviewRevision: 1,
        }),
      }),
      writeAccessKeys: ['user:owner-1'],
    });
  });

  it('returns 409 without overwriting a concurrent Agent X breakdown patch', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        userReview: {
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          updatedByUserId: 'owner-1',
          title: 'My Film Review',
          normalizedTitle: 'my film review',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'video/mp4',
              kind: 'video',
              origin: 'files_upload',
              sizeBytes: 4096,
              url: 'https://cdn.example.com/review.mp4',
            },
            filmReview: {
              videoUrl: 'https://cdn.example.com/review.mp4',
              source: 'team_files',
              schemaVersion: 2,
              reviewRevision: 0,
              timeline: [],
            },
          },
          status: 'ready',
          sport: 'football',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });
    db.beforeNextTransaction(() => {
      db.mutateRecord('UniversalFiles/userReview', (current) => {
        const payload = current['payload'] as Record<string, unknown>;
        const filmReview = payload['filmReview'] as Record<string, unknown>;
        return {
          ...current,
          payload: {
            ...payload,
            filmReview: {
              ...filmReview,
              reviewRevision: 1,
              timeline: [
                {
                  id: 'play-1',
                  sourceId: 'source-1',
                  number: 1,
                  label: 'Inside Zone',
                  startSec: 0,
                  endSec: 8,
                  tags: { defFront: 'Odd' },
                },
              ],
            },
          },
        };
      });
    });

    const response = await request(createApp(db))
      .patch('/api/v1/agent/files/userReview/film-review')
      .send({ title: 'Stale title' });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, code: 'REVISION_CONFLICT' });
    expect(db.getRecord('UniversalFiles/userReview')).toMatchObject({
      title: 'My Film Review',
      payload: {
        filmReview: {
          reviewRevision: 1,
          timeline: [expect.objectContaining({ tags: { defFront: 'Odd' } })],
        },
      },
    });
  });

  it('returns 409 when the panel sends an explicitly stale review revision', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        userReview: {
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          updatedByUserId: 'owner-1',
          title: 'Current title',
          normalizedTitle: 'current title',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'video/mp4',
              kind: 'video',
              origin: 'files_upload',
              sizeBytes: 4096,
              url: 'https://cdn.example.com/review.mp4',
            },
            filmReview: {
              videoUrl: 'https://cdn.example.com/review.mp4',
              source: 'team_files',
              schemaVersion: 2,
              reviewRevision: 5,
            },
          },
          status: 'ready',
          sport: 'football',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });

    const response = await request(createApp(db))
      .patch('/api/v1/agent/files/userReview/film-review')
      .send({ title: 'Stale title', expectedRevision: 4 });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      code: 'REVISION_CONFLICT',
      currentRevision: 5,
    });
    expect(db.getRecord('UniversalFiles/userReview')?.['title']).toBe('Current title');
  });

  it('returns 403 when write access is revoked before the transaction commits', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        userReview: {
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          updatedByUserId: 'owner-1',
          title: 'My Film Review',
          normalizedTitle: 'my film review',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'video/mp4',
              kind: 'video',
              origin: 'files_upload',
              sizeBytes: 4096,
              url: 'https://cdn.example.com/review.mp4',
            },
            filmReview: {
              videoUrl: 'https://cdn.example.com/review.mp4',
              source: 'team_files',
              schemaVersion: 2,
              reviewRevision: 0,
            },
          },
          status: 'ready',
          sport: 'football',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });
    db.beforeNextTransaction(() => {
      db.mutateRecord('UniversalFiles/userReview', (current) => ({
        ...current,
        ownerUserId: 'other-user',
        createdByUserId: 'other-user',
        writeAccessKeys: ['user:other-user'],
      }));
    });

    const response = await request(createApp(db))
      .patch('/api/v1/agent/files/userReview/film-review')
      .send({ title: 'Unauthorized title' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, code: 'ACCESS_DENIED' });
    expect(db.getRecord('UniversalFiles/userReview')?.['title']).toBe('My Film Review');
  });

  it('returns 409 and preserves a concurrent patch when deleting the review projection', async () => {
    const db = createMockFirestore({
      UniversalFiles: {
        teamReview: {
          teamId: 'team-1',
          ownerUserId: 'owner-1',
          createdByUserId: 'owner-1',
          updatedByUserId: 'owner-1',
          title: 'Team Film Review',
          normalizedTitle: 'team film review',
          type: 'file',
          payloadKind: 'native',
          payload: {
            asset: {
              mimeType: 'video/mp4',
              kind: 'video',
              origin: 'files_upload',
              sizeBytes: 4096,
              url: 'https://cdn.example.com/review.mp4',
            },
            filmReview: {
              videoUrl: 'https://cdn.example.com/review.mp4',
              source: 'team_files',
              schemaVersion: 2,
              reviewRevision: 0,
              timeline: [],
            },
          },
          status: 'ready',
          sport: 'football',
          readAccessKeys: ['user:owner-1'],
          writeAccessKeys: ['user:owner-1'],
          createdAt: '2026-06-24T00:00:00.000Z',
          updatedAt: '2026-06-24T00:00:00.000Z',
        },
      },
    });
    db.beforeNextTransaction(() => {
      db.mutateRecord('UniversalFiles/teamReview', (current) => {
        const payload = current['payload'] as Record<string, unknown>;
        const filmReview = payload['filmReview'] as Record<string, unknown>;
        return {
          ...current,
          payload: {
            ...payload,
            filmReview: {
              ...filmReview,
              reviewRevision: 1,
              timeline: [
                {
                  id: 'play-1',
                  sourceId: 'source-1',
                  number: 1,
                  label: 'Inside Zone',
                  startSec: 0,
                  endSec: 8,
                  tags: { defFront: 'Odd' },
                },
              ],
            },
          },
        };
      });
    });

    const response = await request(createApp(db)).delete(
      '/api/v1/agent/files/teamReview/film-review?teamId=team-1'
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, code: 'REVISION_CONFLICT' });
    expect(db.getRecord('UniversalFiles/teamReview')).toMatchObject({
      payload: {
        filmReview: {
          reviewRevision: 1,
          timeline: [expect.objectContaining({ tags: { defFront: 'Odd' } })],
        },
      },
    });
  });

  describe('GET /api/v1/agent/files/:fileId', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(getSignedUrlWithTimeout).mockImplementation(async (getUrl) => getUrl());
    });

    it('refreshes storage-backed film review playback URLs across the asset and nested sources', async () => {
      const db = createMockFirestore({
        UniversalFiles: {
          refreshedReview: {
            ownerUserId: 'owner-1',
            createdByUserId: 'owner-1',
            updatedByUserId: 'owner-1',
            title: 'My Film Review',
            normalizedTitle: 'my film review',
            type: 'file',
            payloadKind: 'native',
            payload: {
              asset: {
                mimeType: 'video/mp4',
                kind: 'video',
                origin: 'files_upload',
                sizeBytes: 4096,
                url: 'https://old.example.com/master.mp4',
                storagePath: 'Users/owner-1/uploads/video/master.mp4',
              },
              filmReview: {
                uploadMode: 'batch_clips',
                videoUrl: 'https://old.example.com/master.mp4',
                source: 'team_files',
                schemaVersion: 2,
                sources: [
                  {
                    id: 'source-1',
                    order: 0,
                    title: 'Master Clip',
                    videoUrl: 'https://old.example.com/master.mp4',
                    storagePath: '/Users//owner-1/uploads/video/master.mp4/',
                  },
                  {
                    id: 'source-2',
                    order: 1,
                    title: 'Secondary Clip',
                    videoUrl: 'https://old.example.com/source-2.mp4',
                    storagePath: 'Users/owner-1/uploads/video/source-2.mp4',
                  },
                ],
              },
            },
            status: 'ready',
            sport: 'football',
            readAccessKeys: ['user:owner-1'],
            writeAccessKeys: ['user:owner-1'],
            createdAt: '2026-06-24T00:00:00.000Z',
            updatedAt: '2026-06-24T00:00:00.000Z',
          },
        },
      });
      const bucket = createSignedUrlBucket({
        'Users/owner-1/uploads/video/master.mp4': 'https://signed.example.com/master.mp4',
        'Users/owner-1/uploads/video/source-2.mp4': 'https://signed.example.com/source-2.mp4',
      });

      const response = await request(createApp(db, bucket)).get(
        '/api/v1/agent/files/refreshedReview'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.file.payload.asset.url).toBe(
        'https://signed.example.com/master.mp4'
      );
      expect(response.body.data.file.payload.filmReview.videoUrl).toBe(
        'https://signed.example.com/master.mp4'
      );
      expect(response.body.data.file.payload.filmReview.sources).toEqual([
        expect.objectContaining({
          id: 'source-1',
          videoUrl: 'https://signed.example.com/master.mp4',
        }),
        expect.objectContaining({
          id: 'source-2',
          videoUrl: 'https://signed.example.com/source-2.mp4',
        }),
      ]);
      expect(getSignedUrlWithTimeout).toHaveBeenCalledTimes(2);
    });

    it('keeps the response usable when a secondary source refresh fails', async () => {
      const db = createMockFirestore({
        UniversalFiles: {
          refreshedReview: {
            ownerUserId: 'owner-1',
            createdByUserId: 'owner-1',
            updatedByUserId: 'owner-1',
            title: 'My Film Review',
            normalizedTitle: 'my film review',
            type: 'file',
            payloadKind: 'native',
            payload: {
              asset: {
                mimeType: 'video/mp4',
                kind: 'video',
                origin: 'files_upload',
                sizeBytes: 4096,
                url: 'https://old.example.com/master.mp4',
                storagePath: 'Users/owner-1/uploads/video/master.mp4',
              },
              filmReview: {
                uploadMode: 'batch_clips',
                videoUrl: 'https://old.example.com/master.mp4',
                source: 'team_files',
                schemaVersion: 2,
                sources: [
                  {
                    id: 'source-1',
                    order: 0,
                    title: 'Master Clip',
                    videoUrl: 'https://old.example.com/master.mp4',
                    storagePath: 'Users/owner-1/uploads/video/master.mp4',
                  },
                  {
                    id: 'source-2',
                    order: 1,
                    title: 'Secondary Clip',
                    videoUrl: 'https://old.example.com/source-2.mp4',
                    storagePath: 'Users/owner-1/uploads/video/source-2.mp4',
                  },
                ],
              },
            },
            status: 'ready',
            sport: 'football',
            readAccessKeys: ['user:owner-1'],
            writeAccessKeys: ['user:owner-1'],
            createdAt: '2026-06-24T00:00:00.000Z',
            updatedAt: '2026-06-24T00:00:00.000Z',
          },
        },
      });
      const bucket = createSignedUrlBucket({
        'Users/owner-1/uploads/video/master.mp4': 'https://signed.example.com/master.mp4',
        'Users/owner-1/uploads/video/source-2.mp4': new Error('sign failed'),
      });

      const response = await request(createApp(db, bucket)).get(
        '/api/v1/agent/files/refreshedReview'
      );

      expect(response.status).toBe(200);
      expect(response.body.data.file.payload.filmReview.sources).toEqual([
        expect.objectContaining({
          id: 'source-1',
          videoUrl: 'https://signed.example.com/master.mp4',
        }),
        expect.objectContaining({
          id: 'source-2',
          videoUrl: 'https://old.example.com/source-2.mp4',
        }),
      ]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to refresh Universal File film review source URL'),
        expect.objectContaining({
          fileId: 'refreshedReview',
          sourceId: 'source-2',
          storagePath: 'Users/owner-1/uploads/video/source-2.mp4',
        })
      );
      expect(getSignedUrlWithTimeout).toHaveBeenCalledTimes(3);
    });
  });
});
