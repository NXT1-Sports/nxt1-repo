import 'reflect-metadata';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createErrorHandler, notFoundHandler } from '@nxt1/core/errors/express';
import { logger } from './utils/logger.js';
import authRoutes from './routes/auth/index.js';
import uploadRoutes from './routes/core/upload/index.js';
import sitemapRoutes from './routes/core/sitemap.routes.js';
import activityRoutes from './routes/feed/activity.routes.js';
import postsRoutes from './routes/feed/posts.routes.js';
import analyticsRoutes from './routes/analytics/index.js';
import inviteRoutes from './routes/core/invite.routes.js';
import settingsRoutes from './routes/core/settings.routes.js';
import helpCenterRoutes from './routes/platform/help-center.routes.js';
import releaseNotesRoutes from './routes/platform/release-notes.routes.js';
import editProfileRoutes from './routes/profile/edit-profile.routes.js';
import agentXRoutes from './routes/agent/index.js';
import billingRoutes from './routes/billing/billing.routes.js';
import {
  webhookRoutes,
  webhookRawBodyMiddleware,
  cloudflareWebhookRoutes,
  firecrawlMonitorWebhookRoutes,
} from './routes/platform/webhooks/index.js';
import usageRoutes from './routes/billing/usage.routes.js';
import { initializeCacheService } from './services/core/cache.service.js';

type MockFirestoreSnapshot = {
  exists?: boolean;
  empty: boolean;
  docs: unknown[];
  size: number;
  forEach: (callback: (doc: unknown) => void) => void;
  data?: () => Record<string, unknown>;
};

type MockFirestoreWrite = {
  path: string;
  operation: 'set' | 'update' | 'delete';
  payload?: Record<string, unknown>;
};

type MockStorageDelete = {
  path: string;
  options?: { ignoreNotFound?: boolean };
};

type MockStorageCopy = {
  fromPath: string;
  toPath: string;
};

const mockFirestoreDocuments = new Map<string, Record<string, unknown>>();
const mockFirestoreWrites: MockFirestoreWrite[] = [];
const mockStorageDeletes: MockStorageDelete[] = [];
const mockStorageCopies: MockStorageCopy[] = [];
const mockStorageObjects = new Map<string, Record<string, unknown>>();

export function __resetMockFirestore(): void {
  mockFirestoreDocuments.clear();
  mockFirestoreWrites.length = 0;
  mockStorageDeletes.length = 0;
  mockStorageCopies.length = 0;
  mockStorageObjects.clear();
}

export function __seedMockFirestoreDocument(path: string, data: Record<string, unknown>): void {
  mockFirestoreDocuments.set(path, cloneMockFirestoreValue(data) as Record<string, unknown>);
}

export function __getMockFirestoreWrites(): readonly MockFirestoreWrite[] {
  return mockFirestoreWrites;
}

export function __getMockFirestoreDocument(path: string): Record<string, unknown> | undefined {
  const data = mockFirestoreDocuments.get(path);
  return data ? (cloneMockFirestoreValue(data) as Record<string, unknown>) : undefined;
}

export function __getMockStorageDeletes(): readonly MockStorageDelete[] {
  return mockStorageDeletes;
}

export function __seedMockStorageObject(path: string, metadata: Record<string, unknown>): void {
  mockStorageObjects.set(path, cloneMockFirestoreValue(metadata) as Record<string, unknown>);
}

export function __getMockStorageCopies(): readonly MockStorageCopy[] {
  return mockStorageCopies;
}

function isDeleteTransform(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.constructor !== undefined &&
    value.constructor.name === 'DeleteTransform'
  );
}

function cloneMockFirestoreValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneMockFirestoreValue(entry));
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const candidate = value as {
    readonly constructor?: { readonly name?: string };
    readonly toMillis?: () => number;
    readonly seconds?: number;
    readonly nanoseconds?: number;
    readonly _seconds?: number;
    readonly _nanoseconds?: number;
  };

  const isTimestampLike =
    candidate.constructor?.name === 'Timestamp' ||
    (typeof candidate.toMillis === 'function' &&
      (typeof candidate.seconds === 'number' || typeof candidate._seconds === 'number'));

  if (isTimestampLike) {
    const millis =
      typeof candidate.toMillis === 'function'
        ? candidate.toMillis()
        : Math.floor(
            ((candidate.seconds ?? candidate._seconds ?? 0) as number) * 1000 +
              ((candidate.nanoseconds ?? candidate._nanoseconds ?? 0) as number) / 1_000_000
          );
    const seconds =
      typeof candidate.seconds === 'number'
        ? candidate.seconds
        : typeof candidate._seconds === 'number'
          ? candidate._seconds
          : Math.floor(millis / 1000);
    const nanoseconds =
      typeof candidate.nanoseconds === 'number'
        ? candidate.nanoseconds
        : typeof candidate._nanoseconds === 'number'
          ? candidate._nanoseconds
          : Math.floor((millis % 1000) * 1_000_000);

    return {
      seconds,
      nanoseconds,
      _seconds: seconds,
      _nanoseconds: nanoseconds,
    };
  }

  if (isDeleteTransform(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    normalized[key] = cloneMockFirestoreValue(entry);
  }
  return normalized;
}

function applyMockDocumentUpdate(path: string, payload: Record<string, unknown>): void {
  const existing = mockFirestoreDocuments.get(path) ?? {};
  const next = { ...existing };

  for (const [key, value] of Object.entries(payload)) {
    if (isDeleteTransform(value)) {
      delete next[key];
      continue;
    }

    next[key] = cloneMockFirestoreValue(value);
  }

  mockFirestoreDocuments.set(path, next);
}

type MockWhereConstraint = {
  readonly field: string;
  readonly operator: string;
  readonly value: unknown;
};

type MockOrderByConstraint = {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
};

function getMockCollectionEntries(
  path: string
): Array<{ path: string; id: string; data: Record<string, unknown> }> {
  const prefix = `${path}/`;
  return [...mockFirestoreDocuments.entries()]
    .filter(([entryPath]) => entryPath.startsWith(prefix))
    .filter(([entryPath]) => entryPath.slice(prefix.length).split('/').length === 1)
    .map(([entryPath, data]) => ({
      path: entryPath,
      id: entryPath.slice(prefix.length),
      data: cloneMockFirestoreValue(data) as Record<string, unknown>,
    }));
}

function compareMockValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  const leftValue = typeof left === 'string' ? left : JSON.stringify(left ?? null);
  const rightValue = typeof right === 'string' ? right : JSON.stringify(right ?? null);
  return leftValue.localeCompare(rightValue);
}

