import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '@nxt1/core/errors/express';
import { adminGuard } from '../../middleware/auth/auth.middleware.js';
import { getPushDripReport } from '../../services/marketing/lifecycle/push-drip-report.service.js';

const router = Router();

function parseLookbackDays(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return undefined;
  }

  return Math.max(1, Math.min(Math.floor(normalized), 30));
}

router.get(
  '/reports/push-drip',
  adminGuard,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const report = await getPushDripReport({
      db: req.firebase!.db,
      lookbackDays: parseLookbackDays(req.query['lookbackDays']),
    });

    res.json({ success: true, data: report });
  })
);

export default router;
