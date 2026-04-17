/**
 * @fileoverview Global Vitest setup — initializes a stub Firebase app so that
 * module-level `getFirestore()` / `getStorage()` / `getAuth()` calls in
 * service files do not throw "default Firebase app does not exist" during test
 * collection.  All actual Firebase interactions in route tests are replaced by
 * the mock Firestore/Storage injected via `req.firebase` in test-app.ts.
 */
import { getApps, initializeApp } from 'firebase-admin/app';

if (getApps().length === 0) {
  initializeApp({ projectId: 'demo-test' });
}
