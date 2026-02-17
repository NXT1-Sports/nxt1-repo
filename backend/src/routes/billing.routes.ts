/**
 * @fileoverview Usage Recording Routes
 * @module @nxt1/backend/routes
 *
 * API endpoints for recording usage events (usage-based billing)
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../middleware/auth.middleware.js';
import { logger } from '../utils/logger.js';
import {
  recordUsageEvent,
  getUserUsageEvents,
  getTeamUsageEvents,
  type CreateUsageEventInput,
  UsageFeature,
} from '../modules/billing/index.js';

const router = Router();

/**
 * POST /api/v1/billing/usage
 * Record a new usage event
 *
 * Body:
 * {
 *   feature: 'AI_GRAPHIC' | 'HIGHLIGHT' | ...
 *   quantity: number
 *   jobId?: string (for idempotency)
 *   metadata?: object
 * }
 */
router.post('/usage', appGuard, async (req: Request, res: Response) => {
  try {
    const { feature, quantity, jobId, metadata } = req.body;

    // Validate required fields
    if (!feature || !quantity) {
      return res.status(400).json({
        error: 'Missing required fields: feature, quantity',
      });
    }

    // Validate feature
    if (!Object.values(UsageFeature).includes(feature)) {
      return res.status(400).json({
        error: 'Invalid feature',
        validFeatures: Object.values(UsageFeature),
      });
    }

    // User is guaranteed by appGuard
    const userId = req.user!.uid;
    const teamId = userId; // Teams resolved server-side

    // Get Firebase context
    const db = req.firebase?.db;
    const environment = req.isStaging ? 'staging' : 'production';

    if (!db) {
      throw new Error('Firebase context not available');
    }

    // Record usage event
    const input: CreateUsageEventInput = {
      userId,
      teamId: teamId || userId, // Use userId as fallback if no team
      feature,
      quantity: Number(quantity),
      unitCostSnapshot: 0, // Will be set by service
      currency: 'usd',
      stripePriceId: '', // Will be set by service
      jobId,
      metadata,
    };

    const eventId = await recordUsageEvent(db, input, environment);

    logger.info('[POST /usage] Usage event recorded', {
      eventId,
      userId,
      feature,
      quantity,
    });

    // Return immediately - processing happens async
    return res.status(202).json({
      success: true,
      eventId,
      message: 'Usage event recorded and queued for processing',
    });
  } catch (error) {
    logger.error('[POST /usage] Failed to record usage', {
      error,
      body: req.body,
    });

    return res.status(500).json({
      error: 'Failed to record usage event',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/billing/usage/me
 * Get current user's usage events
 */
router.get('/usage/me', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;

    const db = req.firebase?.db;

    if (!db) {
      throw new Error('Firebase context not available');
    }

    const limit = Number(req.query['limit']) || 50;
    const events = await getUserUsageEvents(db, userId, limit);

    return res.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error) {
    logger.error('[GET /usage/me] Failed to get usage events', {
      error,
    });

    return res.status(500).json({
      error: 'Failed to get usage events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/billing/usage/team/:teamId
 * Get team's usage events (requires team admin)
 */
router.get('/usage/team/:teamId', appGuard, async (req: Request, res: Response) => {
  try {
    const teamId = req.params['teamId'] as string;

    const db = req.firebase?.db;

    if (!db) {
      throw new Error('Firebase context not available');
    }

    const limit = Number(req.query['limit']) || 100;
    const events = await getTeamUsageEvents(db, teamId, limit);

    return res.json({
      success: true,
      teamId,
      events,
      count: events.length,
    });
  } catch (error) {
    logger.error('[GET /usage/team/:teamId] Failed to get team usage events', {
      error,
      teamId: req.params['teamId'],
    });

    return res.status(500).json({
      error: 'Failed to get team usage events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/billing/usage/features
 * Get list of billable features
 */
router.get('/usage/features', (_req: Request, res: Response) => {
  res.json({
    success: true,
    features: Object.values(UsageFeature),
  });
});

export default router;
