/**
 * @fileoverview Mock Usage Data — Professional Billing Dashboard
 * @module @nxt1/ui/usage/mock-data
 *
 * ⚠️ TEMPORARY FILE — Delete when backend is ready
 *
 * Comprehensive mock data matching GitHub-style billing dashboard.
 * Prices reflect NXT1's actual product pricing.
 */

import type {
  UsageOverview,
  UsageSubscription,
  UsageChartDataPoint,
  UsageProductDetail,
  UsageTopItem,
  UsageBreakdownRow,
  UsagePaymentHistoryRecord,
  UsagePaymentMethod,
  UsageBillingInfo,
  UsageCoupon,
  UsageBudget,
  UsageDashboardData,
  UsagePeriod,
} from '@nxt1/core';

// ============================================
// MOCK: CURRENT PERIOD
// ============================================

const now = new Date();
const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

const monthLabel = now.toLocaleDateString('en-US', { month: 'short' });
const yearStr = now.getFullYear().toString();

export const MOCK_USAGE_PERIOD: UsagePeriod = {
  start: periodStart.toISOString(),
  end: periodEnd.toISOString(),
  label: `${monthLabel} 1 – ${monthLabel} ${periodEnd.getDate()}, ${yearStr}`,
};

// ============================================
// MOCK: OVERVIEW CARDS
// ============================================

export const MOCK_USAGE_OVERVIEW: UsageOverview = {
  currentMeteredUsage: 10908,
  currentIncludedUsage: 1815,
  nextPaymentDueDate: null,
  nextPaymentAmount: 0,
  period: MOCK_USAGE_PERIOD,
  currency: 'usd',
};

// ============================================
// MOCK: SUBSCRIPTIONS
// ============================================

export const MOCK_USAGE_SUBSCRIPTIONS: readonly UsageSubscription[] = [
  {
    id: 'sub-free',
    name: 'NXT1 Free',
    monthlyCost: 0,
    currency: 'usd',
    isFree: true,
    description: 'Basic recruiting tools and profile',
  },
  {
    id: 'sub-agent-x',
    name: 'Agent X Pro',
    monthlyCost: 1000,
    currency: 'usd',
    isFree: false,
    description: 'AI-powered recruiting assistant',
  },
] as const;

// ============================================
// MOCK: CHART DATA (cumulative daily usage)
// ============================================

function generateChartData(): readonly UsageChartDataPoint[] {
  const points: UsageChartDataPoint[] = [];
  const daysInMonth = periodEnd.getDate();
  const today = Math.min(now.getDate(), daysInMonth);

  let cumulative = 0;
  const dailyAmounts = [
    1200, 1400, 1600, 850, 1100, 950, 800, 1300, 750, 900, 600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ];

  for (let day = 1; day <= today; day++) {
    cumulative += dailyAmounts[day - 1] ?? 0;
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    points.push({
      date: date.toISOString(),
      label: `${monthLabel} ${day}`,
      amount: cumulative,
    });
  }
  return points;
}

export const MOCK_USAGE_CHART_DATA: readonly UsageChartDataPoint[] = generateChartData();

// ============================================
// MOCK: PRODUCT DETAILS (tab content)
// ============================================

export const MOCK_USAGE_PRODUCT_DETAILS: readonly UsageProductDetail[] = [
  {
    category: 'media',
    label: 'Media',
    icon: 'image-outline',
    billableAmount: 0,
    consumedAmount: 623,
    discountAmount: 623,
    discountDescription:
      'Applicable discounts cover Media usage in free tier and included usage for highlight minutes.',
    includedQuotas: [
      { label: 'Highlight minutes', used: 0, included: 10, unit: 'min' },
      { label: 'Graphics storage', used: 0, included: 500, unit: 'MB' },
    ],
    includedResetDays: 18,
  },
  {
    category: 'recruiting',
    label: 'Recruiting',
    icon: 'school-outline',
    billableAmount: 0,
    consumedAmount: 0,
    discountAmount: 0,
    discountDescription: 'No recruiting charges for the selected timeframe.',
    includedQuotas: [],
    includedResetDays: 18,
  },
  {
    category: 'ai',
    label: 'AI & Agent X',
    icon: 'sparkles-outline',
    billableAmount: 9093,
    consumedAmount: 9093,
    discountAmount: 0,
    discountDescription: 'Billable spend for Agent X premium requests.',
    includedQuotas: [{ label: 'Basic requests', used: 384, included: 500, unit: 'requests' }],
    includedResetDays: 18,
  },
  {
    category: 'communication',
    label: 'Communication',
    icon: 'mail-outline',
    billableAmount: 0,
    consumedAmount: 0,
    discountAmount: 0,
    discountDescription: 'No communication charges for the selected timeframe.',
    includedQuotas: [],
    includedResetDays: 18,
  },
  {
    category: 'profile',
    label: 'Profile',
    icon: 'person-outline',
    billableAmount: 0,
    consumedAmount: 0,
    discountAmount: 0,
    discountDescription: 'No profile charges for the selected timeframe.',
    includedQuotas: [],
    includedResetDays: 18,
  },
  {
    category: 'teams',
    label: 'Teams',
    icon: 'people-outline',
    billableAmount: 0,
    consumedAmount: 0,
    discountAmount: 0,
    discountDescription: 'No teams charges for the selected timeframe.',
    includedQuotas: [],
    includedResetDays: 18,
  },
] as const;

