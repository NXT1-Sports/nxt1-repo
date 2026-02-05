/**
 * @fileoverview Admin FAQ Routes
 * @module @nxt1/backend/routes/admin/faq
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Create FAQ position
 * POST /api/v1/admin/faq/create
 */
router.post('/create', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get all FAQ positions
 * GET /api/v1/admin/faq
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update FAQ position
 * PUT /api/v1/admin/faq/:id
 */
router.put('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Delete FAQ position
 * DELETE /api/v1/admin/faq/:id
 */
router.delete('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
