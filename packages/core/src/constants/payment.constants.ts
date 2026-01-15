/**
 * @fileoverview Payment Constants
 * @module @nxt1/core/constants
 *
 * Single source of truth for all payment-related configuration.
 * Product definitions, pricing tiers, transaction statuses.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// PAYMENT PROVIDERS
// ============================================

export const PAYMENT_PROVIDERS = {
  STRIPE: 'stripe',
  PAYPAL: 'paypal',
  APPLE: 'apple',
  GOOGLE: 'google',
} as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[keyof typeof PAYMENT_PROVIDERS];

// ============================================
// PAYMENT METHOD TYPES
// ============================================

export const PAYMENT_METHOD_TYPES = {
  CARD: 'card',
  PAYPAL: 'paypal',
  APPLE_PAY: 'apple-pay',
  GOOGLE_PAY: 'google-pay',
  BANK_ACCOUNT: 'bank-account',
} as const;

export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[keyof typeof PAYMENT_METHOD_TYPES];

// ============================================
// CURRENCY
// ============================================

export const CURRENCIES = {
  USD: 'usd',
  EUR: 'eur',
  GBP: 'gbp',
  CAD: 'cad',
  AUD: 'aud',
} as const;

export type Currency = (typeof CURRENCIES)[keyof typeof CURRENCIES];

/** Default currency for all transactions */
export const DEFAULT_CURRENCY: Currency = 'usd';

// ============================================
// PRODUCT CATEGORIES
// ============================================

export const PRODUCT_CATEGORIES = {
  SUBSCRIPTION: 'subscription',
  MEDIA: 'media',
  RECRUITING: 'recruiting',
  CREDITS: 'credits',
} as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[keyof typeof PRODUCT_CATEGORIES];

// ============================================
// SUBSCRIPTION PLANS
// ============================================

export const PLAN_TIERS = {
  FREE: 'free',
  STARTER: 'starter',
  PRO: 'pro',
  ELITE: 'elite',
  TEAM: 'team',
} as const;

export type PlanTier = (typeof PLAN_TIERS)[keyof typeof PLAN_TIERS];

export const BILLING_INTERVALS = {
  MONTH: 'month',
  YEAR: 'year',
} as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[keyof typeof BILLING_INTERVALS];

export interface PlanConfig {
  id: PlanTier;
  name: string;
  description: string;
  prices: {
    monthly: number; // In cents
    yearly: number; // In cents (typically discounted)
  };
  features: string[];
  limits: {
    videoUploads: number; // -1 for unlimited
    emailCampaigns: number;
    aiCredits: number;
    collegeCredits: number;
    teamMembers: number;
  };
  recommended?: boolean;
  stripePriceIds?: {
    monthly: string;
    yearly: string;
  };
}