// ============================================
// MOCK: TOP ITEMS (stacked bar)
// ============================================

export const MOCK_USAGE_TOP_ITEMS: readonly UsageTopItem[] = [
  { name: 'Agent X Requests', color: 'var(--nxt1-color-success)', grossAmount: 556 },
  { name: 'Highlight Reels', color: 'var(--nxt1-color-info)', grossAmount: 67 },
  { name: 'Graphics', color: 'var(--nxt1-color-error)', grossAmount: 1 },
] as const;

// ============================================
// MOCK: BREAKDOWN ROWS (expandable table)
// ============================================

export const MOCK_USAGE_BREAKDOWN_ROWS: readonly UsageBreakdownRow[] = [
  {
    date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    dateLabel: `${monthLabel} 1, ${yearStr}`,
    grossAmount: 1297,
    billedAmount: 48,
    lineItems: [
      {
        sku: 'Agent X Premium Request',
        units: '32 requests',
        pricePerUnit: '$0.04',
        grossAmount: 1280,
        billedAmount: 0,
      },
      {
        sku: 'Graphics Storage',
        units: '0.17 GB',
        pricePerUnit: '$0.10',
        grossAmount: 17,
        billedAmount: 48,
      },
    ],
  },
  {
    date: new Date(now.getFullYear(), now.getMonth(), 2).toISOString(),
    dateLabel: `${monthLabel} 2, ${yearStr}`,
    grossAmount: 1626,
    billedAmount: 1384,
    lineItems: [
      {
        sku: 'Agent X Premium Request',
        units: '384 requests',
        pricePerUnit: '$0.04',
        grossAmount: 1536,
        billedAmount: 1384,
      },
      {
        sku: 'Highlight Minutes',
        units: '2 min',
        pricePerUnit: '$0.50',
        grossAmount: 100,
        billedAmount: 0,
      },
    ],
  },
  {
    date: new Date(now.getFullYear(), now.getMonth(), 3).toISOString(),
    dateLabel: `${monthLabel} 3, ${yearStr}`,
    grossAmount: 1637,
    billedAmount: 1536,
    lineItems: [
      {
        sku: 'Agent X Premium Request',
        units: '384 requests',
        pricePerUnit: '$0.04',
        grossAmount: 1536,
        billedAmount: 1536,
      },
      {
        sku: 'Highlight Minutes',
        units: '2 min',
        pricePerUnit: '$0.50',
        grossAmount: 100,
        billedAmount: 0,
      },
      {
        sku: 'Graphics Storage',
        units: '0.01 GB',
        pricePerUnit: '$0.10',
        grossAmount: 1,
        billedAmount: 0,
      },
    ],
  },
  {
    date: new Date(now.getFullYear(), now.getMonth(), 4).toISOString(),
    dateLabel: `${monthLabel} 4, ${yearStr}`,
    grossAmount: 873,
    billedAmount: 811,
    lineItems: [
      {
        sku: 'Agent X Premium Request',
        units: '198 requests',
        pricePerUnit: '$0.04',
        grossAmount: 792,
        billedAmount: 811,
      },
      {
        sku: 'Graphics Storage',
        units: '0.81 GB',
        pricePerUnit: '$0.10',
        grossAmount: 81,
        billedAmount: 0,
      },
    ],
  },
  {
    date: new Date(now.getFullYear(), now.getMonth(), 5).toISOString(),
    dateLabel: `${monthLabel} 5, ${yearStr}`,
    grossAmount: 1064,
    billedAmount: 1064,
    lineItems: [
      {
        sku: 'Agent X Premium Request',
        units: '266 requests',
        pricePerUnit: '$0.04',
        grossAmount: 1064,
        billedAmount: 1064,
      },
    ],
  },
] as const;

