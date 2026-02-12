/**
 * @fileoverview Usage Dashboard Constants
 * @module @nxt1/core/usage
 * @version 2.0.0
 *
 * Single source of truth for billing dashboard configuration.
 * Product definitions, category configs, timeframe options, API endpoints.
 * 100% portable — no framework dependencies.
 *
 * @author NXT1 Engineering
 */

import type { UsageProductCategory, UsageTimeframe } from './usage.types';

// ============================================
// TIMEFRAME OPTIONS
// ============================================

export interface UsageTimeframeOption {
  readonly id: UsageTimeframe;
  readonly label: string;
}

export const USAGE_TIMEFRAME_OPTIONS: readonly UsageTimeframeOption[] = [
  { id: 'current-month', label: 'Current month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-3-months', label: 'Last 3 months' },
  { id: 'last-6-months', label: 'Last 6 months' },
  { id: 'last-12-months', label: 'Last 12 months' },
] as const;

// ============================================
// PRODUCT CATEGORY CONFIGS
// ============================================

export interface UsageCategoryConfig {
  readonly id: UsageProductCategory;
  readonly label: string;
  readonly icon: string;
  readonly color: string;
}

export const USAGE_CATEGORY_CONFIGS: readonly UsageCategoryConfig[] = [
  {
    id: 'media',
    label: 'Media',
    icon: 'image-outline',
    color: 'var(--nxt1-color-primary)',
  },
  {
    id: 'recruiting',
    label: 'Recruiting',
    icon: 'school-outline',
    color: 'var(--nxt1-color-secondary)',
  },
  {
    id: 'ai',
    label: 'AI & Agent X',
    icon: 'sparkles-outline',
    color: 'var(--nxt1-color-tertiary)',
  },
  {
    id: 'communication',
    label: 'Communication',
    icon: 'mail-outline',
    color: 'var(--nxt1-color-info)',
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: 'person-outline',
    color: 'var(--nxt1-color-warning)',
  },
  {
    id: 'teams',
    label: 'Teams',
    icon: 'people-outline',
    color: 'var(--nxt1-color-error)',
  },
] as const;

// ============================================
// PRODUCT DEFINITIONS (NXT1 Pricing)
// All prices in cents
// ============================================

export interface UsageProductConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: UsageProductCategory;
  readonly icon: string;
  /** Price per unit in cents */
  readonly unitPrice: number;
  /** Whether this product is usage-based (variable qty) */
  readonly isUsageBased: boolean;
  /** Unit label (e.g. "per use", "per 5 views") */
  readonly unitLabel: string;
}

export const USAGE_PRODUCT_CONFIGS: readonly UsageProductConfig[] = [
  // ── MEDIA ─────────────────────────────────
  {
    id: 'highlights',
    name: 'Highlights',
    description: 'AI-generated highlight reels',
    category: 'media',
    icon: 'videocam-outline',
    unitPrice: 500,
    isUsageBased: false,
    unitLabel: 'per highlight',
  },
  {
    id: 'motion-graphics',
    name: 'Motion Graphics',
    description: 'Animated graphics with stats and effects',
    category: 'media',
    icon: 'film-outline',
    unitPrice: 300,
    isUsageBased: false,
    unitLabel: 'per graphic',
  },
  {
    id: 'graphics',
    name: 'Graphics',
    description: 'Static recruitment graphics',
    category: 'media',
    icon: 'image-outline',
    unitPrice: 200,
    isUsageBased: false,
    unitLabel: 'per graphic',
  },
  {
    id: 'write-up-graphic',
    name: 'Write-Up Graphic',
    description: 'Custom write-up with graphic overlay',
    category: 'media',
    icon: 'document-text-outline',
    unitPrice: 200,
    isUsageBased: false,
    unitLabel: 'per graphic',
  },
  {
    id: 'media-bundles',
    name: 'Media Bundles',
    description: 'Agent X media bundle packages',
    category: 'media',
    icon: 'layers-outline',
    unitPrice: 100,
    isUsageBased: false,
    unitLabel: 'per bundle',
  },

  // ── RECRUITING ────────────────────────────
  {
    id: 'scout-report-bundle',
    name: 'Scout Report Bundle',
    description: 'Comprehensive AI scouting analysis',
    category: 'recruiting',
    icon: 'clipboard-outline',
    unitPrice: 300,
    isUsageBased: false,
    unitLabel: 'per report',
  },
  {
    id: 'match-colleges',
    name: 'Match Colleges',
    description: 'AI-powered college matching',
    category: 'recruiting',
    icon: 'school-outline',
    unitPrice: 100,
    isUsageBased: false,
    unitLabel: 'per match',
  },
  {
    id: 'recruit-strategy',
    name: 'Recruit Strategy',
    description: 'Personalized recruiting game plan',
    category: 'recruiting',
    icon: 'map-outline',
    unitPrice: 100,
    isUsageBased: false,
    unitLabel: 'per strategy',
  },
  {
    id: 'college-views',
    name: 'College Views',
    description: 'Profile views and click tracking',
    category: 'recruiting',
    icon: 'eye-outline',
    unitPrice: 100,
    isUsageBased: true,
    unitLabel: 'per 5 views',
  },

  // ── AI & AGENT X ──────────────────────────
  {
    id: 'activity-usage',
    name: 'Activity Usage',
    description: 'AI-powered activity insights and actions',
    category: 'ai',
    icon: 'flash-outline',
    unitPrice: 100,
    isUsageBased: true,
    unitLabel: 'per 5 actions',
  },

  // ── COMMUNICATION ─────────────────────────
  {
    id: 'email-campaign',
    name: 'Email Campaign',
    description: 'Targeted outreach to college coaches',
    category: 'communication',
    icon: 'mail-outline',
    unitPrice: 200,
    isUsageBased: false,
    unitLabel: 'per campaign',
  },
  {
    id: 'follow-ups',
    name: 'Follow-Ups',
    description: 'Automated follow-up messages',
    category: 'communication',
    icon: 'return-down-forward-outline',
    unitPrice: 100,
    isUsageBased: false,
    unitLabel: 'per follow-up',
  },

  // ── PROFILE ───────────────────────────────
  {
    id: 'profile-banners',
    name: 'Profile Banners & Logo',
    description: 'Custom profile branding assets',
    category: 'profile',
    icon: 'color-palette-outline',
    unitPrice: 100,
    isUsageBased: false,
    unitLabel: 'per asset',
  },

  // ── TEAMS ─────────────────────────────────
  {
    id: 'team-page-url',
    name: 'Team Page URL',
    description: 'Custom team page with unique URL',
    category: 'teams',
    icon: 'link-outline',
    unitPrice: 500,
    isUsageBased: false,
    unitLabel: 'per page',
  },
] as const;

