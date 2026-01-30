/**
 * @fileoverview Health Check HTTP - REST endpoint
 * @module @nxt1/functions/util/healthCheckHttp
 *
 * HTTP health check endpoint for uptime monitors.
 */

import { onRequest } from 'firebase-functions/v2/https';

/**
 * HTTP health check endpoint for monitoring
 */
export const healthCheckHttp = onRequest(async (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});
