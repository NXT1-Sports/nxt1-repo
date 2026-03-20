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
import {
  connectToMongoDB,
  disconnectFromMongoDB,
  isMongoDBConnected,
} from './config/database.config.js';

// Import cache service
import { initializeCacheService, getCacheService } from './services/cache.service.js';

// Middleware
import { firebaseContext } from './middleware/firebase-context.middleware.js';
import { performanceMiddleware, testPerformance } from './middleware/performance.middleware.js';
import { getRedisRateLimiter } from './middleware/redis-rate-limit.middleware.js';
import {
  cacheStatusMiddleware,
  createCacheMiddleware,
} from './middleware/cache-status.middleware.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import sitemapRoutes from './routes/sitemap.routes.js';
import feedRoutes from './routes/feed.routes.js';
import exploreRoutes from './routes/explore.routes.js';
import activityRoutes from './routes/activity.routes.js';
import postsRoutes from './routes/posts.routes.js';
import scoutReportsRoutes from './routes/scout-reports.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import newsRoutes from './routes/news.routes.js';
import inviteRoutes from './routes/invite.routes.js';
import missionsRoutes from './routes/missions.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import helpCenterRoutes from './routes/help-center.routes.js';
import editProfileRoutes from './routes/edit-profile.routes.js';
import usersRoutes from './routes/users.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import agentXRoutes from './routes/agent-x.routes.js';
import followRoutes from './routes/follow.routes.js';
import messagesRoutes from './routes/messages.routes.js';

import { bootstrapAgentQueue } from './modules/agent/queue/bootstrap.js';
import { ensureTopicExists } from './modules/billing/index.js';
import ssrRoutes from './routes/ssr.routes.js';
// Detail routes for explore
import collegesRoutes from './routes/colleges.routes.js';
import athletesRoutes from './routes/athletes.routes.js';
import teamsRoutes from './routes/teams.routes.js';
import videosRoutes from './routes/videos.routes.js';
import leaderboardsRoutes from './routes/leaderboards.routes.js';
import campsRoutes from './routes/camps.routes.js';
import eventsRoutes from './routes/events.routes.js';
// Programs (Organization search)
import programsRoutes from './routes/programs.routes.js';
// Billing routes
import billingRoutes from './routes/billing.routes.js';
import webhookRoutes, { webhookRawBodyMiddleware } from './routes/webhook.routes.js';
import usageRoutes from './routes/usage.routes.js';
// Staging-only dev utilities
import seedRoutes from './routes/seed.routes.js';

const app: ReturnType<typeof express> = express();
const PORT = process.env['PORT'] || 3000;
const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

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

app.use(
  cors({
    origin: process.env['CORS_ORIGINS']
      ? process.env['CORS_ORIGINS'].split(',')
      : [
          'http://localhost:4200',
          'http://127.0.0.1:4200',
          'http://localhost:4300',
          'http://127.0.0.1:4300',
          'http://localhost:8100',
          'http://127.0.0.1:8100',
          // Capacitor native apps (iOS & Android)
          'capacitor://localhost',
          'ionic://localhost',
          'https://nxt1.com',
          'https://www.nxt1.com',
          'https://nxt1sports.com',
          'https://www.nxt1sports.com',
        ],
    credentials: true,
  })
);

// Capture raw body for Stripe webhook signature verification (MUST be before body parsers)
app.use(webhookRawBodyMiddleware);

