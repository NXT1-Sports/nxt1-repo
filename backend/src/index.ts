/**
 * @fileoverview Backend Entry Point
 * @module @nxt1/backend
 *
 * Express server using shared @nxt1/core types and unified error handling.
 */

// Import reflect-metadata first - required for class-validator/class-transformer decorators
import 'reflect-metadata';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Import unified error handling from @nxt1/core
import { requestTracker, notFoundHandler, createErrorHandler } from '@nxt1/core/errors/express';

// Import logger
import { logger } from './utils/logger.js';

// Import database configuration
import { connectToMongoDB, disconnectFromMongoDB } from './config/database.config.js';
import mongoose from 'mongoose';

// Import cache service
import { initializeCacheService } from './services/core/cache.service.js';

// Middleware
import { firebaseContext } from './middleware/firebase/firebase-context.middleware.js';
import { mongoScopeMiddleware } from './middleware/mongo/mongo-scope.middleware.js';
import {
  performanceMiddleware,
  testPerformance,
} from './middleware/performance/performance.middleware.js';
import { getRedisRateLimiter } from './middleware/rate-limit/redis-rate-limit.middleware.js';
import {
  cacheStatusMiddleware,
  createCacheMiddleware,
} from './middleware/cache/cache-status.middleware.js';

// Routes
import authRoutes from './routes/auth/index.js';
import uploadRoutes from './routes/core/upload/index.js';
import sitemapRoutes from './routes/core/sitemap.routes.js';
import activityRoutes from './routes/feed/activity.routes.js';
import postsRoutes from './routes/feed/posts.routes.js';
import analyticsRoutes from './routes/analytics/index.js';
import pulseRoutes from './routes/feed/pulse.routes.js';
import inviteRoutes from './routes/core/invite.routes.js';
import settingsRoutes from './routes/core/settings.routes.js';
import helpCenterRoutes from './routes/platform/help-center.routes.js';
import editProfileRoutes from './routes/profile/edit-profile.routes.js';
import agentXRoutes from './routes/agent/index.js';
import messagesRoutes from './routes/communications/messages.routes.js';
import { queueService } from './routes/agent/shared.js';

import { bootstrapAgentQueue } from './modules/agent/queue/bootstrap.js';
import { ensureTopicExists } from './modules/billing/index.js';
// Detail routes for explore
// Programs (Organization search)
import programsRoutes from './routes/team/programs.routes.js';
// Billing routes
import billingRoutes from './routes/billing/billing.routes.js';
import {
  webhookRoutes,
  webhookRawBodyMiddleware,
  sentryWebhookRoutes,
  heliconeRoutes,
  cloudflareWebhookRoutes,
} from './routes/platform/webhooks/index.js';
import usageRoutes from './routes/billing/usage.routes.js';
import iapRoutes from './routes/billing/iap.routes.js';
import teamsRoutes from './routes/team/teams.routes.js';
import engagementRoutes from './routes/feed/engagement.routes.js';
import logsRoutes from './routes/platform/logs.routes.js';
import marketingRoutes from './routes/marketing/index.js';
// Staging-only dev utilities

const app: ReturnType<typeof express> = express();
const PORT = process.env['PORT'] || 3000;
const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_HEALTH_CACHE_TTL_MS = 30_000;

type OpenRouterHealthSnapshot = {
  configured: boolean;
  reachable: boolean;
  statusCode: number | null;
  checkedAt: string;
};

let openRouterHealthCache: {
  checkedAtMs: number;
  snapshot: OpenRouterHealthSnapshot;
} | null = null;

