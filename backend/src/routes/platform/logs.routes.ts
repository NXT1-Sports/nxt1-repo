/**
 * @fileoverview Client Log Ingestion Route
 * @module @nxt1/backend/routes/platform/logs
 *
 * POST /logs — Accepts batched log entries from the frontend RemoteTransport.
 * Forwards entries to the backend structured logger so they appear in server logs.
 *
 * This endpoint is intentionally unauthenticated (logs may be sent before auth).
 * Rate-limited at the API tier to prevent abuse.
 *
 * Request body: { logs: LogEntry[] }
 * Response:     { success: true, accepted: number }
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../../utils/logger.js';

const router = Router();

// ─── POST /logs ───────────────────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  try {
    const { logs } = req.body as { logs?: unknown[] };

    if (!Array.isArray(logs) || logs.length === 0) {
      res.status(400).json({ success: false, error: 'logs array is required' });
      return;
    }

    // Cap batch size to prevent abuse
    const MAX_BATCH = 100;
    const entries = logs.slice(0, MAX_BATCH);

    // Forward each client log entry to the server logger
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;

      const e = entry as Record<string, unknown>;
      const level = typeof e['level'] === 'string' ? e['level'] : 'info';
      const message = typeof e['message'] === 'string' ? e['message'] : String(e['message'] ?? '');
      const context = typeof e['context'] === 'string' ? e['context'] : '[client]';
      const rawData = e['data'];
      const data: Record<string, unknown> =
        typeof rawData === 'object' && rawData !== null ? (rawData as Record<string, unknown>) : {};

      const logMessage = `[CLIENT:${context}] ${message}`;

      switch (level) {
        case 'error':
        case 'fatal':
          logger.error(logMessage, data);
          break;
        case 'warn':
          logger.warn(logMessage, data);
          break;
        case 'debug':
          logger.debug(logMessage, data);
          break;
        default:
          logger.info(logMessage, data);
      }
    }

    res.json({ success: true, accepted: entries.length });
  } catch (err) {
    logger.error('[LogsRoute] Failed to process client logs', { message: String(err) });
    res.status(500).json({ success: false, error: 'Failed to process logs' });
  }
});

export default router;
