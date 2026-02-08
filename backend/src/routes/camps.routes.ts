/**
 * @fileoverview Camp Detail Routes
 * @module @nxt1/backend/routes/camps
 *
 * Camp detail routes matching EXPLORE_API_ENDPOINTS from @nxt1/core/explore/constants.
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';

const router: ExpressRouter = Router();

/**
 * Get camp details by ID
 * GET /api/v1/camps/:id
 */
router.get('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
