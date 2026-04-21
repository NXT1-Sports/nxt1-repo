/**
 * @fileoverview Monthly Org Invoice — Generate Stripe invoices for all Org/Team billing
 * @module @nxt1/functions/scheduled/monthlyOrgInvoice
 *
 * DISABLED: Orgs are now on a pre-paid wallet model. Credits are deducted
 * in real-time from the org wallet — there is no post-pay invoicing cycle.
 * Re-enable only if a post-pay invoicing model is reintroduced.
 *
 * Billing model:
 *   - Org master billing contexts: userId = 'org:<organizationId>'
 *   - Stripe customer is looked up from the 'StripeCustomers' collection
 *   - Invoice collection method: send_invoice / Net 30
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';

const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeTestSecretKey = defineSecret('STRIPE_TEST_SECRET_KEY');

/**
 * Monthly org invoice — DISABLED (org wallet model active).
 * Runs at 23:00 UTC on days 28–31. No-op until post-pay invoicing is reintroduced.
 */
export const monthlyOrgInvoice = onSchedule(
  {
    schedule: '0 23 28-31 * *',
    timeZone: 'UTC',
    retryCount: 2,
    secrets: [stripeSecretKey, stripeTestSecretKey],
  },
  async () => {
    logger.info('[monthlyOrgInvoice] Disabled — org wallet model active. Exiting.');
  }
);
