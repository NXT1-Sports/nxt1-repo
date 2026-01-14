/**
 * @fileoverview Backend Entry Point
 * @module @nxt1/backend
 *
 * Express server using shared @nxt1/core types.
 */

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

// Import shared types from @nxt1/core
import type { ApiResponse } from '@nxt1/core';

// Middleware
import { firebaseContext } from './middleware/firebase-context.middleware.js';

// Routes
import authRoutes from './routes/auth.routes.js';

const { json, urlencoded } = bodyParser;

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(cors());
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));

// Attach Firebase context to all requests
app.use(firebaseContext);

// Health check
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

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);

  const response: ApiResponse<null> = {
    success: false,
    error: process.env['NODE_ENV'] === 'production' ? 'Internal server error' : err.message,
  };

  res.status(500).json(response);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env['NODE_ENV'] || 'development'}`);
  console.log(`\n📊 API Endpoints:`);
  console.log(`   Production: /api/v1/*`);
  console.log(`   Staging:    /api/v1/staging/*`);
});

export default app;
