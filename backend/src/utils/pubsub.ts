/**
 * @fileoverview Shared Pub/Sub client factory
 * @module @nxt1/backend/utils
 *
 * Creates a PubSub client using the same Firebase credentials from .env,
 * so it works locally (with explicit credentials) and in production
 * (with Application Default Credentials fallback).
 */

import { PubSub } from '@google-cloud/pubsub';

/**
 * Create a PubSub client that auto-detects credentials from .env.
 *
 * Locally, FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 * (or their STAGING_ prefixed counterparts) are used.
 *
 * In deployed environments (Cloud Run, App Hosting), the default service
 * account is picked up automatically via Application Default Credentials.
 */
export function createPubSubClient(): PubSub {
  const environment = process.env['NODE_ENV'] || 'production';
  const isStaging = environment === 'staging';

  const projectId = isStaging
    ? process.env['STAGING_FIREBASE_PROJECT_ID']
    : process.env['FIREBASE_PROJECT_ID'];

  const clientEmail = isStaging
    ? process.env['STAGING_FIREBASE_CLIENT_EMAIL']
    : process.env['FIREBASE_CLIENT_EMAIL'];

  let privateKey = isStaging
    ? process.env['STAGING_FIREBASE_PRIVATE_KEY']
    : process.env['FIREBASE_PRIVATE_KEY'];

  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  // Use explicit credentials when available (local dev), otherwise
  // fall back to Application Default Credentials (deployed GCP).
  if (projectId && clientEmail && privateKey) {
    return new PubSub({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });
  }

  return new PubSub();
}
