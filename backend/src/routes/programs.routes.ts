/**
 * @fileoverview Programs (Organization) Search Routes
 * @module @nxt1/backend/routes/programs
 *
 * Provides program search for onboarding team selection.
 * Searches Organizations collection by name with optional state filter.
 *
 * Endpoints:
 * - GET /api/v1/programs/search?q=...&state=...&type=...&limit=20
 *
 * @version 1.0.0
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { appGuard } from '../middleware/auth.middleware.js';
import { asyncHandler, sendSuccess } from '@nxt1/core/errors/express';
import { validationError } from '@nxt1/core/errors';
import { createOrganizationService } from '../services/organization.service.js';
import { logger } from '../utils/logger.js';

const router: ExpressRouter = Router();

// ============================================
// SEARCH PROGRAMS
// ============================================

/**
 * Search programs (organizations) by name
 * GET /api/v1/programs/search?q=katy&state=TX&type=high-school&limit=20
 *
 * Requires authentication. Returns matching organizations
 * including both claimed and ghost/unclaimed entries.
 */
router.get(
  '/search',
  appGuard,
  asyncHandler(async (req: Request, res: Response) => {
    const query = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
    const state = typeof req.query['state'] === 'string' ? req.query['state'].trim() : undefined;
    const type =
      typeof req.query['type'] === 'string'
        ? (req.query['type'].trim() as
            | 'high-school'
            | 'middle-school'
            | 'club'
            | 'college'
            | 'juco'
            | 'organization')
        : undefined;
    const limit = Math.min(Math.max(parseInt(String(req.query['limit'] ?? '20'), 10) || 20, 1), 50);

    if (!query || query.length < 2) {
      throw validationError([
        { field: 'q', message: 'Search query must be at least 2 characters', rule: 'minLength' },
      ]);
    }

    const db = req.firebase!.db;
    const orgService = createOrganizationService(db);

    const organizations = await orgService.searchOrganizations(query, {
      state,
      type,
      limit,
    });

    // Map to a lighter search result shape for the frontend
    const results = organizations.map((org) => ({
      id: org.id,
      name: org.name,
      type: org.type,
      location: org.location,
      logoUrl: org.logoUrl,
      primaryColor: org.primaryColor,
      secondaryColor: org.secondaryColor,
      mascot: org.mascot,
      teamCount: org.teamCount ?? 0,
      isClaimed: org.isClaimed,
    }));

    logger.info('[Programs] Search', { query, state, type, resultCount: results.length });

    sendSuccess(res, results);
  })
);

export default router;
