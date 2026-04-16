/**
 * @fileoverview Agent X Playbook & Briefing Routes
 * @module @nxt1/backend/routes/agent-x/playbook
 *
 * Routes: /playbook/generate, /playbook/item/:id/status, /briefing/generate
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import {
  UpdatePlaybookItemStatusDto,
  GenerateBriefingDto,
} from '../../dtos/agent-x.dto.js';
import type { ShellWeeklyPlaybookItem } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import {
  executeBillingDeduction,
  UsageFeature,
  resolveBillingTarget,
  checkBudgetFromContext,
} from '../../modules/billing/index.js';
import {
  getAuthUser,
  getGenerationService,
} from './shared.js';
import crypto from 'node:crypto';

const router = Router();

router.post('/playbook/generate', appGuard, async (req: Request, res: Response) => {
  const playbookOpId = `playbook-${crypto.randomUUID()}`;
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (req.firebase?.db) {
      const playbookTarget = await resolveBillingTarget(req.firebase.db, user.uid);
      const playbookCtx = playbookTarget.context;
      const playbookBudgetCheck = checkBudgetFromContext(playbookCtx);
      if (!playbookBudgetCheck.allowed) {
        const isWalletUser =
          playbookCtx.billingEntity === 'individual' && playbookCtx.paymentProvider === 'iap';
        res.status(402).json({
          success: false,
          error: playbookBudgetCheck.reason,
          code: isWalletUser ? 'WALLET_EMPTY' : 'BUDGET_EXCEEDED',
        });
        return;
      }
    }

    const result = await getGenerationService().generatePlaybook(
      user.uid,
      req.firebase?.db,
      playbookOpId
    );

    // Billing deduction (fire-and-forget)
    if (req.firebase?.db) {
      void executeBillingDeduction({
        db: req.firebase.db,
        userId: user.uid,
        operationId: playbookOpId,
        feature: UsageFeature.PLAYBOOK_GENERATION,
        environment: (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production') as
          | 'production'
          | 'staging',
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.message.includes('Set at least one goal')) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    if (error.message.includes('AI playbook generation unavailable')) {
      res.status(503).json({ success: false, error: 'AI playbook generation unavailable' });
      return;
    }
    logger.error('Failed to generate playbook', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to generate playbook' });
  }
});

// ─── POST /playbook/item/:id/status — Update a playbook item's status ─────
//
// Allows users (or Agent X) to mark a playbook item as complete, in-progress,
// or problem. Uses a Firestore transaction to prevent concurrent-update races.

router.post(
  '/playbook/item/:id/status',
  appGuard,
  validateBody(UpdatePlaybookItemStatusDto),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const itemId = req.params['id'];
      if (!itemId || typeof itemId !== 'string') {
        res.status(400).json({ success: false, error: 'Item ID is required' });
        return;
      }

      const { status } = req.body as { status: ShellWeeklyPlaybookItem['status'] };
      const { db } = req.firebase!;
      const playbooksRef = db.collection('Users').doc(user.uid).collection('agent_playbooks');

      // Find the latest playbook doc ref outside the transaction (immutable query)
      const latestPlaybook = await playbooksRef.orderBy('generatedAt', 'desc').limit(1).get();
      if (latestPlaybook.empty) {
        res.status(404).json({ success: false, error: 'No playbook found' });
        return;
      }

      const playbookRef = latestPlaybook.docs[0].ref;

      // Use a transaction to atomically read-modify-write the items array,
      // preventing concurrent status updates from silently overwriting each other.
      const updatedItem = await db.runTransaction(async (tx) => {
        const doc = await tx.get(playbookRef);
        const items = (doc.data()?.['items'] ?? []) as ShellWeeklyPlaybookItem[];
        const itemIndex = items.findIndex((i) => i.id === itemId);

        if (itemIndex === -1) return null;

        const patched: ShellWeeklyPlaybookItem = { ...items[itemIndex], status };
        const updatedItems = items.map((item, idx) => (idx === itemIndex ? patched : item));
        tx.update(playbookRef, { items: updatedItems });
        return patched;
      });

      if (!updatedItem) {
        res.status(404).json({ success: false, error: `Playbook item "${itemId}" not found` });
        return;
      }

      logger.info('Playbook item status updated', {
        userId: user.uid,
        itemId,
        status,
      });

      res.json({ success: true, data: updatedItem });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to update playbook item status', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to update playbook item status' });
    }
  }
);

// ─── POST /briefing/generate — Generate or refresh daily AI briefing ───────
//
// Generates a personalized daily briefing from the user's goals, recent
// operations, and delta sync data. Persists to agent_briefings subcollection
// and prunes old entries (keep last 7 days worth).

router.post(
  '/briefing/generate',
  appGuard,
  validateBody(GenerateBriefingDto),
  async (req: Request, res: Response) => {
    const briefingOpId = `briefing-${crypto.randomUUID()}`;
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { force = false } = req.body as { force?: boolean };

      if (req.firebase?.db) {
        const briefingTarget = await resolveBillingTarget(req.firebase.db, user.uid);
        const briefingCtx = briefingTarget.context;
        const briefingBudgetCheck = checkBudgetFromContext(briefingCtx);
        if (!briefingBudgetCheck.allowed) {
          const isWalletUser =
            briefingCtx.billingEntity === 'individual' && briefingCtx.paymentProvider === 'iap';
          res.status(402).json({
            success: false,
            error: briefingBudgetCheck.reason,
            code: isWalletUser ? 'WALLET_EMPTY' : 'BUDGET_EXCEEDED',
          });
          return;
        }
      }

      const result = await getGenerationService().generateBriefing(
        user.uid,
        force,
        req.firebase?.db,
        briefingOpId
      );

      // Billing deduction (fire-and-forget)
      if (req.firebase?.db) {
        void executeBillingDeduction({
          db: req.firebase.db,
          userId: user.uid,
          operationId: briefingOpId,
          feature: UsageFeature.BRIEFING_GENERATION,
          environment: (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production') as
            | 'production'
            | 'staging',
        });
      }

      res.json({ success: true, data: result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to generate briefing', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to generate briefing' });
    }
  }
);

// ─── POST /pause — Pause the entire queue (admin only) ────────────────────

export default router;
