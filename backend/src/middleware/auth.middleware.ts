/**
 * @fileoverview Auth Middleware
 * @module @nxt1/backend
 *
 * Firebase authentication middleware for protected routes.
 * Uses unified error handling from @nxt1/core.
 */

import type { Request, Response, NextFunction } from 'express';
import { auth } from '../utils/firebase.js';
import { unauthorizedError, forbiddenError } from '@nxt1/core/errors';

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

    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(idToken);

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
    console.error('[Auth] Token verification failed:', error);

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
        const decodedToken = await auth.verifyIdToken(idToken);
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
    const decodedToken = await auth.verifyIdToken(req.headers.authorization!.split('Bearer ')[1]);

    if (!decodedToken['admin']) {
      const error = forbiddenError('admin');
      res.status(403).json(error.toResponse());
      return;
    }

    next();
  } catch (error) {
    console.error('[Auth] Admin verification failed:', error);
    const apiError = forbiddenError('admin');
    res.status(403).json(apiError.toResponse());
  }
}
