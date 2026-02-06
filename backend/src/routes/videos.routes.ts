/**
 * @fileoverview Video Detail Routes
 * @module @nxt1/backend/routes/videos
 *
 * Video detail routes matching EXPLORE_API_ENDPOINTS from @nxt1/core/explore/constants.
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Get video details by ID
 * GET /api/v1/videos/:id
 */
router.get('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
