/**
 * @fileoverview Admin Videos Routes
 * @module @nxt1/backend/routes/admin/videos
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Upload new video
 * POST /api/v1/admin/video/upload
 */
router.post('/upload', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Upload new thumbnail
 * POST /api/v1/admin/video/thumbnail
 */
router.post('/thumbnail', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Change video title
 * POST /api/v1/admin/video/title
 */
router.post('/title', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Set video link
 * POST /api/v1/admin/video/link
 */
router.post('/link', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get videos collection
 * GET /api/v1/admin/video-collection
 */
router.get('/collection', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get video by name
 * GET /api/v1/admin/video
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Get thumbnail by name
 * GET /api/v1/admin/thumbnail
 */
router.get('/thumbnail', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

export default router;
