/**
 * @fileoverview Usage Dashboard Routes
 * @module @nxt1/backend/routes
 *
 * API endpoints for the usage/billing dashboard.
 * Aggregates data from Firestore + Stripe for the frontend dashboard UI.
 */

import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { Types } from 'mongoose';
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  PaymentMethodIdDto,
  RedeemCouponDto,
  BuyCreditsDto,
  AutoTopUpDto,
  BillingModeDto,
  InvoiceTopUpDto,
} from '../dtos/usage.dto.js';
import { logger } from '../utils/logger.js';
import {
  COLLECTIONS,
  getOrCreateCustomer,
  getStripeClient,
  createSetupIntent,
  getBillingContext,
  getOrCreateBillingContext,
  getOrgTeamAllocations,
  resolveBillingTarget,
  evictBillingResolutionCache,
  chargeOffSession,
  addWalletTopUp,
  type ResolvedBillingTarget,
} from '../modules/billing/index.js';
import { USAGE_PRODUCT_CONFIGS, USAGE_CATEGORY_CONFIGS, USAGE_HISTORY_PAGE_SIZE } from '@nxt1/core';
import { UsageEventModel, type UsageEventDocument } from '../models/usage-event.model.js';
import { PaymentLogModel, type PaymentLogDocument } from '../models/payment-log.model.js';

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

function hasConfiguredBudget(ctx: {
  billingEntity: string;
  monthlyBudget: number;
  budgetAlertsEnabled?: boolean;
  budgetName?: string;
}): boolean {
  if (ctx.monthlyBudget <= 0) return false;
  if (ctx.billingEntity === 'individual') return false;
  if (ctx.billingEntity === 'organization') {
    return ctx.budgetAlertsEnabled === true || ctx.budgetName !== 'Starter budget';
  }
  return ctx.budgetAlertsEnabled === true;
}

