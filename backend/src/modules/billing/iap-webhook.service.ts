/**
 * @fileoverview Apple App Store Server Notifications Webhook Handler
 * @module @nxt1/backend/modules/billing
 *
 * Handles App Store Server Notifications (v2) sent by Apple when subscription
 * or one-time purchase events occur.
 *
 * Relevant notification types for NXT1 prepaid top-ups:
 *   ONE_TIME_CHARGE  — consumable IAP purchase completed
 *   REFUND           — Apple issued a refund (debit wallet)
 *   DID_FAIL_TO_RENEW — (subscriptions) relevant for future use
 *
 * Apple sends a signed JWT (signedPayload) — we decode the payload
 * and process the embedded transaction info.
 *
 * Docs: https://developer.apple.com/documentation/appstoreservernotifications
 */

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from '../../utils/logger.js';
import { topUpWallet, refundWallet } from './wallet.service.js';
import { IAP_PRODUCT_CREDITS } from './iap.service.js';

// ============================================
// TYPES
// ============================================

/** Decoded App Store Server Notification v2 payload */
export interface AppStoreNotificationPayload {
  notificationType: AppStoreNotificationType;
  subtype?: string;
  notificationUUID: string;
  version: string;
  signedDate: number;
  data: {
    appAppleId: number;
    bundleId: string;
    bundleVersion: string;
    environment: 'Sandbox' | 'Production';
    signedTransactionInfo: string;
    signedRenewalInfo?: string;
  };
}

export type AppStoreNotificationType =
  | 'ONE_TIME_CHARGE'
  | 'REFUND'
  | 'CONSUMPTION_REQUEST'
  | 'DID_RENEW'
  | 'DID_FAIL_TO_RENEW'
  | 'EXPIRED'
  | 'SUBSCRIBED'
  | 'GRACE_PERIOD_EXPIRED'
  | 'OFFER_REDEEMED'
  | 'PRICE_INCREASE'
  | 'REVOKE'
  | 'TEST';

export interface AppStoreTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  quantity: number;
  type:
    | 'Auto-Renewable Subscription'
    | 'Non-Consumable'
    | 'Consumable'
    | 'Non-Renewing Subscription';
  appAccountToken?: string;
  revocationDate?: number;
  revocationReason?: number;
}

export interface IAPWebhookHandleResult {
  success: boolean;
  action: 'credited' | 'refunded' | 'ignored' | 'error';
  transactionId?: string;
  error?: string;
}

// ============================================
// JWT DECODING (WITHOUT SIGNATURE VERIFICATION)
// ============================================

/**
 * Decode a base64url-encoded JWT payload.
 * Apple signs with their own certificate chain — full verification requires
 * fetching Apple's public keys. For now we decode and log; add full
 * verification before production hardening.
 *
 * TODO: Implement full JWT signature verification using Apple root CA.
 */
function decodeJwtPayload<T>(jwt: string): T {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT structure');
  }

  const payloadB64 = parts[1]!;
  // Convert base64url → base64 → Buffer → JSON
  const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(decoded) as T;
}

// ============================================
// NOTIFICATION LOG (DEDUPLICATION)
// ============================================

async function hasNotificationBeenProcessed(
  db: Firestore,
  notificationUUID: string
): Promise<boolean> {
  const snap = await db.collection('appStoreNotificationLogs').doc(notificationUUID).get();
  return snap.exists;
}

