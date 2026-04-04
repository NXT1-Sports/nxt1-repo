/**
 * @fileoverview End-to-end billing test script
 *
 * Simulates the full billing lifecycle without waiting for month-end:
 *   1. Inspect (or seed) the org billing context
 *   2. Record a fake AI-job spend for an athlete user
 *   3. Run the monthly invoice logic immediately (Stripe TEST mode)
 *   4. Print a summary of what happened
 *
 * Usage:
 *   cd backend
 *   npx tsx scripts/test-billing-e2e.ts --orgId=<orgId> --athleteId=<uid>
 *   npx tsx scripts/test-billing-e2e.ts --orgId=<orgId> --athleteId=<uid> --spendCents=500
 *   npx tsx scripts/test-billing-e2e.ts --orgId=<orgId> --athleteId=<uid> --dry-run
 *
 * Flags:
 *   --orgId=<id>        Firestore organizationId  (required)
 *   --athleteId=<uid>   Firebase uid of the athlete user  (required)
 *   --spendCents=<n>    Amount to record in cents (default: 250 = $2.50)
 *   --dry-run           Read-only — inspect state without writing anything
 *   --skip-invoice      Record spend only, skip Stripe invoice step
 *   --env=staging       Use staging Firebase + Stripe test key (default)
 *   --env=production    Use production Firebase + Stripe live key ⚠️
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import Stripe from 'stripe';

// ─── CLI Args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') ?? null;
const hasFlag = (name: string) => args.includes(`--${name}`);

const orgId = getArg('orgId');
const athleteId = getArg('athleteId');
const spendCents = parseInt(getArg('spendCents') ?? '250', 10);
const dryRun = hasFlag('dry-run');
const skipInvoice = hasFlag('skip-invoice');
const setup = hasFlag('setup');
const useProduction = getArg('env') === 'production';

if (!orgId || !athleteId) {
  console.error('❌  Usage: npx tsx scripts/test-billing-e2e.ts --orgId=<id> --athleteId=<uid>');
  process.exit(1);
}

const environment = useProduction ? 'production' : 'staging';

// ─── Firebase Init ─────────────────────────────────────────────────────────────
const projectId = useProduction
  ? process.env['FIREBASE_PROJECT_ID']!
  : process.env['STAGING_FIREBASE_PROJECT_ID']!;
const clientEmail = useProduction
  ? process.env['FIREBASE_CLIENT_EMAIL']!
  : process.env['STAGING_FIREBASE_CLIENT_EMAIL']!;
const privateKey = useProduction
  ? process.env['FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n')
  : process.env['STAGING_FIREBASE_PRIVATE_KEY']!.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌  Missing Firebase env vars. Check .env file.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore();

// ─── Stripe Init ───────────────────────────────────────────────────────────────
const stripeKey = useProduction
  ? process.env['STRIPE_SECRET_KEY']!
  : process.env['STRIPE_TEST_SECRET_KEY']!;

if (!stripeKey) {
  console.error('❌  Missing Stripe secret key in .env');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, { apiVersion: '2025-03-31.basil' as any });

// ─── Collections ───────────────────────────────────────────────────────────────
const BILLING_CONTEXTS = 'billingContexts';
const STRIPE_CUSTOMERS = 'stripeCustomers';
const PAYMENT_LOGS = 'paymentLogs';
const USAGE_EVENTS = 'usageEvents';

// ─── Helpers ───────────────────────────────────────────────────────────────────
function divider(label: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('─'.repeat(60));
}

function cents(n: number) {
  return `$${(n / 100).toFixed(2)}`;
}

// ─── Step 0: Setup (--setup flag) ─────────────────────────────────────────────
// Creates Stripe test customer for the org (if missing) and links the athlete's
// billing context to the org (billingEntity → organization, organizationId set).
async function runSetup() {
  divider('SETUP — Create Stripe test customer + link athlete to org');

  const orgUserId = `org:${orgId}`;

  // ── 1. Create/find Stripe test customer for the org ──────────────────────
  const custSnap = await db
    .collection(STRIPE_CUSTOMERS)
    .where('userId', '==', orgUserId)
    .where('environment', '==', environment)
    .limit(1)
    .get();

  let customerId: string;

  if (!custSnap.empty) {
    customerId = custSnap.docs[0]!.data()['stripeCustomerId'] as string;
    console.log(`✅ Stripe customer already exists: ${customerId}`);
  } else {
    console.log('   Creating Stripe test customer for org...');
    const customer = await stripe.customers.create({
      name: `Test Org (${orgId})`,
      email: `test-org-${orgId?.slice(0, 8)}@nxt1-test.internal`,
      description: `Auto-created by test-billing-e2e.ts for orgId=${orgId}`,
      metadata: { orgId, source: 'test-billing-e2e' },
    });
    customerId = customer.id;
    console.log(`✅ Stripe customer created: ${customerId}`);

    // Save to Firestore
    await db.collection(STRIPE_CUSTOMERS).add({
      userId: orgUserId,
      organizationId: orgId,
      stripeCustomerId: customerId,
      environment,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Stripe customer saved to Firestore (stripeCustomers collection)`);
  }

  // ── 2. Attach a test payment method (card 4242...) ───────────────────────
  console.log('\n   Attaching test card 4242 4242 4242 4242 to customer...');
  try {
    // Create a test payment method
    const pm = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_visa' },
    });
    await stripe.paymentMethods.attach(pm.id, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });
    console.log(`✅ Test card attached (pm=${pm.id}) and set as default`);
  } catch (e: any) {
    console.log(`⚠️  Could not attach test card: ${e.message}`);
    console.log(
      '   → Stripe test mode requires using tok_visa token. Check if test mode is active.'
    );
  }

  // ── 3. Update athlete billing context → link to org ───────────────────────
  console.log(`\n   Updating athlete (${athleteId}) billing context to org type...`);

  const athleteSnap = await db
    .collection(BILLING_CONTEXTS)
    .where('userId', '==', athleteId)
    .limit(1)
    .get();

  if (athleteSnap.empty) {
    await db.collection(BILLING_CONTEXTS).add({
      userId: athleteId,
      organizationId: orgId,
      billingEntity: 'organization',
      paymentProvider: 'stripe',
      currentPeriodSpend: 0,
      pendingHoldsCents: 0,
      monthlyBudget: 50000,
      hardStop: true,
      notified50: false,
      notified80: false,
      notified100: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Athlete billing context created (billingEntity=organization, orgId=${orgId})`);
  } else {
    const current = athleteSnap.docs[0]!.data();
    if (current['billingEntity'] === 'organization' && current['organizationId'] === orgId) {
      console.log(`✅ Athlete already linked to org (no update needed)`);
    } else {
      await athleteSnap.docs[0]!.ref.update({
        billingEntity: 'organization',
        organizationId: orgId,
        paymentProvider: 'stripe',
        hardStop: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(
        `✅ Athlete billing context updated:\n   billingEntity: ${current['billingEntity']} → organization\n   organizationId: ${current['organizationId'] ?? 'none'} → ${orgId}`
      );
    }
  }

  // ── 4. Ensure org master context exists ───────────────────────────────────
  const orgSnap = await db
    .collection(BILLING_CONTEXTS)
    .where('userId', '==', orgUserId)
    .limit(1)
    .get();

  if (orgSnap.empty) {
    await db.collection(BILLING_CONTEXTS).add({
      userId: orgUserId,
      organizationId: orgId,
      billingEntity: 'organization',
      paymentProvider: 'stripe',
      currentPeriodSpend: 0,
      pendingHoldsCents: 0,
      monthlyBudget: 50000,
      hardStop: true,
      notified50: false,
      notified80: false,
      notified100: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Org master billing context created`);
  } else {
    console.log(`✅ Org master billing context already exists`);
  }

  console.log('\n✅ Setup complete. Now run without --setup to record spend + invoice:');
  console.log(`   npx tsx scripts/test-billing-e2e.ts --orgId=${orgId} --athleteId=${athleteId}`);
}

// ─── Step 1: Inspect billing contexts ─────────────────────────────────────────
async function inspectContexts() {
  divider('STEP 1 — Billing Context State');

  // Athlete user context
  const athleteSnap = await db
    .collection(BILLING_CONTEXTS)
    .where('userId', '==', athleteId)
    .limit(1)
    .get();

  if (athleteSnap.empty) {
    console.log(`⚠️  No billing context found for athlete ${athleteId}`);
    console.log('   → Will be auto-created when athlete submits first job.');
  } else {
    const d = athleteSnap.docs[0]!.data();
    console.log(`✅ Athlete billing context (${athleteId}):`);
    console.log(`   billingEntity : ${d['billingEntity']}`);
    console.log(`   organizationId: ${d['organizationId'] ?? 'none'}`);
    console.log(`   currentSpend  : ${cents(d['currentPeriodSpend'] ?? 0)}`);
    console.log(`   pendingHolds  : ${cents(d['pendingHoldsCents'] ?? 0)}`);
    console.log(`   monthlyBudget : ${cents(d['monthlyBudget'] ?? 0)}`);
    console.log(`   hardStop      : ${d['hardStop'] ?? false}`);

    if (d['organizationId'] !== orgId) {
      console.warn(
        `\n⚠️  Athlete's organizationId (${d['organizationId']}) does not match --orgId (${orgId}).`
      );
      console.warn('   Make sure you are using the correct org.');
    }
  }

  // Org master context
  const orgUserId = `org:${orgId}`;
  const orgSnap = await db
    .collection(BILLING_CONTEXTS)
    .where('userId', '==', orgUserId)
    .limit(1)
    .get();

  if (orgSnap.empty) {
    console.log(`\n⚠️  No org master billing context found for org:${orgId}`);
    console.log('   → Will be auto-created when first job completes.');
  } else {
    const d = orgSnap.docs[0]!.data();
    console.log(`\n✅ Org master billing context (org:${orgId}):`);
    console.log(`   currentSpend  : ${cents(d['currentPeriodSpend'] ?? 0)}`);
    console.log(`   pendingHolds  : ${cents(d['pendingHoldsCents'] ?? 0)}`);
    console.log(`   monthlyBudget : ${cents(d['monthlyBudget'] ?? 0)}`);
    console.log(`   hardStop      : ${d['hardStop'] ?? false}`);
  }

  // Stripe customer for org
  const custSnap = await db
    .collection(STRIPE_CUSTOMERS)
    .where('userId', '==', orgUserId)
    .where('environment', '==', environment)
    .limit(1)
    .get();

  if (custSnap.empty) {
    console.log(`\n⚠️  No Stripe customer found for org:${orgId} (env=${environment})`);
    console.log('   Invoice step will be skipped unless you add a card via the Billing portal.');
  } else {
    const cust = custSnap.docs[0]!.data();
    console.log(`\n✅ Stripe customer: ${cust['stripeCustomerId']} (env=${environment})`);
    // Verify the customer exists in Stripe
    try {
      const stripeCust = await stripe.customers.retrieve(cust['stripeCustomerId'] as string);
      if ((stripeCust as any).deleted) {
        console.log('   ⚠️  Customer deleted in Stripe');
      } else {
        console.log(`   name : ${(stripeCust as Stripe.Customer).name}`);
        console.log(`   email: ${(stripeCust as Stripe.Customer).email}`);
      }
    } catch (e: any) {
      console.log(`   ⚠️  Could not fetch from Stripe: ${e.message}`);
    }
  }
}

// ─── Step 2: Record fake spend ─────────────────────────────────────────────────
async function recordFakeSpend() {
  divider(`STEP 2 — Record Fake Spend (${cents(spendCents)})`);

  if (dryRun) {
    console.log('🔍 Dry-run: would record spend but skipping writes.');
    return;
  }

  const orgUserId = `org:${orgId}`;

  // Write a fake usage event for audit trail
  const fakeJobId = `test-job-${Date.now()}`;
  const fakeOperationId = `test-op-${Date.now()}`;

  await db.collection(USAGE_EVENTS).add({
    userId: athleteId,
    organizationId: orgId,
    jobId: fakeJobId,
    operationId: fakeOperationId,
    feature: 'test-billing-e2e',
    costUsd: spendCents / 100,
    chargeAmountCents: spendCents,
    status: 'SENT',
    source: 'test-billing-e2e-script',
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`✅ Usage event written (jobId=${fakeJobId})`);

  // Increment athlete's currentPeriodSpend
  const athleteSnap = await db
    .collection(BILLING_CONTEXTS)
    .where('userId', '==', athleteId)
    .limit(1)
    .get();

  if (!athleteSnap.empty) {
    await athleteSnap.docs[0]!.ref.update({
      currentPeriodSpend: FieldValue.increment(spendCents),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Athlete spend incremented by ${cents(spendCents)}`);
  } else {
    // Create minimal billing context for athlete
    await db.collection(BILLING_CONTEXTS).add({
      userId: athleteId,
      organizationId: orgId,
      billingEntity: 'organization',
      currentPeriodSpend: spendCents,
      pendingHoldsCents: 0,
      monthlyBudget: 50000,
      hardStop: true,
      notified50: false,
      notified80: false,
      notified100: false,
      paymentProvider: 'stripe',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Athlete billing context created with ${cents(spendCents)} spend`);
  }

  // Increment org master currentPeriodSpend
  const orgSnap = await db
    .collection(BILLING_CONTEXTS)
    .where('userId', '==', orgUserId)
    .limit(1)
    .get();

  if (!orgSnap.empty) {
    await orgSnap.docs[0]!.ref.update({
      currentPeriodSpend: FieldValue.increment(spendCents),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const newSpend = (orgSnap.docs[0]!.data()['currentPeriodSpend'] ?? 0) + spendCents;
    console.log(`✅ Org master spend incremented → total now ${cents(newSpend)}`);
  } else {
    // Create org master context
    await db.collection(BILLING_CONTEXTS).add({
      userId: orgUserId,
      organizationId: orgId,
      billingEntity: 'organization',
      currentPeriodSpend: spendCents,
      pendingHoldsCents: 0,
      monthlyBudget: 50000,
      hardStop: true,
      notified50: false,
      notified80: false,
      notified100: false,
      paymentProvider: 'stripe',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Org master billing context created with ${cents(spendCents)} spend`);
  }
}

// ─── Step 3: Generate invoice ──────────────────────────────────────────────────
async function generateInvoice() {
  divider('STEP 3 — Generate Stripe Invoice');

  if (dryRun || skipInvoice) {
    console.log('⏭️  Skipping invoice step (--dry-run or --skip-invoice).');
    return;
  }

  const orgUserId = `org:${orgId}`;

  // Get current spend from Firestore
  const orgSnap = await db
    .collection(BILLING_CONTEXTS)
    .where('userId', '==', orgUserId)
    .limit(1)
    .get();

  if (orgSnap.empty) {
    console.log('⚠️  No org billing context found — nothing to invoice.');
    return;
  }

  const orgCtx = orgSnap.docs[0]!.data();
  const totalSpendCents = (orgCtx['currentPeriodSpend'] as number) ?? 0;

  if (totalSpendCents <= 0) {
    console.log('⚠️  Org has zero spend — no invoice to generate.');
    return;
  }

  console.log(`   Org spend to invoice: ${cents(totalSpendCents)}`);

  // Look up Stripe customer
  const custSnap = await db
    .collection(STRIPE_CUSTOMERS)
    .where('userId', '==', orgUserId)
    .where('environment', '==', environment)
    .limit(1)
    .get();

  if (custSnap.empty) {
    console.log('⚠️  No Stripe customer found for this org — skipping invoice.');
    console.log('   → Org Director/Owner must add a card via the Billing portal first.');
    return;
  }

  const customerId = custSnap.docs[0]!.data()['stripeCustomerId'] as string;
  console.log(`   Stripe customer: ${customerId}`);

  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  // Add timestamp so re-runs during same month don't conflict
  const idempotencyKey = `test-invoice-${orgUserId}-${period}-${Date.now()}`;

  try {
    // 1. Create invoice item
    await stripe.invoiceItems.create(
      {
        customer: customerId,
        amount: totalSpendCents,
        currency: 'usd',
        description: `Agent X usage — ${period} (TEST via test-billing-e2e.ts)`,
      },
      { idempotencyKey }
    );
    console.log(`✅ Invoice item created: ${cents(totalSpendCents)}`);

    // 2. Create invoice (Net 30, send_invoice)
    // NOTE: send_invoice defaults to pending_invoice_items_behavior='exclude' — must override.
    const invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: false,
      collection_method: 'send_invoice',
      days_until_due: 30,
      pending_invoice_items_behavior: 'include',
    });
    console.log(`✅ Invoice created: ${invoice.id} (status: ${invoice.status})`);

    // 3. Finalize (Stripe sends invoice email)
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    console.log(`✅ Invoice finalized: ${finalized.id} (status: ${finalized.status})`);
    if (finalized.hosted_invoice_url) {
      console.log(`   🔗 View invoice: ${finalized.hosted_invoice_url}`);
    }

    // 4. Write payment log (include invoiceUrl immediately — don't rely solely on webhook)
    await db.collection(PAYMENT_LOGS).add({
      userId: orgUserId,
      organizationId: orgId,
      customerId,
      invoiceId: finalized.id,
      invoiceUrl: finalized.hosted_invoice_url ?? null,
      amountCents: totalSpendCents,
      currency: 'usd',
      status: 'invoiced',
      environment,
      billingPeriod: period,
      source: 'test-billing-e2e-script',
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`✅ Payment log written to Firestore (invoiceUrl saved)`);
  } catch (err: any) {
    console.error(`❌  Stripe error: ${err.message}`);
    if (err.code === 'invoice_no_customer_line_items') {
      console.error('   → Invoice item may have already been created (idempotency key collision).');
    }
  }
}

// ─── Step 4: Summary ───────────────────────────────────────────────────────────
async function printSummary() {
  divider('STEP 4 — Final State Summary');

  const orgUserId = `org:${orgId}`;

  const orgSnap = await db
    .collection(BILLING_CONTEXTS)
    .where('userId', '==', orgUserId)
    .limit(1)
    .get();

  if (!orgSnap.empty) {
    const d = orgSnap.docs[0]!.data();
    console.log(`Org master (org:${orgId}):`);
    console.log(`  currentPeriodSpend : ${cents(d['currentPeriodSpend'] ?? 0)}`);
    console.log(`  pendingHoldsCents  : ${cents(d['pendingHoldsCents'] ?? 0)}`);
  }

  // Recent payment logs for this org
  const logsSnap = await db
    .collection(PAYMENT_LOGS)
    .where('organizationId', '==', orgId)
    .orderBy('createdAt', 'desc')
    .limit(3)
    .get();

  if (!logsSnap.empty) {
    console.log(`\nRecent payment logs (last ${logsSnap.size}):`);
    logsSnap.docs.forEach((doc) => {
      const l = doc.data();
      console.log(
        `  ${l['invoiceId'] ?? '–'} | ${cents(l['amountCents'])} | ${l['status']} | ${l['environment']} | ${l['billingPeriod']}`
      );
    });
  } else {
    console.log('\nNo payment logs found for this org yet.');
  }

  // Recent usage events for athlete
  const eventsSnap = await db
    .collection(USAGE_EVENTS)
    .where('userId', '==', athleteId)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();

  if (!eventsSnap.empty) {
    console.log(`\nRecent usage events for athlete (last ${eventsSnap.size}):`);
    eventsSnap.docs.forEach((doc) => {
      const e = doc.data();
      console.log(
        `  feature=${e['feature']} | charge=${cents(e['chargeAmountCents'] ?? 0)} | status=${e['status']}`
      );
    });
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧾 Billing E2E Test');
  console.log(`   env       : ${environment}`);
  console.log(`   orgId     : ${orgId}`);
  console.log(`   athleteId : ${athleteId}`);
  console.log(`   spendCents: ${spendCents} (${cents(spendCents)})`);
  console.log(`   dryRun    : ${dryRun}`);
  console.log(`   skipInvoice: ${skipInvoice}`);
  console.log(`   setup     : ${setup}`);

  if (setup) {
    await runSetup();
    return; // stop here — re-run without --setup to test billing
  }

  await inspectContexts();
  await recordFakeSpend();
  await generateInvoice();
  await printSummary();

  divider('DONE');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌  Fatal error:', err);
    process.exit(1);
  });