import type {
  UsageOverview,
  UsageChartDataPoint,
  UsageProductDetail,
  UsageTopItem,
  UsageBreakdownRow,
  UsageBreakdownLineItem,
  UsageBreakdownTeam,
  UsageBreakdownUser,
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
  if (config) return config.name;
  // Humanize raw tool names from agent metadata (e.g. "generate_scout_report" → "Generate Scout Report")
  return feature.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================
// BREAKDOWN BUILDER
// ============================================

/**
 * Build breakdown rows from usage event documents.
 *
 * For **organization** billing targets, events are aggregated into a
 * nested hierarchy: Day → Team → User → Product.  This lets the UI
 * render a multi-level drill-down table.
 *
 * For **individual** billing targets, events are aggregated into the
 * flat Day → Product structure (unchanged behaviour).
 *
 * Team and user display names are batch-fetched from Firestore
 * (chunked in groups of 30 for the `.in()` query limit).
 */
async function buildBreakdownRows(
  db: Firestore,
  eventsDocs: readonly UsageEventDocument[],
  target: ResolvedBillingTarget
): Promise<UsageBreakdownRow[]> {
  const isOrg = target.type === 'organization';

  // ── Collect unique IDs for name lookups ─────────────────────────
  const userIdSet = new Set<string>();
  const teamIdSet = new Set<string>();

  // ── Aggregate: day → team → user → feature ─────────────────────
  // For individuals we skip the team/user level.
  interface FeatureAgg {
    qty: number;
    cost: number;
  }

  // Org path: day → teamId → userId → feature → FeatureAgg
  const orgDaily = new Map<string, Map<string, Map<string, Map<string, FeatureAgg>>>>();
  // Individual path: day → feature → FeatureAgg
  const indDaily = new Map<string, Map<string, FeatureAgg>>();

  for (const doc of eventsDocs) {
    const dateKey = doc.createdAt.toISOString().slice(0, 10);
    let feature = doc.feature;
    const cost = doc.unitCostSnapshot * doc.quantity;
    const qty = doc.quantity;

    // ── Autonomous agent billing: unpack tool name from metadata ──
    if (feature === 'activity-usage') {
      const meta = doc.metadata as Record<string, unknown> | undefined;
      const agentTools = meta?.['agentTools'] as string[] | undefined;
      if (agentTools && agentTools.length > 0) {
        feature = agentTools[agentTools.length - 1]!;
      }
    }

    if (isOrg) {
      const evTeamId = doc.teamId ?? 'unknown';
      const evUserId = doc.userId ?? 'unknown';
      if (evTeamId !== 'unknown') teamIdSet.add(evTeamId);
      if (evUserId !== 'unknown') userIdSet.add(evUserId);

      if (!orgDaily.has(dateKey)) orgDaily.set(dateKey, new Map());
      const teamMap = orgDaily.get(dateKey)!;
      if (!teamMap.has(evTeamId)) teamMap.set(evTeamId, new Map());
      const userMap = teamMap.get(evTeamId)!;
      if (!userMap.has(evUserId)) userMap.set(evUserId, new Map());
      const featureMap = userMap.get(evUserId)!;
      const existing = featureMap.get(feature) ?? { qty: 0, cost: 0 };
      featureMap.set(feature, { qty: existing.qty + qty, cost: existing.cost + cost });
    } else {
      if (!indDaily.has(dateKey)) indDaily.set(dateKey, new Map());
      const featureMap = indDaily.get(dateKey)!;
      const existing = featureMap.get(feature) ?? { qty: 0, cost: 0 };
      featureMap.set(feature, { qty: existing.qty + qty, cost: existing.cost + cost });
    }
  }

  // ── Batch-fetch display names (org only) ──────────────────────
  const userNames = new Map<string, string>();
  const teamNames = new Map<string, string>();

  if (isOrg) {
    const uIds = Array.from(userIdSet);
    for (let i = 0; i < uIds.length; i += 30) {
      const chunk = uIds.slice(i, i + 30);
      const snap = await db.collection('Users').where('__name__', 'in', chunk).get();
      for (const d of snap.docs) {
        const ud = d.data();
        const first = (ud['firstName'] as string) ?? '';
        const last = (ud['lastName'] as string) ?? '';
        userNames.set(d.id, `${first} ${last}`.trim() || d.id);
      }
    }
    const tIds = Array.from(teamIdSet);
    for (let i = 0; i < tIds.length; i += 30) {
      const chunk = tIds.slice(i, i + 30);
      const snap = await db.collection('Teams').where('__name__', 'in', chunk).get();
      for (const d of snap.docs) {
        const td = d.data();
        const tName = (td['teamName'] as string) ?? '';
        const sport = (td['sport'] as string) ?? (td['sportName'] as string) ?? '';
        const label = [tName, sport].filter(Boolean).join(' · ') || d.id;
        teamNames.set(d.id, label);
      }
    }
  }

  // ── Helper: build flat line items from a feature map ────────────
  function buildLineItems(featureMap: Map<string, FeatureAgg>): UsageBreakdownLineItem[] {
    const items: UsageBreakdownLineItem[] = [];
    for (const [feature, { qty, cost }] of featureMap) {
      const unitCost = qty > 0 ? cost / qty : 0;
      items.push({
        sku: getFeatureDisplayName(feature),
        units: `${qty}`,
        pricePerUnit: `$${(unitCost / 100).toFixed(2)}`,
        grossAmount: cost,
        billedAmount: cost,
      });
    }
    return items;
  }

  // ── Build response rows ──────────────────────────────────────────
  const breakdownRows: UsageBreakdownRow[] = [];

  if (isOrg) {
    for (const [dateKey, teamMap] of Array.from(orgDaily.entries()).sort(
      (a, b) => b[0].localeCompare(a[0]) // DESC
    )) {
      let dayGross = 0;
      const teams: UsageBreakdownTeam[] = [];

      for (const [teamId, userMap] of teamMap) {
        let teamGross = 0;
        const users: UsageBreakdownUser[] = [];

        for (const [userId, featureMap] of userMap) {
          const lineItems = buildLineItems(featureMap).map((li) => ({
            ...li,
            billedAmount: li.grossAmount,
          }));
          const userGross = lineItems.reduce((sum, li) => sum + li.grossAmount, 0);
          teamGross += userGross;
          users.push({
            userId,
            userName: userNames.get(userId) ?? userId,
            grossAmount: userGross,
            billedAmount: userGross,
            lineItems,
          });
        }

        users.sort((a, b) => b.grossAmount - a.grossAmount);
        dayGross += teamGross;
        teams.push({
          teamId,
          teamName: teamNames.get(teamId) ?? teamId,
          grossAmount: teamGross,
          billedAmount: teamGross,
          users,
        });
      }

      teams.sort((a, b) => b.grossAmount - a.grossAmount);

      breakdownRows.push({
        date: dateKey,
        dateLabel: formatDateLabel(new Date(dateKey + 'T00:00:00')),
        grossAmount: dayGross,
        billedAmount: dayGross,
        lineItems: [], // Org rows use `teams` instead
        teams,
      });
    }
  } else {
    // Individual: flat day → products
    for (const [dateKey, featureMap] of Array.from(indDaily.entries()).sort(
      (a, b) => b[0].localeCompare(a[0]) // DESC
    )) {
      const lineItems = buildLineItems(featureMap).map((li) => ({
        ...li,
        billedAmount: li.grossAmount,
      }));
      const dayGross = lineItems.reduce((sum, li) => sum + li.grossAmount, 0);

      breakdownRows.push({
        date: dateKey,
        dateLabel: formatDateLabel(new Date(dateKey + 'T00:00:00')),
        grossAmount: dayGross,
        billedAmount: dayGross,
        lineItems,
      });
    }
  }

  return breakdownRows;
}

// ============================================
// QUERY HELPERS
// ============================================

/**
 * Fetch usage events for an organization by querying all team IDs in one go.
 * MongoDB's `$in` operator handles any number of values without chunking.
 */
async function fetchOrgUsageEvents(
  teamIds: string[],
  startDate: Date,
  endDate: Date,
  orderDesc = true,
  limit = 1000
): Promise<UsageEventDocument[]> {
  if (teamIds.length === 0) return [];

  const docs = await UsageEventModel.find({
    teamId: { $in: teamIds },
    createdAt: { $gte: startDate, $lte: endDate },
  })
    .sort({ createdAt: orderDesc ? -1 : 1 })
    .limit(limit)
    .lean();

  return docs as UsageEventDocument[];
}

/**
 * Fetch usage events for either an org (by teamIds) or an individual (by userId).
 */
async function fetchUsageEvents(
  _db: Firestore,
  target: ResolvedBillingTarget,
  startDate: Date,
  endDate: Date,
  orderDesc = true,
  limit = 1000
): Promise<UsageEventDocument[]> {
  if (target.type === 'organization' && target.teamIds && target.teamIds.length > 0) {
    return fetchOrgUsageEvents(target.teamIds, startDate, endDate, orderDesc, limit);
  }

  const docs = await UsageEventModel.find({
    userId: target.billingUserId,
    createdAt: { $gte: startDate, $lte: endDate },
  })
    .sort({ createdAt: orderDesc ? -1 : 1 })
    .limit(limit)
    .lean();

  return docs as UsageEventDocument[];
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

    // Resolve billing target (director → org, otherwise individual).
    // Read the personal billing context first to get the usePersonalBilling flag,
    // then pass it explicitly so we don't rely on resolveBillingTarget's auto-read
    // which could return stale data right after a billing mode switch.
    const usePersonalBilling = (await getBillingContext(db, userId))?.usePersonalBilling ?? false;
    const target = await resolveBillingTarget(db, userId, { usePersonalBilling });
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
      // Individual billing target (personal wallet, or org member who switched
      // to personal billing). Admin flags refer to the ORG — not the wallet —
      // so they must be false here. Returning true would incorrectly render
      // admin-only UI and overwrite the post-mutation state on dashboard reload.
      return { isOrgAdmin: false, isTeamAdmin: false };
    })();

    const eventsPromise = fetchUsageEvents(db, target, start, end, true, 1000);

    const paymentLogsPromise = PaymentLogModel.find({ userId: target.billingUserId })
      .sort({ createdAt: -1 })
      .limit(USAGE_HISTORY_PAGE_SIZE)
      .lean();

    // Run all three in parallel
    const [adminResult, eventsDocs, paymentLogsSnap] = await Promise.all([
      adminCheckPromise,
      eventsPromise,
      paymentLogsPromise,
    ]);

    const { isOrgAdmin, isTeamAdmin } = adminResult;

    // Org member = on org billing but NOT a billing admin of any kind.
    // Hoisted early so payment-method fetch and dashboard masking both use it.
    const isOrgMember = target.type === 'organization' && !isOrgAdmin && !isTeamAdmin;

    // Aggregate usage by feature
    const featureUsage = new Map<string, number>();
    const dailyUsage = new Map<string, number>();
    let totalUsageCents = 0;

    // For IAP wallet users, org billing contexts, and personal billing overrides,
    // use the atomic counter (currentPeriodSpend) as the authoritative total.
    // deductWallet() and recordOrgSpend() always increment the counter, while
    // usage events may be missing for dynamic-cost features without Stripe price IDs.
    // For personal billing overrides: currentPeriodSpend only counts charges deducted
    // from the personal wallet — events from the prior org-billing period are excluded.
    const isIapUser =
      billingCtx.billingEntity === 'individual' && billingCtx.paymentProvider === 'iap';
    const isPersonalOverride = billingCtx.usePersonalBilling === true;
    const isOrgBilling = billingCtx.billingEntity === 'organization';

    if (isIapUser || isPersonalOverride) {
      // For IAP and personal-override users, currentPeriodSpend is the authoritative
      // total for the ACTIVE mode. On billing-mode switch, the backend restores it
      // from the preserved personal spend counter, so prior personal usage remains
      // intact when the user switches away and later returns.
      totalUsageCents = billingCtx.currentPeriodSpend ?? 0;
    } else {
      // Aggregate events for feature/daily breakdown (charts)
      for (const doc of eventsDocs) {
        const cost = doc.unitCostSnapshot * doc.quantity;
        totalUsageCents += cost;

        featureUsage.set(doc.feature, (featureUsage.get(doc.feature) ?? 0) + cost);

        const dateKey = doc.createdAt.toISOString().slice(0, 10);
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

    // Build chart data — stop at today so the line doesn't extend into future days
    const chartData: UsageChartDataPoint[] = [];
    let cumulative = 0;
    const current = new Date(start);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const chartEnd = end < today ? end : today;
    while (current <= chartEnd) {
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

    // Build breakdown rows (daily — org-aware with team/user names)
    const breakdownRows = await buildBreakdownRows(db, eventsDocs, target);

    // Payment history from the already-fetched paymentLogsSnap (parallelized above)
    const paymentLogDocs = paymentLogsSnap as PaymentLogDocument[];

    const paymentHistory: UsagePaymentHistoryRecord[] = paymentLogDocs.map((doc) => {
      const idStr = (doc._id as Types.ObjectId).toString();
      return {
        id: idStr,
        displayId: idStr.slice(0, 8).toUpperCase(),
        // PaymentLog stores amountPaid in dollars; UsagePaymentHistoryRecord.amount is cents.
        amount: Math.round((doc.amountPaid ?? 0) * 100),
        currency: (doc.currency ?? 'usd') as UsagePaymentHistoryRecord['currency'],
        status: normalizePaymentStatus(doc.status) as UsagePaymentHistoryRecord['status'],
        paymentMethodLabel: doc.paymentMethodLabel ?? 'Card',
        provider: 'stripe',
        createdAt: toISOString(doc.createdAt),
        dateLabel: toISOString(doc.createdAt).slice(0, 10),
        receiptUrl: doc.receiptUrl ?? null,
        invoiceUrl: doc.invoiceUrl ?? null,
      };
    });

  // Payment methods and billing info.
  // Primary: read from Firestore (StripeCustomers.defaultPaymentMethod — synced by webhooks)
  // to avoid slow Stripe API calls on every dashboard load. Fall back to Stripe only on a
  // cold cache, and skip entirely for non-admin org members who have no billing access.
    let paymentMethods: UsagePaymentMethod[] = [];
    let billingInfo: UsageBillingInfo | null = null;
    if (!isOrgMember) {
      try {
        const customerDoc = await db
          .collection(COLLECTIONS.STRIPE_CUSTOMERS)
          .where('userId', '==', target.billingUserId)
          .where('environment', '==', environment)
          .limit(1)
          .get();

        if (!customerDoc.empty) {
          const docData = customerDoc.docs[0]!.data() as Record<string, unknown>;
          const cached = docData['defaultPaymentMethod'] as Record<string, unknown> | undefined;

          if (cached?.['pmId']) {
            // Fast path: build from Firestore cache (set by payment_method.attached /
            // setup_intent.succeeded / customer.updated webhooks)
            const brand = (cached['brand'] as string | undefined) ?? 'card';
            paymentMethods = [
              {
                id: cached['pmId'] as string,
                type: 'card' as const,
                provider: 'stripe' as const,
                label: `${brand.charAt(0).toUpperCase() + brand.slice(1)} ending in ${(cached['last4'] as string | undefined) ?? '****'}`,
                last4: (cached['last4'] as string | null) ?? null,
                brand: brand ?? null,
                expiryMonth: (cached['expMonth'] as number | null) ?? null,
                expiryYear: (cached['expYear'] as number | null) ?? null,
                isDefault: true,
                email: null,
                addedAt: (docData['updatedAt'] as string | undefined) ?? new Date().toISOString(),
              },
            ];
          } else {
            // Cold path: no webhook data yet — fall back to Stripe API once
            const customerId = docData['stripeCustomerId'] as string;
            const stripe = getStripeClient(environment);
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
        }
      } catch (err) {
        logger.warn('[GET /dashboard] Failed to fetch payment methods', { error: err });
      }
    }

    // Budgets from billing context
    const accountName = billingCtx.billingEntity === 'organization' ? 'Organization' : 'Personal';

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

    const budgets: UsageBudget[] = hasConfiguredBudget(billingCtx)
      ? [
          {
            id: `budget-${userId}`,
            category: 'ai',
            productName: billingCtx.budgetName ?? 'Overall Budget',
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
        ]
      : [];

    // Authoritative section list — backend decides, frontend just renders.
    // Eliminating all tab-visibility conditional logic from the frontend.
    const allowedSections: UsageDashboardData['allowedSections'] = isOrgMember
      ? ['overview']
      : target.type === 'organization'
        ? ['overview', 'metered-usage', 'breakdown', 'budgets', 'payment-info']
        : ['overview', 'metered-usage', 'breakdown', 'payment-info']; // personal: payment-info to view/manage saved card

        const dashboard: UsageDashboardData = {
      overview,
      chartData: isOrgMember ? [] : chartData,
      productDetails: isOrgMember ? [] : productDetails,
      topItems: isOrgMember ? [] : topItems,
      breakdownRows: isOrgMember ? [] : breakdownRows,
      // Non-admin org members: mask all sensitive financial data.
      // Personal users and org admins both receive their full payment data.
      paymentHistory: isOrgAdmin ? paymentHistory : isOrgMember ? [] : paymentHistory,
      paymentMethods: isOrgMember ? [] : paymentMethods,
      billingInfo: isOrgMember ? null : billingInfo,
      coupon: null,
      budgets,
      billingEntity: billingCtx.billingEntity,
      paymentProvider: billingCtx.paymentProvider,
      isOrgAdmin,
      isTeamAdmin,
      isOrgMember,
      allowedSections,
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

    const eventsDocs = await fetchUsageEvents(db, target, start, end, false, 10000);

    // For IAP wallet users, personal billing overrides, and org billing contexts,
    // use the atomic counter (currentPeriodSpend) as the authoritative total.
    // Personal overrides: currentPeriodSpend only reflects personal wallet charges,
    // correctly excluding spend that occurred while the user was on org billing.
    const isIapUser =
      billingCtx.billingEntity === 'individual' && billingCtx.paymentProvider === 'iap';
    const isPersonalOverride = billingCtx.usePersonalBilling === true;
    const isOrgBilling = billingCtx.billingEntity === 'organization';

    let totalUsageCents = 0;
    if (isIapUser || isPersonalOverride) {
      // currentPeriodSpend is the active-mode mirror restored from the preserved
      // personal spend counter, so switching away and back keeps the last
      // personal-wallet usage state intact.
      totalUsageCents = billingCtx.currentPeriodSpend ?? 0;
    } else {
      for (const doc of eventsDocs) {
        totalUsageCents += doc.unitCostSnapshot * doc.quantity;
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

    const overview: UsageOverview = {
      currentMeteredUsage: totalUsageCents,
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

    const eventsDocs = await fetchUsageEvents(db, target, start, end, false, 10000);

    const dailyUsage = new Map<string, number>();
    for (const doc of eventsDocs) {
      const dateKey = doc.createdAt.toISOString().slice(0, 10);
      const cost = doc.unitCostSnapshot * doc.quantity;
      dailyUsage.set(dateKey, (dailyUsage.get(dateKey) ?? 0) + cost);
    }

    const chartData: UsageChartDataPoint[] = [];
    let cumulative = 0;
    const current = new Date(start);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const chartEnd = end < today ? end : today;
    while (current <= chartEnd) {
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

    const eventsDocs = await fetchUsageEvents(db, target, start, end, true, 500);

    const breakdownRows = await buildBreakdownRows(db, eventsDocs, target);

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

    // Get total count + paginated results in parallel
    const [total, paginatedDocs] = await Promise.all([
      PaymentLogModel.countDocuments({ userId: target.billingUserId }),
      PaymentLogModel.find({ userId: target.billingUserId })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ]);

    const records: UsagePaymentHistoryRecord[] = (paginatedDocs as PaymentLogDocument[]).map(
      (doc) => {
        const idStr = (doc._id as Types.ObjectId).toString();
        return {
          id: idStr,
          displayId: idStr.slice(0, 8).toUpperCase(),
          // PaymentLog stores amountPaid in dollars; UsagePaymentHistoryRecord.amount is cents.
          amount: Math.round((doc.amountPaid ?? 0) * 100),
          currency: (doc.currency ?? 'usd') as UsagePaymentHistoryRecord['currency'],
          status: normalizePaymentStatus(doc.status) as UsagePaymentHistoryRecord['status'],
          paymentMethodLabel: doc.paymentMethodLabel ?? 'Card',
          provider: 'stripe',
          createdAt: toISOString(doc.createdAt),
          dateLabel: toISOString(doc.createdAt).slice(0, 10),
          receiptUrl: doc.receiptUrl ?? null,
          invoiceUrl: doc.invoiceUrl ?? null,
        };
      }
    );

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
/**
 * POST /api/v1/usage/buy-credits
 * Purchase credits via Stripe Checkout (wallet top-up for individuals and organizations).
 * Creates a Stripe Checkout Session in "payment" mode for a one-time purchase.
 * On success the Stripe webhook credits the wallet; the frontend gets the checkout URL.
 *
 * Body: { amountCents: number, organizationId?: string }
 */
router.post(
  '/buy-credits',
  appGuard,
  validateBody(BuyCreditsDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const email = req.user!.email ?? '';
      const { amountCents, organizationId } = req.body as BuyCreditsDto;
      const db = req.firebase?.db;

      if (!db) {
        return res.status(503).json({ error: 'Database unavailable' });
      }

      const environment = req.isStaging ? 'staging' : 'production';
      const stripe = getStripeClient(environment);
      const origin = req.headers.origin ?? '';

      let customerId: string;
      let productName = 'NXT1 Credits';
      let sessionMetadata: Record<string, string>;

      if (organizationId) {
        // ── Org wallet top-up: verify the caller is an org admin ──
        const orgDoc = await db.collection('Organizations').doc(organizationId).get();
        if (!orgDoc.exists) {
          return res.status(404).json({ error: 'Organization not found' });
        }
        const orgData = orgDoc.data()!;
        const ownerId = orgData['ownerId'] as string | undefined;
        const admins = (orgData['admins'] as Array<{ userId: string }>) ?? [];
        const isAdmin = ownerId === userId || admins.some((a) => a.userId === userId);
        if (!isAdmin) {
          return res.status(403).json({ error: 'Only org admins can add funds to the org wallet' });
        }

        const orgEmail =
          (orgData['billingEmail'] as string) || (orgData['email'] as string) || email;
        const orgCustomer = await getOrCreateCustomer(
          db,
          `org:${organizationId}`,
          orgEmail,
          undefined,
          environment
        );
        customerId = orgCustomer.customerId;
        productName = 'NXT1 Team Credits';
        sessionMetadata = {
          userId,
          type: 'org_wallet_topup',
          billingEntity: 'organization',
          organizationId,
          amountCents: String(amountCents),
        };
      } else {
        // ── Individual wallet top-up ──
        const individual = await getOrCreateCustomer(db, userId, email, undefined, environment);
        customerId = individual.customerId;
        sessionMetadata = {
          userId,
          type: 'wallet_topup',
          billingEntity: 'individual',
          amountCents: String(amountCents),
        };
      }

      // ── Fast path: charge saved default payment method directly ──────────
      // Avoids redirecting the user to Stripe Checkout when a card is already
      // on file. Only personal top-ups use this path — org top-ups may involve
      // bank accounts which need the full Checkout UX.
      if (!organizationId) {
        const customer = await stripe.customers.retrieve(customerId);
        const defaultMethodId =
          typeof customer !== 'string' && !customer.deleted
            ? typeof customer.invoice_settings?.default_payment_method === 'string'
              ? customer.invoice_settings.default_payment_method
              : (customer.invoice_settings?.default_payment_method?.id ?? null)
            : null;

        if (defaultMethodId) {
          const idempotencyKey = `buy-credits:${userId}:${amountCents}:${Date.now()}`;
          const charge = await chargeOffSession(
            customerId,
            defaultMethodId,
            amountCents,
            'NXT1 Credits top-up',
            idempotencyKey,
            environment
          );

          if (!charge.success) {
            // Card declined or requires authentication — fall through to Checkout
            // so the user can update their payment method.
            logger.warn('[POST /buy-credits] Off-session charge failed, falling back to Checkout', {
              userId,
              amountCents,
              errorCode: charge.errorCode,
            });
          } else {
            // Credit the wallet and write a PaymentLog immediately — no webhook needed.
            const { newBalance } = await addWalletTopUp(db!, userId, amountCents, 'stripe');

            await PaymentLogModel.findOneAndUpdate(
              { invoiceId: charge.paymentIntentId },
              {
                $setOnInsert: {
                  invoiceId: charge.paymentIntentId,
                  customerId,
                  userId,
                  amountDue: amountCents / 100,
                  amountPaid: amountCents / 100,
                  currency: 'usd',
                  status: 'PAID',
                  paymentMethodLabel: 'Card',
                  type: 'wallet_topup',
                  receiptUrl: charge.receiptUrl ?? null,
                  invoiceUrl: null,
                  rawEvent: { paymentIntentId: charge.paymentIntentId } as Record<string, unknown>,
                  createdAt: new Date(),
                },
              },
              { upsert: true }
            );

            logger.info('[POST /buy-credits] Wallet topped up via saved card', {
              userId,
              amountCents,
              newBalance,
              paymentIntentId: charge.paymentIntentId,
            });

            return res.json({ success: true, credited: true, newBalance });
          }
        }
      }

      // ── Redirect path: no saved card, or org top-up ──────────────────────
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: organizationId
          ? ([
              'card',
              'us_bank_account',
            ] as import('stripe').Stripe.Checkout.SessionCreateParams.PaymentMethodType[])
          : (['card'] as import('stripe').Stripe.Checkout.SessionCreateParams.PaymentMethodType[]),
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: amountCents,
              product_data: {
                name: productName,
                description: `$${(amountCents / 100).toFixed(2)} credit top-up`,
              },
            },
            quantity: 1,
          },
        ],
        // Save the card to the Stripe customer after checkout so it can be
        // displayed in Payment info and reused for future top-ups.
        payment_intent_data: {
          setup_future_usage: 'off_session',
        },
        metadata: sessionMetadata,
        success_url: `${origin}/usage?credits=success&amount=${amountCents}`,
        cancel_url: `${origin}/usage?credits=cancelled`,
      });

      logger.info('[POST /buy-credits] Checkout session created', {
        userId,
        amountCents,
        organizationId,
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
 * POST /api/v1/usage/auto-topup
 * Configure automatic wallet top-up settings for the current user.
 * When enabled the backend will automatically trigger a Stripe charge
 * when the wallet balance falls below the threshold.
 */
router.post(
  '/auto-topup',
  appGuard,
  validateBody(AutoTopUpDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { enabled, thresholdCents, amountCents } = req.body as AutoTopUpDto;
      const db = req.firebase?.db;
      if (!db) return res.status(503).json({ error: 'Database unavailable' });

      // Resolve billing context — auto top-up applies to whoever pays
      const target = await resolveBillingTarget(db, userId);
      const billingUserId = target.billingUserId;

      const snapshot = await db.collection(COLLECTIONS.BILLING_CONTEXTS).doc(billingUserId).get();

      if (!snapshot.exists) {
        return res.status(404).json({ error: 'Billing context not found' });
      }

      await snapshot.ref.update({
        autoTopUpEnabled: enabled,
        autoTopUpThresholdCents: thresholdCents,
        autoTopUpAmountCents: amountCents,
        updatedAt: new Date(),
      });

      logger.info('[POST /auto-topup] Auto top-up configured', {
        userId,
        billingUserId,
        enabled,
        thresholdCents,
        amountCents,
      });

      return res.json({ success: true });
    } catch (error) {
      logger.error('[POST /auto-topup] Failed to configure auto top-up', { error });
      return res.status(500).json({
        error: 'Failed to configure auto top-up',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/v1/usage/billing-mode
 * Allow an org roster member to toggle between org wallet and personal wallet.
 * When usePersonalBilling=true, their AI spend is deducted from their own wallet
 * instead of the org wallet — useful when the org wallet is empty.
 */
router.post(
  '/billing-mode',
  appGuard,
  validateBody(BillingModeDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const { usePersonalBilling } = req.body as BillingModeDto;
      const db = req.firebase?.db;
      if (!db) return res.status(503).json({ error: 'Database unavailable' });

      // Persist the preference on the user's individual billing context.
      // Use getOrCreateBillingContext to guarantee the doc exists before writing —
      // org users may not have a personal billing context yet if they've never
      // used personal billing.
      await getOrCreateBillingContext(db, userId);

      // Re-query to get the Firestore doc ref after ensuring it exists
      const snapshot = await db.collection(COLLECTIONS.BILLING_CONTEXTS).doc(userId).get();

      if (!snapshot.exists) {
        return res.status(404).json({ error: 'Billing context not found' });
      }

      const personalCtxData = snapshot.data();

      const modeUpdate: Record<string, unknown> = {
        usePersonalBilling,
        updatedAt: new Date(),
      };
      // currentPeriodSpend is the active-mode display counter consumed by the UI.
      // Restore it from the persisted per-mode counters so switching away and
      // back keeps the last personal/org state exactly intact.
      if (usePersonalBilling) {
        modeUpdate['currentPeriodSpend'] =
          (personalCtxData?.['personalCurrentPeriodSpend'] as number | undefined) ?? 0;
      } else {
        modeUpdate['currentPeriodSpend'] =
          (personalCtxData?.['orgCurrentPeriodSpend'] as number | undefined) ?? 0;
      }

      await snapshot.ref.update(modeUpdate);

      // Evict in-memory billing resolution cache so the next dashboard load
      // re-resolves from Firestore (picks up the new usePersonalBilling flag).
      evictBillingResolutionCache(userId);

      // ── Return the fully resolved billing context in the response ──
      // This eliminates read-after-write races: the frontend can apply the
      // fresh context directly from the mutation response instead of needing
      // to GET /billing/budget (which may hit a stale HTTP cache).
      const freshTarget = await resolveBillingTarget(db, userId, { usePersonalBilling });
      const freshCtx = freshTarget.context;
      const freshWalletBalance = freshCtx.walletBalanceCents ?? 0;

      // Resolve admin flags for the fresh context.
      // Default to FALSE — when switching to personal billing, freshTarget.type
      // is 'individual' and admin flags are meaningless for the user's own wallet
      // view. Only compute real admin flags when the resolved target is the org.
      let freshAdminResult = { isOrgAdmin: false, isTeamAdmin: false };
      if (freshTarget.type === 'organization' && freshTarget.organizationId) {
        const [userDoc, orgDoc] = await Promise.all([
          db.collection('Users').doc(userId).get(),
          db.collection('Organizations').doc(freshTarget.organizationId).get(),
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
        freshAdminResult = { isOrgAdmin: orgAdmin, isTeamAdmin: orgAdmin };
      }

      logger.info('[POST /billing-mode] Billing mode updated', { userId, usePersonalBilling });

      // Compute the authoritative section list for the new billing mode so the
      // frontend can swap sidebar tabs atomically with the billing context.
      // Must match the /dashboard handler's logic exactly.
      const freshIsOrgMember =
        freshTarget.type === 'organization' &&
        !freshAdminResult.isOrgAdmin &&
        !freshAdminResult.isTeamAdmin;
      const freshAllowedSections: UsageDashboardData['allowedSections'] = freshIsOrgMember
        ? ['overview']
        : freshTarget.type === 'organization'
          ? ['overview', 'metered-usage', 'breakdown', 'budgets', 'payment-info']
          : ['overview', 'metered-usage', 'breakdown', 'payment-info'];

      return res.json({
        success: true,
        data: {
          billingMode: usePersonalBilling ? 'personal' : 'organization',
          allowedSections: freshAllowedSections,
          // Fresh billing context — SSOT for the frontend
          billingContext: {
            billingEntity: freshCtx.billingEntity,
            monthlyBudget: freshCtx.monthlyBudget,
            currentPeriodSpend: freshCtx.currentPeriodSpend,
            periodStart: freshCtx.periodStart,
            periodEnd: freshCtx.periodEnd,
            percentUsed:
              freshCtx.monthlyBudget > 0
                ? Math.round((freshCtx.currentPeriodSpend / freshCtx.monthlyBudget) * 100)
                : 0,
            hardStop: freshCtx.hardStop,
            teamId: freshCtx.teamId,
            organizationId: freshCtx.organizationId,
            paymentProvider: freshCtx.paymentProvider,
            walletBalanceCents: freshWalletBalance,
            pendingHoldsCents: freshCtx.pendingHoldsCents ?? 0,
            isOrgAdmin: freshAdminResult.isOrgAdmin,
            isTeamAdmin: freshAdminResult.isTeamAdmin,
            usePersonalBilling,
            autoTopUpEnabled:
              (personalCtxData?.['autoTopUpEnabled'] as boolean | undefined) ?? false,
            autoTopUpThresholdCents:
              (personalCtxData?.['autoTopUpThresholdCents'] as number | undefined) ?? 0,
            autoTopUpAmountCents:
              (personalCtxData?.['autoTopUpAmountCents'] as number | undefined) ?? 0,
            orgWalletEmpty: freshCtx.billingEntity !== 'individual' && freshWalletBalance <= 0,
          },
        },
      });
    } catch (error) {
      logger.error('[POST /billing-mode] Failed to update billing mode', { error });
      return res.status(500).json({
        error: 'Failed to update billing mode',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/v1/usage/invoice-topup
 * Request an invoice-based wallet top-up for organizations.
 * Creates a Stripe Invoice with net payment terms. When paid, the webhook
 * calls addFundsToOrgWallet() to credit the org wallet.
 *
 * Requires the caller to be an org admin.
 */
router.post(
  '/invoice-topup',
  appGuard,
  validateBody(InvoiceTopUpDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const email = req.user!.email ?? '';
      const { amountCents, poNumber, netDays } = req.body as InvoiceTopUpDto;
      const db = req.firebase?.db;
      if (!db) return res.status(503).json({ error: 'Database unavailable' });

      // Resolve org billing context — only org admins can request invoice top-ups
      const billingCtx = await getBillingContext(db, userId);
      if (billingCtx?.billingEntity !== 'organization' || !billingCtx.organizationId) {
        return res
          .status(403)
          .json({ error: 'Invoice top-up is only available for organization accounts' });
      }

      const organizationId = billingCtx.organizationId;
      const orgDoc = await db.collection('Organizations').doc(organizationId).get();
      const orgData = orgDoc.data()!;
      const ownerId = orgData['ownerId'] as string | undefined;
      const admins = (orgData['admins'] as Array<{ userId: string }>) ?? [];
      const isAdmin = ownerId === userId || admins.some((a) => a.userId === userId);

      if (!isAdmin) {
        return res.status(403).json({ error: 'Only org admins can request invoice top-ups' });
      }

      const environment = req.isStaging ? 'staging' : 'production';
      const orgEmail = (orgData['billingEmail'] as string) || (orgData['email'] as string) || email;
      const { customerId } = await getOrCreateCustomer(
        db,
        `org:${organizationId}`,
        orgEmail,
        undefined,
        environment
      );

      const stripe = getStripeClient(environment);

      // Create a Stripe Invoice Item + Invoice with net payment terms
      await stripe.invoiceItems.create({
        customer: customerId,
        amount: amountCents,
        currency: 'usd',
        description: poNumber ? `NXT1 Team Credits (PO #${poNumber})` : 'NXT1 Team Credits',
      });

      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: netDays,
        metadata: {
          userId,
          organizationId,
          type: 'org_invoice_topup',
          billingEntity: 'organization',
          amountCents: String(amountCents),
          ...(poNumber ? { poNumber } : {}),
        },
        description: poNumber ? `PO #${poNumber}` : undefined,
      });

      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
      await stripe.invoices.sendInvoice(finalizedInvoice.id);

      logger.info('[POST /invoice-topup] Invoice created and sent', {
        userId,
        organizationId,
        amountCents,
        invoiceId: finalizedInvoice.id,
        netDays,
      });

      return res.json({
        success: true,
        data: {
          invoiceId: finalizedInvoice.id,
          invoiceUrl: finalizedInvoice.invoice_pdf,
          hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url,
        },
      });
    } catch (error) {
      logger.error('[POST /invoice-topup] Failed to create invoice', { error });
      return res.status(500).json({
        error: 'Failed to create invoice',
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

    const accountName = ctx.billingEntity === 'organization' ? 'Organization' : 'Personal';

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

    const budgets: UsageBudget[] = hasConfiguredBudget(ctx)
      ? [
          {
            id: `budget-${userId}`,
            category: 'ai',
            productName: ctx.budgetName ?? 'Overall Budget',
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
        ]
      : [];

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

    if (!Types.ObjectId.isValid(transactionId)) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const receiptLog = await PaymentLogModel.findById(transactionId).lean();
    if (!receiptLog) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Allow access if the log belongs to the user directly OR to their org billing target
    const receiptTarget = await resolveBillingTarget(db, userId);
    if (receiptLog.userId !== userId && receiptLog.userId !== receiptTarget.billingUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!receiptLog.receiptUrl) {
      return res.status(404).json({ error: 'Receipt not available' });
    }

    return res.json({ success: true, data: { url: receiptLog.receiptUrl } });
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

    if (!Types.ObjectId.isValid(transactionId)) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const invoiceLog = await PaymentLogModel.findById(transactionId).lean();
    if (!invoiceLog) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Allow access if the log belongs to the user directly OR to their org billing target
    const invoiceTarget = await resolveBillingTarget(db, userId);
    if (invoiceLog.userId !== userId && invoiceLog.userId !== invoiceTarget.billingUserId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!invoiceLog.invoiceUrl) {
      return res.status(404).json({ error: 'Invoice not available' });
    }

    return res.json({ success: true, data: { url: invoiceLog.invoiceUrl } });
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
