/**
 * @fileoverview Route Handler Utilities
 * @module @nxt1/backend
 *
 * Helper functions to reduce boilerplate in route handlers
 */

// import type { Request, Response, NextFunction } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';

/**
 * Firebase context interface
 */
export interface FirebaseContext {
  db: Firestore;
  auth: Auth;
  storage: Storage;
  isStaging: boolean;
}