// ============================================
// API ENDPOINTS
// ============================================

export const USAGE_API_ENDPOINTS = {
  dashboard: '/api/v1/usage/dashboard',
  overview: '/api/v1/usage/overview',
  chart: '/api/v1/usage/chart',
  breakdown: '/api/v1/usage/breakdown',
  history: '/api/v1/usage/history',
  paymentMethods: '/api/v1/usage/payment-methods',
  addPaymentMethod: '/api/v1/usage/payment-methods/add',
  removePaymentMethod: '/api/v1/usage/payment-methods/remove',
  setDefaultPaymentMethod: '/api/v1/usage/payment-methods/default',
  billingInfo: '/api/v1/usage/billing-info',
  budgets: '/api/v1/usage/budgets',
  downloadReceipt: '/api/v1/usage/receipt',
  downloadInvoice: '/api/v1/usage/invoice',
  redeemCoupon: '/api/v1/usage/coupon/redeem',
} as const;

// ============================================
// CACHE KEYS & TTLs
// ============================================

export const USAGE_CACHE_KEYS = {
  DASHBOARD: 'usage:dashboard:',
  OVERVIEW: 'usage:overview:',
  CHART: 'usage:chart:',
  HISTORY: 'usage:history:',
  PAYMENT_METHODS: 'usage:payment-methods:',
  BUDGETS: 'usage:budgets:',
} as const;

export const USAGE_CACHE_TTLS = {
  /** Dashboard data TTL — 5 minutes */
  DASHBOARD: 300_000,
  /** Overview TTL — 1 minute (changes frequently) */
  OVERVIEW: 60_000,
  /** Chart TTL — 5 minutes */
  CHART: 300_000,
  /** History TTL — 15 minutes */
  HISTORY: 900_000,
  /** Payment methods TTL — 30 minutes */
  PAYMENT_METHODS: 1_800_000,
  /** Budgets TTL — 10 minutes */
  BUDGETS: 600_000,
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

/** Number of history records per page */
export const USAGE_HISTORY_PAGE_SIZE = 20;

/** Number of breakdown rows to show initially */
export const USAGE_BREAKDOWN_INITIAL_ROWS = 5;

/** Number of top items in stacked bar */
export const USAGE_TOP_ITEMS_COUNT = 3;

// ============================================
// HELPERS
// ============================================

/**
 * Get a product config by ID
 */
export function getUsageProductConfig(productId: string): UsageProductConfig | undefined {
  return USAGE_PRODUCT_CONFIGS.find((p) => p.id === productId);
}

/**
 * Get a category config by ID
 */
export function getUsageCategoryConfig(
  categoryId: UsageProductCategory
): UsageCategoryConfig | undefined {
  return USAGE_CATEGORY_CONFIGS.find((c) => c.id === categoryId);
}

/**
 * Get all product configs for a category
 */
export function getUsageProductsByCategory(
  categoryId: UsageProductCategory
): readonly UsageProductConfig[] {
  return USAGE_PRODUCT_CONFIGS.filter((p) => p.category === categoryId);
}

/**
 * Format a date for the breakdown table display
 */
export function formatUsageDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date for payment history display (YYYY-MM-DD)
 */
export function formatUsageHistoryDate(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generate a short display ID from a full ID
 */
export function generateDisplayId(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
