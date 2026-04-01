/**
 * @fileoverview Apple In-App Purchase Routes
 * @module @nxt1/backend/routes/iap
 *
 * Handles Apple IAP consumable purchases for the NXT1 prepaid wallet.
 *
 * Two endpoints:
 *   POST /iap/verify-receipt   — Client calls this after a successful StoreKit 2 purchase.
 *                                We verify the JWS transaction, map productId → dollar amount,
 *                                and credit the user's wallet.
 *
 *   POST /iap/webhook          — Apple's App Store Server Notifications V2 S2S endpoint.
 *                                Apple sends DID_CONSUME, REFUND, etc.
 *                                We use SignedDataVerifier to authenticate the payload,
 *                                then reconcile wallet state.
 *
 * Product ID → dollar amount mapping (cents):
 *   nxt1.wallet.100  → $1.00  (100 cents)
 *   nxt1.wallet.500  → $5.00  (500 cents)
 *   nxt1.wallet.1000 → $10.00 (1000 cents)
 *   nxt1.wallet.2500 → $25.00 (2500 cents)
 *   nxt1.wallet.5000 → $50.00 (5000 cents)
 *
 * All product IDs and amounts live in WALLET_PRODUCTS below.
 * To add a new denomination, add one entry — no other changes needed.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Router, type Request, type Response } from 'express';
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { logger } from '../utils/logger.js';
import { addWalletTopUp, processWalletRefund } from '../modules/billing/budget.service.js';
import { IAPVerifyReceiptDto } from '../dtos/billing.dto.js';
import { FieldValue } from 'firebase-admin/firestore';

// Static import — resolved via tsconfig paths → root node_modules
import { Environment, SignedDataVerifier } from '@apple/app-store-server-library';

// ──────────────────────────────────────────────────────────────────────────────
// Apple Bundle / App constants
// ──────────────────────────────────────────────────────────────────────────────
const APPLE_BUNDLE_ID = process.env['APPLE_BUNDLE_ID'] ?? 'com.nxt1sports.nxt1';
const APPLE_APP_ID = parseInt(process.env['APPLE_APP_ID'] ?? '6446410344', 10);

// Resolve certs directory — stored alongside this file at src/routes/iap-certs/
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CERTS_DIR = path.join(__dirname, 'iap-certs');

const CERT_FILES = [
  'AppleIncRootCertificate.cer',
  'AppleComputerRootCertificate.cer',
  'AppleRootCA-G2.cer',
  'AppleRootCA-G3.cer',
] as const;

// Certificates loaded once on first use — no need to re-read disk on every request
let _cachedCerts: Buffer[] | null = null;

function loadAppleCerts(): Buffer[] {
  if (_cachedCerts) return _cachedCerts;
  _cachedCerts = CERT_FILES.map((file) => {
    const certPath = path.join(CERTS_DIR, file);
    if (!fs.existsSync(certPath)) {
      throw new Error(`Apple root CA certificate not found: ${certPath}`);
    }
    return fs.readFileSync(certPath);
  });
  return _cachedCerts;
}

// ──────────────────────────────────────────────────────────────────────────────
// Product ID → wallet amount mapping (cents)
// ──────────────────────────────────────────────────────────────────────────────
const WALLET_PRODUCTS: Record<string, number> = {
  'nxt1.wallet.100': 100, // $1.00
  'nxt1.wallet.500': 500, // $5.00
  'nxt1.wallet.1000': 1000, // $10.00
  'nxt1.wallet.2500': 2500, // $25.00
  'nxt1.wallet.5000': 5000, // $50.00
};

// ──────────────────────────────────────────────────────────────────────────────
// Helper: build a SignedDataVerifier for the correct environment
// ──────────────────────────────────────────────────────────────────────────────
async function buildVerifier(isStaging: boolean) {
  const certs = loadAppleCerts();
  const env = isStaging ? Environment.SANDBOX : Environment.PRODUCTION;
  // Disable online OCSP checks for sandbox — Apple's OCSP endpoint can be unreliable in sandbox
  const enableOnlineChecks = !isStaging;
  return new SignedDataVerifier(certs, enableOnlineChecks, env, APPLE_BUNDLE_ID, APPLE_APP_ID);
}

// ──────────────────────────────────────────────────────────────────────────────
// Router
// ──────────────────────────────────────────────────────────────────────────────
const router = Router();

/**
 * POST /api/v1/iap/verify-receipt
 *
 * Called by the mobile client after a successful StoreKit 2 purchase.
 * Body: { jwsTransaction: string }
 *
 * Flow:
 *   1. Verify the JWS transaction signature using Apple root CAs.
 *   2. Confirm the productId is a known wallet denomination.
 *   3. Credit the user's wallet via addWalletTopUp().
 *   4. Return { success, newBalance }.
 */
