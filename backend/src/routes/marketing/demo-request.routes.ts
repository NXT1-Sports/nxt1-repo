/**
 * @fileoverview Public Demo Request Routes
 * @module @nxt1/backend/routes/marketing
 *
 * POST /marketing/demo-request — public, unauthenticated lead capture from
 * the landing page hero. No appGuard: this must work for anonymous visitors.
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../../utils/logger.js';
import {
  submitDemoRequest,
  DemoRequestValidationError,
} from '../../services/marketing/demo-request.service.js';
import type { DemoRequestRole, DemoRequestSubmission, DemoRequestType } from '@nxt1/core';

const router = Router();

/**
 * Submit a public demo request.
 * POST /marketing/demo-request
 */
router.post('/demo-request', async (req: Request, res: Response): Promise<void> => {
  try {
    const environment = req.isStaging ? 'staging' : 'production';
    const body = req.body as {
      requestType?: DemoRequestType;
      name?: string;
      email?: string;
      organization?: string;
      role?: DemoRequestRole;
      sport?: string;
      preferredDemoDate?: string;
      preferredDemoTime?: string;
      notes?: string;
    };

    const submission: DemoRequestSubmission = {
      requestType: body.requestType,
      name: body.name ?? '',
      email: body.email ?? '',
      organization: body.organization ?? '',
      role: body.role,
      sport: body.sport,
      preferredDemoDate: body.preferredDemoDate,
      preferredDemoTime: body.preferredDemoTime,
      notes: body.notes,
    };

    const record = await submitDemoRequest(submission, environment);
    res.json({ success: true, data: record });
  } catch (err) {
    if (err instanceof DemoRequestValidationError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }

    logger.error('[DemoRequest] POST /demo-request failed', { error: String(err) });
    res.status(500).json({ success: false, error: 'Failed to submit demo request' });
  }
});

export default router;
