/**
 * @fileoverview Profile Routes
 * @module @nxt1/backend/routes/profile
 *
 * Profile API routes matching packages/core/src/profile/profile.api.ts
 * Note: These routes are mounted under /auth/profile in auth.routes.ts
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Search profiles
 * GET /api/v1/auth/profile/search
 */
router.get('/search', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get profile by username
 * GET /api/v1/auth/profile/username/:username
 */
router.get('/username/:username', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get user profile by ID
 * GET /api/v1/auth/profile/:userId
 */
router.get('/:userId', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update user profile
 * PUT /api/v1/auth/profile/:userId
 */
router.put('/:userId', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Upload profile image
 * POST /api/v1/auth/profile/:userId/image
 */
router.post('/:userId/image', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Update sport profile
 * PUT /api/v1/auth/profile/:userId/sport
 */
router.put('/:userId/sport', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Add new sport to profile
 * POST /api/v1/auth/profile/:userId/sport
 */
router.post('/:userId/sport', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Remove sport from profile
 * DELETE /api/v1/auth/profile/:userId/sport/:sportIndex
 */
router.delete('/:userId/sport/:sportIndex', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
