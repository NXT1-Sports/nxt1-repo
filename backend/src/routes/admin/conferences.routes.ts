/**
 * @fileoverview Admin Conferences Routes
 * @module @nxt1/backend/routes/admin/conferences
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Create new conference
 * POST /api/v1/admin/conference
 */
router.post('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Change conference image
 * POST /api/v1/admin/conference/file
 */
router.post('/file', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Check conference sports
 * POST /api/v1/admin/conference/check
 */
router.post('/check', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get conference names
 * GET /api/v1/admin/conference/names
 */
router.get('/names', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get all conferences
 * GET /api/v1/admin/conference
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update conference
 * PUT /api/v1/admin/conference/:id
 */
router.put('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Delete conference
 * DELETE /api/v1/admin/conference/:id
 */
router.delete('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
