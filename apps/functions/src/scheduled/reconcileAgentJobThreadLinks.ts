/**
 * @fileoverview Reconcile Agent Job-Thread Links — Cloud Scheduler Entry Point
 * @module @nxt1/functions/scheduled/reconcileAgentJobThreadLinks
 *
 * Runs every 6 hours to repair missing `AgentJobs.threadId` values using
 * MongoDB message linkage (`operationId -> threadId`).
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');
const FAILURE_ALERT_THRESHOLD = 3;
const HEALTH_DOC_PATH = 'CronHealth/reconcileAgentJobThreadLinks';

interface ReconcileFailureDetails {
  readonly reason: string;
  readonly status?: number;
  readonly body?: string;
}

async function recordSuccess(): Promise<void> {
  await admin.firestore().doc(HEALTH_DOC_PATH).set(
    {
      consecutiveFailures: 0,
      lastSuccessAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function recordFailure(details: ReconcileFailureDetails): Promise<number> {
  const db = admin.firestore();
  const ref = db.doc(HEALTH_DOC_PATH);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.data();
    const previousFailures =
      typeof previous?.['consecutiveFailures'] === 'number' ? previous['consecutiveFailures'] : 0;
    const consecutiveFailures = previousFailures + 1;

    transaction.set(
      ref,
      {
        consecutiveFailures,
        lastFailureAt: admin.firestore.FieldValue.serverTimestamp(),
        lastFailureReason: details.reason,
        lastFailureStatus: details.status ?? null,
        lastFailureBody: details.body?.slice(0, 500) ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return consecutiveFailures;
  });
}

async function handleFailure(details: ReconcileFailureDetails): Promise<void> {
  const consecutiveFailures = await recordFailure(details);

  logger.warn('Agent job-thread link reconciliation skipped', {
    ...details,
    consecutiveFailures,
    alertThreshold: FAILURE_ALERT_THRESHOLD,
  });

  if (consecutiveFailures >= FAILURE_ALERT_THRESHOLD) {
    throw new Error(
      `Agent job-thread link reconciliation failed ${consecutiveFailures} times consecutively: ${details.reason}`
    );
  }
}

export const reconcileAgentJobThreadLinks = onSchedule(
  {
    schedule: '0 */6 * * *',
    timeZone: 'America/New_York',
    retryCount: 1,
    timeoutSeconds: 180,
    secrets: [CRON_SECRET],
  },
  async () => {
    logger.info('Starting agent job-thread link reconciliation');

    const url = `${BACKEND_URL.value()}/api/v1/agent-x/cron/reconcile-job-thread-links`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET.value(),
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        logger.warn('Backend returned non-OK response', {
          status: response.status,
          body: body.slice(0, 500),
        });
        await handleFailure({
          reason: 'backend_non_ok',
          status: response.status,
          body,
        });
        return;
      }

      const result = (await response.json()) as { data?: Record<string, unknown> };
      await recordSuccess();
      logger.info('Agent job-thread link reconciliation completed', {
        result: result.data ?? null,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (error.message.startsWith('Agent job-thread link reconciliation failed')) {
        logger.error('Agent job-thread link reconciliation escalation', {
          error: error.message,
        });
        throw error;
      }

      await handleFailure({ reason: error.message });
    }
  }
);
