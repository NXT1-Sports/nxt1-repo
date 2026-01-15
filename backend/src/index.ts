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

// Middleware
import { firebaseContext } from './middleware/firebase-context.middleware.js';

// Routes
import authRoutes from './routes/auth.routes.js';

const { json, urlencoded } = bodyParser;

const app = express();
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
// API Routes - Production (uses FIREBASE_SERVICE_ACCOUNT)
// ============================================================================
app.use('/api/v1/auth', authRoutes);

// ============================================================================
// API Routes - Staging (uses STAGING_FIREBASE_SERVICE_ACCOUNT)
// ============================================================================
app.use('/api/v1/staging/auth', authRoutes);

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
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env['NODE_ENV'] || 'development'}`);
  console.log(`\nAPI Endpoints:`);
  console.log(`   Production: /api/v1/*`);
  console.log(`   Staging:    /api/v1/staging/*`);
});

export default app;
