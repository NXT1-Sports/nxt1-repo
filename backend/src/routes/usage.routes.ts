/**
 * @fileoverview Usage Dashboard Routes
 * @module @nxt1/backend/routes
 *
 * API endpoints for the usage/billing dashboard.
 * Aggregates data from Firestore + Stripe for the frontend dashboard UI.
 */

import { Router, type Request, type Response } from 'express';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  AddPaymentMethodTokenDto,
  PaymentMethodIdDto,
  RedeemCouponDto,
  BuyCreditsDto,
} from '../dtos/usage.dto.js';
import { logger } from '../utils/logger.js';
import {
  COLLECTIONS,
  getOrCreateCustomer,
  getStripeClient,
  createSetupIntent,
  getBillingContext,
  getOrgTeamAllocations,
  resolveBillingTarget,
  type ResolvedBillingTarget,
} from '../modules/billing/index.js';
import { USAGE_PRODUCT_CONFIGS, USAGE_CATEGORY_CONFIGS, USAGE_HISTORY_PAGE_SIZE } from '@nxt1/core';

/** Normalize PaymentLog status (Firestore: 'PAID'/'FAILED'/…) to TransactionStatus ('completed'/'failed'/…) */
function normalizePaymentStatus(status: unknown): string {
  switch (String(status ?? '').toUpperCase()) {
    case 'PAID':
      return 'completed';
    case 'FAILED':
      return 'failed';
    case 'PENDING':
      return 'processing';
    case 'VOID':
    case 'CANCELED':
      return 'canceled';
    case 'REFUNDED':
      return 'refunded';
    default:
      return 'completed';
  }
}

/** Convert Firestore Timestamp, Date, or ISO string to ISO string */
function toISOString(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (val instanceof Date) return val.toISOString();
  // Firestore Timestamp
  const tsVal = val as Record<string, unknown>;
  if (typeof tsVal['toDate'] === 'function') return (tsVal['toDate'] as () => Date)().toISOString();
  return new Date().toISOString();
}
import type {
  UsageOverview,
  UsageChartDataPoint,
  UsageProductDetail,
  UsageTopItem,
  UsageBreakdownRow,
  UsageBreakdownLineItem,
  UsagePaymentHistoryRecord,
  UsageBudget,
  UsageDashboardData,
  UsageProductCategory,
  UsagePaymentMethod,
  UsageBillingInfo,
} from '@nxt1/core';

const router = Router();

// ============================================
// HELPERS
// ============================================

/** Resolve a timeframe string to date range */
function resolveTimeframe(timeframe: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  let start: Date;

  switch (timeframe) {
    case 'last-month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start, end: lastEnd };
    }
    case 'last-3-months':
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case 'last-6-months':
      start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
    case 'last-12-months':
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      break;
    case 'current-month':
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  return { start, end };
}

