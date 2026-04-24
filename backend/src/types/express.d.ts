/**
 * @fileoverview Express Type Extensions
 * @module @nxt1/backend
 *
 * Extends Express Request type with authenticated user and Firebase context.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';
import { AuthenticatedUser } from '../middleware/auth/auth.middleware.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user information extracted from Firebase ID token.
       * Present when request passes through appGuard or optionalAuth middleware.
       */
      user?: AuthenticatedUser;

      /**
       * Firebase instances (db, auth, storage) injected by firebaseContext middleware.
       * Automatically switches between production and staging based on route.
       */
      firebase: {
        db: Firestore;
        auth: Auth;
        storage: Storage;
      };

      /**
       * Flag indicating if the current request is targeting staging environment.
       * True for /staging/ routes, false for production routes.
       */
      isStaging: boolean;

      /**
       * Raw body for Stripe webhook signature verification
       */
      rawBody?: string;
    }
  }
}

export {};
