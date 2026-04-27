/**
 * @fileoverview Mongo scope middleware.
 * @module @nxt1/backend/middleware/mongo
 */

import type { NextFunction, Request, Response } from 'express';
import { runWithMongoEnvironmentScope } from './mongo-scope.context.js';
import { logger } from '../../utils/logger.js';

export function mongoScopeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const scope = req.isStaging ? 'staging' : 'production';
  logger.debug('Mongo environment scope resolved for request', {
    method: req.method,
    path: req.originalUrl,
    scope,
    isStagingRoute: req.isStaging === true,
  });
  runWithMongoEnvironmentScope(scope, next);
}
