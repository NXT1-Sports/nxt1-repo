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
import { postBackendCronJson } from './utils/backendCronRequest';

const CRON_SECRET = defineSecret('CRON_SECRET');
const BACKEND_URL = defineString('BACKEND_URL');
const FAILURE_ALERT_THRESHOLD = 3;
const HEALTH_DOC_PATH = 'CronHealth/reconcileAgentJobThreadLinks';

interface ReconcileFailureDetails {
  readonly reason: string;
  readonly status?: number;
  readonly body?: string;
}

function parseBackendFailureMessage(message: string): ReconcileFailureDetails {
  const match = /backend returned\s+(\d+)(?:\s+(.*))?$/i.exec(message);
  if (!match) {
    return { reason: message };
  }

  const status = Number(match[1]);
  const body = match[2]?.trim();

  return {
    reason: 'backend_non_ok',
    status: Number.isFinite(status) ? status : undefined,
    body: body && body.length > 0 ? body : undefined,
  };
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

    try {
      const result = await postBackendCronJson<{ data?: Record<string, unknown> }>({
        backendBaseUrl: BACKEND_URL.value(),
        endpointPath: '/api/v1/agent-x/cron/reconcile-job-thread-links',
        cronSecret: CRON_SECRET.value(),
        jobName: 'reconcileAgentJobThreadLinks',
        timeoutMs: 20_000,
        maxAttempts: 3,
      });

      if (!result) {
        await handleFailure({ reason: 'backend_unavailable' });
        return;
      }

      await recordSuccess();
      logger.info('Agent job-thread link reconciliation completed', {
        result: result.data.data ?? null,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (error.message.startsWith('Agent job-thread link reconciliation failed')) {
        logger.error('Agent job-thread link reconciliation escalation', {
          error: error.message,
        });
        throw error;
      }

      await handleFailure(parseBackendFailureMessage(error.message));
    }
  }
);
