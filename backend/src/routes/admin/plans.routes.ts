/**
 * @fileoverview Admin Plans Routes
 * @module @nxt1/backend/routes/admin/plans
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Create plan
 * POST /api/v1/admin/plan/create
 */
router.post('/create', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get all plans
 * GET /api/v1/admin/plan/list
 */
router.get('/list', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get plan by ID
 * GET /api/v1/admin/plan/:id
 */
router.get('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get package titles
 * GET /api/v1/admin/package/titles
 */
router.get('/package/titles', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get credit config
 * GET /api/v1/admin/credit/config
 */
router.get('/credit/config', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update plan by ID
 * PUT /api/v1/admin/plan/:id
 */
router.put('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update plan order
 * PUT /api/v1/admin/plan/list/re-order
 */
router.put('/list/re-order', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update plan title
 * PUT /api/v1/admin/plan/title/update
 */
router.put('/title/update', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Config credit
 * PUT /api/v1/admin/plan/credit/update
 */
router.put('/credit/update', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Delete plan
 * DELETE /api/v1/admin/plan/:id/:priceId
 */
router.delete('/:id/:priceId', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
