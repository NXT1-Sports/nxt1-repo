/**
 * @fileoverview Monthly Billing Reset — Reset all billing contexts
 * @module @nxt1/functions/scheduled/monthlyBillingReset
 *
 * Runs at midnight UTC on the 1st of each month.
 * Resets currentPeriodSpend and notification flags for all billing contexts.
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();

const BILLING_CONTEXTS_COLLECTION = 'billingContexts';
const TEAM_BUDGET_ALLOCATIONS_COLLECTION = 'teamBudgetAllocations';
const BATCH_SIZE = 450;

/**
 * Monthly billing reset — resets spend counters for all billing contexts.
 * Runs at 00:00 UTC on the 1st of every month.
 */
export const monthlyBillingReset = onSchedule(
  {
    schedule: '0 0 1 * *',
    timeZone: 'UTC',
    retryCount: 3,
  },
  async () => {
    logger.info('Starting monthly billing reset');

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    try {
      const snapshot = await db.collection(BILLING_CONTEXTS_COLLECTION).get();

      let batch = db.batch();
      let count = 0;
      let batchCount = 0;

      for (const doc of snapshot.docs) {
        batch.update(doc.ref, {
          currentPeriodSpend: 0,
          periodStart,
          periodEnd,
          notified50: false,
          notified80: false,
          notified100: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
        count++;
        batchCount++;

        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      logger.info('Monthly billing reset complete', { count, periodStart, periodEnd });

      // ── Reset team budget allocations ─────────────────────────────────
      const allocSnap = await db.collection(TEAM_BUDGET_ALLOCATIONS_COLLECTION).get();

      let allocBatch = db.batch();
      let allocCount = 0;
      let allocBatchCount = 0;

      for (const doc of allocSnap.docs) {
        allocBatch.update(doc.ref, {
          currentPeriodSpend: 0,
          periodStart,
          periodEnd,
          notified50: false,
          notified80: false,
          notified100: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
        allocCount++;
        allocBatchCount++;

        if (allocBatchCount >= BATCH_SIZE) {
          await allocBatch.commit();
          allocBatch = db.batch();
          allocBatchCount = 0;
        }
      }

      if (allocBatchCount > 0) {
        await allocBatch.commit();
      }

      logger.info('Monthly team allocation reset complete', { allocCount, periodStart, periodEnd });
    } catch (error) {
      logger.error('Monthly billing reset failed', { error });
      throw error;
    }
  }
);
