/**
 * @fileoverview Admin Templates Routes
 * @module @nxt1/backend/routes/admin/templates
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Create template
 * POST /api/v1/admin/templates
 */
router.post('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get academic list
 * GET /api/v1/admin/academic/list
 */
router.get('/academic/list', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get all templates
 * GET /api/v1/admin/templates/list
 */
router.get('/list', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update academic category by ID
 * PUT /api/v1/admin/academic/:id
 */
router.put('/academic/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update all templates
 * PUT /api/v1/admin/templates/updateAll
 */
router.put('/updateAll', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update category name
 * PUT /api/v1/admin/templates/update-category-name
 */
router.put('/update-category-name', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update template by ID
 * PUT /api/v1/admin/templates/:id
 */
router.put('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update category order
 * PUT /api/v1/admin/template/update-category-order
 */
router.put('/update-category-order', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Delete template
 * DELETE /api/v1/admin/templates/:id
 */
router.delete('/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
