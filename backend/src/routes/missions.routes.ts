/**
 * @fileoverview Missions Routes
 * @module @nxt1/backend/routes/missions
 *
 * Document-based missions/gamification feature routes.
 * Matches MISSIONS_API_ENDPOINTS from @nxt1/core/missions/constants.
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';

const router: ExpressRouter = Router();

/**
 * Get available missions
 * GET /api/v1/missions
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get mission progress
 * GET /api/v1/missions/progress
 */
router.get('/progress', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get badges
 * GET /api/v1/missions/badges
 */
router.get('/badges', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get leaderboard
 * GET /api/v1/missions/leaderboard
 */
router.get('/leaderboard', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get mission detail
 * GET /api/v1/missions/:id
 */
router.get('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Complete/claim mission
 * POST /api/v1/missions/:id/complete
 */
router.post('/:id/complete', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Claim mission reward (legacy)
 * POST /api/v1/missions/:id/claim
 */
router.post('/:id/claim', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
