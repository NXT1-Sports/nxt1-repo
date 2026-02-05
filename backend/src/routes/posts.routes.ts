/**
 * @fileoverview Posts Routes
 * @module @nxt1/backend/routes/posts
 *
 * Create Post API routes matching packages/core/src/create-post/create-post.api.ts
 * Endpoints from CREATE_POST_API_ENDPOINTS constant.
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Get draft posts
 * GET /api/v1/posts/drafts
 */
router.get('/drafts', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Save draft
 * POST /api/v1/posts/drafts
 */
router.post('/drafts', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Delete draft
 * DELETE /api/v1/posts/drafts/:id
 */
router.delete('/drafts/:id', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get XP preview
 * POST /api/v1/posts/xp-preview
 */
router.post('/xp-preview', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Upload media file
 * POST /api/v1/posts/media
 *
 * Handles file uploads for posts (images, videos).
 * Expects multipart/form-data with file field.
 */
router.post('/media', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Create a new post
 * POST /api/v1/posts
 */
router.post('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
