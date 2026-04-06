/**
 * @fileoverview Auth Middleware
 * @module @nxt1/backend
 *
 * Firebase authentication middleware for protected routes.
 * Uses unified error handling from @nxt1/core.
 */

import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { auth as prodAuth } from '../utils/firebase.js';
import { unauthorizedError, forbiddenError } from '@nxt1/core/errors';
import { logger } from '../utils/logger.js';

/**
 * User information extracted from Firebase ID token
 */
export interface AuthenticatedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  photoURL?: string;
}

/**
 * Middleware to verify Firebase ID token
 * Extracts user information from Bearer token
 */
export async function appGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      const error = unauthorizedError('missing');
      res.status(401).json(error.toResponse());
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    if (!idToken) {
      const error = unauthorizedError('missing');
      res.status(401).json(error.toResponse());
      return;
    }

    // Use the Firebase instance injected by firebaseContext middleware
    // (stagingAuth for /staging/ routes, prodAuth otherwise)
    const firebaseAuth = req.firebase?.auth ?? prodAuth;
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);

    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      emailVerified: decodedToken.email_verified || false,
      displayName: decodedToken['name'],
      photoURL: decodedToken.picture,
    };

    next();
  } catch (error) {
    logger.error('[Auth] Token verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Provide specific error messages using unified error codes
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        const apiError = unauthorizedError('expired');
        res.status(401).json(apiError.toResponse());
        return;
      }
      if (error.message.includes('revoked')) {
        const apiError = unauthorizedError('revoked');
        res.status(401).json(apiError.toResponse());
        return;
      }
    }

    const apiError = unauthorizedError('invalid');
    res.status(401).json(apiError.toResponse());
  }
}

/**
 * Optional auth middleware - doesn't require authentication but extracts user if present
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];

      if (idToken) {
        const firebaseAuth = req.firebase?.auth ?? prodAuth;
        const decodedToken = await firebaseAuth.verifyIdToken(idToken);
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email || '',
          emailVerified: decodedToken.email_verified || false,
          displayName: decodedToken['name'],
          photoURL: decodedToken.picture,
        };
      }
    }

    next();
  } catch {
    // Token invalid but continue without user
    next();
  }
}

/**
 * Admin guard - requires user to be an admin
 */
export async function adminGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // First run standard auth
    await new Promise<void>((resolve, reject) => {
      appGuard(req, res, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });

    if (!req.user) {
      return;
    }

    // Check admin claim
    const firebaseAuth = req.firebase?.auth ?? prodAuth;
    const decodedToken = await firebaseAuth.verifyIdToken(
      req.headers.authorization!.split('Bearer ')[1]
    );

    if (!decodedToken['admin']) {
      const error = forbiddenError('admin');
      res.status(403).json(error.toResponse());
      return;
    }

    next();
  } catch (error) {
    logger.error('[Auth] Admin verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    const apiError = forbiddenError('admin');
    res.status(403).json(apiError.toResponse());
  }
}

/**
 * CRON guard — validates a shared secret from Cloud Scheduler.
 *
 * The secret is stored in `CRON_SECRET` env var (Firebase Secret Manager)
 * and passed by the Cloud Function in the `x-cron-secret` header.
 */
export function cronGuard(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-cron-secret'];
  const expected = process.env['CRON_SECRET'];

  if (!expected || typeof secret !== 'string') {
    const error = forbiddenError('permission');
    res.status(403).json(error.toResponse());
    return;
  }

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(secret, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const error = forbiddenError('permission');
    res.status(403).json(error.toResponse());
    return;
  }

  next();
}
