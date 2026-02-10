/**
 * @fileoverview Wallet Service — Shared State Management
 * @module @nxt1/ui/wallet
 * @version 1.0.0
 *
 * Signal-based state management for the Credit Wallet feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Credit balance tracking
 * - Bundle selection
 * - Transaction history
 * - Auto-reload settings
 * - Section accordion management
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { formatPrice } from '@nxt1/core/constants';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';

// ⚠️ TEMPORARY: Mock data for development (remove when backend is ready)
import {
  MOCK_WALLET_BALANCE,
  MOCK_WALLET_BUNDLES,
  MOCK_WALLET_TRANSACTIONS,
  MOCK_WALLET_AUTO_RELOAD,
  WALLET_SECTIONS,
  type WalletSectionId,
  type WalletBalance,
  type WalletBundle,
  type WalletTransaction,
  type WalletSection,
  type WalletAutoReload,
} from './wallet.mock-data';

/**
 * Wallet state management service.
 * Provides reactive state for the credit wallet interface.
 */
@Injectable({ providedIn: 'root' })
export class WalletService {
  // ⚠️ TEMPORARY: API service commented out — using mock data
  // private readonly api = inject(WalletApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('WalletService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _balance = signal<WalletBalance | null>(null);
  private readonly _bundles = signal<readonly WalletBundle[]>([]);
  private readonly _transactions = signal<readonly WalletTransaction[]>([]);
  private readonly _autoReload = signal<WalletAutoReload | null>(null);
  private readonly _expandedSection = signal<WalletSectionId | null>('balance');
  private readonly _selectedBundleId = signal<string | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _isPurchasing = signal(false);
  private readonly _error = signal<string | null>(null);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** Current credit balance */
  readonly balance = computed(() => this._balance());

  /** Available credit bundles for purchase */
  readonly bundles = computed(() => this._bundles());

  /** Transaction history */
  readonly transactions = computed(() => this._transactions());

  /** Auto-reload settings */
  readonly autoReload = computed(() => this._autoReload());

  /** Currently expanded section ID */
  readonly expandedSection = computed(() => this._expandedSection());

  /** Currently selected bundle for purchase */
  readonly selectedBundleId = computed(() => this._selectedBundleId());

  /** Whether loading wallet data */
  readonly isLoading = computed(() => this._isLoading());

  /** Whether a purchase is in progress */
  readonly isPurchasing = computed(() => this._isPurchasing());

  /** Current error message */
  readonly error = computed(() => this._error());

  // ============================================
  // DERIVED COMPUTEDS
  // ============================================

  /** Total available credits */
  readonly totalCredits = computed(() => this._balance()?.total ?? 0);

  /** Whether balance is critically low (< 10) */
  readonly isCriticalBalance = computed(() => this.totalCredits() < 10);

  /** Whether balance is low (< 25) */
  readonly isLowBalance = computed(() => this.totalCredits() < 25);

  /** Wallet sections configuration */
  readonly sections = computed<readonly WalletSection[]>(() => WALLET_SECTIONS);

  /** Selected bundle object */
  readonly selectedBundle = computed(() => {
    const id = this._selectedBundleId();
    if (!id) return null;
    return this._bundles().find((b) => b.id === id) ?? null;
  });

  /** Recommended bundle (best value or popular) */
  readonly recommendedBundle = computed(() =>
    this._bundles().find((b) => b.recommended) ?? this._bundles()[1] ?? null
  );

  /** Transaction count */
  readonly transactionCount = computed(() => this._transactions().length);

  /** Whether transactions exist */
  readonly hasTransactions = computed(() => this._transactions().length > 0);

  /** Recent transactions (last 5) */
  readonly recentTransactions = computed(() => this._transactions().slice(0, 5));

  /** Spend transactions only */
  readonly spendTransactions = computed(() =>
    this._transactions().filter((t) => t.type === 'spend')
  );

  /** Purchase transactions only */
  readonly purchaseTransactions = computed(() =>
    this._transactions().filter((t) => t.type === 'purchase' || t.type === 'granted')
  );

  // ============================================
  // SECTION MANAGEMENT
  // ============================================

  /**
   * Toggle a section's expanded state.
   */
  toggleSection(sectionId: WalletSectionId): void {
    const current = this._expandedSection();
    this._expandedSection.set(current === sectionId ? null : sectionId);
    this.haptics.impact('light');
  }

  /**
   * Expand a specific section.
   */
  expandSection(sectionId: WalletSectionId): void {
    this._expandedSection.set(sectionId);
  }

  // ============================================
  // BUNDLE SELECTION
  // ============================================

  /**
   * Select a credit bundle for purchase.
   */
  selectBundle(bundleId: string): void {
    this._selectedBundleId.set(bundleId);
    this.haptics.selection();
  }

  /**
   * Clear bundle selection.
   */
  clearBundleSelection(): void {
    this._selectedBundleId.set(null);
  }

