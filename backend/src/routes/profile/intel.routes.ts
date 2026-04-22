/**
 * @fileoverview Profile — Intel report routes.
 *
 * GET   /:userId/intel                       — fetch stored Intel report
 * POST  /:userId/intel/generate              — trigger on-demand full generation (own profile only)
 * PATCH /:userId/intel/section/:sectionId    — regenerate a single section in-place (own profile only)
 */

import { Router, type Request, type Response } from 'express';
import { appGuard, optionalAuth } from '../../middleware/auth/auth.middleware.js';
import { logger } from '../../utils/logger.js';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { forbiddenError, validationError } from '@nxt1/core/errors';

const VALID_ATHLETE_SECTIONS = new Set([
  'agent_x_brief',
  'athletic_measurements',
  'season_stats',
  'recruiting_activity',
  'academic_profile',
  'awards_honors',
]);

const router = Router();

// ─── GET /:userId/intel ───────────────────────────────────────────────────────

router.get(
  '/:userId/intel',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const db = req.firebase!.db;

    const { IntelGenerationService } =
      await import('../../modules/agent/services/intel.service.js');
    const intelService = new IntelGenerationService();
    const report = await intelService.getAthleteIntel(userId, db);

    res.json({ success: true, data: report });
  })
);

// ─── POST /:userId/intel/generate ─────────────────────────────────────────────

router.post(
  '/:userId/intel/generate',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const authUid = req.user!.uid;
    const db = req.firebase!.db;

    if (authUid !== userId) {
      sendError(res, forbiddenError('owner'));
      return;
    }

    const { IntelGenerationService } =
      await import('../../modules/agent/services/intel.service.js');
    const intelService = new IntelGenerationService();
    const report = await intelService.generateAthleteIntel(userId, db);

    logger.info('[Profile] Intel generated', { userId });
    res.json({
      success: true,
      status: 'ready',
      message: 'Intel report generated successfully',
      reportId: (report as Record<string, unknown>)['id'],
      data: report,
    });
  })
);

// ─── PATCH /:userId/intel/section/:sectionId ──────────────────────────────────

router.patch(
  '/:userId/intel/section/:sectionId',
  appGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, sectionId } = req.params as { userId: string; sectionId: string };
    const authUid = req.user!.uid;
    const db = req.firebase!.db;

    if (authUid !== userId) {
      sendError(res, forbiddenError('owner'));
      return;
    }

    if (!VALID_ATHLETE_SECTIONS.has(sectionId)) {
      sendError(
        res,
        validationError([
          {
            field: 'sectionId',
            message: `Invalid section id "${sectionId}". Valid sections: ${[...VALID_ATHLETE_SECTIONS].join(', ')}`,
            rule: 'enum',
          },
        ])
      );
      return;
    }

    const { IntelGenerationService } =
      await import('../../modules/agent/services/intel.service.js');
    const intelService = new IntelGenerationService();

    // Cast is safe — we validated sectionId against the valid set above
    const report = await intelService.updateAthleteIntelSection(
      userId,
      sectionId as Parameters<typeof intelService.updateAthleteIntelSection>[1],
      db
    );

    logger.info('[Profile] Intel section updated', { userId, sectionId });
    res.json({
      success: true,
      status: 'ready',
      message: `Section "${sectionId}" updated successfully`,
      sectionId,
      data: report,
    });
  })
);

export default router;
