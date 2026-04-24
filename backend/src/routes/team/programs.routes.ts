/**
 * @fileoverview Programs Routes
 * @module @nxt1/backend/routes/programs
 *
 * Organization search endpoint used by onboarding "Select Program" step.
 * Delegates to OrganizationService.searchOrganizations() for
 * prefix-based name search on the Organizations Firestore collection.
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { createOrganizationService } from '../../services/team/organization.service.js';
import type { Organization } from '@nxt1/core/models';
import { logger } from '../../utils/logger.js';

const router: ExpressRouter = Router();

/**
 * GET /programs/search?q=<query>&limit=<limit>&type=<type>&state=<state>
 *
 * Search organizations by name prefix (case-insensitive).
 * Used by the onboarding team-selection step to find existing programs.
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
    const limit = Math.min(Math.max(Number(req.query['limit']) || 20, 1), 50);
    const type = typeof req.query['type'] === 'string' ? req.query['type'] : undefined;
    const state = typeof req.query['state'] === 'string' ? req.query['state'] : undefined;

    if (!query || query.length < 2) {
      res.json({ success: true, data: [] });
      return;
    }

    const db = req.firebase!.db;
    const organizationService = createOrganizationService(db);

    const orgs = await organizationService.searchOrganizations(query, {
      limit,
      type: type as Organization['type'] | undefined,
      state,
    });

    res.json({
      success: true,
      data: orgs.map((org) => ({
        id: org.id,
        name: org.name,
        type: org.type,
        location: org.location,
        logoUrl: org.logoUrl ?? null,
        primaryColor: org.primaryColor ?? null,
        secondaryColor: org.secondaryColor ?? null,
        mascot: org.mascot ?? null,
        teamCount: org.teamCount ?? 0,
        isClaimed: org.isClaimed ?? false,
      })),
    });
  } catch (err) {
    logger.error('Program search failed', { error: err, query: req.query['q'] });
    res.status(500).json({ success: false, error: 'Program search failed' });
  }
});

router.get('/:programId', async (req: Request, res: Response) => {
  try {
    const programId =
      typeof req.params['programId'] === 'string' ? req.params['programId'].trim() : '';

    if (!programId) {
      res.status(400).json({ success: false, error: 'Program id is required' });
      return;
    }

    const db = req.firebase!.db;
    const organizationService = createOrganizationService(db);
    const org = await organizationService.getOrganizationById(programId);

    res.json({
      success: true,
      data: {
        id: org.id,
        name: org.name,
        type: org.type,
        location: org.location,
        logoUrl: org.logoUrl ?? null,
        primaryColor: org.primaryColor ?? null,
        secondaryColor: org.secondaryColor ?? null,
        mascot: org.mascot ?? null,
        teamCount: org.teamCount ?? 0,
        isClaimed: org.isClaimed ?? false,
      },
    });
  } catch (err) {
    logger.error('Program lookup failed', {
      error: err,
      programId: req.params['programId'],
    });
    res.status(404).json({ success: false, error: 'Program not found' });
  }
});

export default router;
