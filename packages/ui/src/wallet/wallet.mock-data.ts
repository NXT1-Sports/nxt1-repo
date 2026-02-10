/**
 * @fileoverview Mock Wallet Data for Development
 * @module @nxt1/ui/wallet/mock-data
 *
 * ⚠️ TEMPORARY FILE — Delete when backend is ready
 *
 * Contains comprehensive dummy data for the Credit Wallet feature
 * during development. All data here is fabricated for UI testing purposes only.
 */

// ============================================
// WALLET SECTION IDS
// ============================================

/** Valid wallet section identifiers */
export type WalletSectionId = 'balance' | 'bundles' | 'history' | 'settings';

// ============================================
// WALLET TYPES
// ============================================

/** Display-ready credit balance */
export interface WalletBalance {
  /** Total available credits across all types */
  readonly total: number;
  /** AI credits (subscription + purchased) */
  readonly ai: number;
  /** College credits (subscription + purchased) */
  readonly college: number;
  /** Email credits (subscription + purchased) */
  readonly email: number;
}

/** Display-ready credit bundle for purchase */
export interface WalletBundle {
  readonly id: string;
  readonly name: string;
  readonly credits: number;
  readonly bonusCredits: number;
  readonly price: number;
  readonly pricePerCredit: number;
  readonly savings: number;
  readonly badge: string | null;
  readonly recommended: boolean;
}

/** A single credit transaction for history display */
export interface WalletTransaction {
  readonly id: string;
  readonly type: 'spend' | 'purchase' | 'granted' | 'refund';
  readonly amount: number;
  readonly description: string;
  readonly actionType: string | null;
  readonly balanceAfter: number;
  readonly createdAt: string;
}

/** Wallet section config (for accordion rendering) */
export interface WalletSection {
  readonly id: WalletSectionId;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
}

/** Auto-reload settings */
export interface WalletAutoReload {
  readonly enabled: boolean;
  readonly threshold: number;
  readonly bundleId: string;
}

// ============================================
// MOCK: SECTIONS CONFIG
// ============================================

export const WALLET_SECTIONS: readonly WalletSection[] = [
  {
    id: 'balance',
    title: 'Credit Balance',
    description: 'Your available credits by type',
    icon: 'wallet-outline',
  },
  {
    id: 'bundles',
    title: 'Buy Credits',
    description: 'Top up your wallet with credit packs',
    icon: 'cart-outline',
  },
  {
    id: 'history',
    title: 'Spend History',
    description: 'Recent credit transactions',
    icon: 'time-outline',
  },
  {
    id: 'settings',
    title: 'Wallet Settings',
    description: 'Auto-reload and payment methods',
    icon: 'settings-outline',
  },
] as const;

// ============================================
// MOCK: CREDIT BALANCE
// ============================================

export const MOCK_WALLET_BALANCE: WalletBalance = {
  total: 127,
  ai: 82,
  college: 30,
  email: 15,
};

// ============================================
// MOCK: CREDIT BUNDLES
// ============================================

export const MOCK_WALLET_BUNDLES: readonly WalletBundle[] = [
  {
    id: 'ai-10',
    name: '10 AI Credits',
    credits: 10,
    bonusCredits: 0,
    price: 499,
    pricePerCredit: 50,
    savings: 0,
    badge: null,
    recommended: false,
  },
  {
    id: 'ai-25',
    name: '25 AI Credits',
    credits: 25,
    bonusCredits: 2,
    price: 999,
    pricePerCredit: 40,
    savings: 20,
    badge: 'POPULAR',
    recommended: false,
  },
  {
    id: 'ai-50',
    name: '50 AI Credits',
    credits: 50,
    bonusCredits: 5,
    price: 1799,
    pricePerCredit: 36,
    savings: 28,
    badge: 'BEST VALUE',
    recommended: true,
  },
  {
    id: 'ai-100',
    name: '100 AI Credits',
    credits: 100,
    bonusCredits: 15,
    price: 2999,
    pricePerCredit: 30,
    savings: 40,
    badge: null,
    recommended: false,
  },
] as const;

// ============================================
// MOCK: TRANSACTION HISTORY
// ============================================

const now = Date.now();

export const MOCK_WALLET_TRANSACTIONS: readonly WalletTransaction[] = [
  {
    id: 'txn-001',
    type: 'spend',
    amount: -15,
    description: 'Commitment graphic created',
    actionType: 'create_graphic',
    balanceAfter: 127,
    createdAt: new Date(now - 1_800_000).toISOString(),
  },
  {
    id: 'txn-002',
    type: 'spend',
    amount: -5,
    description: 'Email drafted to Coach Williams',
    actionType: 'draft_email',
    balanceAfter: 142,
    createdAt: new Date(now - 7_200_000).toISOString(),
  },
  {
    id: 'txn-003',
    type: 'purchase',
    amount: 55,
    description: '50 AI Credits + 5 bonus',
    actionType: null,
    balanceAfter: 147,
    createdAt: new Date(now - 86_400_000).toISOString(),
  },
  {
    id: 'txn-004',
    type: 'spend',
    amount: -25,
    description: 'AI scouting report generated',
    actionType: 'scouting_report',
    balanceAfter: 92,
    createdAt: new Date(now - 172_800_000).toISOString(),
  },
  {
    id: 'txn-005',
    type: 'granted',
    amount: 20,
    description: 'Monthly Pro plan credits',
    actionType: null,
    balanceAfter: 117,
    createdAt: new Date(now - 604_800_000).toISOString(),
  },
  {
    id: 'txn-006',
    type: 'spend',
    amount: -30,
    description: 'Highlight reel motion graphic',
    actionType: 'create_motion',
    balanceAfter: 97,
    createdAt: new Date(now - 864_000_000).toISOString(),
  },
  {
    id: 'txn-007',
    type: 'spend',
    amount: -15,
    description: 'College search — Top 10 fits',
    actionType: 'find_colleges',
    balanceAfter: 127,
    createdAt: new Date(now - 1_209_600_000).toISOString(),
  },
  {
    id: 'txn-008',
    type: 'purchase',
    amount: 27,
    description: '25 AI Credits + 2 bonus',
    actionType: null,
    balanceAfter: 142,
    createdAt: new Date(now - 1_814_400_000).toISOString(),
  },
] as const;

// ============================================
// MOCK: AUTO-RELOAD SETTINGS
// ============================================

export const MOCK_WALLET_AUTO_RELOAD: WalletAutoReload = {
  enabled: false,
  threshold: 10,
  bundleId: 'ai-25',
};

// ============================================
// EMPTY STATES
// ============================================

export const MOCK_EMPTY_WALLET_BALANCE: WalletBalance = {
  total: 0,
  ai: 0,
  college: 0,
  email: 0,
};

export const MOCK_EMPTY_WALLET_TRANSACTIONS: readonly WalletTransaction[] = [];
