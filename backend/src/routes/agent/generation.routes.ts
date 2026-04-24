/**
 * @fileoverview Agent X — Playbook & briefing generation routes.
 *
 * POST /playbook/generate
 * GET /playbook/generate/status/:operationId
 * POST /playbook/item/:id/status
 * POST /briefing/generate
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { aiRateLimit } from '../../middleware/rate-limit/rate-limit.middleware.js';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import { UpdatePlaybookItemStatusDto, GenerateBriefingDto } from '../../dtos/agent-x.dto.js';
import type { AgentJobPayload, ShellWeeklyPlaybookItem } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import {
  executeBillingDeduction,
  resolveBillingTarget,
  checkBudgetFromContext,
} from '../../modules/billing/index.js';
import { getAuthUser, getGenerationService, jobRepository, queueService } from './shared.js';

const router = Router();

// ─── POST /playbook/generate ──────────────────────────────────────────────

router.post('/playbook/generate', appGuard, aiRateLimit, async (req: Request, res: Response) => {
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

    const db = req.firebase?.db;
    if (!db || !queueService || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue is unavailable' });
      return;
    }

    const enqueuePayload: AgentJobPayload = {
      operationId: playbookOpId,
      userId: user.uid,
      intent: 'Generate weekly playbook',
      sessionId: crypto.randomUUID(),
      origin: 'user',
      agent: 'strategy_coordinator',
      context: {
        mode: 'playbook',
      },
    };

    await jobRepository.withDb(db).create(enqueuePayload);

    const environment = req.isStaging ? 'staging' : 'production';
    const jobId = await queueService.enqueuePlaybookGeneration(
      { operationId: playbookOpId, userId: user.uid },
      environment
    );

    res.status(202).json({
      success: true,
      data: {
        operationId: playbookOpId,
        jobId,
        status: 'queued',
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to enqueue playbook generation', {
      error: error.message,
      stack: error.stack,
    });

    if (req.firebase?.db && jobRepository) {
      await jobRepository
        .withDb(req.firebase.db)
        .markFailed(playbookOpId, error.message)
        .catch(() => undefined);
    }

    res.status(500).json({ success: false, error: 'Failed to enqueue playbook generation' });
  }
});

// ─── GET /playbook/generate/status/:operationId ───────────────────────────

router.get(
  '/playbook/generate/status/:operationId',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      // This endpoint is polled by clients; never allow HTTP caching/conditional 304
      // responses because polling must always observe fresh operation state.
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const operationId = req.params['operationId'];
      if (!operationId || typeof operationId !== 'string') {
        res.status(400).json({ success: false, error: 'Operation ID is required' });
        return;
      }

      if (!req.firebase?.db || !jobRepository) {
        res.status(503).json({ success: false, error: 'Agent job repository is unavailable' });
        return;
      }

      const job = await jobRepository.withDb(req.firebase.db).getById(operationId);
      if (!job || job.userId !== user.uid) {
        res.status(404).json({ success: false, error: 'Playbook operation not found' });
        return;
      }

      res.json({
        success: true,
        data: {
          operationId,
          status: job.status,
          result: job.result,
          error: job.error,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          completedAt: job.completedAt,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to fetch playbook generation status', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to fetch playbook generation status' });
    }
  }
);

// ─── POST /playbook/item/:id/status ───────────────────────────────────────

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

      const latestPlaybook = await playbooksRef.orderBy('generatedAt', 'desc').limit(1).get();
      if (latestPlaybook.empty) {
        res.status(404).json({ success: false, error: 'No playbook found' });
        return;
      }

      const playbookRef = latestPlaybook.docs[0].ref;

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

      logger.info('Playbook item status updated', { userId: user.uid, itemId, status });

      // ── Per-goal completion check ──────────────────────────────────────
      // When an item is marked complete, check whether ALL items for its
      // linked goal are now done.  If so, auto-mark the goal as completed
      // in goal_history so both levels stay in sync.
      if (status === 'complete' || status === 'snoozed') {
        const checkDoc = await playbooksRef.orderBy('generatedAt', 'desc').limit(1).get();
        if (!checkDoc.empty) {
          const allItems = (checkDoc.docs[0].data()?.['items'] ?? []) as ShellWeeklyPlaybookItem[];
          const nonSnoozed = allItems.filter((i) => i.status !== 'snoozed');
          const allDone = nonSnoozed.length > 0 && nonSnoozed.every((i) => i.status === 'complete');

          // Check per-goal completion (fire-and-forget, non-blocking)
          void (async () => {
            try {
              const goalHistoryRef = db
                .collection('Users')
                .doc(user.uid)
                .collection('goal_history');
              // Build a map of goalId → all items for that goal
              const goalItemMap = new Map<string, ShellWeeklyPlaybookItem[]>();
              for (const item of allItems) {
                if (item.goal?.id) {
                  const bucket = goalItemMap.get(item.goal.id) ?? [];
                  bucket.push(item);
                  goalItemMap.set(item.goal.id, bucket);
                }
              }

              const now = new Date().toISOString();
              const playbookId = checkDoc.docs[0].id;
              for (const [goalId, goalItems] of goalItemMap) {
                const nonSnoozedGoalItems = goalItems.filter((i) => i.status !== 'snoozed');
                const allGoalItemsDone =
                  nonSnoozedGoalItems.length > 0 &&
                  nonSnoozedGoalItems.every((i) => i.status === 'complete');
                const completedCount = goalItems.filter((i) => i.status === 'complete').length;
                const histDoc = await goalHistoryRef.doc(goalId).get();
                if (!histDoc.exists) continue;

                const completedItems = goalItems
                  .filter((i) => i.status === 'complete')
                  .map((i) => ({ id: i.id, title: i.title, completedAt: now }));
                const pendingItems = goalItems
                  .filter((i) => i.status !== 'complete' && i.status !== 'snoozed')
                  .map((i) => ({ id: i.id, title: i.title }));

                const update: Record<string, unknown> = {
                  itemsTotal: goalItems.length,
                  itemsCompleted: completedCount,
                  completedItems,
                  pendingItems,
                };

                if (allGoalItemsDone && !histDoc.data()?.['isCompleted']) {
                  update['isCompleted'] = true;
                  update['completedAt'] = now;
                  update['completionSource'] = 'all_items_done';
                  logger.info('Goal auto-completed via all items done', {
                    userId: user.uid,
                    goalId,
                    itemCount: goalItems.length,
                  });
                }

                await goalHistoryRef.doc(goalId).update(update);

                // ── Keep cycle record in sync ──────────────────────────────
                // Update the immutable cycle doc for this playbook so the
                // per-cycle audit trail reflects real-time item progress.
                try {
                  const cycleUpdate: Record<string, unknown> = {
                    itemsCompleted: completedCount,
                    itemsTotal: goalItems.length,
                    completedItems,
                    pendingItems,
                  };
                  if (allGoalItemsDone && !histDoc.data()?.['isCompleted']) {
                    cycleUpdate['isCompleted'] = true;
                    cycleUpdate['completedAt'] = now;
                  }
                  await goalHistoryRef
                    .doc(goalId)
                    .collection('cycles')
                    .doc(playbookId)
                    .update(cycleUpdate);
                } catch {
                  // Cycle doc may not exist for legacy playbooks — ignore
                }
              }
            } catch (goalErr) {
              logger.warn('Failed to auto-complete goal after item completion', {
                userId: user.uid,
                error: goalErr instanceof Error ? goalErr.message : String(goalErr),
              });
            }
          })();

          if (allDone) {
            logger.info('All playbook tasks complete — regenerating playbook', {
              userId: user.uid,
            });
            getGenerationService()
              .generateWeeklyPlaybook(user.uid, true)
              .catch((err) =>
                logger.warn('Playbook regeneration after all-complete failed', {
                  userId: user.uid,
                  error: err instanceof Error ? err.message : String(err),
                })
              );
          }
        }
      }

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

// ─── POST /briefing/generate ──────────────────────────────────────────────

router.post(
  '/briefing/generate',
  appGuard,
  aiRateLimit,
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

      if (req.firebase?.db) {
        void executeBillingDeduction({
          db: req.firebase.db,
          userId: user.uid,
          operationId: briefingOpId,
          feature: 'briefing-generation',
          coordinatorId: 'strategy_coordinator',
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

export default router;