export const PLAN_CONFIGS: readonly PlanConfig[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Get started with basic features',
    prices: { monthly: 0, yearly: 0 },
    features: ['Basic profile', '3 video uploads', 'Community access', 'Basic analytics'],
    limits: {
      videoUploads: 3,
      emailCampaigns: 0,
      aiCredits: 0,
      collegeCredits: 0,
      teamMembers: 0,
    },
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for getting noticed',
    prices: { monthly: 999, yearly: 9588 }, // $9.99/mo, $79.90/yr (20% off)
    features: [
      'Full profile customization',
      '10 video uploads',
      '5 email campaigns/month',
      '5 AI credits/month',
      'Profile analytics',
    ],
    limits: {
      videoUploads: 10,
      emailCampaigns: 5,
      aiCredits: 5,
      collegeCredits: 0,
      teamMembers: 0,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Everything you need to get recruited',
    prices: { monthly: 1999, yearly: 19188 }, // $19.99/mo, $159.90/yr (20% off)
    features: [
      'Everything in Starter',
      'Unlimited video uploads',
      '20 email campaigns/month',
      '20 AI credits/month',
      'AI scouting report',
      '5 college credits/month',
      'Priority support',
    ],
    limits: {
      videoUploads: -1,
      emailCampaigns: 20,
      aiCredits: 20,
      collegeCredits: 5,
      teamMembers: 0,
    },
    recommended: true,
  },
  {
    id: 'elite',
    name: 'Elite',
    description: 'Maximum exposure and support',
    prices: { monthly: 3999, yearly: 38388 }, // $39.99/mo, $319.90/yr (20% off)
    features: [
      'Everything in Pro',
      'Unlimited email campaigns',
      '50 AI credits/month',
      '15 college credits/month',
      'Personal branding package',
      'Direct coach messaging',
      'Advanced analytics dashboard',
      'Dedicated support',
    ],
    limits: {
      videoUploads: -1,
      emailCampaigns: -1,
      aiCredits: 50,
      collegeCredits: 15,
      teamMembers: 0,
    },
  },
  {
    id: 'team',
    name: 'Team',
    description: 'For coaches and organizations',
    prices: { monthly: 19999, yearly: 191988 }, // $199.99/mo, $1599.90/yr (20% off)
    features: [
      'Everything in Elite',
      'Team management dashboard',
      'Bulk athlete profiles',
      'Team branding',
      'Admin controls',
      '100 AI credits/month',
      '50 college credits/month',
      'Up to 50 team members',
      'API access',
    ],
    limits: {
      videoUploads: -1,
      emailCampaigns: -1,
      aiCredits: 100,
      collegeCredits: 50,
      teamMembers: 50,
    },
  },
] as const;

// ============================================
// SUBSCRIPTION STATUS
// ============================================

export const SUBSCRIPTION_STATUSES = {
  ACTIVE: 'active',
  TRIALING: 'trialing',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  UNPAID: 'unpaid',
  INCOMPLETE: 'incomplete',
  INCOMPLETE_EXPIRED: 'incomplete_expired',
  PAUSED: 'paused',
  NONE: 'none',
} as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];

// ============================================
// MEDIA PRODUCT TYPES
// ============================================

export const MEDIA_PRODUCT_TYPES = {
  GRAPHIC: 'graphic',
  HIGHLIGHT: 'highlight',
  MOTION: 'motion',
  PROFILE_CARD: 'profile-card',
  SCOUTING_REPORT: 'scouting-report',
} as const;

export type MediaProductType = (typeof MEDIA_PRODUCT_TYPES)[keyof typeof MEDIA_PRODUCT_TYPES];

export interface MediaProductConfig {
  id: MediaProductType;
  name: string;
  description: string;
  price: number; // In cents
  processingTime: string;
  outputFormats: string[];
  aiGenerated: boolean;
}

export const MEDIA_PRODUCT_CONFIGS: readonly MediaProductConfig[] = [
  {
    id: 'graphic',
    name: 'Custom Graphic',
    description: 'AI-generated recruitment graphic with your stats and photo',
    price: 499, // $4.99
    processingTime: '< 2 minutes',
    outputFormats: ['PNG', 'JPG'],
    aiGenerated: true,
  },
  {
    id: 'highlight',
    name: 'Highlight Reel',
    description: 'AI-edited highlight video with music and transitions',
    price: 1499, // $14.99
    processingTime: '5-10 minutes',
    outputFormats: ['MP4', 'MOV'],
    aiGenerated: true,
  },
  {
    id: 'motion',
    name: 'Motion Graphic',
    description: 'Animated graphic with stats and dynamic effects',
    price: 999, // $9.99
    processingTime: '2-5 minutes',
    outputFormats: ['MP4', 'GIF'],
    aiGenerated: true,
  },
  {
    id: 'profile-card',
    name: 'Digital Profile Card',
    description: 'Shareable digital card with QR code to your profile',
    price: 299, // $2.99
    processingTime: '< 1 minute',
    outputFormats: ['PNG', 'PDF'],
    aiGenerated: true,
  },
  {
    id: 'scouting-report',
    name: 'AI Scouting Report',
    description: 'Comprehensive AI analysis of your game film',
    price: 2499, // $24.99
    processingTime: '15-30 minutes',
    outputFormats: ['PDF'],
    aiGenerated: true,
  },
] as const;

