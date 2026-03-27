/**
 * @fileoverview Usage Dashboard Routes
 * @module @nxt1/backend/routes
 *
 * API endpoints for the usage/billing dashboard.
 * Aggregates data from Firestore + Stripe for the frontend dashboard UI.
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  AddPaymentMethodTokenDto,
  PaymentMethodIdDto,
  SimpleBillingInfoDto,
  RedeemCouponDto,
} from '../dtos/usage.dto.js';
import { logger } from '../utils/logger.js';
import {
  COLLECTIONS,
  getOrCreateCustomer,
  getStripeClient,
  getOrCreateBillingContext,
  getOrgTeamAllocations,
} from '../modules/billing/index.js';
import { USAGE_PRODUCT_CONFIGS, USAGE_CATEGORY_CONFIGS, USAGE_HISTORY_PAGE_SIZE } from '@nxt1/core';
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

    // Parallel queries
    const [billingCtx, eventsSnap] = await Promise.all([
      getOrCreateBillingContext(db, userId),
      db
        .collection(COLLECTIONS.USAGE_EVENTS)
        .where('userId', '==', userId)
        .where('createdAt', '>=', start.toISOString())
        .where('createdAt', '<=', end.toISOString())
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get(),
    ]);

    // Aggregate usage by feature
    const featureUsage = new Map<string, number>();
    const dailyUsage = new Map<string, number>();
    let totalUsageCents = 0;

    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      const feature = data['feature'] as string;
      const cost = (data['unitCostSnapshot'] as number) * (data['quantity'] as number);
      totalUsageCents += cost;

      featureUsage.set(feature, (featureUsage.get(feature) ?? 0) + cost);

      const dateKey = (data['createdAt'] as string).slice(0, 10);
      dailyUsage.set(dateKey, (dailyUsage.get(dateKey) ?? 0) + cost);
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

    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      const dateKey = (data['createdAt'] as string).slice(0, 10);
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

    // Payment history from paymentLogs
    const paymentLogsSnap = await db
      .collection(COLLECTIONS.PAYMENT_LOGS)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(USAGE_HISTORY_PAGE_SIZE)
      .get();

    const paymentHistory: UsagePaymentHistoryRecord[] = paymentLogsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        displayId: doc.id.slice(0, 8).toUpperCase(),
        amount: (d['amount'] as number) ?? 0,
        currency: 'usd',
        status: (d['status'] as 'completed') ?? 'completed',
        paymentMethodLabel: (d['paymentMethodLabel'] as string) ?? 'Card',
        provider: 'stripe',
        createdAt: (d['createdAt'] as string) ?? new Date().toISOString(),
        dateLabel: (d['createdAt'] as string)?.slice(0, 10) ?? '',
        receiptUrl: (d['receiptUrl'] as string) ?? null,
        invoiceUrl: (d['invoiceUrl'] as string) ?? null,
      };
    });

    // Payment methods from Stripe
    let paymentMethods: UsagePaymentMethod[] = [];
    try {
      const customerDoc = await db
        .collection(COLLECTIONS.STRIPE_CUSTOMERS)
        .where('userId', '==', userId)
        .where('environment', '==', environment)
        .limit(1)
        .get();

      if (!customerDoc.empty) {
        const customerId = customerDoc.docs[0]?.data()['stripeCustomerId'] as string;
        const stripe = getStripeClient(environment);
        const methods = await stripe.paymentMethods.list({
          customer: customerId,
          type: 'card',
        });

        const customer = await stripe.customers.retrieve(customerId);
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
      }
    } catch (err) {
      logger.warn('[GET /dashboard] Failed to fetch payment methods from Stripe', { error: err });
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
          allocations.map((a) => db.collection('teams').doc(a.teamId).get())
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
      paymentHistory,
      paymentMethods,
      billingInfo: null,
      coupon: null,
      budgets,
      billingEntity: billingCtx.billingEntity,
      paymentProvider: billingCtx.paymentProvider,
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

    const [billingCtx, eventsSnap] = await Promise.all([
      getOrCreateBillingContext(db, userId),
      db
        .collection(COLLECTIONS.USAGE_EVENTS)
        .where('userId', '==', userId)
        .where('createdAt', '>=', start.toISOString())
        .where('createdAt', '<=', end.toISOString())
        .get(),
    ]);

    let totalUsageCents = 0;
    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      totalUsageCents += (data['unitCostSnapshot'] as number) * (data['quantity'] as number);
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

    const eventsSnap = await db
      .collection(COLLECTIONS.USAGE_EVENTS)
      .where('userId', '==', userId)
      .where('createdAt', '>=', start.toISOString())
      .where('createdAt', '<=', end.toISOString())
      .get();

    const dailyUsage = new Map<string, number>();
    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      const dateKey = (data['createdAt'] as string).slice(0, 10);
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

    const eventsSnap = await db
      .collection(COLLECTIONS.USAGE_EVENTS)
      .where('userId', '==', userId)
      .where('createdAt', '>=', start.toISOString())
      .where('createdAt', '<=', end.toISOString())
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    const dailyEvents = new Map<string, Map<string, { qty: number; cost: number }>>();

    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      const dateKey = (data['createdAt'] as string).slice(0, 10);
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

    // Get total count
    const countSnap = await db
      .collection(COLLECTIONS.PAYMENT_LOGS)
      .where('userId', '==', userId)
      .count()
      .get();
    const total = countSnap.data().count;

    // Get paginated records
    const logsSnap = await db
      .collection(COLLECTIONS.PAYMENT_LOGS)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .offset(offset)
      .limit(limit)
      .get();

    const records: UsagePaymentHistoryRecord[] = logsSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        displayId: doc.id.slice(0, 8).toUpperCase(),
        amount: (d['amount'] as number) ?? 0,
        currency: 'usd',
        status: (d['status'] as 'completed') ?? 'completed',
        paymentMethodLabel: (d['paymentMethodLabel'] as string) ?? 'Card',
        provider: 'stripe',
        createdAt: (d['createdAt'] as string) ?? new Date().toISOString(),
        dateLabel: (d['createdAt'] as string)?.slice(0, 10) ?? '',
        receiptUrl: (d['receiptUrl'] as string) ?? null,
        invoiceUrl: (d['invoiceUrl'] as string) ?? null,
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

    const customerDoc = await db
      .collection(COLLECTIONS.STRIPE_CUSTOMERS)
      .where('userId', '==', userId)
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
 * POST /api/v1/usage/payment-methods/add
 * Add a new payment method via Stripe token
 */
