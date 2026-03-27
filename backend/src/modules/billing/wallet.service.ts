/**
 * @fileoverview Wallet Service — Prepaid Balance for Individual Users
 * @module @nxt1/backend/modules/billing
 *
 * Manages a prepaid credit wallet stored in Firestore collection `wallets`.
 * - Individual users top-up via Apple IAP → balance credited here
 * - Each AI job deducts actual_cost × multiplier from the wallet
 * - Org / Team users do NOT use the wallet (postpaid via Stripe)
 */

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface Wallet {
  userId: string;
  /** Balance in cents (USD) */
  balanceCents: number;
  /** ISO timestamp of last update */
  updatedAt: FirebaseFirestore.FieldValue | string;
  /** ISO timestamp of creation */
  createdAt: FirebaseFirestore.FieldValue | string;
}

export interface WalletTopUpResult {
  success: boolean;
  newBalanceCents: number;
  error?: string;
}

export interface WalletDeductResult {
  success: boolean;
  /** Balance after deduction */
  newBalanceCents?: number;
  error?: string;
}

export interface WalletBalanceResult {
  balanceCents: number;
  /** Whether the wallet has enough funds for the given amount */
  sufficient: boolean;
}

const WALLETS_COLLECTION = 'wallets';

// ============================================
// INTERNAL HELPERS
// ============================================

