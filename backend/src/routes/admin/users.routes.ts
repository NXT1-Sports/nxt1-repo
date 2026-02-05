/**
 * @fileoverview Admin Users Routes
 * @module @nxt1/backend/routes/admin/users
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Get users list (admin)
 * GET /api/v1/admin/users
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update user (admin)
 * PUT /api/v1/admin/users/:uid
 */
router.put('/:uid', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Delete user (admin)
 * DELETE /api/v1/admin/users/:uid
 */
router.delete('/:uid', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