// Body parsing — Express 5 built-in (no body-parser needed).
// 50 mb covers large media-upload metadata payloads; enforced once here,
// NOT again inside setupApplication to avoid double-parsing.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
async function setupApplication() {
  // ============================================================================
  // Global Middleware
  // ============================================================================
  // Body parsing is registered once at the top of the file (before setupApplication)
  // so that it is available to the webhook raw-body middleware and all subsequent
  // middleware without double-parsing. Do NOT re-register it here.

  // Add request tracking (trace IDs, timing)
  app.use(requestTracker);

  // Attach Firebase context to all requests
  app.use(firebaseContext);

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

  /**
   * Deep health check — verifies all critical dependencies are reachable.
   * Used by Cloud Run / load balancers to determine instance readiness.
   * Returns HTTP 200 when healthy, HTTP 503 when degraded.
   */
  async function deepHealthCheck(label: string): Promise<{ status: number; body: object }> {
    const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

    // MongoDB
    const mongoStart = Date.now();
    try {
      const mongoOk = isMongoDBConnected();
      checks['mongodb'] = { ok: mongoOk, latencyMs: Date.now() - mongoStart };
    } catch (err) {
      checks['mongodb'] = {
        ok: false,
        latencyMs: Date.now() - mongoStart,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Cache (Redis or memory fallback)
    const cacheStart = Date.now();
    try {
      const cache = getCacheService();
      const testKey = `health:ping:${Date.now()}`;
      await cache.set(testKey, '1', { ttl: 5 });
      const val = await cache.get(testKey);
      checks['cache'] = { ok: val === '1', latencyMs: Date.now() - cacheStart };
    } catch (err) {
      checks['cache'] = {
        ok: false,
        latencyMs: Date.now() - cacheStart,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const allHealthy = Object.values(checks).every((c) => c.ok);
    const httpStatus = allHealthy ? 200 : 503;

    return {
      status: httpStatus,
      body: {
        status: allHealthy ? `${label} OK` : `${label} DEGRADED`,
        timestamp: new Date().toISOString(),
        checks,
      },
    };
  }

  app.get('/health', async (_req, res) => {
    const { status, body } = await deepHealthCheck('Production');
    res.status(status).json(body);
  });

  app.get('/staging/health', async (_req, res) => {
    const { status, body } = await deepHealthCheck('Staging');
    res.status(status).json(body);
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
    rateLimitType: RateLimitType;
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
    { path: '/invite', rateLimitType: 'email', handler: inviteRoutes },
    // Content routes with standard API rate limiting
    { path: '/feed', rateLimitType: 'api', handler: feedRoutes },
    { path: '/explore', rateLimitType: 'api', handler: exploreRoutes },
    { path: '/activity', rateLimitType: 'api', handler: activityRoutes },
    { path: '/posts', rateLimitType: 'api', handler: postsRoutes },
    { path: '/scout-reports', rateLimitType: 'api', handler: scoutReportsRoutes },
    { path: '/analytics', rateLimitType: 'api', handler: analyticsRoutes },
    { path: '/news', rateLimitType: 'api', handler: newsRoutes },
    { path: '/missions', rateLimitType: 'api', handler: missionsRoutes },
    { path: '/settings', rateLimitType: 'api', handler: settingsRoutes },
    { path: '/help-center', rateLimitType: 'api', handler: helpCenterRoutes },
    { path: '/profile', rateLimitType: 'api', handler: editProfileRoutes },
    { path: '/agent-x', rateLimitType: 'api', handler: agentXRoutes },
    { path: '/users', rateLimitType: 'api', handler: usersRoutes },
    { path: '/locations', rateLimitType: 'api', handler: locationsRoutes },
    { path: '/follow', rateLimitType: 'api', handler: followRoutes },
    // Messages routes
    { path: '/messages', rateLimitType: 'api', handler: messagesRoutes },
    // Search/Discovery routes with search-specific rate limiting
    { path: '/colleges', rateLimitType: 'search', handler: collegesRoutes },
    { path: '/athletes', rateLimitType: 'search', handler: athletesRoutes },
    { path: '/teams', rateLimitType: 'api', handler: teamsRoutes },
    { path: '/programs', rateLimitType: 'search', handler: programsRoutes },
    { path: '/videos', rateLimitType: 'upload', handler: videosRoutes },
    { path: '/leaderboards', rateLimitType: 'search', handler: leaderboardsRoutes },
    { path: '/camps', rateLimitType: 'api', handler: campsRoutes },
    { path: '/events', rateLimitType: 'api', handler: eventsRoutes },
    // Billing routes with strict rate limiting
    { path: '/billing', rateLimitType: 'billing', handler: billingRoutes },
    { path: '/webhook', rateLimitType: 'billing', handler: webhookRoutes },
    // Usage dashboard routes
    { path: '/usage', rateLimitType: 'api', handler: usageRoutes },
    // SSR routes with lighter limits (for SEO crawlers)
    { path: '/ssr', rateLimitType: 'api', handler: ssrRoutes },
  ];

  /**
   * Setup routes for production and staging environments
   */
  async function setupRoutes(prefix: string, configs: Array<RouteConfig>): Promise<void> {
    for (const { path, rateLimitType, handler } of configs) {
      const rateLimiter = await getRedisRateLimiter(rateLimitType);
      app.use(`${prefix}${path}`, rateLimiter, handler);
    }
  }

  // Setup production routes: /api/v1/*
  await setupRoutes('/api/v1', routeConfigs);

  // Setup staging routes: /api/v1/staging/*
  await setupRoutes('/api/v1/staging', routeConfigs);

  // Staging-only: seed helper (never exposed on /api/v1/ prod path)
  const seedLimiter = await getRedisRateLimiter('api');
  app.use('/api/v1/staging/seed', seedLimiter, seedRoutes);

  // Log all protected endpoints
  logger.info('🛡️ Rate Limiting Coverage:');
  logger.info(`   Health checks: SKIPPED (automatic)`);
  logger.info(`   Sitemap (SEO): lenient (200/15min)`);
  logger.info(`   Debug endpoint: api (100/15min)`);
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

initializeServices().then(() => {
  server = app.listen(PORT, () => {
    const env = process.env['NODE_ENV'] || 'development';
    const firebaseProject = process.env['FIREBASE_PROJECT_ID'] || '(applicationDefault)';
    const stripeKey =
      process.env['STRIPE_SECRET_KEY'] || process.env['STRIPE_TEST_SECRET_KEY'] || '';
    const stripeMode = stripeKey.includes('live') ? 'LIVE' : stripeKey ? 'TEST' : 'NOT SET';
    const redisDb = process.env['REDIS_DB'] || '0 (default)';

    logger.info(`Backend server running on port ${PORT}`);
    logger.info('========================================');
    logger.info(`ENV:              ${env}`);
    logger.info(`Firebase Project: ${firebaseProject}`);
    logger.info(`Stripe Mode:      ${stripeMode}`);
    logger.info(`Redis DB:         ${redisDb}`);
    logger.info('========================================');
    logger.info(`API Endpoints:`);
    logger.info(`   Production: /api/v1/*`);
    logger.info(`   Staging:    /api/v1/staging/*`);
  });
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