function createMockFirestore() {
  const createQueryRef = (
    path = '',
    whereConstraints: readonly MockWhereConstraint[] = [],
    orderByConstraint?: MockOrderByConstraint,
    limitConstraint?: number
  ) => ({
    collection: (name: string) => createQueryRef(path ? `${path}/${name}` : name),
    doc: (id: string) => createDocumentRef(path ? `${path}/${id}` : id),
    where: (field: string, operator: string, value: unknown) =>
      createQueryRef(
        path,
        [...whereConstraints, { field, operator, value }],
        orderByConstraint,
        limitConstraint
      ),
    orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') =>
      createQueryRef(path, whereConstraints, { field, direction }, limitConstraint),
    limit: (count: number) => createQueryRef(path, whereConstraints, orderByConstraint, count),
    select: () => createQueryRef(path, whereConstraints, orderByConstraint, limitConstraint),
    offset: () => createQueryRef(path, whereConstraints, orderByConstraint, limitConstraint),
    startAfter: () => createQueryRef(path, whereConstraints, orderByConstraint, limitConstraint),
    get: async () => {
      let entries = getMockCollectionEntries(path);

      for (const constraint of whereConstraints) {
        if (constraint.operator === '==') {
          entries = entries.filter((entry) => entry.data[constraint.field] === constraint.value);
        }
      }

      if (orderByConstraint) {
        entries.sort((left, right) => {
          const comparison = compareMockValues(
            left.data[orderByConstraint.field],
            right.data[orderByConstraint.field]
          );
          return orderByConstraint.direction === 'desc' ? comparison * -1 : comparison;
        });
      }

      if (typeof limitConstraint === 'number') {
        entries = entries.slice(0, limitConstraint);
      }

      const docs = entries.map((entry) => ({
        id: entry.id,
        ref: createDocumentRef(entry.path),
        exists: true,
        data: () => cloneMockFirestoreValue(entry.data) as Record<string, unknown>,
      }));

      return {
        empty: docs.length === 0,
        docs,
        size: docs.length,
        forEach: (callback: (doc: unknown) => void) => {
          docs.forEach((doc) => callback(doc));
        },
      } satisfies MockFirestoreSnapshot;
    },
    set: async () => undefined,
    add: async () => ({ id: 'test-id' }),
    update: async () => undefined,
    delete: async () => undefined,
  });

  const createDocumentRef = (path: string) => ({
    collection: (name: string) => createQueryRef(`${path}/${name}`),
    doc: (id: string) => createDocumentRef(`${path}/${id}`),
    where: () => createQueryRef(path),
    orderBy: () => createQueryRef(path),
    limit: () => createQueryRef(path),
    select: () => createQueryRef(path),
    offset: () => createQueryRef(path),
    startAfter: () => createQueryRef(path),
    get: async () => {
      const data = mockFirestoreDocuments.get(path);
      return {
        exists: data !== undefined,
        empty: data === undefined,
        docs: [],
        size: data === undefined ? 0 : 1,
        forEach: () => undefined,
        data: () => cloneMockFirestoreValue(data ?? {}) as Record<string, unknown>,
      } satisfies MockFirestoreSnapshot;
    },
    set: async (payload: Record<string, unknown>) => {
      mockFirestoreWrites.push({
        path,
        operation: 'set',
        payload: cloneMockFirestoreValue(payload) as Record<string, unknown>,
      });
      applyMockDocumentUpdate(path, payload);
    },
    add: async () => ({ id: 'test-id' }),
    update: async (payload: Record<string, unknown>) => {
      mockFirestoreWrites.push({
        path,
        operation: 'update',
        payload: cloneMockFirestoreValue(payload) as Record<string, unknown>,
      });
      applyMockDocumentUpdate(path, payload);
    },
    delete: async () => {
      mockFirestoreWrites.push({ path, operation: 'delete' });
      mockFirestoreDocuments.delete(path);
    },
  });

  const queryRef = createQueryRef();

  return {
    ...queryRef,
    batch: () => ({
      set: () => undefined,
      update: () => undefined,
      delete: () => undefined,
      commit: async () => undefined,
    }),
    runTransaction: async <T>(callback: (transaction: unknown) => Promise<T> | T): Promise<T> =>
      callback({
        get: async (ref: { get: () => Promise<MockFirestoreSnapshot> }) => ref.get(),
        set: async (
          ref: { set: (payload: Record<string, unknown>) => Promise<void> },
          payload: Record<string, unknown>
        ) => ref.set(payload),
        update: async (
          ref: { update: (payload: Record<string, unknown>) => Promise<void> },
          payload: Record<string, unknown>
        ) => ref.update(payload),
        delete: async (ref: { delete: () => Promise<void> }) => ref.delete(),
      }),
  };
}

