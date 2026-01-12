/**
 * @fileoverview Auth Middleware
 * @module @nxt1/backend
 *
 * Firebase authentication middleware for protected routes.
 */

import type { Request, Response, NextFunction } from 'express';
import { auth } from '../utils/firebase.js';

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
 * Extended Request type with authenticated user
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Middleware to verify Firebase ID token
 * Extracts user information from Bearer token
 */
export async function appGuard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
      });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    if (!idToken) {
      res.status(401).json({
        success: false,
        error: 'No token provided',
      });
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

    // Provide specific error messages
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        res.status(401).json({
          success: false,
          error: 'Token expired. Please sign in again.',
        });
        return;
      }
      if (error.message.includes('revoked')) {
        res.status(401).json({
          success: false,
          error: 'Token revoked. Please sign in again.',
        });
        return;
      }
    }

    res.status(401).json({
      success: false,
      error: 'Invalid authentication token',
    });
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
      res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('[Auth] Admin verification failed:', error);
    res.status(403).json({
      success: false,
      error: 'Admin access required',
    });
  }
}
