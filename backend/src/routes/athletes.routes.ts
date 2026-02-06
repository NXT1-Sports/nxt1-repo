/**
 * @fileoverview Athlete Detail Routes
 * @module @nxt1/backend/routes/athletes
 *
 * Athlete detail routes matching EXPLORE_API_ENDPOINTS from @nxt1/core/explore/constants.
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Get athlete details by ID
 * GET /api/v1/athletes/:id
 */
router.get('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