router.post(
  '/verify-receipt',
  appGuard,
  validateBody(IAPVerifyReceiptDto),
  async (req: Request, res: Response) => {
    const userId = req.user!.uid;
    const { jwsTransaction } = req.body as IAPVerifyReceiptDto;
    const db = req.firebase?.db;

    if (!db) {
      return res.status(500).json({ success: false, error: 'Firebase context unavailable' });
    }

    try {
      const verifier = await buildVerifier(!!req.isStaging);
      const transaction = await verifier.verifyAndDecodeTransaction(jwsTransaction);

      const productId = transaction.productId;
      if (!productId) {
        return res.status(400).json({ success: false, error: 'Transaction missing productId' });
      }

      const amountCents = WALLET_PRODUCTS[productId];
      if (amountCents === undefined) {
        logger.warn('[iap/verify-receipt] Unknown productId', { userId, productId });
        return res.status(400).json({
          success: false,
          error: `Unknown wallet product: ${productId}`,
        });
      }

      const transactionId = transaction.transactionId;
      if (!transactionId) {
        return res.status(400).json({ success: false, error: 'Transaction missing transactionId' });
      }

      // Idempotency guard — prevent replay attacks from crediting the wallet multiple times
      // for the same Apple transaction (e.g., client retries or intercepted JWS reuse).
      const txnDocRef = db.collection('iap_processed_transactions').doc(transactionId);
      const existing = await txnDocRef.get();
      if (existing.exists) {
        logger.warn('[iap/verify-receipt] Duplicate transaction — already processed', {
          userId,
          transactionId,
        });
        return res.status(200).json({
          success: true,
          alreadyProcessed: true,
          newBalance: existing.get('newBalance') as number,
          transactionId,
        });
      }

      const { newBalance } = await addWalletTopUp(db, userId, amountCents);

      // Persist the idempotency record after crediting
      await txnDocRef.set({
        userId,
        productId,
        amountCents,
        newBalance,
        processedAt: FieldValue.serverTimestamp(),
      });

      logger.info('[iap/verify-receipt] Wallet credited', {
        userId,
        productId,
        amountCents,
        newBalance,
        transactionId,
      });

      return res.status(200).json({
        success: true,
        productId,
        amountCents,
        newBalance,
        transactionId,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : 'UnknownError';
      logger.error('[iap/verify-receipt] Verification failed', {
        error: errMsg,
        errorName: errName,
        userId,
      });
      return res.status(400).json({
        success: false,
        error: errMsg || 'IAP verification failed',
      });
    }
  }
);

/**
 * POST /api/v1/iap/webhook
 *
 * Apple App Store Server Notifications V2 (S2S).
 * Apple sends signed JWS payloads for REFUND, REVOKE, etc.
 *
 * Currently supported notification types:
 *   REFUND          — Deduct from wallet (capped at zero, no negative balances)
 *   CONSUMPTION_REQUEST — Acknowledged; no wallet change needed (client already called verify-receipt)
 *   (all others)    — Acknowledged with 200, not acted upon
 *
 * Apple requires a 200 response within 5 seconds or it retries.
 */
router.post('/webhook', async (req: Request, res: Response) => {
  // webhookRawBodyMiddleware consumes the body stream before express.json() for all /webhook paths.
  // Parse from req.rawBody if req.body is empty.
  let parsedBody: { signedPayload?: string } = {};
  if (req.body && typeof req.body === 'object' && Object.keys(req.body as object).length > 0) {
    parsedBody = req.body as { signedPayload?: string };
  } else if (req.rawBody) {
    try {
      parsedBody = JSON.parse(req.rawBody) as { signedPayload?: string };
    } catch (_parseErr) {
      return res.status(400).json({ success: false, error: 'Invalid JSON body' });
    }
  }
  const { signedPayload } = parsedBody;

  if (!signedPayload) {
    return res.status(400).json({ success: false, error: 'Missing signedPayload' });
  }

  const db = req.firebase?.db;
  if (!db) {
    return res.status(500).json({ success: false, error: 'Firebase context unavailable' });
  }

  try {
    const verifier = await buildVerifier(!!req.isStaging);
    const notification = await verifier.verifyAndDecodeNotification(signedPayload);

    const type = notification.notificationType;
    const subtype = notification.subtype;

    logger.info('[iap/webhook] Received notification', { type, subtype });

    if (type === 'REFUND' && notification.data?.signedTransactionInfo) {
      const transaction = await verifier.verifyAndDecodeTransaction(
        notification.data.signedTransactionInfo
      );

      const productId = transaction.productId;
      const amountCents = productId ? (WALLET_PRODUCTS[productId] ?? 0) : 0;

      if (amountCents > 0) {
        // appAccountToken is the NXT1 userId set during StoreKit purchase initiation
        const rawToken = transaction.appAccountToken;
        if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
          logger.warn('[iap/webhook] REFUND missing valid appAccountToken — cannot attribute', {
            productId,
            amountCents,
            transactionId: transaction.transactionId,
          });
        } else {
          const userId = rawToken.trim();
          await processWalletRefund(db, userId, amountCents).catch((err: unknown) => {
            logger.error('[iap/webhook] Failed to process refund deduction', {
              error: err,
              userId,
              amountCents,
            });
          });
          logger.info('[iap/webhook] Refund processed', { userId, productId, amountCents });
        }
      }
    }

    // Always acknowledge immediately
    return res.status(200).json({ success: true, type });
  } catch (err) {
    logger.error('[iap/webhook] Failed to process notification', { error: err });
    // Return 200 anyway to prevent Apple retry storms for verification failures
    return res.status(200).json({ success: false, error: 'Notification processing failed' });
  }
});

export default router;