function createMockStorage() {
  return {
    bucket: () => ({
      name: 'test-bucket',
      file: (path: string) => ({
        __path: path,
        save: async () => undefined,
        makePublic: async () => undefined,
        exists: async () => [mockStorageObjects.has(path)],
        getMetadata: async () => [
          cloneMockFirestoreValue(
            mockStorageObjects.get(path) ?? {
              contentType: 'application/octet-stream',
              size: '0',
            }
          ) as Record<string, unknown>,
        ],
        getSignedUrl: async (options?: { responseDisposition?: string; responseType?: string }) => {
          const signedUrl = new URL(`https://example.com/storage/${encodeURIComponent(path)}`);
          if (options?.responseDisposition) {
            signedUrl.searchParams.set('response-content-disposition', options.responseDisposition);
          }
          if (options?.responseType) {
            signedUrl.searchParams.set('response-content-type', options.responseType);
          }
          return [signedUrl.toString()];
        },
        copy: async (destination: unknown) => {
          const destinationPath =
            typeof destination === 'object' &&
            destination !== null &&
            '__path' in destination &&
            typeof (destination as { __path?: unknown }).__path === 'string'
              ? ((destination as { __path: string }).__path as string)
              : String(destination);
          mockStorageCopies.push({ fromPath: path, toPath: destinationPath });
          const sourceMetadata = mockStorageObjects.get(path) ?? {
            contentType: 'application/octet-stream',
            size: '0',
          };
          mockStorageObjects.set(
            destinationPath,
            cloneMockFirestoreValue(sourceMetadata) as Record<string, unknown>
          );
        },
        delete: async (options?: { ignoreNotFound?: boolean }) => {
          mockStorageDeletes.push({ path, options });
          mockStorageObjects.delete(path);
        },
      }),
    }),
  };
}

function decodeMockAuthToken(idToken: string): {
  uid: string;
  email: string;
  email_verified: boolean;
  admin: boolean;
} {
  const prefix = 'test-auth:';
  if (!idToken.startsWith(prefix)) {
    return {
      uid: 'test-user',
      email: 'test@example.com',
      email_verified: true,
      admin: true,
    };
  }

  try {
    const payload = JSON.parse(Buffer.from(idToken.slice(prefix.length), 'base64url').toString());
    return {
      uid: typeof payload.uid === 'string' ? payload.uid : 'test-user',
      email: typeof payload.email === 'string' ? payload.email : 'test@example.com',
      email_verified: typeof payload.email_verified === 'boolean' ? payload.email_verified : true,
      admin: typeof payload.admin === 'boolean' ? payload.admin : true,
    };
  } catch {
    return {
      uid: 'test-user',
      email: 'test@example.com',
      email_verified: true,
      admin: true,
    };
  }
}

const app: ReturnType<typeof express> = express();

await initializeCacheService();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(webhookRawBodyMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, _res, next) => {
  const isStaging = req.originalUrl.includes('/staging/') || req.originalUrl.includes('/staging');
  req.isStaging = isStaging;
  req.firebase = {
    db: createMockFirestore() as never,
    auth: {
      verifyIdToken: async (idToken: string) => decodeMockAuthToken(idToken),
    } as never,
    storage: createMockStorage() as never,
  };
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'Test OK', timestamp: new Date().toISOString() });
});

app.get('/staging/health', (_req, res) => {
  res.json({ status: 'Test Staging OK', timestamp: new Date().toISOString() });
});

app.use('/', sitemapRoutes);

const routeConfigs = [
  ['/auth', authRoutes],
  ['/upload', uploadRoutes],
  ['/invite', inviteRoutes],
  ['/activity', activityRoutes],
  ['/feed/posts', postsRoutes],
  ['/analytics', analyticsRoutes],
  ['/settings', settingsRoutes],
  ['/help-center', helpCenterRoutes],
  ['/profile', editProfileRoutes],
  ['/agent-x', agentXRoutes],
  ['/billing', billingRoutes],
  ['/webhook', webhookRoutes],
  ['/cloudflare-webhook', cloudflareWebhookRoutes],
  ['/firecrawl-monitor-webhook', firecrawlMonitorWebhookRoutes],
  ['/usage', usageRoutes],
  ['/system/release-notes', releaseNotesRoutes],
] as const;

for (const [path, handler] of routeConfigs) {
  app.use(`/api/v1${path}`, handler);
  app.use(`/api/v1/staging${path}`, handler);
}

app.use(notFoundHandler);
app.use(
  createErrorHandler({
    includeStackTrace: true,
    logErrors: true,
  })
);

logger.info('Test app initialized');

export default app;
