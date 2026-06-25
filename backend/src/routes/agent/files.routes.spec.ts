import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  getSignedUrlWithTimeout: vi.fn(),
}));

vi.mock('../../modules/agent/tools/media/agent-media-lifecycle.service.js', () => ({
  AgentMediaLifecycleService: {
    extractStoragePathFromUrl: vi.fn().mockReturnValue(null),
    requiresDurablePromotion: vi.fn().mockReturnValue(false),
    promoteOwnedObjectToDurableUploadPath: vi.fn(),
    buildStoragePath: vi.fn(),
    saveBufferAndSignRead: vi.fn(),
  },
}));

vi.mock('../../services/team/universal-file-semantic.service.js', () => ({
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

type SeedRecord = Record<string, unknown>;

function cloneRecord(record: SeedRecord): SeedRecord {
  return JSON.parse(JSON.stringify(record)) as SeedRecord;
}

function createMockFirestore(seed: Record<string, Record<string, SeedRecord>>) {
  const store = new Map<string, SeedRecord>();

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
  });

  const createCollectionRef = (collectionName: string) => ({
    doc(docId: string) {
      return createDocRef(`${collectionName}/${docId}`);
    },
    where(field: string, _operator: '==', value: unknown) {
      return {
        async get() {
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
        },
      };
    },
  });

  return {
    collection(collectionName: string) {
      return createCollectionRef(collectionName);
    },
    getRecord(path: string) {
      const record = store.get(path);
      return record ? cloneRecord(record) : undefined;
    },
  };
}

function createApp(db: ReturnType<typeof createMockFirestore>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user?: Record<string, unknown> }).user = {
      uid: 'owner-1',
      displayName: 'Owner One',
      photoURL: 'https://example.com/owner.png',
    };
    req.firebase = {
      db: db as never,
      auth: {} as never,
      storage: {} as never,
    };
    next();
  });
  app.use('/api/v1/agent', filesRoutes);
  return app;
}

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

    expect(response.status).toBe(200);
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
