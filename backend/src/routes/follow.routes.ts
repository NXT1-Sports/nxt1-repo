/**
 * @fileoverview Follow Routes
 * @module @nxt1/backend/routes/follow
 *
 * Follow/unfollow routes matching profile.api.ts
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';

const router: ExpressRouter = Router();

/**
 * Follow a user
 * POST /api/v1/follow
 */
router.post('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Unfollow a user
 * DELETE /api/v1/follow
 */
router.delete('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get followers for user
 * GET /api/v1/follow/followers/:userId
 */
router.get('/followers/:userId', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get following for user
 * GET /api/v1/follow/following/:userId
 */
router.get('/following/:userId', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
