/**
 * @fileoverview Sentry Webhook to Slack Route
 * @module @nxt1/backend/routes
 *
 * API endpoint to accept Sentry Internal Integration webhooks
 * and proxy them to Slack custom incoming webhooks.
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../../../utils/logger.js';
import { sendSlackAlert } from '../../../services/platform/alert.service.js';

const router = Router();

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const body =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};
    const event =
      typeof body['event'] === 'object' && body['event'] !== null
        ? (body['event'] as Record<string, unknown>)
        : {};

    // Determine context from Sentry Webhook Payload
    const projectName =
      readString(body['project_name']) || readString(body['project']) || 'NXT1 Monorepo Web';
    const url = readString(body['url']);
    const title = readString(event['title']) || readString(body['message']) || 'Unknown Exception';

    // Fallback if environment is not set
    const environment = readString(event['environment']) || 'production';
    const culprit = readString(event['culprit']);

    const delivered = await sendSlackAlert({
      target: 'sentry',
      severity: 'critical',
      title: `Sentry Alert: ${projectName}`,
      summary: `Issue: <${url || '#'}|${title}>`,
      fields: [
        { label: 'Environment', value: environment },
        ...(culprit ? [{ label: 'Location', value: culprit }] : []),
      ],
      ...(url ? { linkText: 'Open in Sentry', linkUrl: String(url) } : {}),
    });

    if (!delivered) {
      res.status(500).send('Failed to post to Slack');
      return;
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Failed to process Sentry webhook', {
      error: error instanceof Error ? error.message : String(error),
      contentType: req.headers['content-type'],
      hasBody: req.body !== undefined,
    });
    res.status(500).send('Internal Error');
  }
});

export default router;
