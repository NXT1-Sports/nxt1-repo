/**
 * @fileoverview Expire Stale Wallet Holds — Sweeper Cron Job
 * @module @nxt1/functions/scheduled/expireStaleHolds
 *
 * Runs every 15 minutes to find and release wallet holds that were never
 * captured or released (e.g., OpenRouter timeout, Helicone webhook failure,
 * server crash mid-request).
 *
 * This prevents users from having funds permanently locked due to
 * third-party provider outages. The hold expiry duration is configurable
 * via the `AppConfig/billing` Firestore document (`holdExpiryMs`).
 *
 * Collections affected:
 * - `WalletHolds`      (marks stale holds as 'expired')
 * - `BillingContexts`  (releases pendingHoldsCents back to available balance)
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';

// ─── Constants ──────────────────────────────────────────────────────────────

const WALLET_HOLDS_COLLECTION = 'WalletHolds';
const BILLING_CONTEXTS_COLLECTION = 'BillingContexts';
const APP_CONFIG_BILLING_DOC = 'AppConfig/billing';

/** Fallback: 10 minutes if Firestore config document doesn't exist */
const DEFAULT_HOLD_EXPIRY_MS = 10 * 60 * 1000;

/** Max holds to process per invocation (Firestore batch limit safety) */
const BATCH_LIMIT = 200;

// ─── Helper ─────────────────────────────────────────────────────────────────

/**
 * Reads the holdExpiryMs from the dynamic AppConfig billing doc.
 * Falls back to DEFAULT_HOLD_EXPIRY_MS if the doc or field is missing.
 */
async function getHoldExpiryMs(db: FirebaseFirestore.Firestore): Promise<number> {
  try {
    const doc = await db.doc(APP_CONFIG_BILLING_DOC).get();
    if (doc.exists) {
      const data = doc.data();
      if (data && typeof data['holdExpiryMs'] === 'number' && data['holdExpiryMs'] > 0) {
        return data['holdExpiryMs'] as number;
      }
    }
  } catch (err) {
    logger.warn('Failed to read AppConfig billing doc, using default hold expiry', { err });
  }
  return DEFAULT_HOLD_EXPIRY_MS;
}

// ─── Scheduled Function ─────────────────────────────────────────────────────

/**
 * Expire stale wallet holds — runs every 15 minutes.
 *
 * 1. Queries `WalletHolds` for active holds older than the configured expiry.
 * 2. Batch-updates them to status 'expired'.
 * 3. Releases the held amount back on each user's billingContext.
 */
export const expireStaleWalletHolds = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    retryCount: 2,
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();
    const holdExpiryMs = await getHoldExpiryMs(db);
    const cutoff = new Date(Date.now() - holdExpiryMs);

    logger.info('Starting stale hold sweep', {
      holdExpiryMs,
      cutoffISO: cutoff.toISOString(),
    });

    // ── Step 1: Find stale holds ───────────────────────────────────────────

    const snapshot = await db
      .collection(WALLET_HOLDS_COLLECTION)
      .where('status', '==', 'active')
      .where('createdAt', '<', cutoff)
      .limit(BATCH_LIMIT)
      .get();

    if (snapshot.empty) {
      logger.info('No stale holds found');
      return;
    }

    // ── Step 2: Batch-mark holds as expired ────────────────────────────────

    const batch = db.batch();
    const holdsByUser = new Map<string, number>();
    let expiredCount = 0;

    for (const doc of snapshot.docs) {
      const hold = doc.data();
      const userId = hold['userId'] as string;
      const amountCents = (hold['amountCents'] as number) ?? 0;

      batch.update(doc.ref, {
        status: 'expired',
        resolvedAt: FieldValue.serverTimestamp(),
      });

      holdsByUser.set(userId, (holdsByUser.get(userId) ?? 0) + amountCents);
      expiredCount++;
    }

    await batch.commit();

    // ── Step 3: Release held funds on each user's billing context ──────────

    let releasedUsers = 0;

    for (const [userId, totalHeldCents] of holdsByUser) {
      try {
        const ctxSnap = await db
          .collection(BILLING_CONTEXTS_COLLECTION)
          .where('userId', '==', userId)
          .limit(1)
          .get();

        if (!ctxSnap.empty) {
          await ctxSnap.docs[0]!.ref.update({
            pendingHoldsCents: FieldValue.increment(-totalHeldCents),
            updatedAt: FieldValue.serverTimestamp(),
          });
          releasedUsers++;
        }
      } catch (err) {
        // Non-fatal: log and continue to next user
        logger.error('Failed to release hold for user', { userId, err });
      }
    }

    logger.info('Stale hold sweep complete', {
      expiredCount,
      releasedUsers,
      totalUsersAffected: holdsByUser.size,
    });
  }
);
