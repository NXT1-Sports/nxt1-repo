/**
 * @fileoverview Health Check - Callable function
 * @module @nxt1/functions/util/healthCheck
 *
 * Simple health check for monitoring.
 */

import { onCall } from 'firebase-functions/v2/https';

/**
 * Simple health check callable function
 */
export const healthCheck = onCall(async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    environment: process.env['NODE_ENV'] || 'production',
  };
});