  // ============================================
  // DATA LOADING
  // ============================================

  /**
   * Load all wallet data.
   * Uses mock data for now — will connect to backend API.
   */
  async loadWallet(): Promise<void> {
    this.logger.info('Loading wallet data');
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // ⚠️ TEMPORARY: Using mock data
      await this.simulateDelay(400);

      this._balance.set(MOCK_WALLET_BALANCE);
      this._bundles.set([...MOCK_WALLET_BUNDLES]);
      this._transactions.set([...MOCK_WALLET_TRANSACTIONS]);
      this._autoReload.set(MOCK_WALLET_AUTO_RELOAD);

      // Pre-select recommended bundle
      const recommended = MOCK_WALLET_BUNDLES.find((b) => b.recommended);
      if (recommended) {
        this._selectedBundleId.set(recommended.id);
      }

      this.logger.info('Wallet loaded successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load wallet';
      this._error.set(message);
      this.logger.error('Failed to load wallet', { error: err });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Refresh balance only (lightweight).
   */
  async refreshBalance(): Promise<void> {
    try {
      // ⚠️ TEMPORARY: Using mock data
      await this.simulateDelay(200);
      this._balance.set(MOCK_WALLET_BALANCE);
    } catch (err) {
      this.logger.error('Failed to refresh balance', { error: err });
    }
  }

  // ============================================
  // PURCHASE FLOW
  // ============================================

  /**
   * Purchase the currently selected credit bundle.
   * Returns true on success, false on failure.
   */
  async purchaseSelectedBundle(): Promise<boolean> {
    const bundle = this.selectedBundle();
    if (!bundle) {
      this.toast.error('Please select a credit pack');
      return false;
    }

    return this.purchaseBundle(bundle.id);
  }

  /**
   * Purchase a specific credit bundle by ID.
   */
  async purchaseBundle(bundleId: string): Promise<boolean> {
    const bundle = this._bundles().find((b) => b.id === bundleId);
    if (!bundle) {
      this.toast.error('Invalid credit pack');
      return false;
    }

    this.logger.info('Purchasing credit bundle', { bundleId, credits: bundle.credits });
    this._isPurchasing.set(true);
    this._error.set(null);

    try {
      // ⚠️ TEMPORARY: Simulated purchase
      await this.simulateDelay(1500);

      // Optimistic balance update
      const currentBalance = this._balance();
      if (currentBalance) {
        const addedCredits = bundle.credits + bundle.bonusCredits;
        this._balance.set({
          ...currentBalance,
          ai: currentBalance.ai + addedCredits,
          total: currentBalance.total + addedCredits,
        });
      }

      // Add to transaction history
      const newTransaction: WalletTransaction = {
        id: `txn-${Date.now()}`,
        type: 'purchase',
        amount: bundle.credits + bundle.bonusCredits,
        description: `${bundle.name}${bundle.bonusCredits > 0 ? ` + ${bundle.bonusCredits} bonus` : ''}`,
        actionType: null,
        balanceAfter: (currentBalance?.total ?? 0) + bundle.credits + bundle.bonusCredits,
        createdAt: new Date().toISOString(),
      };

      this._transactions.update((txns) => [newTransaction, ...txns]);

      await this.haptics.notification('success');
      this.toast.success(`Added ${bundle.credits + bundle.bonusCredits} credits!`);

      this.logger.info('Purchase completed', { bundleId });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Purchase failed';
      this._error.set(message);
      this.toast.error(message);
      await this.haptics.notification('error');
      this.logger.error('Purchase failed', { bundleId, error: err });
      return false;
    } finally {
      this._isPurchasing.set(false);
    }
  }

  // ============================================
  // AUTO-RELOAD
  // ============================================

  /**
   * Toggle auto-reload on/off.
   */
  toggleAutoReload(): void {
    const current = this._autoReload();
    if (!current) return;

    this._autoReload.set({
      ...current,
      enabled: !current.enabled,
    });

    this.haptics.impact('light');
    this.toast.success(
      current.enabled ? 'Auto-reload disabled' : 'Auto-reload enabled'
    );
  }

  /**
   * Update auto-reload threshold.
   */
  setAutoReloadThreshold(threshold: number): void {
    const current = this._autoReload();
    if (!current) return;

    this._autoReload.set({ ...current, threshold });
  }

  /**
   * Update auto-reload bundle.
   */
  setAutoReloadBundle(bundleId: string): void {
    const current = this._autoReload();
    if (!current) return;

    this._autoReload.set({ ...current, bundleId });
  }

  // ============================================
  // PRICE FORMATTING (delegates to @nxt1/core)
  // ============================================

  /**
   * Format a price in cents to a display string.
   */
  formatPrice(cents: number): string {
    return formatPrice(cents);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /** Simulate API latency during development */
  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
