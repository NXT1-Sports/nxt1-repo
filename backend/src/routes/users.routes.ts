/**
 * @fileoverview Users Routes
 * @module @nxt1/backend/routes/users
 *
 * User search routes
 * Matches CREATE_POST_API_ENDPOINTS.SEARCH_USERS
 */

import { Router, type Router as ExpressRouter, Request, Response } from 'express';
import { getUsersByIds } from '../services/users.service.js';
import { logger } from '../utils/logger.js';
import { validationError } from '@nxt1/core/errors';

const router: ExpressRouter = Router();

/**
 * Search users for tagging
 * GET /api/v1/users/search
 */
router.get('/search', (_req: Request, res: Response) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented',
  });
});

/**
 * Fetch multiple users by IDs
 * POST /api/v1/users/batch
 *
 * Body: { userIds: string[] }
 * Response: { success: true, data: User[] }
 *
 * @example
 * ```json
 * POST /api/v1/users/batch
 * { "userIds": ["user1", "user2", "user3"] }
 * ```
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { userIds } = req.body as { userIds?: string[] };

    // Validate input
    if (!Array.isArray(userIds) || userIds.length === 0) {
      const error = validationError([
        {
          field: 'userIds',
          message: 'userIds must be a non-empty array',
          rule: 'required',
        },
      ]);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    // Limit batch size to prevent abuse
    const MAX_BATCH_SIZE = 100;
    if (userIds.length > MAX_BATCH_SIZE) {
      const error = validationError([
        {
          field: 'userIds',
          message: `Maximum ${MAX_BATCH_SIZE} users per request`,
          rule: 'maxArrayLength',
        },
      ]);
      res.status(error.statusCode).json(error.toResponse());
      return;
    }

    logger.info('[POST /users/batch] Fetching users:', { count: userIds.length });

    // Fetch users via service (with Redis caching)
    const users = await getUsersByIds(userIds);

    logger.info('[POST /users/batch] Success:', {
      requested: userIds.length,
      found: users.length,
      cached: users.length > 0 ? 'check service logs' : 'n/a',
    });

    res.json({
      success: true,
      data: users,
      meta: {
        requested: userIds.length,
        found: users.length,
      },
    });
  } catch (error) {
    logger.error('[POST /users/batch] Error:', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
