/**
 * @fileoverview Apple In-App Purchase Service
 * @module @nxt1/backend/modules/billing
 *
 * Verifies Apple IAP receipts and credits the user's prepaid wallet.
 *
 * Flow:
 *   Mobile client completes IAP → sends receipt to backend
 *   → backend verifies with App Store API
 *   → on success, calls topUpWallet() with idempotency (transactionId)
 *   → returns new wallet balance to client
 *
 * Product ID → credit mapping (cents):
 *   com.nxt1.credits_100  → $1.00 (100 cents)
 *   com.nxt1.credits_500  → $5.00 (500 cents)
 *   com.nxt1.credits_1000 → $10.00 (1000 cents)
 *   com.nxt1.credits_2500 → $25.00 (2500 cents)
 *   com.nxt1.credits_5000 → $50.00 (5000 cents)
 */

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';
import { topUpWallet } from './wallet.service.js';

// ============================================
// TYPES
// ============================================

export interface IAPVerifyInput {
  /** Base64-encoded receipt data from StoreKit */
  receiptData: string;
  /** User ID to credit */
  userId: string;
  /** Optional: client-reported product ID for quick validation */
  productId?: string;
  /** Optional: client-reported transaction ID for idempotency hint */
  transactionId?: string;
}

export interface IAPVerifyResult {
  success: boolean;
  /** Amount credited in cents */
  creditedCents?: number;
  /** New wallet balance in cents */
  newBalanceCents?: number;
  /** Apple transaction ID (for idempotency records) */
  transactionId?: string;
  error?: string;
  /** 'already_processed' means this receipt was already applied */
  errorCode?: 'already_processed' | 'invalid_receipt' | 'product_not_found' | 'server_error';
}

export interface AppleVerifyReceiptResponse {
  status: number;
  receipt?: {
    in_app: AppleInAppPurchase[];
  };
  latest_receipt_info?: AppleInAppPurchase[];
}

export interface AppleInAppPurchase {
  product_id: string;
  transaction_id: string;
  original_transaction_id: string;
  purchase_date_ms: string;
  expires_date_ms?: string;
  cancellation_date?: string;
}

// ============================================
// PRODUCT MAPPING
// ============================================

/**
 * Maps Apple product IDs to wallet credit amounts in cents.
 * Update this map when adding new IAP products in App Store Connect.
 */
export const IAP_PRODUCT_CREDITS: Record<string, number> = {
  'com.nxt1.credits_100': 100,
  'com.nxt1.credits_500': 500,
  'com.nxt1.credits_1000': 1000,
  'com.nxt1.credits_2500': 2500,
  'com.nxt1.credits_5000': 5000,
};

function getCreditForProduct(productId: string): number | null {
  return IAP_PRODUCT_CREDITS[productId] ?? null;
}

// ============================================
// APPLE RECEIPT VERIFICATION
// ============================================

const APPLE_VERIFY_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_PRODUCTION = 'https://buy.itunes.apple.com/verifyReceipt';

/**
 * Verify a receipt with Apple's servers.
 * Apple recommends hitting production first; if status=21007, retry with sandbox.
 *
 * Status codes:
 *   0    = valid
 *   21007 = receipt is from sandbox (retry with sandbox URL)
 *   21008 = receipt is from production (retry with production URL)
 *   21002 = malformed receipt data
 *   21003 = receipt could not be authenticated
 *   others = error
 */
async function verifyWithApple(
  receiptData: string,
  environment: 'production' | 'sandbox'
): Promise<AppleVerifyReceiptResponse> {
  const sharedSecret = process.env['APPLE_SHARED_SECRET'] ?? process.env['APPLE_IAP_SHARED_SECRET'];
  if (!sharedSecret) {
    throw new Error('APPLE_SHARED_SECRET is not configured');
  }

  const url = environment === 'production' ? APPLE_VERIFY_PRODUCTION : APPLE_VERIFY_SANDBOX;

  const body: Record<string, string> = {
    'receipt-data': receiptData,
    password: sharedSecret,
    'exclude-old-transactions': 'true',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Apple API HTTP error ${response.status}`);
  }

  return response.json() as Promise<AppleVerifyReceiptResponse>;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Verify an Apple IAP receipt and credit the user's wallet.
 *
 * This function is idempotent: calling it twice with the same receipt
 * will not double-credit (enforced via Firestore `iapLogs` collection
 * keyed on Apple `transactionId`).
 *
 * @param db Firestore instance
 * @param input IAP verification input
 */
export async function verifyAndCreditIAP(
  db: Firestore,
  input: IAPVerifyInput
): Promise<IAPVerifyResult> {
  const { receiptData, userId } = input;

  if (!receiptData) {
    return { success: false, error: 'Receipt data is required', errorCode: 'invalid_receipt' };
  }

  try {
    // Step 1: Try production first
    let appleResponse = await verifyWithApple(receiptData, 'production');

    // Step 2: If status=21007 (sandbox receipt), retry with sandbox
    if (appleResponse.status === 21007) {
      logger.info('[iap] Sandbox receipt detected, retrying with sandbox URL', { userId });
      appleResponse = await verifyWithApple(receiptData, 'sandbox');
    }

    if (appleResponse.status !== 0) {
      logger.warn('[iap] Apple receipt verification failed', {
        userId,
        status: appleResponse.status,
      });
      return {
        success: false,
        error: `Apple verification failed with status ${appleResponse.status}`,
        errorCode: 'invalid_receipt',
      };
    }

    // Step 3: Find the most recent in-app purchase in receipt
    const purchases = appleResponse.latest_receipt_info ?? appleResponse.receipt?.in_app ?? [];

    if (purchases.length === 0) {
      return {
        success: false,
        error: 'No purchases found in receipt',
        errorCode: 'invalid_receipt',
      };
    }

    // Sort by purchase date descending and pick the latest non-cancelled purchase
    const sorted = [...purchases]
      .filter((p) => !p.cancellation_date)
      .sort((a, b) => Number(b.purchase_date_ms) - Number(a.purchase_date_ms));

    const latest = sorted[0];
    if (!latest) {
      return { success: false, error: 'No valid purchase found', errorCode: 'invalid_receipt' };
    }

    const { product_id: productId, transaction_id: transactionId } = latest;

    // Step 4: Validate product ID
    const creditCents = getCreditForProduct(productId);
    if (creditCents === null) {
      logger.warn('[iap] Unknown product ID', { userId, productId });
      return {
        success: false,
        error: `Unknown product ID: ${productId}`,
        errorCode: 'product_not_found',
      };
    }

    // Step 5: Credit wallet (topUpWallet handles idempotency via transactionId)
    const walletResult = await topUpWallet(db, userId, creditCents, transactionId);

    if (!walletResult.success) {
      return {
        success: false,
        error: walletResult.error,
        errorCode: 'server_error',
      };
    }

    logger.info('[iap] Receipt verified and wallet credited', {
      userId,
      productId,
      transactionId,
      creditCents,
      newBalanceCents: walletResult.newBalanceCents,
    });

    // Log the IAP event (separate from idempotency record in iapLogs)
    await db.collection('iapEvents').add({
      userId,
      productId,
      transactionId,
      creditCents,
      verifiedAt: new Date().toISOString(),
      environment: appleResponse.status === 0 ? 'production' : 'sandbox',
    });

    return {
      success: true,
      creditedCents: creditCents,
      newBalanceCents: walletResult.newBalanceCents,
      transactionId,
    };
  } catch (error) {
    logger.error('[iap] Verification error', { userId, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'server_error',
    };
  }
}