// ============================================
// MOCK: PAYMENT HISTORY
// ============================================

export const MOCK_USAGE_PAYMENT_HISTORY: readonly UsagePaymentHistoryRecord[] = [
  {
    id: 'pay-001',
    displayId: '1FG1LCGT',
    amount: 18567,
    currency: 'usd',
    status: 'completed',
    paymentMethodLabel: 'MasterCard ending in 9639',
    provider: 'stripe',
    createdAt: '2026-01-15T00:00:00Z',
    dateLabel: '2026-01-15',
    receiptUrl: '#',
    invoiceUrl: '#',
  },
  {
    id: 'pay-002',
    displayId: '1ZBD10TH',
    amount: 4858,
    currency: 'usd',
    status: 'completed',
    paymentMethodLabel: 'MasterCard ending in 9639',
    provider: 'stripe',
    createdAt: '2025-12-15T00:00:00Z',
    dateLabel: '2025-12-15',
    receiptUrl: '#',
    invoiceUrl: '#',
  },
  {
    id: 'pay-003',
    displayId: '17VQWFEW',
    amount: 4588,
    currency: 'usd',
    status: 'completed',
    paymentMethodLabel: 'MasterCard ending in 9639',
    provider: 'stripe',
    createdAt: '2025-11-15T00:00:00Z',
    dateLabel: '2025-11-15',
    receiptUrl: '#',
    invoiceUrl: '#',
  },
  {
    id: 'pay-004',
    displayId: '0HU99H6H',
    amount: 8192,
    currency: 'usd',
    status: 'completed',
    paymentMethodLabel: 'MasterCard ending in 9639',
    provider: 'stripe',
    createdAt: '2025-10-15T00:00:00Z',
    dateLabel: '2025-10-15',
    receiptUrl: '#',
    invoiceUrl: '#',
  },
  {
    id: 'pay-005',
    displayId: '1EMCZ80R',
    amount: 6844,
    currency: 'usd',
    status: 'completed',
    paymentMethodLabel: 'MasterCard ending in 7048',
    provider: 'stripe',
    createdAt: '2025-09-15T00:00:00Z',
    dateLabel: '2025-09-15',
    receiptUrl: '#',
    invoiceUrl: '#',
  },
  {
    id: 'pay-006',
    displayId: '05W4T0CE',
    amount: 5192,
    currency: 'usd',
    status: 'completed',
    paymentMethodLabel: 'MasterCard ending in 7048',
    provider: 'stripe',
    createdAt: '2025-08-15T00:00:00Z',
    dateLabel: '2025-08-15',
    receiptUrl: '#',
    invoiceUrl: '#',
  },
  {
    id: 'pay-007',
    displayId: '08YTYEJ1',
    amount: 1000,
    currency: 'usd',
    status: 'failed',
    paymentMethodLabel: 'MasterCard ending in 0408',
    provider: 'stripe',
    createdAt: '2025-06-22T00:00:00Z',
    dateLabel: '2025-06-22',
    receiptUrl: null,
    invoiceUrl: null,
  },
  {
    id: 'pay-008',
    displayId: '0ZRJ4KQV',
    amount: 1000,
    currency: 'usd',
    status: 'failed',
    paymentMethodLabel: 'MasterCard ending in 0408',
    provider: 'stripe',
    createdAt: '2025-06-15T00:00:00Z',
    dateLabel: '2025-06-15',
    receiptUrl: null,
    invoiceUrl: null,
  },
  {
    id: 'pay-009',
    displayId: '05ACHLFE',
    amount: 1000,
    currency: 'usd',
    status: 'completed',
    paymentMethodLabel: 'MasterCard ending in 0408',
    provider: 'stripe',
    createdAt: '2025-05-22T00:00:00Z',
    dateLabel: '2025-05-22',
    receiptUrl: '#',
    invoiceUrl: '#',
  },
  {
    id: 'pay-010',
    displayId: '10WHMZS0',
    amount: 1000,
    currency: 'usd',
    status: 'failed',
    paymentMethodLabel: 'MasterCard ending in 0408',
    provider: 'stripe',
    createdAt: '2025-05-15T00:00:00Z',
    dateLabel: '2025-05-15',
    receiptUrl: null,
    invoiceUrl: null,
  },
] as const;

