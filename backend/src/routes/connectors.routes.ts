import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { CONNECTOR_IDS, type ConnectorId } from '@nxt1/core';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { validationError } from '@nxt1/core/errors';
import { appGuard } from '../middleware/auth/auth.middleware.js';
import { composioConnectorService } from '../services/platform/composio-connector.service.js';
import type { RuntimeEnvironment } from '../config/runtime-environment.js';

const router: RouterType = Router();
const connectorIds = new Set<string>(Object.values(CONNECTOR_IDS));

function resolveEnvironment(req: Request): RuntimeEnvironment {
  return req.isStaging ? 'staging' : 'production';
}

router.use(appGuard);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await composioConnectorService.getCatalog(req.user!.uid, resolveEnvironment(req));
    res.json({ success: true, data });
  })
);

router.post(
  '/:connectorId/authorize',
  asyncHandler(async (req: Request, res: Response) => {
    const connectorId = req.params['connectorId'] as string;
    if (!connectorIds.has(connectorId)) {
      sendError(
        res,
        validationError([{ field: 'connectorId', message: 'Unknown connector', rule: 'invalid' }])
      );
      return;
    }

    try {
      const data = await composioConnectorService.authorize(
        req.user!.uid,
        connectorId as ConnectorId,
        resolveEnvironment(req)
      );
      res.json({ success: true, data });
    } catch (error) {
      sendError(
        res,
        validationError([
          {
            field: 'connectorId',
            message: error instanceof Error ? error.message : 'Unable to authorize connector',
            rule: 'invalid',
          },
        ])
      );
    }
  })
);

export default router;
