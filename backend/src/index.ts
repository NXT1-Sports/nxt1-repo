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

// ============================================================================
// API Routes - Staging (uses STAGING_FIREBASE_SERVICE_ACCOUNT)
// ============================================================================
app.use('/api/v1/staging/auth', authRoutes);
app.use('/api/v1/staging/upload', uploadRoutes);

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
