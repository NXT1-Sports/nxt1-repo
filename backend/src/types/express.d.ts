/**
 * @fileoverview Express Type Extensions
 * @module @nxt1/backend
 *
 * Extends Express Request type with authenticated user information.
 * This enables type-safe access to req.user across all middleware and routes.
 */

import { AuthenticatedUser } from '../middleware/auth.middleware.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user information extracted from Firebase ID token.
       * Present when request passes through appGuard or optionalAuth middleware.
       */
      user?: AuthenticatedUser;
    }
  }
}

export {};
