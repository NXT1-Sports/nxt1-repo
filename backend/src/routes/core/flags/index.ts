/**
 * @fileoverview Feature Flags API Routes
 * @module @nxt1/backend/routes/core/flags
 *
 * Public endpoints for reading feature flags.
 * All authenticated users can read flags.
 *
 * Routes:
 * - GET /api/v1/flags/:flagKey    - Get single flag
 * - GET /api/v1/flags/batch       - Get multiple flags (query: keys=key1&keys=key2)
 * - GET /api/v1/flags/all         - Get all flags (admin only)
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Router, type Request, type Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FEATURE_FLAG_REGISTRY, type FeatureFlagKey } from '@nxt1/core/flags';
import { FeatureFlagsService } from '../../../config/feature-flags/index.js';
import { asyncHandler } from '@nxt1/core/errors/express';
import { createApiError, forbiddenError, unauthorizedError } from '@nxt1/core';

const router = Router();

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Initialize FeatureFlagsService.
 * Will be injected into req.app.locals in real implementation.
 */
function getFlagsService(): FeatureFlagsService {
  const firestore = getFirestore();
  // In production, use a singleton/DI container
  return new FeatureFlagsService(firestore, 300); // 5-minute cache
}

/**
 * Auth verification middleware.
 * All flag endpoints require authentication.
 */
const requireAuth = asyncHandler(async (req: Request, res: Response, next: () => void) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw unauthorizedError('missing');
  }

  const token = authHeader.slice(7);
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      emailVerified: decodedToken.email_verified || false,
      displayName: decodedToken['name'],
      photoURL: decodedToken.picture,
    };

    const decoded = decodedToken as Record<string, unknown>;
    const claims =
      typeof decoded['claims'] === 'object' && decoded['claims'] !== null
        ? (decoded['claims'] as Record<string, unknown>)
        : undefined;
    const isAdmin = decoded['admin'] === true || claims?.['admin'] === true;
    res.locals['isAdmin'] = isAdmin;

    next();
  } catch {
    throw unauthorizedError('invalid');
  }
});

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/v1/flags/:flagKey
 * Get a single feature flag value.
 *
 * @example
 * GET /api/v1/flags/team.intel.enabled
 * Authorization: Bearer {token}
 *
 * Response:
 * {
 *   "success": true,
 *   "data": false
 * }
 */
router.get(
  '/:flagKey',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { flagKey } = req.params;

    // Validate flag key
    if (!FEATURE_FLAG_REGISTRY.getFlag(flagKey as FeatureFlagKey)) {
      throw createApiError('RES_NOT_FOUND', {
        message: `Feature flag not found: ${flagKey}`,
      });
    }

    const flagsService = getFlagsService();
    const value = await flagsService.getFlagValue(flagKey as FeatureFlagKey);

    return res.json({
      success: true,
      data: value,
    });
  })
);

/**
 * GET /api/v1/flags/batch
 * Get multiple feature flag values.
 *
 * @example
 * GET /api/v1/flags/batch?keys=team.intel.enabled&keys=agent.primary.enabled
 * Authorization: Bearer {token}
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "team.intel.enabled": false,
 *     "agent.primary.enabled": true
 *   }
 * }
 */
router.get(
  '/batch',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { keys } = req.query;

    // Parse keys from query string
    let flagKeys: string[] = [];
    if (Array.isArray(keys)) {
      flagKeys = keys.filter((k): k is string => typeof k === 'string');
    } else if (typeof keys === 'string') {
      flagKeys = [keys];
    }

    if (flagKeys.length === 0) {
      throw createApiError('VAL_INVALID_INPUT', {
        message: 'No flag keys provided',
      });
    }

    // Validate all keys
    const invalidKeys = flagKeys.filter((k) => !FEATURE_FLAG_REGISTRY.getFlag(k as FeatureFlagKey));
    if (invalidKeys.length > 0) {
      throw createApiError('VAL_INVALID_INPUT', {
        message: `Unknown flags: ${invalidKeys.join(', ')}`,
      });
    }

    const flagsService = getFlagsService();
    const values = await flagsService.getFlagValues(flagKeys as FeatureFlagKey[]);

    return res.json({
      success: true,
      data: values,
    });
  })
);

/**
 * GET /api/v1/flags/all
 * Get all feature flag values (admin only).
 * For control planes and admin dashboards.
 *
 * @example
 * GET /api/v1/flags/all
 * Authorization: Bearer {admin_token}
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "team.intel.enabled": false,
 *     "team.profiles.enabled": true,
 *     ...
 *   }
 * }
 */
router.get(
  '/all',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    // Check admin role (simple implementation)
    const isAdmin = res.locals['isAdmin'] === true;

    if (!isAdmin) {
      throw forbiddenError('admin');
    }

    const flagsService = getFlagsService();
    const allFlags = await flagsService.getAllFlags();

    return res.json({
      success: true,
      data: allFlags,
    });
  })
);

export default router;

/**
 * Mount point for feature flags routes.
 * In main API router: router.use('/api/v1/flags', flagsRouter);
 */
export const FLAGS_ROUTER_MOUNT = '/api/v1/flags';
