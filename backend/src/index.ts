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

// Routes
import authRoutes from './routes/auth.routes.js';

const { json, urlencoded } = bodyParser;

const app = express();
const PORT = process.env['PORT'] || 3000;

// Middleware
app.use(cors());
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/v1/auth', authRoutes);

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
});

export default app;
