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

// Import cache service
import { initializeCacheService } from './services/cache.service.js';

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
import ssrRoutes from './routes/ssr.routes.js';
// Detail routes for explore
import collegesRoutes from './routes/colleges.routes.js';
import athletesRoutes from './routes/athletes.routes.js';
import teamsRoutes from './routes/teams.routes.js';
import videosRoutes from './routes/videos.routes.js';
import leaderboardsRoutes from './routes/leaderboards.routes.js';
import campsRoutes from './routes/camps.routes.js';
import eventsRoutes from './routes/events.routes.js';
// Billing routes
import billingRoutes from './routes/billing.routes.js';
import webhookRoutes from './routes/webhook.routes.js';

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
          'https://nxt1.com',
          'https://www.nxt1.com',
          'https://nxt1sports.com',
          'https://www.nxt1sports.com',
        ],
    credentials: true,
  })
);

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

  // Performance monitoring for all requests
  app.use(performanceMiddleware);

  // Cache status tracking for all requests
  app.use(createCacheMiddleware('redis'));
  app.use(cacheStatusMiddleware);

  // Global Redis-based rate limiting
  app.use(await getRedisRateLimiter('api'));

  // ============================================================================
  // Health Checks
  // ============================================================================
  app.get('/health', (_req, res) => {
    res.json({ status: 'Production OK', timestamp: new Date().toISOString() });
  });

  app.get('/staging/health', (_req, res) => {
    res.json({ status: 'Staging OK', timestamp: new Date().toISOString() });
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
    // Auth routes with strict rate limiting
    { path: '/auth', rateLimitType: 'auth', handler: authRoutes },
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
    // Search/Discovery routes with search-specific rate limiting
    { path: '/colleges', rateLimitType: 'search', handler: collegesRoutes },
    { path: '/athletes', rateLimitType: 'search', handler: athletesRoutes },
    { path: '/teams', rateLimitType: 'api', handler: teamsRoutes },
    { path: '/videos', rateLimitType: 'upload', handler: videosRoutes },
    { path: '/leaderboards', rateLimitType: 'search', handler: leaderboardsRoutes },
    { path: '/camps', rateLimitType: 'api', handler: campsRoutes },
    { path: '/events', rateLimitType: 'api', handler: eventsRoutes },
    // Billing routes with strict rate limiting
    { path: '/billing', rateLimitType: 'billing', handler: billingRoutes },
    { path: '/webhook', rateLimitType: 'billing', handler: webhookRoutes },
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
