/**
 * @fileoverview Firebase Context Middleware
 * @module @nxt1/backend
 *
 * Middleware to inject appropriate Firebase instances based on route
 */

import type { Request, Response, NextFunction } from 'express';

// Production Firebase
import { db, auth, storage } from '../utils/firebase.js';

// Staging Firebase
import { stagingDb, stagingAuth, stagingStorage } from '../utils/firebase-staging.js';

/**
 * Middleware to attach Firebase instances to request
 * Uses staging Firebase for /staging/ routes, production otherwise
 */
export const firebaseContext = (req: Request, _res: Response, next: NextFunction): void => {
  // Check full URL path for /staging/ to determine environment
  const isStaging = req.originalUrl.includes('/staging/') || req.originalUrl.includes('/staging');

  req.isStaging = isStaging;

  req.firebase = {
    db: isStaging ? stagingDb : db,
    auth: isStaging ? stagingAuth : auth,
    storage: isStaging ? stagingStorage : storage,
  };

  // Log for debugging (optional - remove in production)
  if (process.env['NODE_ENV'] !== 'production') {
    console.log(
      `[Firebase Context] ${req.method} ${req.originalUrl} → ${isStaging ? '🟡 STAGING' : '🟢 PRODUCTION'}`
    );
  }

  next();
};
