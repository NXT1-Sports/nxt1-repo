/**
 * @fileoverview Firebase Cloud Functions Entry Point
 * @module @nxt1/functions
 * @version 2.0.0
 *
 * Cloud Functions for NXT1 platform - triggers, scheduled tasks, and webhooks.
 * Uses shared @nxt1/core types for type safety across the platform.
 *
 * Architecture (2026 Best Practices):
 * ├── auth/         - Authentication triggers (user lifecycle)
 * ├── user/         - User data triggers (profile updates)
 * ├── notification/ - Notification triggers (push, email)
 * ├── scheduled/    - Cron/scheduled tasks
 * └── util/         - Utility/callable functions
 *
 * @see https://firebase.google.com/docs/functions/typescript
 */

import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';

// Initialize Firebase Admin (must be done before importing triggers)
admin.initializeApp();

// Set default options for all functions
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
  timeoutSeconds: 60,
  memory: '256MiB',
});

// ============================================
// EXPORT ALL FUNCTION MODULES
// ============================================

// Auth triggers (user lifecycle events)
export * from './auth';

// User triggers (profile/data changes)
export * from './user';

// Notification triggers (push, email)
export * from './notification';

// Email triggers (transactional & marketing)
// TODO: Enable when SMTP credentials are configured
// export * from './email';

// Scheduled/cron tasks
export * from './scheduled';

// Utility/callable functions
export * from './util';
