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

// Middleware
import { firebaseContext } from './middleware/firebase-context.middleware.js';

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
import helpRoutes from './routes/help.routes.js';
import editProfileRoutes from './routes/edit-profile.routes.js';
import usersRoutes from './routes/users.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import adminRoutes from './routes/admin/index.js';
import agentXRoutes from './routes/agent-x.routes.js';
import followRoutes from './routes/follow.routes.js';
import ssrRoutes from './routes/ssr.routes.js';

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
app.use('/api/v1/help', helpRoutes);
app.use('/api/v1/profile', editProfileRoutes); // Edit profile endpoints (mount at /profile)
app.use('/api/v1/agent-x', agentXRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/locations', locationsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/follow', followRoutes);

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
app.use('/api/v1/staging/help', helpRoutes);
app.use('/api/v1/staging/profile', editProfileRoutes); // Edit profile endpoints
app.use('/api/v1/staging/agent-x', agentXRoutes);
app.use('/api/v1/staging/users', usersRoutes);
app.use('/api/v1/staging/locations', locationsRoutes);
app.use('/api/v1/staging/admin', adminRoutes);
app.use('/api/v1/staging/follow', followRoutes);
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
// Start Server
// ============================================================================
app.listen(PORT, () => {
  logger.info(`Backend server running on port ${PORT}`);
  logger.info(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
  logger.info(`API Endpoints:`);
  logger.info(`   Production: /api/v1/*`);
  logger.info(`   Staging:    /api/v1/staging/*`);
});

export default app;
