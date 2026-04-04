/**
 * @fileoverview Stripe Webhook Routes
 * @module @nxt1/backend/routes
 *
 * API endpoints for Stripe webhooks
 */

import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import { logger } from '../utils/logger.js';
import { verifyWebhookSignature, handleWebhookEvent } from '../modules/billing/index.js';

const router = Router();

/**
 * Middleware to get raw body for Stripe signature verification
 * Must be applied before any body parser
 */
export const webhookRawBodyMiddleware: RequestHandler = (req: Request, _res, next) => {
  if (req.originalUrl.includes('/webhook')) {
    let data = '';
    req.setEncoding('utf8');

    req.on('data', (chunk) => {
      data += chunk;
    });

    req.on('end', () => {
      req.rawBody = data;
      next();
    });
  } else {
    next();
  }
};

/**
 * POST /api/v1/webhook          ← production (STRIPE_WEBHOOK_SECRET)
 * POST /api/v1/staging/webhook  ← staging   (STRIPE_TEST_WEBHOOK_SECRET)
 *
 * Single handler — req.isStaging is set by firebaseContext middleware based on URL prefix.
 */
router.post('/', async (req: Request, res: Response) => {
  const environment = req.isStaging ? 'staging' : 'production';
  const tag = `[POST /webhook:${environment}]`;

  try {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      logger.error(`${tag} Missing stripe-signature header`);
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    const rawBody = req.rawBody || JSON.stringify(req.body);
    const event = verifyWebhookSignature(rawBody, signature as string, environment);

    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    await handleWebhookEvent(db, event, environment);

    logger.info(`${tag} Webhook processed successfully`, {
      eventType: event.type,
      eventId: event.id,
    });

    return res.json({ received: true });
  } catch (error) {
    logger.error(`${tag} Webhook processing failed`, { error });
    return res.status(400).json({
      error: 'Webhook processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
