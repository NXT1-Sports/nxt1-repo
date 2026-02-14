/**
 * @fileoverview Reconciliation Script
 * @module @nxt1/backend/scripts
 *
 * Script to reconcile pending/failed usage events with Stripe
 * Should be run as a scheduled job (e.g., Cloud Scheduler)
 */

import admin from 'firebase-admin';
import { logger } from '../src/utils/logger.js';
import { db } from '../src/utils/firebase.js';
import { stagingDb } from '../src/utils/firebase-staging.js';
import { getPendingUsageEvents, UsageEventStatus } from '../src/modules/billing/usage.service.js';
import { publishUsageEvent } from '../src/modules/billing/pubsub.service.js';

/**
 * Reconcile pending events for an environment
 */
async function reconcileEnvironment(
  environment: 'staging' | 'production',
  dryRun: boolean = false
): Promise<void> {
  logger.info(`[reconcileEnvironment] Starting reconciliation for ${environment}`, {
    dryRun,
  });

  const firestore = environment === 'staging' ? stagingDb : db;

  try {
    // Get pending/failed events
    const pendingEvents = await getPendingUsageEvents(firestore, 1000);

    logger.info(`[reconcileEnvironment] Found pending events`, {
      count: pendingEvents.length,
      environment,
    });

    if (pendingEvents.length === 0) {
      logger.info('[reconcileEnvironment] No pending events to reconcile');
      return;
    }

    let requeued = 0;
    let skipped = 0;

    for (const event of pendingEvents) {
      try {
        // Skip events that are too recent (might still be processing)
        const createdTime = event.createdAt?.toDate?.()?.getTime() || 0;
        const now = Date.now();
        const ageMinutes = (now - createdTime) / 1000 / 60;

        if (ageMinutes < 5) {
          logger.info('[reconcileEnvironment] Event too recent, skipping', {
            eventId: event.id,
            ageMinutes,
          });
          skipped++;
          continue;
        }

        // Skip if too many retries
        if (event.retryCount && event.retryCount > 5) {
          logger.warn('[reconcileEnvironment] Event exceeded max retries', {
            eventId: event.id,
            retryCount: event.retryCount,
          });
          skipped++;
          continue;
        }

        if (dryRun) {
          logger.info('[reconcileEnvironment] DRY RUN - Would requeue event', {
            eventId: event.id,
            status: event.status,
            retryCount: event.retryCount,
          });
        } else {
          // Requeue event
          await publishUsageEvent(event.id, environment);
          logger.info('[reconcileEnvironment] Event requeued', {
            eventId: event.id,
          });
        }

        requeued++;
      } catch (error) {
        logger.error('[reconcileEnvironment] Failed to requeue event', {
          error,
          eventId: event.id,
        });
      }
    }

    logger.info('[reconcileEnvironment] Reconciliation complete', {
      environment,
      total: pendingEvents.length,
      requeued,
      skipped,
      dryRun,
    });
  } catch (error) {
    logger.error('[reconcileEnvironment] Reconciliation failed', {
      error,
      environment,
    });
    throw error;
  }
}

/**
 * Main reconciliation function
 */
async function runReconciliation(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const environment = process.argv.includes('--staging') ? 'staging' : 'production';

  logger.info('[runReconciliation] Starting reconciliation', {
    environment,
    dryRun,
  });

  try {
    await reconcileEnvironment(environment, dryRun);

    logger.info('[runReconciliation] Reconciliation completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('[runReconciliation] Reconciliation failed', {
      error,
    });
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runReconciliation();
}

export { reconcileEnvironment };
