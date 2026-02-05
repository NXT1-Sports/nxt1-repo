/**
 * @fileoverview Admin Dashboard Routes
 * @module @nxt1/backend/routes/admin/dashboard
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Get admin dashboard
 * GET /api/v1/admin/dashboard
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Migrate offer logos
 * POST /api/v1/admin/migrate/offer-logos
 */
router.post('/migrate/offer-logos', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
