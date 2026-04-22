/**
 * @fileoverview Helicone Webhook Routes
 * @module @nxt1/backend/routes
 *
 * API endpoint for receiving Helicone cost reconciliation webhooks.
 * Helicone POSTs exact downstream LLM costs after each AI call completes,
 * allowing us to true-up or true-down the initially estimated charge.
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../../../utils/logger.js';
import {
  verifyHeliconeSignature,
  processHeliconeWebhook,
  type HeliconeWebhookPayload,
} from '../../../modules/billing/helicone-webhook.service.js';

const router = Router();

/**
 * POST /api/v1/helicone/webhook
 * Helicone cost reconciliation webhook
 *
 * Helicone sends a POST with the exact cost of each LLM call.
 * We correlate it with our usage event and adjust billing if needed.
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    // Verify signature if configured
    const signature = req.headers['helicone-signature'] as string | undefined;
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (process.env['HELICONE_WEBHOOK_SECRET']) {
      if (!signature) {
        logger.warn('[POST /helicone/webhook] Missing helicone-signature header');
        return res.status(401).json({ error: 'Missing helicone-signature header' });
      }

      const isValid = verifyHeliconeSignature(rawBody, signature);
      if (!isValid) {
        logger.warn('[POST /helicone/webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const db = req.firebase?.db;
    if (!db) {
      throw new Error('Firebase context not available');
    }

    const payload = req.body as HeliconeWebhookPayload;

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const result = await processHeliconeWebhook(db, payload);

    logger.info('[POST /helicone/webhook] Webhook processed', {
      reconciled: result.reconciled,
      usageEventId: result.usageEventId,
      adjustmentCents: result.adjustmentCents,
      reason: result.reason,
    });

    // Only return minimal acknowledgment — never expose billing internals
    return res.json({ received: true, reconciled: result.reconciled });
  } catch (error) {
    logger.error('[POST /helicone/webhook] Webhook processing failed', { error });

    // Never expose internal error details to external webhook callers
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
