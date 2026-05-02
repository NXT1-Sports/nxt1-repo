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
import analyticsRoutes from './routes/analytics/index.js';
import pulseRoutes from './routes/feed/pulse.routes.js';
import inviteRoutes from './routes/core/invite.routes.js';
import settingsRoutes from './routes/core/settings.routes.js';
import helpCenterRoutes from './routes/platform/help-center.routes.js';
import editProfileRoutes from './routes/profile/edit-profile.routes.js';
import agentXRoutes from './routes/agent/index.js';
import billingRoutes from './routes/billing/billing.routes.js';
import {
  webhookRoutes,
  webhookRawBodyMiddleware,
  cloudflareWebhookRoutes,
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

const mockFirestoreDocuments = new Map<string, Record<string, unknown>>();
const mockFirestoreWrites: MockFirestoreWrite[] = [];

export function __resetMockFirestore(): void {
  mockFirestoreDocuments.clear();
  mockFirestoreWrites.length = 0;
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

function createMockFirestore() {
  const querySnapshot: MockFirestoreSnapshot = {
    empty: true,
    docs: [],
    size: 0,
    forEach: () => undefined,
  };

  const createQueryRef = (path = '') => ({
    collection: (name: string) => createQueryRef(path ? `${path}/${name}` : name),
    doc: (id: string) => createDocumentRef(path ? `${path}/${id}` : id),
    where: () => createQueryRef(path),
    orderBy: () => createQueryRef(path),
    limit: () => createQueryRef(path),
    select: () => createQueryRef(path),
    offset: () => createQueryRef(path),
    startAfter: () => createQueryRef(path),
    get: async () => querySnapshot,
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
      file: () => ({
        save: async () => undefined,
        makePublic: async () => undefined,
        exists: async () => [false],
        getSignedUrl: async () => ['https://example.com/test-file'],
      }),
    }),
  };
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
      verifyIdToken: async () => ({
        uid: 'test-user',
        email: 'test@example.com',
        email_verified: true,
        admin: true,
      }),
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
  ['/analytics', analyticsRoutes],
  ['/pulse', pulseRoutes],
  ['/settings', settingsRoutes],
  ['/help-center', helpCenterRoutes],
  ['/profile', editProfileRoutes],
  ['/agent-x', agentXRoutes],
  ['/billing', billingRoutes],
  ['/webhook', webhookRoutes],
  ['/cloudflare-webhook', cloudflareWebhookRoutes],
  ['/usage', usageRoutes],
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