router.post(
  '/payment-methods/add',
  appGuard,
  validateBody(AddPaymentMethodTokenDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { token } = req.body as AddPaymentMethodTokenDto;

      const db = req.firebase?.db;
      if (!db) throw new Error('Firebase context not available');
      const environment = req.isStaging ? 'staging' : 'production';
      const email = req.user!.email ?? '';

      const { customerId } = await getOrCreateCustomer(db, userId, email, undefined, environment);
      const stripe = getStripeClient(environment);

      const paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: { token },
      });

      await stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId });

      const result: UsagePaymentMethod = {
        id: paymentMethod.id,
        type: 'card',
        provider: 'stripe',
        label: `${(paymentMethod.card?.brand ?? 'card').charAt(0).toUpperCase() + (paymentMethod.card?.brand ?? 'card').slice(1)} ending in ${paymentMethod.card?.last4 ?? '****'}`,
        last4: paymentMethod.card?.last4 ?? null,
        brand: paymentMethod.card?.brand ?? null,
        expiryMonth: paymentMethod.card?.exp_month ?? null,
        expiryYear: paymentMethod.card?.exp_year ?? null,
        isDefault: false,
        email: null,
        addedAt: new Date().toISOString(),
      };

      logger.info('[POST /payment-methods/add] Payment method added', {
        userId,
        methodId: result.id,
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      logger.error('[POST /payment-methods/add] Failed to add payment method', { error });
      return res.status(500).json({
        error: 'Failed to add payment method',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/v1/usage/payment-methods/remove
 * Remove a saved payment method
 */
router.post(
  '/payment-methods/remove',
  appGuard,
  validateBody(PaymentMethodIdDto),
  async (req: Request, res: Response) => {
    try {
      const { methodId } = req.body as PaymentMethodIdDto;

      const environment = req.isStaging ? 'staging' : 'production';
      const stripe = getStripeClient(environment);

      await stripe.paymentMethods.detach(methodId);

      logger.info('[POST /payment-methods/remove] Payment method removed', { methodId });
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

      const customerDoc = await db
        .collection(COLLECTIONS.STRIPE_CUSTOMERS)
        .where('userId', '==', userId)
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
 * POST /api/v1/usage/billing-info
 * Update billing information
 */
router.post(
  '/billing-info',
  appGuard,
  validateBody(SimpleBillingInfoDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { name, addressLine1, addressLine2, country } = req.body as SimpleBillingInfoDto;

      const db = req.firebase?.db;
      if (!db) throw new Error('Firebase context not available');

      await db
        .collection('billingInfo')
        .doc(userId)
        .set(
          {
            name: String(name).slice(0, 200),
            addressLine1: String(addressLine1 ?? '').slice(0, 200),
            addressLine2: String(addressLine2 ?? '').slice(0, 200),
            country: String(country ?? '').slice(0, 100),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

      logger.info('[POST /billing-info] Billing info updated', { userId });
      return res.json({ success: true });
    } catch (error) {
      logger.error('[POST /billing-info] Failed to update billing info', { error });
      return res.status(500).json({
        error: 'Failed to update billing info',
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

    const ctx = await getOrCreateBillingContext(db, userId);

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
          allocations.map((a) => db.collection('teams').doc(a.teamId).get())
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
    if (logData?.['userId'] !== userId) {
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
    if (logData?.['userId'] !== userId) {
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

export default router;
