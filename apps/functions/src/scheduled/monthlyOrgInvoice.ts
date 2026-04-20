/**
 * @fileoverview Monthly Org Invoice — Generate Stripe invoices for all Org/Team billing
 * @module @nxt1/functions/scheduled/monthlyOrgInvoice
 *
 * Runs at 23:00 UTC on days 28-31. An isLastDayOfMonth() guard ensures it
 * only executes once per month (on the actual last day). This fires BEFORE
 * the monthlyBillingReset (00:00 UTC on the 1st) so that currentPeriodSpend
 * is still populated when invoices are generated.
 *
 * Billing model:
 *   - Org master billing contexts: userId = 'org:<organizationId>'
 *   - Stripe customer is looked up from the 'StripeCustomers' collection
 *   - Invoice collection method: send_invoice / Net 30
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';

// ─── Firestore collections ────────────────────────────────────────────────────

const BILLING_CONTEXTS_COLLECTION = 'BillingContexts';
const STRIPE_CUSTOMERS_COLLECTION = 'StripeCustomers';
const PAYMENT_LOGS_COLLECTION = 'PaymentLogs';

// ─── Firebase project IDs ─────────────────────────────────────────────────────

const STAGING_PROJECT_ID = 'nxt-1-staging-v2';

// ─── Firebase Secrets ─────────────────────────────────────────────────────────

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeTestSecretKey = defineSecret('STRIPE_TEST_SECRET_KEY');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true only on the last calendar day of the current month (UTC).
 */
function isLastDayOfMonth(): boolean {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(now.getUTCDate() + 1);
  return now.getUTCMonth() !== tomorrow.getUTCMonth();
}

// ─── Scheduled Function ───────────────────────────────────────────────────────

/**
 * Monthly org invoice — generates Stripe invoices for all organizations/teams
 * with non-zero spend in the current billing period.
 *
 * Runs at 23:00 UTC on days 28–31 (last day of month guard applied in handler).
 */
export const monthlyOrgInvoice = onSchedule(
  {
    schedule: '0 23 28-31 * *',
    timeZone: 'UTC',
    retryCount: 2,
    secrets: [stripeSecretKey, stripeTestSecretKey],
  },
  async () => {
    // DISABLED: Orgs are now on a pre-paid wallet model. Credits are deducted
    // in real-time from the org wallet — there is no post-pay invoicing cycle.
    // Re-enable only if a post-pay invoicing model is reintroduced.
    logger.info('[monthlyOrgInvoice] Disabled — org wallet model active. Exiting.');
    return;

    if (!isLastDayOfMonth()) {
      logger.info('[monthlyOrgInvoice] Not the last day of month — skipping');
      return;
    }

    const isStaging = process.env['GCLOUD_PROJECT'] === STAGING_PROJECT_ID;
    const environment: 'staging' | 'production' = isStaging ? 'staging' : 'production';
    const secretKey = isStaging ? stripeTestSecretKey.value() : stripeSecretKey.value();

    if (!secretKey) {
      logger.error('[monthlyOrgInvoice] Stripe secret key not configured', { environment });
      return;
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover' as NonNullable<
        ConstructorParameters<typeof Stripe>[1]
      >['apiVersion'],
    });

    const db = admin.firestore();

    logger.info('[monthlyOrgInvoice] Starting monthly org invoice generation', { environment });

    // Query org master billing contexts (userId starts with 'org:')
    // Combined with billingEntity == 'organization' for index efficiency.
    const snapshot = await db
      .collection(BILLING_CONTEXTS_COLLECTION)
      .where('billingEntity', '==', 'organization')
      .where('userId', '>=', 'org:')
      .where('userId', '<', 'org:\uf8ff')
      .get();

    // In-memory filter for non-zero spend (avoids a second range field in Firestore query)
    const orgsWithSpend = snapshot.docs.filter(
      (doc) => ((doc.data()['currentPeriodSpend'] as number) ?? 0) > 0
    );

    logger.info('[monthlyOrgInvoice] Org billing contexts found', {
      total: snapshot.size,
      withSpend: orgsWithSpend.length,
    });

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    let invoiceCount = 0;
    let errorCount = 0;

    for (const doc of orgsWithSpend) {
      const ctx = doc.data();
      const billingUserId = ctx['userId'] as string;
      const spendCents = ctx['currentPeriodSpend'] as number;
      const organizationId = ctx['organizationId'] as string | undefined;

      try {
        // Look up Stripe customer for this org
        const customerQuery = await db
          .collection(STRIPE_CUSTOMERS_COLLECTION)
          .where('userId', '==', billingUserId)
          .where('environment', '==', environment)
          .limit(1)
          .get();

        if (customerQuery.empty) {
          logger.warn('[monthlyOrgInvoice] No Stripe customer found — skipping org', {
            billingUserId,
            organizationId,
          });
          continue;
        }

        const customerId = customerQuery.docs[0]!.data()['stripeCustomerId'] as string;
        const idempotencyKey = `monthly-invoice-${billingUserId}-${period}`;

        // Create pending invoice item for the period's total spend
        await stripe.invoiceItems.create(
          {
            customer: customerId,
            amount: spendCents,
            currency: 'usd',
            description: `Agent X usage — ${period}`,
          },
          { idempotencyKey }
        );

        // Create invoice with Net 30 send_invoice collection
        // NOTE: must set pending_invoice_items_behavior='include' — Stripe defaults
        // to 'exclude' for send_invoice, which would produce a $0 invoice.
        const invoice = await stripe.invoices.create({
          customer: customerId,
          auto_advance: false,
          collection_method: 'send_invoice',
          days_until_due: 30,
          pending_invoice_items_behavior: 'include',
        });

        // Finalize so Stripe sends the invoice email
        const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

        // Write payment log for audit trail
        await db.collection(PAYMENT_LOGS_COLLECTION).add({
          userId: billingUserId,
          organizationId: organizationId ?? null,
          customerId,
          invoiceId: finalizedInvoice.id,
          invoiceUrl: finalizedInvoice.hosted_invoice_url ?? null,
          amountCents: spendCents,
          currency: 'usd',
          status: 'invoiced',
          environment,
          billingPeriod: period,
          createdAt: FieldValue.serverTimestamp(),
        });

        invoiceCount++;
        logger.info('[monthlyOrgInvoice] Invoice generated', {
          billingUserId,
          organizationId,
          customerId,
          invoiceId: finalizedInvoice.id,
          spendCents,
        });
      } catch (err) {
        errorCount++;
        let errorMessage: string;
        if (err instanceof Error) {
          errorMessage = (err as Error).message;
        } else {
          errorMessage = String(err);
        }
        logger.error('[monthlyOrgInvoice] Failed to invoice org', {
          billingUserId,
          organizationId,
          error: errorMessage,
        });
        // Continue processing remaining orgs — don't abort the entire batch
      }
    }

    logger.info('[monthlyOrgInvoice] Complete', { invoiceCount, errorCount, period });
  }
);