/** Format a date as display label */
function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format period label */
function formatPeriodLabel(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${startStr} – ${endStr}`;
}

/** Map UsageFeature enum to product category */
function getFeatureCategory(feature: string): UsageProductCategory {
  const config = USAGE_PRODUCT_CONFIGS.find((p) => {
    // Match feature enum values to product config IDs
    const normalized = feature.toLowerCase().replace(/_/g, '-');
    return p.id === normalized;
  });
  return config?.category ?? 'ai';
}

/** Get product display name from feature */
function getFeatureDisplayName(feature: string): string {
  const normalized = feature.toLowerCase().replace(/_/g, '-');
  const config = USAGE_PRODUCT_CONFIGS.find((p) => p.id === normalized);
  return config?.name ?? feature;
}

// ============================================
// QUERY HELPERS
// ============================================

/**
 * Fetch usage events for an organization by querying all team IDs.
 * Firestore `.in()` is limited to 30 values, so we chunk and merge.
 */
async function fetchOrgUsageEvents(
  db: Firestore,
  teamIds: string[],
  startIso: string,
  endIso: string,
  orderDesc = true,
  limit = 1000
): Promise<QueryDocumentSnapshot[]> {
  if (teamIds.length === 0) return [];

  const CHUNK_SIZE = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < teamIds.length; i += CHUNK_SIZE) {
    chunks.push(teamIds.slice(i, i + CHUNK_SIZE));
  }

  const direction = orderDesc ? 'desc' : 'asc';

  const results = await Promise.all(
    chunks.map((chunk) =>
      db
        .collection(COLLECTIONS.USAGE_EVENTS)
        .where('teamId', 'in', chunk)
        .where('createdAt', '>=', startIso)
        .where('createdAt', '<=', endIso)
        .orderBy('createdAt', direction)
        .limit(limit)
        .get()
    )
  );

  const allDocs = results.flatMap((snap) => snap.docs);
  allDocs.sort((a, b) => {
    const aDate = a.data()['createdAt'] as string;
    const bDate = b.data()['createdAt'] as string;
    return orderDesc ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
  });
  return allDocs.slice(0, limit);
}

/**
 * Fetch usage events for either an org (by teamIds) or an individual (by userId).
 */
async function fetchUsageEvents(
  db: Firestore,
  target: ResolvedBillingTarget,
  startIso: string,
  endIso: string,
  orderDesc = true,
  limit = 1000
): Promise<QueryDocumentSnapshot[]> {
  if (target.type === 'organization' && target.teamIds && target.teamIds.length > 0) {
    return fetchOrgUsageEvents(db, target.teamIds, startIso, endIso, orderDesc, limit);
  }

  // Individual query — date filtering at the database level
  const direction = orderDesc ? 'desc' : 'asc';
  const snap = await db
    .collection(COLLECTIONS.USAGE_EVENTS)
    .where('userId', '==', target.billingUserId)
    .where('createdAt', '>=', startIso)
    .where('createdAt', '<=', endIso)
    .orderBy('createdAt', direction)
    .limit(limit)
    .get();

  return snap.docs;
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/v1/usage/dashboard
 * Full dashboard data — aggregated from Firestore usage events + billing context
 */
router.get('/dashboard', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    const timeframe = (req.query['timeframe'] as string) || 'current-month';
    const { start, end } = resolveTimeframe(timeframe);
    const environment = req.isStaging ? 'staging' : 'production';

    // Resolve billing target (director → org, otherwise individual)
    const target = await resolveBillingTarget(db, userId);
    const billingCtx = target.context;

    // ── Parallelize independent queries ──
    // Group 1: Admin status (needs userId + target)
    // Group 2: Usage events (needs target + timeframe)
    // Group 3: Payment logs (needs target)
    // All three are independent — run in parallel.

    const adminCheckPromise = (async (): Promise<{ isOrgAdmin: boolean; isTeamAdmin: boolean }> => {
      if (target.type === 'organization' && target.organizationId) {
        const [userDoc, orgDoc] = await Promise.all([
          db.collection('Users').doc(userId).get(),
          db.collection('Organizations').doc(target.organizationId).get(),
        ]);
        const role = userDoc.data()?.['role'] as string | undefined;
        const orgData = orgDoc.data();

        let orgAdmin = false;
        if (orgData) {
          const ownerId = orgData['ownerId'] as string | undefined;
          const admins = (orgData['admins'] as Array<{ userId: string }>) ?? [];
          const adminIds = admins.map((a) => a.userId).filter(Boolean);
          orgAdmin = role === 'director' || ownerId === userId || adminIds.includes(userId);
        }

        if (orgAdmin) return { isOrgAdmin: true, isTeamAdmin: true };

        // Check team admin via roster entry → team.adminIds
        const rosterSnap = await db
          .collection('RosterEntries')
          .where('userId', '==', userId)
          .where('status', '==', 'active')
          .limit(1)
          .get();

        if (!rosterSnap.empty) {
          const teamId = rosterSnap.docs[0]!.data()['teamId'] as string | undefined;
          if (teamId) {
            const teamDoc = await db.collection('Teams').doc(teamId).get();
            const teamData = teamDoc.data();
            const teamAdminIds: string[] = Array.isArray(teamData?.['adminIds'])
              ? (teamData!['adminIds'] as string[])
              : teamData?.['createdBy']
                ? [teamData['createdBy'] as string]
                : [];
            return { isOrgAdmin: false, isTeamAdmin: teamAdminIds.includes(userId) };
          }
        }

        return { isOrgAdmin: false, isTeamAdmin: false };
      }
      // Individual users are their own "admin"
      return { isOrgAdmin: true, isTeamAdmin: true };
    })();

    const eventsPromise = fetchUsageEvents(
      db,
      target,
      start.toISOString(),
      end.toISOString(),
      true,
      1000
    );

    const paymentLogsPromise = db
      .collection(COLLECTIONS.PAYMENT_LOGS)
      .where('userId', '==', target.billingUserId)
      .orderBy('createdAt', 'desc')
      .limit(USAGE_HISTORY_PAGE_SIZE)
      .get();

    // Run all three in parallel
    const [adminResult, eventsDocs, paymentLogsSnap] = await Promise.all([
      adminCheckPromise,
      eventsPromise,
      paymentLogsPromise,
    ]);

    const { isOrgAdmin, isTeamAdmin } = adminResult;

    // Aggregate usage by feature
    const featureUsage = new Map<string, number>();
    const dailyUsage = new Map<string, number>();
    let totalUsageCents = 0;

    // For IAP wallet users and org billing contexts, use the atomic counter
    // (currentPeriodSpend) as the authoritative total.  IAP's deductWallet and
    // org billing's recordOrgSpend always increment the counter, while usage
    // events may be missing for dynamic-cost features without Stripe price IDs.
    const isIapUser =
      billingCtx.billingEntity === 'individual' && billingCtx.paymentProvider === 'iap';
    const isOrgBilling = billingCtx.billingEntity === 'organization';

    if (isIapUser) {
      totalUsageCents = billingCtx.currentPeriodSpend ?? 0;
    } else {
      // Aggregate events for feature/daily breakdown (charts)
      for (const doc of eventsDocs) {
        const data = doc.data();
        const feature = data['feature'] as string;
        const cost = (data['unitCostSnapshot'] as number) * (data['quantity'] as number);
        totalUsageCents += cost;

        featureUsage.set(feature, (featureUsage.get(feature) ?? 0) + cost);

        const dateKey = toISOString(data['createdAt']).slice(0, 10);
        dailyUsage.set(dateKey, (dailyUsage.get(dateKey) ?? 0) + cost);
      }

      // For org billing, prefer the atomic counter as the authoritative total.
      // Usage events may undercount when features lack a Stripe price mapping.
      if (isOrgBilling) {
        const authoritative = billingCtx.currentPeriodSpend ?? 0;
        if (authoritative > totalUsageCents) {
          totalUsageCents = authoritative;
        }
      }
    }

    // Build overview (includes wallet fields for B2C UI fork)
    const overview: UsageOverview = {
      currentMeteredUsage: totalUsageCents,
      currentIncludedUsage: 0,
      nextPaymentDueDate: end.toISOString(),
      nextPaymentAmount: totalUsageCents,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        label: formatPeriodLabel(start, end),
      },
      currency: 'usd',
      billingEntity: billingCtx.billingEntity,
      paymentProvider: billingCtx.paymentProvider,
      walletBalanceCents: billingCtx.walletBalanceCents ?? 0,
      pendingHoldsCents: billingCtx.pendingHoldsCents ?? 0,
    };

    // Build chart data
    const chartData: UsageChartDataPoint[] = [];
    let cumulative = 0;
    const current = new Date(start);
    while (current <= end) {
      const dateKey = current.toISOString().slice(0, 10);
      cumulative += dailyUsage.get(dateKey) ?? 0;
      chartData.push({
        date: dateKey,
        label: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        amount: cumulative,
      });
      current.setDate(current.getDate() + 1);
    }

    // Build product details by category
    const categoryTotals = new Map<UsageProductCategory, number>();
    for (const [feature, cost] of featureUsage) {
      const cat = getFeatureCategory(feature);
      categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + cost);
    }

    const productDetails: UsageProductDetail[] = USAGE_CATEGORY_CONFIGS.map((cat) => ({
      category: cat.id,
      label: cat.label,
      icon: cat.icon,
      billableAmount: categoryTotals.get(cat.id) ?? 0,
      consumedAmount: categoryTotals.get(cat.id) ?? 0,
      discountAmount: 0,
      discountDescription: '',
      includedQuotas: [],
      includedResetDays: Math.ceil((end.getTime() - Date.now()) / 86400000),
    }));

    // Build top items
    const topItems: UsageTopItem[] = Array.from(featureUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([feature, grossAmount], i) => ({
        name: getFeatureDisplayName(feature),
        color: USAGE_CATEGORY_CONFIGS[i % USAGE_CATEGORY_CONFIGS.length]?.color ?? '#888',
        grossAmount,
      }));

    // Build breakdown rows (daily)
    const breakdownRows: UsageBreakdownRow[] = [];
    const dailyEvents = new Map<string, Map<string, { qty: number; cost: number }>>();

    for (const doc of eventsDocs) {
      const data = doc.data();
      const dateKey = toISOString(data['createdAt']).slice(0, 10);
      const feature = data['feature'] as string;
      const cost = (data['unitCostSnapshot'] as number) * (data['quantity'] as number);
      const qty = data['quantity'] as number;

      if (!dailyEvents.has(dateKey)) dailyEvents.set(dateKey, new Map());
      const dayMap = dailyEvents.get(dateKey)!;
      const existing = dayMap.get(feature) ?? { qty: 0, cost: 0 };
      dayMap.set(feature, { qty: existing.qty + qty, cost: existing.cost + cost });
    }

    for (const [dateKey, features] of Array.from(dailyEvents.entries()).sort((a, b) =>
      b[0].localeCompare(a[0])
    )) {
      let dayGross = 0;
      const lineItems: UsageBreakdownLineItem[] = [];

      for (const [feature, { qty, cost }] of features) {
        dayGross += cost;
        const unitCost = qty > 0 ? cost / qty : 0;
        lineItems.push({
          sku: getFeatureDisplayName(feature),
          units: `${qty}`,
          pricePerUnit: `$${(unitCost / 100).toFixed(2)}`,
          grossAmount: cost,
          billedAmount: cost,
        });
      }

      breakdownRows.push({
        date: dateKey,
        dateLabel: formatDateLabel(new Date(dateKey + 'T00:00:00')),
        grossAmount: dayGross,
        billedAmount: dayGross,
        lineItems,
      });
    }

    // Payment history from the already-fetched paymentLogsSnap (parallelized above)
    const paymentLogDocs = paymentLogsSnap.docs;

    const paymentHistory: UsagePaymentHistoryRecord[] = paymentLogDocs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        displayId: doc.id.slice(0, 8).toUpperCase(),
        amount: (d['amountPaid'] as number) ?? 0,
        currency: ((d['currency'] as string) ?? 'usd') as UsagePaymentHistoryRecord['currency'],
        status: normalizePaymentStatus(d['status']) as UsagePaymentHistoryRecord['status'],
        paymentMethodLabel: (d['paymentMethodLabel'] as string) ?? 'Card',
        provider: 'stripe',
        createdAt: toISOString(d['createdAt']),
        dateLabel: toISOString(d['createdAt']).slice(0, 10),
        receiptUrl: (d['receiptUrl'] as string | null) ?? null,
        invoiceUrl: (d['invoiceUrl'] as string | null) ?? null,
      };
    });

    // Payment methods and billing info from Stripe — skip for non-admins (data is masked anyway)
    let paymentMethods: UsagePaymentMethod[] = [];
    let billingInfo: UsageBillingInfo | null = null;
    if (isOrgAdmin) {
      try {
        const customerDoc = await db
          .collection(COLLECTIONS.STRIPE_CUSTOMERS)
          .where('userId', '==', target.billingUserId)
          .where('environment', '==', environment)
          .limit(1)
          .get();

        if (!customerDoc.empty) {
          const customerId = customerDoc.docs[0]?.data()['stripeCustomerId'] as string;
          const stripe = getStripeClient(environment);

          // Parallelize the two Stripe API calls (each can take 3-5s)
          const [methods, customer] = await Promise.all([
            stripe.paymentMethods.list({ customer: customerId, type: 'card' }),
            stripe.customers.retrieve(customerId),
          ]);

          const defaultMethodId =
            typeof customer !== 'string' && !customer.deleted
              ? typeof customer.invoice_settings?.default_payment_method === 'string'
                ? customer.invoice_settings.default_payment_method
                : customer.invoice_settings?.default_payment_method?.id
              : undefined;

          paymentMethods = methods.data.map((m) => ({
            id: m.id,
            type: 'card' as const,
            provider: 'stripe' as const,
            label: `${(m.card?.brand ?? 'card').charAt(0).toUpperCase() + (m.card?.brand ?? 'card').slice(1)} ending in ${m.card?.last4 ?? '****'}`,
            last4: m.card?.last4 ?? null,
            brand: m.card?.brand ?? null,
            expiryMonth: m.card?.exp_month ?? null,
            expiryYear: m.card?.exp_year ?? null,
            isDefault: m.id === defaultMethodId,
            email: null,
            addedAt: new Date(m.created * 1000).toISOString(),
          }));

          if (typeof customer !== 'string' && !customer.deleted && customer.address) {
            const addr = customer.address;
            const cityStateZip = [addr.city, addr.state, addr.postal_code]
              .filter(Boolean)
              .join(', ');
            billingInfo = {
              name: customer.name ?? '',
              addressLine1: addr.line1 ?? '',
              addressLine2: addr.line2 ? `${addr.line2}, ${cityStateZip}` : cityStateZip,
              country: addr.country ?? '',
            };
          }
        }
      } catch (err) {
        logger.warn('[GET /dashboard] Failed to fetch payment methods from Stripe', {
          error: err,
        });
      }
    }

    // Budgets from billing context
    const accountName =
      billingCtx.billingEntity === 'organization'
        ? 'Organization'
        : billingCtx.billingEntity === 'team'
          ? 'Team'
          : 'Personal';

    // For org billing, include team allocations so the AD can see per-team breakdown
    let teamAllocations: UsageBudget['teamAllocations'];
    if (billingCtx.billingEntity === 'organization' && billingCtx.organizationId) {
      const allocations = await getOrgTeamAllocations(db, billingCtx.organizationId);
      if (allocations.length > 0) {
        // Resolve team names in parallel
        const teamDocs = await Promise.all(
          allocations.map((a) => db.collection('Teams').doc(a.teamId).get())
        );
        const teamNames = new Map(
          teamDocs.map((doc) => [doc.id, (doc.data()?.['name'] as string) ?? 'Unknown Team'])
        );

        teamAllocations = allocations.map((a) => ({
          teamId: a.teamId,
          teamName: teamNames.get(a.teamId) ?? 'Unknown Team',
          monthlyLimit: a.monthlyLimit,
          currentSpend: a.currentPeriodSpend,
          percentUsed:
            a.monthlyLimit > 0 ? Math.round((a.currentPeriodSpend / a.monthlyLimit) * 100) : 0,
        }));
      }
    }

    const budgets: UsageBudget[] = [
      {
        id: `budget-${userId}`,
        category: 'ai',
        productName: 'Overall Budget',
        budgetLimit: billingCtx.monthlyBudget,
        spent: billingCtx.currentPeriodSpend,
        percentUsed:
          billingCtx.monthlyBudget > 0
            ? Math.round((billingCtx.currentPeriodSpend / billingCtx.monthlyBudget) * 100)
            : 0,
        stopOnLimit: billingCtx.hardStop,
        accountName,
        ownershipPercent: 100,
        teamAllocations,
      },
    ];

    const dashboard: UsageDashboardData = {
      overview,
      subscriptions: [],
      chartData,
      productDetails,
      topItems,
      breakdownRows,
      // Non-admin org members: mask sensitive financial data
      paymentHistory: isOrgAdmin ? paymentHistory : [],
      paymentMethods: isOrgAdmin ? paymentMethods : [],
      billingInfo: isOrgAdmin ? billingInfo : null,
      coupon: null,
      budgets,
      billingEntity: billingCtx.billingEntity,
      paymentProvider: billingCtx.paymentProvider,
      isOrgAdmin,
      isTeamAdmin,
    };

    return res.json({ success: true, data: dashboard });
  } catch (error) {
    logger.error('[GET /dashboard] Failed to load usage dashboard', { error });
    return res.status(500).json({
      error: 'Failed to load usage dashboard',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/usage/overview
 * Quick overview cards only
 */
router.get('/overview', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Resolve billing target (director → org, otherwise individual)
    const target = await resolveBillingTarget(db, userId);
    const billingCtx = target.context;

    const eventsDocs = await fetchUsageEvents(
      db,
      target,
      start.toISOString(),
      end.toISOString(),
      false,
      10000
    );

    // For IAP wallet users, charges go directly to billingContexts.currentPeriodSpend
    // (deductWallet does not write usageEvents). Use the authoritative source directly.
    const isIapUser =
      billingCtx.billingEntity === 'individual' && billingCtx.paymentProvider === 'iap';

    let totalUsageCents = 0;
    if (isIapUser) {
      totalUsageCents = billingCtx.currentPeriodSpend ?? 0;
    } else {
      for (const doc of eventsDocs) {
        const data = doc.data();
        totalUsageCents += (data['unitCostSnapshot'] as number) * (data['quantity'] as number);
      }
    }

    const overview: UsageOverview = {
      currentMeteredUsage: totalUsageCents,
      currentIncludedUsage: 0,
      nextPaymentDueDate: end.toISOString(),
      nextPaymentAmount: totalUsageCents,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        label: formatPeriodLabel(start, end),
      },
      currency: 'usd',
      billingEntity: billingCtx.billingEntity,
      paymentProvider: billingCtx.paymentProvider,
      walletBalanceCents: billingCtx.walletBalanceCents ?? 0,
      pendingHoldsCents: billingCtx.pendingHoldsCents ?? 0,
    };

    return res.json({ success: true, data: overview });
  } catch (error) {
    logger.error('[GET /overview] Failed to get usage overview', { error });
    return res.status(500).json({
      error: 'Failed to get usage overview',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/usage/chart
 * Chart data for usage over time
 */
router.get('/chart', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    const timeframe = (req.query['timeframe'] as string) || 'current-month';
    const { start, end } = resolveTimeframe(timeframe);

    // Resolve billing target (director → org, otherwise individual)
    const target = await resolveBillingTarget(db, userId);

    const eventsDocs = await fetchUsageEvents(
      db,
      target,
      start.toISOString(),
      end.toISOString(),
      false,
      10000
    );

    const dailyUsage = new Map<string, number>();
    for (const doc of eventsDocs) {
      const data = doc.data();
      const dateKey = toISOString(data['createdAt']).slice(0, 10);
      const cost = (data['unitCostSnapshot'] as number) * (data['quantity'] as number);
      dailyUsage.set(dateKey, (dailyUsage.get(dateKey) ?? 0) + cost);
    }

    const chartData: UsageChartDataPoint[] = [];
    let cumulative = 0;
    const current = new Date(start);
    while (current <= end) {
      const dateKey = current.toISOString().slice(0, 10);
      cumulative += dailyUsage.get(dateKey) ?? 0;
      chartData.push({
        date: dateKey,
        label: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        amount: cumulative,
      });
      current.setDate(current.getDate() + 1);
    }

    return res.json({ success: true, data: chartData });
  } catch (error) {
    logger.error('[GET /chart] Failed to get chart data', { error });
    return res.status(500).json({
      error: 'Failed to get chart data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/usage/breakdown
 * Daily breakdown with expandable line items
 */
router.get('/breakdown', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    const timeframe = (req.query['timeframe'] as string) || 'current-month';
    const { start, end } = resolveTimeframe(timeframe);

    // Resolve billing target (director → org, otherwise individual)
    const target = await resolveBillingTarget(db, userId);

    const eventsDocs = await fetchUsageEvents(
      db,
      target,
      start.toISOString(),
      end.toISOString(),
      true,
      500
    );

    const dailyEvents = new Map<string, Map<string, { qty: number; cost: number }>>();

    for (const doc of eventsDocs) {
      const data = doc.data();
      const dateKey = toISOString(data['createdAt']).slice(0, 10);
      const feature = data['feature'] as string;
      const cost = (data['unitCostSnapshot'] as number) * (data['quantity'] as number);
      const qty = data['quantity'] as number;

      if (!dailyEvents.has(dateKey)) dailyEvents.set(dateKey, new Map());
      const dayMap = dailyEvents.get(dateKey)!;
      const existing = dayMap.get(feature) ?? { qty: 0, cost: 0 };
      dayMap.set(feature, { qty: existing.qty + qty, cost: existing.cost + cost });
    }

    const breakdownRows: UsageBreakdownRow[] = [];
    for (const [dateKey, features] of Array.from(dailyEvents.entries()).sort((a, b) =>
      b[0].localeCompare(a[0])
    )) {
      let dayGross = 0;
      const lineItems: UsageBreakdownLineItem[] = [];

      for (const [feature, { qty, cost }] of features) {
        dayGross += cost;
        const unitCost = qty > 0 ? cost / qty : 0;
        lineItems.push({
          sku: getFeatureDisplayName(feature),
          units: `${qty}`,
          pricePerUnit: `$${(unitCost / 100).toFixed(2)}`,
          grossAmount: cost,
          billedAmount: cost,
        });
      }

      breakdownRows.push({
        date: dateKey,
        dateLabel: formatDateLabel(new Date(dateKey + 'T00:00:00')),
        grossAmount: dayGross,
        billedAmount: dayGross,
        lineItems,
      });
    }

    return res.json({ success: true, data: breakdownRows });
  } catch (error) {
    logger.error('[GET /breakdown] Failed to get usage breakdown', { error });
    return res.status(500).json({
      error: 'Failed to get usage breakdown',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/usage/history
 * Paginated payment history
 */
router.get('/history', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    const page = Math.max(1, Number(req.query['page']) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || USAGE_HISTORY_PAGE_SIZE));
    const offset = (page - 1) * limit;

    // Resolve billing target (director → org, otherwise individual)
    const target = await resolveBillingTarget(db, userId);

    // Get total count
    const countSnap = await db
      .collection(COLLECTIONS.PAYMENT_LOGS)
      .where('userId', '==', target.billingUserId)
      .count()
      .get();
    const total = countSnap.data().count;

    // Paginate at the database level using orderBy + offset + limit
    const logsSnap = await db
      .collection(COLLECTIONS.PAYMENT_LOGS)
      .where('userId', '==', target.billingUserId)
      .orderBy('createdAt', 'desc')
      .offset(offset)
      .limit(limit)
      .get();

    const paginatedDocs = logsSnap.docs;

    const records: UsagePaymentHistoryRecord[] = paginatedDocs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        displayId: doc.id.slice(0, 8).toUpperCase(),
        amount: (d['amountPaid'] as number) ?? 0,
        currency: ((d['currency'] as string) ?? 'usd') as UsagePaymentHistoryRecord['currency'],
        status: normalizePaymentStatus(d['status']) as UsagePaymentHistoryRecord['status'],
        paymentMethodLabel: (d['paymentMethodLabel'] as string) ?? 'Card',
        provider: 'stripe',
        createdAt: toISOString(d['createdAt']),
        dateLabel: toISOString(d['createdAt']).slice(0, 10),
        receiptUrl: (d['receiptUrl'] as string | null) ?? null,
        invoiceUrl: (d['invoiceUrl'] as string | null) ?? null,
      };
    });

    return res.json({
      success: true,
      data: {
        records,
        total,
        hasMore: offset + records.length < total,
      },
    });
  } catch (error) {
    logger.error('[GET /history] Failed to get payment history', { error });
    return res.status(500).json({
      error: 'Failed to get payment history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/usage/payment-methods
 * List saved payment methods from Stripe
 */
router.get('/payment-methods', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');
    const environment = req.isStaging ? 'staging' : 'production';

    // Resolve billing target (director → org, otherwise individual)
    const target = await resolveBillingTarget(db, userId);

    // ── Guard: Only org admins can view payment methods for an organization ──
    if (target.type === 'organization' && target.organizationId) {
      const billingCtx = await getBillingContext(db, userId);
      const isOrg = billingCtx?.billingEntity === 'organization';
      if (isOrg) {
        const userDoc = await db.collection('Users').doc(userId).get();
        const role = userDoc.data()?.['role'] as string | undefined;
        const orgDoc = await db.collection('Organizations').doc(target.organizationId).get();
        const orgData = orgDoc.data();
        const ownerId = orgData?.['ownerId'] as string | undefined;
        const admins = (orgData?.['admins'] as Array<{ userId: string }>) ?? [];
        const adminIds = admins.map((a) => a.userId).filter(Boolean);
        const isAdmin = role === 'director' || ownerId === userId || adminIds.includes(userId);
        if (!isAdmin) {
          return res.json({ success: true, data: [] });
        }
      }
    }

    const customerDoc = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('userId', '==', target.billingUserId)
      .where('environment', '==', environment)
      .limit(1)
      .get();

    if (customerDoc.empty) {
      return res.json({ success: true, data: [] });
    }

    const customerId = customerDoc.docs[0]?.data()['stripeCustomerId'] as string;
    const stripe = getStripeClient(environment);
    const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });

    const customer = await stripe.customers.retrieve(customerId);
    const defaultMethodId =
      typeof customer !== 'string' && !customer.deleted
        ? typeof customer.invoice_settings?.default_payment_method === 'string'
          ? customer.invoice_settings.default_payment_method
          : customer.invoice_settings?.default_payment_method?.id
        : undefined;

    const paymentMethods: UsagePaymentMethod[] = methods.data.map((m) => ({
      id: m.id,
      type: 'card' as const,
      provider: 'stripe' as const,
      label: `${(m.card?.brand ?? 'card').charAt(0).toUpperCase() + (m.card?.brand ?? 'card').slice(1)} ending in ${m.card?.last4 ?? '****'}`,
      last4: m.card?.last4 ?? null,
      brand: m.card?.brand ?? null,
      expiryMonth: m.card?.exp_month ?? null,
      expiryYear: m.card?.exp_year ?? null,
      isDefault: m.id === defaultMethodId,
      email: null,
      addedAt: new Date(m.created * 1000).toISOString(),
    }));

    return res.json({ success: true, data: paymentMethods });
  } catch (error) {
    logger.error('[GET /payment-methods] Failed to get payment methods', { error });
    return res.status(500).json({
      error: 'Failed to get payment methods',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @deprecated Use Stripe Customer Portal (POST /portal-session) instead.
 * POST /api/v1/usage/payment-methods/add — kept for backwards compatibility only.
 */
router.post(
  '/payment-methods/add',
  appGuard,
  validateBody(AddPaymentMethodTokenDto),
  async (_req: Request, res: Response) => {
    return res.status(410).json({
      error:
        'This endpoint has been deprecated. Use the Stripe Customer Portal to manage payment methods.',
      code: 'DEPRECATED_USE_PORTAL',
    });
  }
);

/**
 * POST /api/v1/usage/payment-methods/setup-intent
 * Create a Stripe SetupIntent to save a card via Stripe Elements.
 * Only available for Org/Team users — Individual users use Apple IAP.
 */
router.post('/payment-methods/setup-intent', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;

    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    const billingCtx = await getBillingContext(db, userId);
    if (billingCtx?.billingEntity === 'individual') {
      return res.status(400).json({
        error: 'Individual users manage payment via Apple IAP, not Stripe',
        code: 'INDIVIDUAL_USE_IAP',
      });
    }

    const environment = req.isStaging ? 'staging' : 'production';
    const email = req.user!.email ?? '';

    const target = await resolveBillingTarget(db, userId);
    const { customerId } = await getOrCreateCustomer(
      db,
      target.billingUserId,
      email,
      target.teamIds?.[0],
      environment
    );

    const clientSecret = await createSetupIntent(customerId, environment);

    logger.info('[POST /payment-methods/setup-intent] SetupIntent created', { userId });
    return res.json({ success: true, data: { clientSecret } });
  } catch (error) {
    logger.error('[POST /payment-methods/setup-intent] Failed to create setup intent', { error });
    return res.status(500).json({
      error: 'Failed to create setup intent',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/usage/payment-methods/remove
 * Remove a saved payment method (with ownership verification)
 */
router.post(
  '/payment-methods/remove',
  appGuard,
  validateBody(PaymentMethodIdDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { methodId } = req.body as PaymentMethodIdDto;

      const db = req.firebase?.db;
      if (!db) throw new Error('Firebase context not available');
      const environment = req.isStaging ? 'staging' : 'production';

      // Verify the payment method belongs to this user's Stripe customer
      const target = await resolveBillingTarget(db, userId);
      const customerDoc = await db
        .collection(COLLECTIONS.STRIPE_CUSTOMERS)
        .where('userId', '==', target.billingUserId)
        .where('environment', '==', environment)
        .limit(1)
        .get();

      if (customerDoc.empty) {
        return res.status(404).json({ error: 'No Stripe customer found' });
      }

      const customerId = customerDoc.docs[0]?.data()['stripeCustomerId'] as string;
      const stripe = getStripeClient(environment);

      // Retrieve the payment method and verify it belongs to this customer
      const pm = await stripe.paymentMethods.retrieve(methodId);
      if (pm.customer !== customerId) {
        logger.warn('[POST /payment-methods/remove] Ownership mismatch', {
          userId,
          methodId,
          expectedCustomer: customerId,
          actualCustomer: pm.customer,
        });
        return res.status(403).json({ error: 'Payment method does not belong to this account' });
      }

      await stripe.paymentMethods.detach(methodId);

      logger.info('[POST /payment-methods/remove] Payment method removed', {
        userId,
        methodId,
      });
      return res.json({ success: true });
    } catch (error) {
      logger.error('[POST /payment-methods/remove] Failed to remove payment method', { error });
      return res.status(500).json({
        error: 'Failed to remove payment method',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/v1/usage/payment-methods/default
 * Set a payment method as default
 */
router.post(
  '/payment-methods/default',
  appGuard,
  validateBody(PaymentMethodIdDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { methodId } = req.body as PaymentMethodIdDto;

      const db = req.firebase?.db;
      if (!db) throw new Error('Firebase context not available');
      const environment = req.isStaging ? 'staging' : 'production';

      // Resolve billing target (director → org, otherwise individual)
      const target = await resolveBillingTarget(db, userId);

      const customerDoc = await db
        .collection(COLLECTIONS.STRIPE_CUSTOMERS)
        .where('userId', '==', target.billingUserId)
        .where('environment', '==', environment)
        .limit(1)
        .get();

      if (customerDoc.empty) {
        return res.status(404).json({ error: 'No Stripe customer found' });
      }

      const customerId = customerDoc.docs[0]?.data()['stripeCustomerId'] as string;
      const stripe = getStripeClient(environment);

      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: methodId },
      });

      logger.info('[POST /payment-methods/default] Default payment method updated', {
        userId,
        methodId,
      });
      return res.json({ success: true });
    } catch (error) {
      logger.error('[POST /payment-methods/default] Failed to set default payment method', {
        error,
      });
      return res.status(500).json({
        error: 'Failed to set default payment method',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * @deprecated Use Stripe Customer Portal (POST /portal-session) instead.
 * POST /api/v1/usage/billing-info — kept for backwards compatibility only.
 */
router.post('/billing-info', appGuard, async (_req: Request, res: Response) => {
  return res.status(410).json({
    error:
      'This endpoint has been deprecated. Use the Stripe Customer Portal to manage billing info.',
    code: 'DEPRECATED_USE_PORTAL',
  });
});

/**
 * POST /api/v1/usage/buy-credits
 * Purchase credits via Stripe Checkout (B2C wallet top-up).
 * Creates a Stripe Checkout Session in "payment" mode for a one-time purchase.
 * On success the webhook credits the wallet; the frontend gets the checkout URL.
 *
 * Body: { amountCents: number } — min 500 ($5), max 50000 ($500)
 */
router.post(
  '/buy-credits',
  appGuard,
  validateBody(BuyCreditsDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const email = req.user!.email ?? '';
      const { amountCents } = req.body as BuyCreditsDto;
      const db = req.firebase?.db;

      if (!db) {
        return res.status(503).json({ error: 'Database unavailable' });
      }

      const environment = req.isStaging ? 'staging' : 'production';
      const { customerId } = await getOrCreateCustomer(db, userId, email, undefined, environment);
      const stripe = getStripeClient(environment);

      const origin = req.headers.origin ?? '';
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: amountCents,
              product_data: {
                name: 'NXT1 Credits',
                description: `$${(amountCents / 100).toFixed(2)} credit top-up`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          userId,
          type: 'wallet_topup',
          amountCents: String(amountCents),
        },
        success_url: `${origin}/usage?credits=success&amount=${amountCents}`,
        cancel_url: `${origin}/usage?credits=cancelled`,
      });

      logger.info('[POST /buy-credits] Checkout session created', {
        userId,
        amountCents,
        sessionId: session.id,
      });

      return res.json({ success: true, url: session.url });
    } catch (error) {
      logger.error('[POST /buy-credits] Failed to create checkout session', { error });
      return res.status(500).json({
        error: 'Failed to start credit purchase',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/v1/usage/budgets
 * List budgets for current user
 */
router.get('/budgets', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    // Resolve billing target (director → org, otherwise individual)
    const target = await resolveBillingTarget(db, userId);
    const ctx = target.context;

    const accountName =
      ctx.billingEntity === 'organization'
        ? 'Organization'
        : ctx.billingEntity === 'team'
          ? 'Team'
          : 'Personal';

    // For org billing, include team allocations
    let teamAllocations: UsageBudget['teamAllocations'];
    if (ctx.billingEntity === 'organization' && ctx.organizationId) {
      const allocations = await getOrgTeamAllocations(db, ctx.organizationId);
      if (allocations.length > 0) {
        const teamDocs = await Promise.all(
          allocations.map((a) => db.collection('Teams').doc(a.teamId).get())
        );
        const teamNames = new Map(
          teamDocs.map((doc) => [doc.id, (doc.data()?.['name'] as string) ?? 'Unknown Team'])
        );

        teamAllocations = allocations.map((a) => ({
          teamId: a.teamId,
          teamName: teamNames.get(a.teamId) ?? 'Unknown Team',
          monthlyLimit: a.monthlyLimit,
          currentSpend: a.currentPeriodSpend,
          percentUsed:
            a.monthlyLimit > 0 ? Math.round((a.currentPeriodSpend / a.monthlyLimit) * 100) : 0,
        }));
      }
    }

    const budgets: UsageBudget[] = [
      {
        id: `budget-${userId}`,
        category: 'ai',
        productName: 'Overall Budget',
        budgetLimit: ctx.monthlyBudget,
        spent: ctx.currentPeriodSpend,
        percentUsed:
          ctx.monthlyBudget > 0
            ? Math.round((ctx.currentPeriodSpend / ctx.monthlyBudget) * 100)
            : 0,
        stopOnLimit: ctx.hardStop,
        accountName,
        ownershipPercent: 100,
        teamAllocations,
      },
    ];

    return res.json({ success: true, data: budgets });
  } catch (error) {
    logger.error('[GET /budgets] Failed to get budgets', { error });
    return res.status(500).json({
      error: 'Failed to get budgets',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/usage/receipt/:transactionId
 * Get receipt download URL
 */
router.get('/receipt/:transactionId', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const transactionId = req.params['transactionId'] as string;
    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    const logDoc = await db.collection(COLLECTIONS.PAYMENT_LOGS).doc(transactionId).get();
    if (!logDoc.exists) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const logData = logDoc.data();
    // Allow access if the log belongs to the user directly OR to their org billing target
    const target = await resolveBillingTarget(db, userId);
    if (logData?.['userId'] !== userId && logData?.['userId'] !== target.billingUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const receiptUrl = logData?.['receiptUrl'] as string | undefined;
    if (!receiptUrl) {
      return res.status(404).json({ error: 'Receipt not available' });
    }

    return res.json({ success: true, data: { url: receiptUrl } });
  } catch (error) {
    logger.error('[GET /receipt/:id] Failed to get receipt', { error });
    return res.status(500).json({
      error: 'Failed to get receipt',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/v1/usage/invoice/:transactionId
 * Get invoice download URL
 */
router.get('/invoice/:transactionId', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const transactionId = req.params['transactionId'] as string;
    const db = req.firebase?.db;
    if (!db) throw new Error('Firebase context not available');

    const logDoc = await db.collection(COLLECTIONS.PAYMENT_LOGS).doc(transactionId).get();
    if (!logDoc.exists) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const logData = logDoc.data();
    // Allow access if the log belongs to the user directly OR to their org billing target
    const target = await resolveBillingTarget(db, userId);
    if (logData?.['userId'] !== userId && logData?.['userId'] !== target.billingUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const invoiceUrl = logData?.['invoiceUrl'] as string | undefined;
    if (!invoiceUrl) {
      return res.status(404).json({ error: 'Invoice not available' });
    }

    return res.json({ success: true, data: { url: invoiceUrl } });
  } catch (error) {
    logger.error('[GET /invoice/:id] Failed to get invoice', { error });
    return res.status(500).json({
      error: 'Failed to get invoice',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/usage/coupon/redeem
 * Redeem a coupon code
 */
router.post(
  '/coupon/redeem',
  appGuard,
  validateBody(RedeemCouponDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { code } = req.body as RedeemCouponDto;

      const db = req.firebase?.db;
      if (!db) throw new Error('Firebase context not available');
      const environment = req.isStaging ? 'staging' : 'production';

      // Look up coupon in Stripe
      const stripe = getStripeClient(environment);
      const promotionCodes = await stripe.promotionCodes.list({
        code: code.trim().toUpperCase(),
        active: true,
        limit: 1,
      });

      if (promotionCodes.data.length === 0) {
        return res.status(404).json({ error: 'Invalid or expired coupon code' });
      }

      // Apply coupon to customer
      const customerDoc = await db
        .collection(COLLECTIONS.STRIPE_CUSTOMERS)
        .where('userId', '==', userId)
        .where('environment', '==', environment)
        .limit(1)
        .get();

      if (customerDoc.empty) {
        return res.status(404).json({ error: 'No billing account found' });
      }

      const customerId = customerDoc.docs[0]?.data()['stripeCustomerId'] as string;
      const promoCode = promotionCodes.data[0]!;
      const couponObj = (promoCode as unknown as Record<string, unknown>)['coupon'] as
        | string
        | { id: string }
        | undefined;
      const couponId = typeof couponObj === 'string' ? couponObj : couponObj?.id;

      if (couponId) {
        await stripe.customers.update(customerId, {
          promotion_code: promoCode.id,
        } as Record<string, unknown>);
      }

      logger.info('[POST /coupon/redeem] Coupon redeemed', { userId, code: code.trim() });
      return res.json({ success: true });
    } catch (error) {
      logger.error('[POST /coupon/redeem] Failed to redeem coupon', { error });
      return res.status(500).json({
        error: 'Failed to redeem coupon',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

// ============================================
// STRIPE CUSTOMER PORTAL
// ============================================

/**
 * POST /api/v1/usage/portal-session
 * Create a Stripe Customer Portal session so the user can manage
 * payment methods, billing info, and invoices on Stripe's hosted UI.
 *
 * @returns {{ success: true, url: string }}
 */
router.post('/portal-session', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase?.db;
    const email = req.user!.email ?? '';
    const environment = req.isStaging ? 'staging' : 'production';

    if (!db) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    // Resolve who actually pays — directors bill to their org's Stripe customer,
    // individuals bill to their own.
    const billingCtx = await getBillingContext(db, userId);
    let customerUserId = userId;
    let customerEmail = email;

    if (billingCtx?.billingEntity === 'organization' && billingCtx.organizationId) {
      // ── Guard: Only org admins can access the Stripe Customer Portal ──
      const userDoc = await db.collection('Users').doc(userId).get();
      const role = userDoc.data()?.['role'] as string | undefined;
      const orgDoc = await db.collection('Organizations').doc(billingCtx.organizationId).get();
      const orgData = orgDoc.data();
      const ownerId = orgData?.['ownerId'] as string | undefined;
      const admins = (orgData?.['admins'] as Array<{ userId: string }>) ?? [];
      const adminIds = admins.map((a) => a.userId).filter(Boolean);
      const isAdmin = role === 'director' || ownerId === userId || adminIds.includes(userId);

      if (!isAdmin) {
        logger.warn('[POST /portal-session] Non-admin attempted to access Stripe portal', {
          userId,
          organizationId: billingCtx.organizationId,
        });
        return res.status(403).json({ error: 'Only organization admins can manage billing' });
      }

      // Director / org-billed: open portal for the org's Stripe customer
      customerUserId = `org:${billingCtx.organizationId}`;
      customerEmail =
        (orgData?.['billingEmail'] as string) || (orgData?.['email'] as string) || email;
      logger.info('[POST /portal-session] Resolved director to org customer', {
        userId,
        organizationId: billingCtx.organizationId,
        customerUserId,
      });
    } else if (billingCtx?.billingEntity === 'team' && billingCtx.teamId) {
      // Legacy team billing
      customerUserId = `team:${billingCtx.teamId}`;
      const teamDoc = await db.collection('Teams').doc(billingCtx.teamId).get();
      const teamData = teamDoc.data();
      customerEmail =
        (teamData?.['billingEmail'] as string) || (teamData?.['email'] as string) || email;
    }

    const { customerId } = await getOrCreateCustomer(
      db,
      customerUserId,
      customerEmail,
      billingCtx?.teamId,
      environment
    );

    const stripe = getStripeClient(environment);
    const returnUrl =
      req.body?.returnUrl && typeof req.body.returnUrl === 'string'
        ? req.body.returnUrl
        : `${req.headers.origin ?? ''}/usage`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    logger.info('[POST /portal-session] Portal session created', {
      userId,
      customerUserId,
      customerId,
      billingEntity: billingCtx?.billingEntity ?? 'individual',
    });

    return res.json({ success: true, url: session.url });
  } catch (error) {
    logger.error('[POST /portal-session] Failed to create portal session', {
      error,
      userId: req.user?.uid,
    });
    return res.status(500).json({
      error: 'Failed to create billing portal session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