// ============================================
// MOCK: PAYMENT METHODS
// ============================================

export const MOCK_USAGE_PAYMENT_METHODS: readonly UsagePaymentMethod[] = [
  {
    id: 'pm-001',
    type: 'card',
    provider: 'stripe',
    label: 'Credit Card: MasterCard ending 9639',
    last4: '9639',
    brand: 'mastercard',
    expiryMonth: 2,
    expiryYear: 2029,
    isDefault: true,
    email: null,
    addedAt: '2024-06-01T00:00:00Z',
  },
] as const;

// ============================================
// MOCK: BILLING INFO
// ============================================

export const MOCK_USAGE_BILLING_INFO: UsageBillingInfo = {
  name: 'John Keller',
  addressLine1: '1278 CHANDLER AVE SW',
  addressLine2: 'NORTH CANTON, OH 44720-3419',
  country: 'United States of America',
};

// ============================================
// MOCK: COUPON
// ============================================

export const MOCK_USAGE_COUPON: UsageCoupon | null = null;

// ============================================
// MOCK: BUDGETS
// ============================================

export const MOCK_USAGE_BUDGETS: readonly UsageBudget[] = [
  {
    id: 'budget-media',
    category: 'media',
    productName: 'Media',
    budgetLimit: 0,
    spent: 0,
    percentUsed: 0,
    stopOnLimit: true,
    accountName: 'john-nxt1sports',
    ownershipPercent: 100,
  },
  {
    id: 'budget-ai',
    category: 'ai',
    productName: 'All Premium Request SKUs',
    budgetLimit: 16000,
    spent: 9093,
    percentUsed: 56.8,
    stopOnLimit: false,
    accountName: 'john-nxt1sports',
    ownershipPercent: 100,
  },
  {
    id: 'budget-recruiting',
    category: 'recruiting',
    productName: 'Recruiting',
    budgetLimit: 0,
    spent: 0,
    percentUsed: 0,
    stopOnLimit: true,
    accountName: 'john-nxt1sports',
    ownershipPercent: 100,
  },
  {
    id: 'budget-communication',
    category: 'communication',
    productName: 'Communication',
    budgetLimit: 0,
    spent: 0,
    percentUsed: 0,
    stopOnLimit: true,
    accountName: 'john-nxt1sports',
    ownershipPercent: 100,
  },
  {
    id: 'budget-profile',
    category: 'profile',
    productName: 'Profile',
    budgetLimit: 0,
    spent: 0,
    percentUsed: 0,
    stopOnLimit: true,
    accountName: 'john-nxt1sports',
    ownershipPercent: 100,
  },
  {
    id: 'budget-teams',
    category: 'teams',
    productName: 'Teams',
    budgetLimit: 0,
    spent: 0,
    percentUsed: 0,
    stopOnLimit: true,
    accountName: 'john-nxt1sports',
    ownershipPercent: 100,
  },
] as const;

// ============================================
// MOCK: COMPLETE DASHBOARD DATA
// ============================================

export const MOCK_USAGE_DASHBOARD: UsageDashboardData = {
  overview: MOCK_USAGE_OVERVIEW,
  subscriptions: MOCK_USAGE_SUBSCRIPTIONS,
  chartData: MOCK_USAGE_CHART_DATA,
  productDetails: MOCK_USAGE_PRODUCT_DETAILS,
  topItems: MOCK_USAGE_TOP_ITEMS,
  breakdownRows: MOCK_USAGE_BREAKDOWN_ROWS,
  paymentHistory: MOCK_USAGE_PAYMENT_HISTORY,
  paymentMethods: MOCK_USAGE_PAYMENT_METHODS,
  billingInfo: MOCK_USAGE_BILLING_INFO,
  coupon: MOCK_USAGE_COUPON,
  budgets: MOCK_USAGE_BUDGETS,
};
