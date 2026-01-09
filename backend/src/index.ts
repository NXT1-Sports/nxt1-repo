/**
 * @fileoverview Backend Entry Point
 * @module @nxt1/backend
 *
 * Express server using shared @nxt1/core types.
 */

import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';

// Import shared types from @nxt1/core
import type { UserV2, ApiResponse } from '@nxt1/core';
import { validateRegistration, validateProfileUpdate } from '@nxt1/core/validation';

// Routes
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import videoRoutes from './routes/video.routes.js';
import teamRoutes from './routes/team.routes.js';
import stripeRoutes from './routes/stripe.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/video', videoRoutes);
app.use('/api/v1/team', teamRoutes);
app.use('/api/v1/stripe', stripeRoutes);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server Error]', err);

  const response: ApiResponse<null> = {
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  };

  res.status(500).json(response);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
