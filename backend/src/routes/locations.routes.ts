/**
 * @fileoverview Locations Routes
 * @module @nxt1/backend/routes/locations
 *
 * Location search routes for create-post location tagging feature.
 * Matches CREATE_POST_API_ENDPOINTS.SEARCH_LOCATIONS
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';

const router: ExpressRouter = Router();

/**
 * Search locations for post tagging
 * GET /api/v1/locations/search
 */
router.get('/search', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
