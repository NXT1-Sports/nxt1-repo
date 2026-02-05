/**
 * @fileoverview Users Routes
 * @module @nxt1/backend/routes/users
 *
 * User search routes for create-post tagging feature.
 * Matches CREATE_POST_API_ENDPOINTS.SEARCH_USERS
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Search users for tagging
 * GET /api/v1/users/search
 */
router.get('/search', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