async function getWalletRef(
  db: Firestore,
  userId: string
): Promise<FirebaseFirestore.DocumentReference> {
  return db.collection(WALLETS_COLLECTION).doc(userId);
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get the current wallet balance for a user.
 * Returns 0 if no wallet document exists yet.
 */
export async function getWalletBalance(db: Firestore, userId: string): Promise<number> {
  const ref = await getWalletRef(db, userId);
  const snap = await ref.get();
  if (!snap.exists) return 0;
  return (snap.data() as Wallet).balanceCents ?? 0;
}

/**
 * Check whether a user has sufficient balance for a given cost.
 *
 * @param db Firestore instance
 * @param userId User ID
 * @param requiredCents Amount needed in cents
 */
export async function checkSufficientBalance(
  db: Firestore,
  userId: string,
  requiredCents: number
): Promise<WalletBalanceResult> {
  const balanceCents = await getWalletBalance(db, userId);
  return {
    balanceCents,
    sufficient: balanceCents >= requiredCents,
  };
}

/**
 * Add funds to a user's prepaid wallet.
 * Called after successful Apple IAP verification.
 *
 * Uses a Firestore transaction to ensure atomicity.
 *
 * @param db Firestore instance
 * @param userId User ID
 * @param amountCents Amount to credit in cents
 * @param idempotencyKey Unique key (Apple transactionId) to prevent double credit
 */
export async function topUpWallet(
  db: Firestore,
  userId: string,
  amountCents: number,
  idempotencyKey: string
): Promise<WalletTopUpResult> {
  if (amountCents <= 0) {
    return { success: false, newBalanceCents: 0, error: 'Amount must be positive' };
  }

  // Check idempotency — did we already process this transaction?
  const iapLogRef = db.collection('iapLogs').doc(idempotencyKey);

  try {
    const result = await db.runTransaction(async (tx) => {
      const iapLogSnap = await tx.get(iapLogRef);
      if (iapLogSnap.exists) {
        // Already processed — return current balance without changing anything
        const walletRef = await getWalletRef(db, userId);
        const walletSnap = await tx.get(walletRef);
        const currentBalance = walletSnap.exists
          ? ((walletSnap.data() as Wallet).balanceCents ?? 0)
          : 0;
        return { alreadyProcessed: true, newBalanceCents: currentBalance };
      }

      const walletRef = await getWalletRef(db, userId);
      const walletSnap = await tx.get(walletRef);
      const ts = FieldValue.serverTimestamp();

      if (!walletSnap.exists) {
        tx.set(walletRef, {
          userId,
          balanceCents: amountCents,
          createdAt: ts,
          updatedAt: ts,
        });
      } else {
        tx.update(walletRef, {
          balanceCents: FieldValue.increment(amountCents),
          updatedAt: ts,
        });
      }

      // Mark IAP log as processed
      tx.set(iapLogRef, {
        userId,
        amountCents,
        processedAt: ts,
        type: 'top_up',
      });

      const currentBalance = walletSnap.exists
        ? ((walletSnap.data() as Wallet).balanceCents ?? 0)
        : 0;

      return { alreadyProcessed: false, newBalanceCents: currentBalance + amountCents };
    });

    if (result.alreadyProcessed) {
      logger.info('[wallet] Top-up already processed (idempotent)', { userId, idempotencyKey });
    } else {
      logger.info('[wallet] Top-up successful', {
        userId,
        amountCents,
        newBalanceCents: result.newBalanceCents,
      });
    }

    return { success: true, newBalanceCents: result.newBalanceCents };
  } catch (error) {
    logger.error('[wallet] Top-up failed', { userId, amountCents, idempotencyKey, error });
    return {
      success: false,
      newBalanceCents: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Deduct funds from a user's prepaid wallet.
 * Called after a job completes and cost is known.
 *
 * Fails without deducting if the balance would go below zero
 * (callers should call `checkSufficientBalance` before running jobs).
 *
 * @param db Firestore instance
 * @param userId User ID
 * @param amountCents Amount to deduct in cents
 * @param jobId Job ID for audit trail
 */
export async function deductFromWallet(
  db: Firestore,
  userId: string,
  amountCents: number,
  jobId: string
): Promise<WalletDeductResult> {
  if (amountCents <= 0) {
    return { success: true, newBalanceCents: await getWalletBalance(db, userId) };
  }

  const walletRef = await getWalletRef(db, userId);

  try {
    const newBalance = await db.runTransaction(async (tx) => {
      const walletSnap = await tx.get(walletRef);
      const currentBalance = walletSnap.exists
        ? ((walletSnap.data() as Wallet).balanceCents ?? 0)
        : 0;

      if (currentBalance < amountCents) {
        throw new Error(`Insufficient balance: ${currentBalance} < ${amountCents}`);
      }

      const ts = FieldValue.serverTimestamp();
      if (!walletSnap.exists) {
        tx.set(walletRef, {
          userId,
          balanceCents: 0,
          createdAt: ts,
          updatedAt: ts,
        });
      } else {
        tx.update(walletRef, {
          balanceCents: FieldValue.increment(-amountCents),
          updatedAt: ts,
        });
      }

      return currentBalance - amountCents;
    });

    logger.info('[wallet] Deduction successful', { userId, amountCents, newBalance, jobId });
    return { success: true, newBalanceCents: newBalance };
  } catch (error) {
    logger.error('[wallet] Deduction failed', { userId, amountCents, jobId, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Credit back an amount to the wallet (for refunds).
 *
 * @param db Firestore instance
 * @param userId User ID
 * @param amountCents Amount to refund in cents
 * @param reason Reason string for audit
 */
export async function refundWallet(
  db: Firestore,
  userId: string,
  amountCents: number,
  reason: string
): Promise<WalletTopUpResult> {
  const walletRef = await getWalletRef(db, userId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const walletSnap = await tx.get(walletRef);
      const ts = FieldValue.serverTimestamp();
      const currentBalance = walletSnap.exists
        ? ((walletSnap.data() as Wallet).balanceCents ?? 0)
        : 0;

      if (!walletSnap.exists) {
        tx.set(walletRef, { userId, balanceCents: amountCents, createdAt: ts, updatedAt: ts });
      } else {
        tx.update(walletRef, {
          balanceCents: FieldValue.increment(amountCents),
          updatedAt: ts,
        });
      }

      // Log refund
      await db.collection('walletRefunds').add({
        userId,
        amountCents,
        reason,
        refundedAt: ts,
      });

      return currentBalance + amountCents;
    });

    logger.info('[wallet] Refund applied', { userId, amountCents, reason, newBalance: result });
    return { success: true, newBalanceCents: result };
  } catch (error) {
    logger.error('[wallet] Refund failed', { userId, amountCents, reason, error });
    return {
      success: false,
      newBalanceCents: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
