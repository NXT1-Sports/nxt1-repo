import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createErrorHandler, notFoundHandler } from '@nxt1/core/errors/express';
import { logger } from './utils/logger.js';
import authRoutes from './routes/auth.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import sitemapRoutes from './routes/sitemap.routes.js';
import feedRoutes from './routes/feed.routes.js';
import exploreRoutes from './routes/explore.routes.js';
import activityRoutes from './routes/activity.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import pulseRoutes from './routes/pulse.routes.js';
import inviteRoutes from './routes/invite.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import helpCenterRoutes from './routes/help-center.routes.js';
import editProfileRoutes from './routes/edit-profile.routes.js';
import agentXRoutes from './routes/agent-x.routes.js';
import billingRoutes from './routes/billing.routes.js';
import webhookRoutes, { webhookRawBodyMiddleware } from './routes/webhook.routes.js';
import usageRoutes from './routes/usage.routes.js';
import { initializeCacheService } from './services/cache.service.js';

type MockFirestoreSnapshot = {
  empty: boolean;
  docs: unknown[];
  size: number;
  forEach: (callback: (doc: unknown) => void) => void;
};

function createMockFirestore() {
  const snapshot: MockFirestoreSnapshot = {
    empty: true,
    docs: [],
    size: 0,
    forEach: () => undefined,
  };

  const ref = {
    collection: () => ref,
    doc: () => ref,
    where: () => ref,
    orderBy: () => ref,
    limit: () => ref,
    select: () => ref,
    offset: () => ref,
    startAfter: () => ref,
    get: async () => snapshot,
    set: async () => undefined,
    add: async () => ({ id: 'test-id' }),
    update: async () => undefined,
    delete: async () => undefined,
  };

  return {
    ...ref,
    batch: () => ({
      set: () => undefined,
      update: () => undefined,
      delete: () => undefined,
      commit: async () => undefined,
    }),
    runTransaction: async <T>(callback: (transaction: unknown) => Promise<T> | T): Promise<T> =>
      callback({
        get: async () => snapshot,
        set: async () => undefined,
        update: async () => undefined,
        delete: async () => undefined,
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
  ['/feed', feedRoutes],
  ['/explore', exploreRoutes],
  ['/activity', activityRoutes],
  ['/analytics', analyticsRoutes],
  ['/pulse', pulseRoutes],
  ['/settings', settingsRoutes],
  ['/help-center', helpCenterRoutes],
  ['/profile', editProfileRoutes],
  ['/agent-x', agentXRoutes],
  ['/billing', billingRoutes],
  ['/webhook', webhookRoutes],
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