async function checkOpenRouterHealth(): Promise<OpenRouterHealthSnapshot> {
  const now = Date.now();
  if (
    openRouterHealthCache &&
    now - openRouterHealthCache.checkedAtMs < OPENROUTER_HEALTH_CACHE_TTL_MS
  ) {
    return openRouterHealthCache.snapshot;
  }

  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    const snapshot: OpenRouterHealthSnapshot = {
      configured: false,
      reachable: false,
      statusCode: null,
      checkedAt: new Date().toISOString(),
    };
    openRouterHealthCache = { checkedAtMs: now, snapshot };
    return snapshot;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    // A response below 500 means OpenRouter is reachable from this process,
    // even if auth/policy on the key itself is restricted.
    const snapshot: OpenRouterHealthSnapshot = {
      configured: true,
      reachable: response.status < 500,
      statusCode: response.status,
      checkedAt: new Date().toISOString(),
    };

    openRouterHealthCache = { checkedAtMs: now, snapshot };
    return snapshot;
  } catch {
    const snapshot: OpenRouterHealthSnapshot = {
      configured: true,
      reachable: false,
      statusCode: null,
      checkedAt: new Date().toISOString(),
    };

    openRouterHealthCache = { checkedAtMs: now, snapshot };
    return snapshot;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// Application Setup Function (Async)
// ============================================================================

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Managed by frontend/CDN
    crossOriginEmbedderPolicy: false, // Allow cross-origin resources
  })
);

// Private network origin check (RFC 1918) — used for LAN dev/device testing
const isPrivateNetworkOrigin = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname) ||
      /^192\.168\.\d+\.\d+$/.test(hostname)
    );
  } catch {
    return false;
  }
};

// Merge CORS_ORIGINS and STAGING_ALLOWED_FRONTEND_ORIGINS env vars with the hardcoded list.
// This ensures env-var overrides (e.g. set in Firebase console) don't silently drop staging URLs.
const _envCorsOrigins = [
  ...(process.env['CORS_ORIGINS'] ? process.env['CORS_ORIGINS'].split(',') : []),
  ...(process.env['STAGING_ALLOWED_FRONTEND_ORIGINS']
    ? process.env['STAGING_ALLOWED_FRONTEND_ORIGINS'].split(',')
    : []),
]
  .map((o) => o.trim())
  .filter(Boolean);

// These origins are ALWAYS allowed regardless of env var overrides.
// Capacitor/Ionic native origins must never be dropped by env var changes.
const STATIC_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:4300',
  'http://127.0.0.1:4300',
  'http://localhost:8100',
  'http://127.0.0.1:8100',
  // Capacitor native apps — iOS uses capacitor://, Android uses https://localhost
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'https://nxt1.com',
  'https://www.nxt1.com',
  'https://nxt1sports.com',
  'https://www.nxt1sports.com',
  // Firebase App Hosting (staging)
  'https://nxt1-repo--nxt-1-v2.us-east4.hosted.app',
  'https://nxt1-repo--nxt-1-staging-v2.us-central1.hosted.app',
  'https://nxt1-repo--nxt-1-staging-v2.us-east4.hosted.app',
  'https://nxt1-repo-backend--nxt-1-v2.us-east4.hosted.app',
  'https://nxt1-repo-backend--nxt-1-staging-v2.us-east4.hosted.app',
  // Firebase Hosting (staging) — both .web.app and .firebaseapp.com domains
  'https://nxt-1-staging-v2.web.app',
  'https://nxt-1-staging-v2.firebaseapp.com',
  'https://nxt-1-v2.web.app',
  'https://nxt-1-v2.firebaseapp.com',
  // Production server (direct IP access — staging/dev only)
  'http://34.72.3.113:8080',
  'https://api.nxt1sports.com',
];

// Merge env-var origins with the static list (env vars ADD to the list, not replace it).
// This prevents env overrides from accidentally dropping native Capacitor/Ionic origins.
const ALLOWED_ORIGINS = [...new Set([...STATIC_ALLOWED_ORIGINS, ..._envCorsOrigins])];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. native mobile, curl, server-to-server)
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      // Allow LAN IPs in non-production (Ionic live-reload on physical devices)
      if (process.env['NODE_ENV'] !== 'production' && isPrivateNetworkOrigin(origin)) {
        return callback(null, true);
      }

      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  })
);

// Capture raw body for Stripe webhook signature verification (MUST be before body parsers)
app.use(webhookRawBodyMiddleware);

// Body parsing — Express 5 built-in (no body-parser needed)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout
app.use((_req, res, next) => {
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        error: { code: 'REQUEST_TIMEOUT', message: 'Request timed out' },
      });
    }
  });
  next();
});

