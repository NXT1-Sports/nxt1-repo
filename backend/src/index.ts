/**
 * @fileoverview Backend Entry Point
 * @module @nxt1/backend
 *
 * Express server using shared @nxt1/core types and unified error handling.
 */

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
// Global Middleware
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

// Add request tracking (trace IDs, timing)
app.use(requestTracker);

// Attach Firebase context to all requests
app.use(firebaseContext);

// Performance monitoring for all requests
app.use(performanceMiddleware);

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
// Global Performance Debug Endpoint
// ============================================================================
app.get('/api/v1/debug/performance', async (_req, res) => {
  try {
    const result = await testPerformance();
    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get performance stats';
    res.status(500).json({
      success: false,
      error: {
        message,
      },
    });
  }
});

// ============================================================================
// Public Routes (no /api prefix for SEO)
// ============================================================================
app.use('/', sitemapRoutes);

// ============================================================================
// API Routes — register once for both production and staging prefixes
// ============================================================================
const API_ROUTES: Array<{ path: string; router: ReturnType<typeof express.Router> }> = [
  { path: '/auth', router: authRoutes },
  { path: '/upload', router: uploadRoutes },
  { path: '/feed', router: feedRoutes },
  { path: '/explore', router: exploreRoutes },
  { path: '/activity', router: activityRoutes },
  { path: '/posts', router: postsRoutes },
  { path: '/scout-reports', router: scoutReportsRoutes },
  { path: '/analytics', router: analyticsRoutes },
  { path: '/news', router: newsRoutes },
  { path: '/invite', router: inviteRoutes },
  { path: '/missions', router: missionsRoutes },
  { path: '/settings', router: settingsRoutes },
  { path: '/help-center', router: helpCenterRoutes },
  { path: '/profile', router: editProfileRoutes },
  { path: '/agent-x', router: agentXRoutes },
  { path: '/users', router: usersRoutes },
  { path: '/locations', router: locationsRoutes },
  { path: '/follow', router: followRoutes },
  { path: '/colleges', router: collegesRoutes },
  { path: '/athletes', router: athletesRoutes },
  { path: '/teams', router: teamsRoutes },
  { path: '/videos', router: videosRoutes },
  { path: '/leaderboards', router: leaderboardsRoutes },
  { path: '/camps', router: campsRoutes },
  { path: '/events', router: eventsRoutes },
  { path: '/billing', router: billingRoutes },
  { path: '/billing', router: webhookRoutes },
  { path: '/ssr', router: ssrRoutes },
];

for (const prefix of ['/api/v1', '/api/v1/staging']) {
  for (const { path, router } of API_ROUTES) {
    app.use(`${prefix}${path}`, router);
  }
}

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

// ============================================================================
// Initialize Services
// ============================================================================
async function initializeServices() {
  try {
    // 1. Initialize cache service (Redis + Memory fallback)
    await initializeCacheService();
    logger.info('✅ Cache service initialized');

    // 2. Connect to MongoDB
    await connectToMongoDB();
    logger.info('✅ MongoDB connected');

    logger.info('✅ All services initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize services:', { error });
    // MongoDB errors are critical for college routes
    throw error;
  }
}

// ============================================================================
// Start Server
// ============================================================================
let server: ReturnType<typeof app.listen> | null = null;

initializeServices().then(() => {
  server = app.listen(PORT, () => {
    logger.info(`Backend server running on port ${PORT}`);
    logger.info(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
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
