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
 * POST /api/v1/billing/webhook
 * Stripe webhook endpoint for production
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      logger.error('[POST /webhook] Missing stripe-signature header');
      return res.status(400).json({
        error: 'Missing stripe-signature header',
      });
    }

    // Get raw body
    const rawBody = req.rawBody || JSON.stringify(req.body);

    // Verify signature and get event
    const event = verifyWebhookSignature(rawBody, signature as string, 'production');

    // Get Firebase context
    const db = req.firebase?.db;

    if (!db) {
      throw new Error('Firebase context not available');
    }

    // Handle event
    await handleWebhookEvent(db, event, 'production');

    logger.info('[POST /webhook] Webhook processed successfully', {
      eventType: event.type,
      eventId: event.id,
    });

    return res.json({ received: true });
  } catch (error) {
    logger.error('[POST /webhook] Webhook processing failed', {
      error,
    });

    return res.status(400).json({
      error: 'Webhook processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/billing/staging/webhook
 * Stripe webhook endpoint for staging
 */
router.post('/staging/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      logger.error('[POST /staging/webhook] Missing stripe-signature header');
      return res.status(400).json({
        error: 'Missing stripe-signature header',
      });
    }

    // Get raw body
    const rawBody = req.rawBody || JSON.stringify(req.body);

    // Verify signature and get event
    const event = verifyWebhookSignature(rawBody, signature as string, 'staging');

    // Get Firebase context (staging)
    const db = req.firebase?.db;

    if (!db) {
      throw new Error('Firebase context not available');
    }

    // Handle event
    await handleWebhookEvent(db, event, 'staging');

    logger.info('[POST /staging/webhook] Webhook processed successfully', {
      eventType: event.type,
      eventId: event.id,
    });

    return res.json({ received: true });
  } catch (error) {
    logger.error('[POST /staging/webhook] Webhook processing failed', {
      error,
    });

    return res.status(400).json({
      error: 'Webhook processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