// ============================================
// RECRUITING PRODUCT TYPES
// ============================================

export const RECRUITING_PRODUCT_TYPES = {
  COLLEGE_CREDIT: 'college-credit',
  COLLEGE_BUNDLE_5: 'college-bundle-5',
  COLLEGE_BUNDLE_10: 'college-bundle-10',
  COLLEGE_BUNDLE_25: 'college-bundle-25',
  COLLEGE_BUNDLE_50: 'college-bundle-50',
  COLLEGE_UNLIMITED: 'college-unlimited',
} as const;

export type RecruitingProductType =
  (typeof RECRUITING_PRODUCT_TYPES)[keyof typeof RECRUITING_PRODUCT_TYPES];

export interface RecruitingProductConfig {
  id: RecruitingProductType;
  name: string;
  description: string;
  quantity: number; // Number of colleges, -1 for unlimited
  price: number; // In cents
  pricePerUnit: number; // Price per college in cents
  savings?: number; // Percentage saved vs single purchase
  popular?: boolean;
}

export const RECRUITING_PRODUCT_CONFIGS: readonly RecruitingProductConfig[] = [
  {
    id: 'college-credit',
    name: 'Single College',
    description: 'Open 1 college connection',
    quantity: 1,
    price: 299, // $2.99
    pricePerUnit: 299,
  },
  {
    id: 'college-bundle-5',
    name: '5 College Bundle',
    description: 'Open 5 college connections',
    quantity: 5,
    price: 1199, // $11.99 (save 20%)
    pricePerUnit: 240,
    savings: 20,
  },
  {
    id: 'college-bundle-10',
    name: '10 College Bundle',
    description: 'Open 10 college connections',
    quantity: 10,
    price: 1999, // $19.99 (save 33%)
    pricePerUnit: 200,
    savings: 33,
    popular: true,
  },
  {
    id: 'college-bundle-25',
    name: '25 College Bundle',
    description: 'Open 25 college connections',
    quantity: 25,
    price: 3999, // $39.99 (save 47%)
    pricePerUnit: 160,
    savings: 47,
  },
  {
    id: 'college-bundle-50',
    name: '50 College Bundle',
    description: 'Open 50 college connections',
    quantity: 50,
    price: 5999, // $59.99 (save 60%)
    pricePerUnit: 120,
    savings: 60,
  },
  {
    id: 'college-unlimited',
    name: 'Unlimited Colleges',
    description: 'Open unlimited college connections for 1 year',
    quantity: -1,
    price: 9999, // $99.99
    pricePerUnit: 0,
  },
] as const;

// ============================================
// CREDIT TYPES
// ============================================

export const CREDIT_TYPES = {
  AI: 'ai',
  COLLEGE: 'college',
  EMAIL: 'email',
} as const;

export type CreditType = (typeof CREDIT_TYPES)[keyof typeof CREDIT_TYPES];

export interface CreditPackConfig {
  id: string;
  creditType: CreditType;
  name: string;
  quantity: number;
  price: number; // In cents
  pricePerUnit: number;
  bonus?: number; // Bonus credits
}

export const AI_CREDIT_PACKS: readonly CreditPackConfig[] = [
  {
    id: 'ai-10',
    creditType: 'ai',
    name: '10 AI Credits',
    quantity: 10,
    price: 499,
    pricePerUnit: 50,
  },
  {
    id: 'ai-25',
    creditType: 'ai',
    name: '25 AI Credits',
    quantity: 25,
    price: 999,
    pricePerUnit: 40,
    bonus: 2,
  },
  {
    id: 'ai-50',
    creditType: 'ai',
    name: '50 AI Credits',
    quantity: 50,
    price: 1799,
    pricePerUnit: 36,
    bonus: 5,
  },
  {
    id: 'ai-100',
    creditType: 'ai',
    name: '100 AI Credits',
    quantity: 100,
    price: 2999,
    pricePerUnit: 30,
    bonus: 15,
  },
] as const;