async function markNotificationProcessed(
  db: Firestore,
  notificationUUID: string,
  data: Record<string, unknown>
): Promise<void> {
  await db
    .collection('appStoreNotificationLogs')
    .doc(notificationUUID)
    .set({
      ...data,
      processedAt: new Date().toISOString(),
    });
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Handle an App Store Server Notification.
 *
 * The caller (route handler) is responsible for:
 *   1. Reading the raw `signedPayload` from the request body
 *   2. Resolving the userId from `appAccountToken` in the transaction
 *      (set this token in StoreKit when initiating purchase on the client)
 *
 * @param db Firestore instance
 * @param signedPayload The JWT string from Apple's POST body
 */
export async function handleAppStoreNotification(
  db: Firestore,
  signedPayload: string
): Promise<IAPWebhookHandleResult> {
  let notificationUUID = 'unknown';

  try {
    // Decode outer notification payload
    const notification = decodeJwtPayload<AppStoreNotificationPayload>(signedPayload);
    notificationUUID = notification.notificationUUID;
    const { notificationType } = notification;

    logger.info('[iap-webhook] Received notification', {
      notificationType,
      notificationUUID,
      subtype: notification.subtype,
    });

    // Deduplicate
    if (await hasNotificationBeenProcessed(db, notificationUUID)) {
      logger.info('[iap-webhook] Notification already processed', { notificationUUID });
      return { success: true, action: 'ignored' };
    }

    // Decode transaction info
    const txInfo = decodeJwtPayload<AppStoreTransactionInfo>(
      notification.data.signedTransactionInfo
    );

    const { transactionId, productId, appAccountToken: userId } = txInfo;

    if (!userId) {
      logger.warn('[iap-webhook] No appAccountToken (userId) in transaction — cannot credit', {
        transactionId,
        productId,
      });
      await markNotificationProcessed(db, notificationUUID, {
        notificationType,
        transactionId,
        productId,
        result: 'no_user_id',
      });
      return { success: true, action: 'ignored' };
    }

    let result: IAPWebhookHandleResult;

    if (notificationType === 'ONE_TIME_CHARGE') {
      result = await handleOneTimeCharge(db, userId, productId, transactionId, notificationUUID);
    } else if (notificationType === 'REFUND') {
      result = await handleRefund(db, userId, productId, transactionId, notificationUUID);
    } else {
      logger.info('[iap-webhook] Notification type not handled — ignoring', { notificationType });
      await markNotificationProcessed(db, notificationUUID, {
        notificationType,
        transactionId,
        productId,
        result: 'ignored_type',
      });
      return { success: true, action: 'ignored' };
    }

    return result;
  } catch (error) {
    logger.error('[iap-webhook] Failed to handle notification', {
      notificationUUID,
      error,
    });
    return {
      success: false,
      action: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// HANDLERS
// ============================================

async function handleOneTimeCharge(
  db: Firestore,
  userId: string,
  productId: string,
  transactionId: string,
  notificationUUID: string
): Promise<IAPWebhookHandleResult> {
  const creditCents = IAP_PRODUCT_CREDITS[productId];

  if (creditCents === undefined) {
    logger.warn('[iap-webhook] Unknown product ID in ONE_TIME_CHARGE', { productId, userId });
    await markNotificationProcessed(db, notificationUUID, {
      notificationType: 'ONE_TIME_CHARGE',
      transactionId,
      productId,
      result: 'unknown_product',
    });
    return {
      success: false,
      action: 'error',
      transactionId,
      error: `Unknown product ID: ${productId}`,
    };
  }

  const walletResult = await topUpWallet(db, userId, creditCents, transactionId);

  await markNotificationProcessed(db, notificationUUID, {
    notificationType: 'ONE_TIME_CHARGE',
    transactionId,
    productId,
    userId,
    creditCents,
    walletSuccess: walletResult.success,
  });

  if (walletResult.success) {
    logger.info('[iap-webhook] Wallet credited via ONE_TIME_CHARGE', {
      userId,
      productId,
      creditCents,
      transactionId,
    });
    return { success: true, action: 'credited', transactionId };
  }

  return {
    success: false,
    action: 'error',
    transactionId,
    error: walletResult.error,
  };
}

async function handleRefund(
  db: Firestore,
  userId: string,
  productId: string,
  transactionId: string,
  notificationUUID: string
): Promise<IAPWebhookHandleResult> {
  const refundCents = IAP_PRODUCT_CREDITS[productId];

  if (refundCents === undefined) {
    logger.warn('[iap-webhook] Unknown product ID in REFUND', { productId, userId });
    await markNotificationProcessed(db, notificationUUID, {
      notificationType: 'REFUND',
      transactionId,
      productId,
      result: 'unknown_product',
    });
    return { success: true, action: 'ignored', transactionId };
  }

  // For refunds we DEDUCT from wallet (Apple clawed back the money)
  const walletResult = await refundWallet(
    db,
    userId,
    -refundCents,
    `Apple refund: ${transactionId}`
  );

  await markNotificationProcessed(db, notificationUUID, {
    notificationType: 'REFUND',
    transactionId,
    productId,
    userId,
    refundCents,
    walletSuccess: walletResult.success,
  });

  if (walletResult.success) {
    logger.info('[iap-webhook] Wallet debited via REFUND', {
      userId,
      productId,
      refundCents,
      transactionId,
    });
    return { success: true, action: 'refunded', transactionId };
  }

  return {
    success: false,
    action: 'error',
    transactionId,
    error: walletResult.error,
  };
}
