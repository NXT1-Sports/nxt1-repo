/**
 * @fileoverview Admin General Routes
 * @module @nxt1/backend/routes/admin/general
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Add graduation year
 * POST /api/v1/admin/general/graduation-year
 */
router.post('/graduation-year', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update price HTML
 * POST /api/v1/admin/prices/update-html
 */
router.post('/prices/update-html', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get all graduation years
 * GET /api/v1/admin/general/graduation-year
 */
router.get('/graduation-year', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get price HTML
 * GET /api/v1/admin/prices/html
 */
router.get('/prices/html', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Delete graduation year
 * DELETE /api/v1/admin/general/graduation-year
 */
router.delete('/graduation-year', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
