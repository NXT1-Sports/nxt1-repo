/**
 * @fileoverview Backend Entry Point
 * @module @nxt1/backend
 *
 * Express server using shared @nxt1/core types and unified error handling.
 */

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

// Import unified error handling from @nxt1/core
import { requestTracker, notFoundHandler, createErrorHandler } from '@nxt1/core/errors/express';

// Import logger
import { logger } from './utils/logger.js';

// Import database configuration
import { connectToMongoDB } from './config/database.config.js';

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

const { json, urlencoded } = bodyParser;

const app: ReturnType<typeof express> = express();
const PORT = process.env['PORT'] || 3000;

// ============================================================================
// Global Middleware
// ============================================================================
app.use(cors());
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));

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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to get performance stats',
      },
    });
  }
});

// ============================================================================
// Public Routes (no /api prefix for SEO)
// ============================================================================
app.use('/', sitemapRoutes);

// ============================================================================
// API Routes - Production (uses FIREBASE_SERVICE_ACCOUNT)
// ============================================================================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/feed', feedRoutes);
app.use('/api/v1/explore', exploreRoutes);
app.use('/api/v1/activity', activityRoutes);
app.use('/api/v1/posts', postsRoutes);
app.use('/api/v1/scout-reports', scoutReportsRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/news', newsRoutes);
app.use('/api/v1/invite', inviteRoutes);
app.use('/api/v1/missions', missionsRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/help-center', helpCenterRoutes);
app.use('/api/v1/profile', editProfileRoutes); // Edit profile endpoints (mount at /profile)
app.use('/api/v1/agent-x', agentXRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/locations', locationsRoutes);
app.use('/api/v1/follow', followRoutes);
// Detail routes - College uses MongoDB + Redis cache
app.use('/api/v1/colleges', collegesRoutes);
app.use('/api/v1/athletes', athletesRoutes);
app.use('/api/v1/teams', teamsRoutes);
app.use('/api/v1/videos', videosRoutes);
app.use('/api/v1/leaderboards', leaderboardsRoutes);
app.use('/api/v1/camps', campsRoutes);
app.use('/api/v1/events', eventsRoutes);
// Billing routes
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/billing', webhookRoutes);

app.use('/api/v1/ssr', ssrRoutes);

// ============================================================================
// API Routes - Staging (uses STAGING_FIREBASE_SERVICE_ACCOUNT)
// ============================================================================
app.use('/api/v1/staging/auth', authRoutes);
app.use('/api/v1/staging/upload', uploadRoutes);
app.use('/api/v1/staging/feed', feedRoutes);
app.use('/api/v1/staging/explore', exploreRoutes);
app.use('/api/v1/staging/activity', activityRoutes);
app.use('/api/v1/staging/posts', postsRoutes);
app.use('/api/v1/staging/scout-reports', scoutReportsRoutes);
app.use('/api/v1/staging/analytics', analyticsRoutes);
app.use('/api/v1/staging/news', newsRoutes);
app.use('/api/v1/staging/invite', inviteRoutes);
app.use('/api/v1/staging/missions', missionsRoutes);
app.use('/api/v1/staging/settings', settingsRoutes);
app.use('/api/v1/staging/help-center', helpCenterRoutes);
app.use('/api/v1/staging/profile', editProfileRoutes); // Edit profile endpoints
app.use('/api/v1/staging/agent-x', agentXRoutes);
app.use('/api/v1/staging/users', usersRoutes);
app.use('/api/v1/staging/locations', locationsRoutes);
app.use('/api/v1/staging/follow', followRoutes);
// Detail routes - College uses MongoDB + Redis cache
app.use('/api/v1/staging/colleges', collegesRoutes);
app.use('/api/v1/staging/athletes', athletesRoutes);
app.use('/api/v1/staging/teams', teamsRoutes);
app.use('/api/v1/staging/videos', videosRoutes);
// Billing routes (staging)
app.use('/api/v1/staging/billing', billingRoutes);
app.use('/api/v1/staging/billing', webhookRoutes);
app.use('/api/v1/staging/leaderboards', leaderboardsRoutes);
app.use('/api/v1/staging/camps', campsRoutes);
app.use('/api/v1/staging/events', eventsRoutes);
app.use('/api/v1/staging/ssr', ssrRoutes);

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
initializeServices().then(() => {
  app.listen(PORT, () => {
    logger.info(`Backend server running on port ${PORT}`);
    logger.info(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
    logger.info(`API Endpoints:`);
    logger.info(`   Production: /api/v1/*`);
    logger.info(`   Staging:    /api/v1/staging/*`);
  });
});

export default app;
