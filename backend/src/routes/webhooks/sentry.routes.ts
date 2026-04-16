/**
 * @fileoverview Sentry Webhook to Slack Route
 * @module @nxt1/backend/routes
 *
 * API endpoint to accept Sentry Internal Integration webhooks
 * and proxy them to Slack custom incoming webhooks.
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../../utils/logger.js';

const router = Router();

const SLACK_WEBHOOK_URL = process.env['SLACK_SENTRY_WEBHOOK_URL'] ?? '';

router.post('/', async (req: Request, res: Response) => {
  try {
    // Determine context from Sentry Webhook Payload
    const projectName = req.body.project_name || req.body.project || 'NXT1 Monorepo Web';
    const url = req.body.url;
    const event = req.body.event || {};
    const title = event.title || req.body.message || 'Unknown Exception';

    // Fallback if environment is not set
    const environment = event.environment || 'production';

    const slackMsg = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚨 Sentry Alert: ${projectName}`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Issue:* <${url || '#'}|${title}>\n*Environment:* ${environment}`,
          },
        },
      ],
    };

    // If Sentry sends culprit/stacktrace snippet, we can append it conditionally
    if (event.culprit) {
      slackMsg.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Location:* \`${event.culprit}\``,
        },
      });
    }

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMsg),
    });

    if (!response.ok) {
      const respText = await response.text();
      logger.error(`Slack webhook failed: ${response.status} ${respText}`);
      res.status(500).send('Failed to post to Slack');
      return;
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Failed to process Sentry webhook', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).send('Internal Error');
  }
});

export default router;