// ============================================
// TRANSACTION STATUS
// ============================================

export const TRANSACTION_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
  DISPUTED: 'disputed',
} as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[keyof typeof TRANSACTION_STATUSES];

// ============================================
// TRANSACTION TYPES
// ============================================

export const TRANSACTION_TYPES = {
  SUBSCRIPTION: 'subscription',
  ONE_TIME: 'one_time',
  REFUND: 'refund',
  CREDIT_PURCHASE: 'credit_purchase',
} as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];

// ============================================
// REFUND REASONS
// ============================================

export const REFUND_REASONS = {
  CUSTOMER_REQUEST: 'customer_request',
  DUPLICATE: 'duplicate',
  FRAUDULENT: 'fraudulent',
  PRODUCT_NOT_DELIVERED: 'product_not_delivered',
  PRODUCT_UNSATISFACTORY: 'product_unsatisfactory',
  OTHER: 'other',
} as const;

export type RefundReason = (typeof REFUND_REASONS)[keyof typeof REFUND_REASONS];

// ============================================
// DISCOUNT TYPES
// ============================================

export const DISCOUNT_TYPES = {
  PERCENTAGE: 'percentage',
  FIXED_AMOUNT: 'fixed_amount',
} as const;

export type DiscountType = (typeof DISCOUNT_TYPES)[keyof typeof DISCOUNT_TYPES];

// ============================================
// ENTITLEMENT STATUS
// ============================================

export const ENTITLEMENT_STATUSES = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  PENDING: 'pending',
} as const;

export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[keyof typeof ENTITLEMENT_STATUSES];

// ============================================
// INVOICE STATUS
// ============================================

export const INVOICE_STATUSES = {
  DRAFT: 'draft',
  OPEN: 'open',
  PAID: 'paid',
  VOID: 'void',
  UNCOLLECTIBLE: 'uncollectible',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[keyof typeof INVOICE_STATUSES];

// ============================================
// PRICE HELPERS
// ============================================

/**
 * Convert cents to display price
 */
export function formatPrice(cents: number, currency: Currency = 'usd'): string {
  const amount = cents / 100;
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
  return formatter.format(amount);
}

/**
 * Get plan config by ID
 */
export function getPlanConfig(planId: PlanTier): PlanConfig | undefined {
  return PLAN_CONFIGS.find((p) => p.id === planId);
}

/**
 * Get media product config by ID
 */
export function getMediaProductConfig(productId: MediaProductType): MediaProductConfig | undefined {
  return MEDIA_PRODUCT_CONFIGS.find((p) => p.id === productId);
}

/**
 * Get recruiting product config by ID
 */
export function getRecruitingProductConfig(
  productId: RecruitingProductType
): RecruitingProductConfig | undefined {
  return RECRUITING_PRODUCT_CONFIGS.find((p) => p.id === productId);
}

/**
 * Calculate tiered price for recruiting credits
 */
export function calculateRecruitingPrice(quantity: number): {
  total: number;
  pricePerUnit: number;
  recommendedBundle: RecruitingProductType | null;
} {
  // Find best bundle for quantity
  const bundles = RECRUITING_PRODUCT_CONFIGS.filter((p) => p.quantity > 0);

  // If exact match, use that bundle
  const exactMatch = bundles.find((b) => b.quantity === quantity);
  if (exactMatch) {
    return {
      total: exactMatch.price,
      pricePerUnit: exactMatch.pricePerUnit,
      recommendedBundle: exactMatch.id,
    };
  }

  // Otherwise, calculate single price
  const singlePrice = RECRUITING_PRODUCT_CONFIGS.find((p) => p.id === 'college-credit')!;
  const total = quantity * singlePrice.price;

  // Find recommended bundle (next size up)
  const recommended = bundles.find((b) => b.quantity >= quantity && b.quantity > 1);

  return {
    total,
    pricePerUnit: singlePrice.pricePerUnit,
    recommendedBundle: recommended?.id ?? null,
  };
}