// Early health endpoint — registered before setupApplication() so Cloud Run's
// startup probe gets a 200 immediately while MongoDB/Redis are still connecting.
// Once setupApplication() runs, its /health handler (registered later in the stack)
// will NOT override this one; Express uses first-match wins for app.get().
// This early handler returns "starting" until the full handler is wired up.
let _appReady = false;
app.get('/health', (_req, res, next) => {
  if (_appReady) return next(); // defer to the full handler registered by setupApplication()
  res.status(200).json({ status: 'starting', timestamp: new Date().toISOString() });
});

async function setupApplication() {
  // ============================================================================
  // Global Middleware
  // ============================================================================
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Add request tracking (trace IDs, timing)
  app.use(requestTracker);

  // Attach Firebase context to all requests
  app.use(firebaseContext);

  // Attach request-scoped Mongo environment context (staging vs production)
  app.use(mongoScopeMiddleware);

  // Performance monitoring for all requests
  app.use(performanceMiddleware);

  // Cache status tracking for all requests
  app.use(createCacheMiddleware('redis'));
  app.use(cacheStatusMiddleware);

  // Rate limiting is applied per-route via setupRoutes() to avoid double-counting
  // See routeConfigs array below for granular rate limit configuration

  // ============================================================================
  // Health Checks
  // ============================================================================
  app.get('/health', (_req, res) => {
    const mongoState = mongoose.connection.readyState;
    const mongoStatus =
      mongoState === 1 ? 'connected' : mongoState === 2 ? 'connecting' : 'disconnected';
    const healthy = mongoState === 1;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'Production OK' : 'Production DEGRADED',
      timestamp: new Date().toISOString(),
      mongo: mongoStatus,
    });
  });

  app.get('/staging/health', (_req, res) => {
    const mongoState = mongoose.connection.readyState;
    const mongoStatus =
      mongoState === 1 ? 'connected' : mongoState === 2 ? 'connecting' : 'disconnected';
    const healthy = mongoState === 1;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'Staging OK' : 'Staging DEGRADED',
      timestamp: new Date().toISOString(),
      mongo: mongoStatus,
    });
  });

  app.get('/health/agent', async (_req, res) => {
    const queueInitialized = queueService !== null;
    const [openrouter, queueHealthy, queueCounts, queuePaused] = await Promise.all([
      checkOpenRouterHealth(),
      queueService ? queueService.isHealthy().catch(() => false) : Promise.resolve(false),
      queueService ? queueService.getCounts().catch(() => null) : Promise.resolve(null),
      queueService ? queueService.isPaused().catch(() => null) : Promise.resolve(null),
    ]);

    const healthy = queueInitialized && queueHealthy && openrouter.reachable;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'Agent OK' : 'Agent DEGRADED',
      timestamp: new Date().toISOString(),
      queue: {
        initialized: queueInitialized,
        healthy: queueHealthy,
        paused: queuePaused,
        counts: queueCounts,
      },
      openrouter,
    });
  });

  // ============================================================================
  // Global Performance Debug Endpoint (with rate limiting)
  // ============================================================================
  app.get('/api/v1/debug/performance', await getRedisRateLimiter('api'), async (_req, res) => {
    try {
      const result = await testPerformance();
      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get performance stats';
      res.status(500).json({
        success: false,
        error: {
          message: errorMessage,
        },
      });
    }
  });

  // ============================================================================
  // Rate Limiting Audit Endpoint (with rate limiting)
  // ============================================================================
  app.get('/api/v1/debug/rate-limits', await getRedisRateLimiter('api'), async (_req, res) => {
    try {
      const { generateAuditReport, getCoverageStats, validateCoverage } =
        await import('./utils/rate-limiting-audit.js');

      const stats = getCoverageStats();
      const validation = validateCoverage();
      const report = generateAuditReport();

      res.json({
        success: true,
        data: {
          stats,
          validation,
          report: report.split('\n'), // Return as array for easier frontend consumption
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get rate limiting audit';
      res.status(500).json({
        success: false,
        error: {
          message: errorMessage,
        },
      });
    }
  });

  // ============================================================================
  // Public Routes (with lenient rate limiting for SEO crawlers)
  // ============================================================================
  app.use('/', await getRedisRateLimiter('lenient'), sitemapRoutes);

  /**
   * Rate limiting types for different endpoint categories
   */
  type RateLimitType = 'auth' | 'upload' | 'email' | 'api' | 'search' | 'billing' | 'lenient';

  /**
   * Route configuration interface
   */
  interface RouteConfig {
    path: string;
    rateLimitType?: RateLimitType;
    handler: ReturnType<typeof express.Router>;
  }

  /**
   * Route configuration for both production and staging
   */
  const routeConfigs: Array<RouteConfig> = [
    // Auth routes — use 'api' rate limit since Firebase handles actual authentication.
    // The /auth/* endpoints are profile management, onboarding, and session tracking,
    // not password-based login. 'auth' (5 req/15min) was causing 429s on profile fetch.
    { path: '/auth', rateLimitType: 'api', handler: authRoutes },
    { path: '/upload', rateLimitType: 'upload', handler: uploadRoutes },
    // Invite links/QR flows need to stay frictionless for coaches and team admins.
    { path: '/invite', handler: inviteRoutes },
    // Content routes with standard API rate limiting
    { path: '/activity', rateLimitType: 'api', handler: activityRoutes },
    { path: '/feed/posts', rateLimitType: 'api', handler: postsRoutes },
    { path: '/analytics', rateLimitType: 'api', handler: analyticsRoutes },
    { path: '/pulse', rateLimitType: 'api', handler: pulseRoutes },
    { path: '/settings', rateLimitType: 'api', handler: settingsRoutes },
    { path: '/help-center', rateLimitType: 'api', handler: helpCenterRoutes },
    { path: '/marketing', rateLimitType: 'api', handler: marketingRoutes },
    { path: '/profile', rateLimitType: 'api', handler: editProfileRoutes },
    { path: '/agent-x', rateLimitType: 'api', handler: agentXRoutes },
    // Messages routes
    { path: '/messages', rateLimitType: 'api', handler: messagesRoutes },
    // Search/Discovery routes with search-specific rate limiting
    { path: '/programs', rateLimitType: 'search', handler: programsRoutes },
    // Billing routes with strict rate limiting
    { path: '/billing', rateLimitType: 'billing', handler: billingRoutes },
    { path: '/webhook', rateLimitType: 'billing', handler: webhookRoutes },
    // Sentry webhook for Slack pipeline
    { path: '/sentry-webhook', rateLimitType: 'api', handler: sentryWebhookRoutes },
    // Helicone cost reconciliation webhook
    { path: '/helicone', rateLimitType: 'billing', handler: heliconeRoutes },
    // Usage dashboard routes
    { path: '/usage', rateLimitType: 'api', handler: usageRoutes },
    // Apple IAP verification runs after StoreKit has already completed the charge.
    // Keep abuse protection, but do not subject wallet credit confirmation to the
    // same strict billing limiter used for checkout/session creation flows.
    { path: '/iap', rateLimitType: 'lenient', handler: iapRoutes },
    // Cloudflare Stream video processing webhooks
    { path: '/cloudflare-webhook', rateLimitType: 'api', handler: cloudflareWebhookRoutes },
    // Team profile routes
    { path: '/teams', rateLimitType: 'api', handler: teamsRoutes },
    // Universal feed item engagement (share + view impression tracking — all types)
    { path: '/engagement', rateLimitType: 'api', handler: engagementRoutes },
    // Client-side log ingestion (no auth required — rate-limited at API tier)
    { path: '/logs', rateLimitType: 'api', handler: logsRoutes },
    // SSR routes with lighter limits (for SEO crawlers)
  ];

  /**
   * Setup routes for production and staging environments
   */
  async function setupRoutes(prefix: string, configs: Array<RouteConfig>): Promise<void> {
    for (const { path, rateLimitType, handler } of configs) {
      if (rateLimitType) {
        const rateLimiter = await getRedisRateLimiter(rateLimitType);
        app.use(`${prefix}${path}`, rateLimiter, handler);
      } else {
        app.use(`${prefix}${path}`, handler);
      }
    }
  }

  // Setup production routes: /api/v1/*
  await setupRoutes('/api/v1', routeConfigs);

  // Setup staging routes: /api/v1/staging/*
  await setupRoutes('/api/v1/staging', routeConfigs);

  // Log all protected endpoints
  logger.info('🛡️ Rate Limiting Coverage:');
  logger.info(`   Health checks: SKIPPED (automatic)`);
  logger.info(`   Sitemap (SEO): lenient (300/1min)`);
  logger.info(`   Debug endpoint: api (150/1min)`);
  logger.info(`   Invite routes: UNTHROTTLED (QR/link-first flow)`);
  logger.info(`   Production routes (${routeConfigs.length}): /api/v1/*`);
  logger.info(`   Staging routes (${routeConfigs.length}): /api/v1/staging/*`);
  logger.info(`   Total protected endpoints: ${routeConfigs.length * 2 + 2}`); // production + staging + debug + sitemap

  // ============================================================================
  // Error Handling (must be last)
  // ============================================================================

  // 404 handler for unmatched routes
  app.use(notFoundHandler);

  // Unified error handler with logging
  app.use(
    createErrorHandler({
      includeStackTrace: process.env['NODE_ENV'] !== 'production',
      logErrors: true,
    })
  );

  logger.info('✅ Application routes and middleware configured with Redis-based rate limiting');
}

// ============================================================================
// Initialize Services and Application
// ============================================================================
async function initializeServices() {
  try {
    // 1. Initialize cache service (Redis + Memory fallback)
    await initializeCacheService();
    logger.info('✅ Cache service initialized');

    // 2. Connect to MongoDB
    await connectToMongoDB();
    logger.info('✅ MongoDB connected');

    // 3. Setup application routes and middleware (requires Redis for rate limiting)
    await setupApplication();
    _appReady = true; // Allow the full /health handler (registered in setupApplication()) to take over

    // 4. Ensure Pub/Sub topic exists for usage-based billing
    await ensureTopicExists().catch((err) => {
      logger.warn('⚠️ Pub/Sub topic setup failed (non-critical):', { error: err });
    });

    // 5. Start Agent X Background Queue and Workers
    // 5. Start Agent X Background Queue and Workers
    logger.info('Starting Agent Engine...');
    shutdownAgentFn = await bootstrapAgentQueue();
    logger.info('✅ Agent Engine started and listening to queue');

    logger.info('✅ All services initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize services:', { error });
    // MongoDB and Redis errors are critical
    throw error;
  }
}

// ============================================================================
// Start Server
// ============================================================================
let server: ReturnType<typeof app.listen> | null = null;
let shutdownAgentFn: (() => Promise<void>) | null = null;

// Cloud Run requires the port to be open before the startup probe fires.
// Start listening immediately; services (MongoDB, Redis, Agent) initialize
// in the background. The /health endpoint returns 503 until MongoDB connects.
server = app.listen(PORT, () => {
  const env = process.env['NODE_ENV'] || 'development';
  logger.info(`Backend server listening on port ${PORT} — services initializing...`);
  logger.info('========================================');
  logger.info(`ENV:              ${env}`);
  logger.info('========================================');
  logger.info(`API Endpoints:`);
  logger.info(`   Production: /api/v1/*`);
  logger.info(`   Staging:    /api/v1/staging/*`);
});

initializeServices()
  .then(() => {
    logger.info('✅ All services initialized — server fully ready');
  })
  .catch((error) => {
    logger.error('❌ Fatal: service initialization failed — triggering restart', { error });
    process.exit(1);
  });
// ============================================================================
// Graceful Shutdown
// ============================================================================
function gracefulShutdown(signal: string): void {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        if (shutdownAgentFn) {
          logger.info('Shutting down Agent Engine...');
          await shutdownAgentFn();
          logger.info('Agent Engine shut down');
        }
      } catch (err) {
        logger.error('Error shutting down Agent Engine:', { error: err });
      }

      try {
        await disconnectFromMongoDB();
        logger.info('MongoDB disconnected');
      } catch (err) {
        logger.error('Error disconnecting MongoDB:', { error: err });
      }

      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long (15s)
    setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 15_000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
