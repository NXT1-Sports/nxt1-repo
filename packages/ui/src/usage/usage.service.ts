/**
 * @fileoverview Usage Dashboard Service — Signal-Based State Management
 * @module @nxt1/ui/usage
 * @version 2.0.0
 *
 * Professional billing dashboard state management.
 * Single scrollable page — no tabs/accordion.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  formatPrice,
  USAGE_CATEGORY_CONFIGS,
  type UsageTimeframe,
  type UsageOverview,
  type UsageSubscription,
  type UsageChartDataPoint,
  type UsageProductDetail,
  type UsageProductCategory,
  type UsageTopItem,
  type UsageBreakdownRow,
  type UsagePaymentHistoryRecord,
  type UsagePaymentMethod,
  type UsageBillingInfo,
  type UsageCoupon,
  type UsageBudget,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';

/** Navigation sections for the billing dashboard */
export type UsageSection =
  | 'overview'
  | 'metered-usage'
  | 'breakdown'
  | 'payment-history'
  | 'budgets'
  | 'payment-info';

export interface UsageSectionNav {
  readonly id: UsageSection;
  readonly label: string;
}

export const USAGE_SECTION_NAVS: readonly UsageSectionNav[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'metered-usage', label: 'Metered usage' },
  { id: 'breakdown', label: 'Usage breakdown' },
  { id: 'payment-history', label: 'Payment history' },
  { id: 'budgets', label: 'Budgets & alerts' },
  { id: 'payment-info', label: 'Payment info' },
] as const;
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';

// ⚠️ TEMPORARY: Mock data (remove when backend is ready)
import {
  MOCK_USAGE_OVERVIEW,
  MOCK_USAGE_SUBSCRIPTIONS,
  MOCK_USAGE_CHART_DATA,
  MOCK_USAGE_PRODUCT_DETAILS,
  MOCK_USAGE_TOP_ITEMS,
  MOCK_USAGE_BREAKDOWN_ROWS,
  MOCK_USAGE_PAYMENT_HISTORY,
  MOCK_USAGE_PAYMENT_METHODS,
  MOCK_USAGE_BILLING_INFO,
  MOCK_USAGE_COUPON,
  MOCK_USAGE_BUDGETS,
} from './usage.mock-data';

@Injectable({ providedIn: 'root' })
export class UsageService {
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('UsageService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _overview = signal<UsageOverview | null>(null);
  private readonly _subscriptions = signal<readonly UsageSubscription[]>([]);
  private readonly _chartData = signal<readonly UsageChartDataPoint[]>([]);
  private readonly _productDetails = signal<readonly UsageProductDetail[]>([]);
  private readonly _topItems = signal<readonly UsageTopItem[]>([]);
  private readonly _breakdownRows = signal<readonly UsageBreakdownRow[]>([]);
  private readonly _paymentHistory = signal<readonly UsagePaymentHistoryRecord[]>([]);
  private readonly _paymentMethods = signal<readonly UsagePaymentMethod[]>([]);
  private readonly _billingInfo = signal<UsageBillingInfo | null>(null);
  private readonly _coupon = signal<UsageCoupon | null>(null);
  private readonly _budgets = signal<readonly UsageBudget[]>([]);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _timeframe = signal<UsageTimeframe>('current-month');
  private readonly _activeProductTab = signal<UsageProductCategory>('media');
  private readonly _expandedBreakdownRow = signal<string | null>(null);
  private readonly _searchQuery = signal('');
  private readonly _historyPage = signal(1);
  private readonly _historyHasMore = signal(true);
  private readonly _isLoadingMore = signal(false);
  private readonly _activeSection = signal<UsageSection>('overview');

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  readonly overview = computed(() => this._overview());
  readonly subscriptions = computed(() => this._subscriptions());
  readonly chartData = computed(() => this._chartData());
  readonly productDetails = computed(() => this._productDetails());
  readonly topItems = computed(() => this._topItems());
  readonly breakdownRows = computed(() => this._breakdownRows());
  readonly paymentHistory = computed(() => this._paymentHistory());
  readonly paymentMethods = computed(() => this._paymentMethods());
  readonly billingInfo = computed(() => this._billingInfo());
  readonly coupon = computed(() => this._coupon());
  readonly budgets = computed(() => this._budgets());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly timeframe = computed(() => this._timeframe());
  readonly activeProductTab = computed(() => this._activeProductTab());
  readonly expandedBreakdownRow = computed(() => this._expandedBreakdownRow());
  readonly searchQuery = computed(() => this._searchQuery());
  readonly isLoadingMore = computed(() => this._isLoadingMore());
  readonly historyHasMore = computed(() => this._historyHasMore());
  readonly activeSection = computed(() => this._activeSection());
  readonly sectionNavs = USAGE_SECTION_NAVS;

  // ============================================
  // DERIVED COMPUTEDS
  // ============================================

  /** Current metered usage formatted */
  readonly currentUsageFormatted = computed(() =>
    formatPrice(this._overview()?.currentMeteredUsage ?? 0)
  );

  /** Included usage formatted */
  readonly includedUsageFormatted = computed(() =>
    formatPrice(this._overview()?.currentIncludedUsage ?? 0)
  );

  /** Period label */
  readonly periodLabel = computed(() => this._overview()?.period.label ?? '');

  /** Next payment due display */
  readonly nextPaymentDisplay = computed(() => {
    const overview = this._overview();
    if (!overview?.nextPaymentDueDate) return '–';
    return formatPrice(overview.nextPaymentAmount);
  });

  /** Active product detail based on selected tab */
  readonly activeProductDetail = computed(
    () => this._productDetails().find((d) => d.category === this._activeProductTab()) ?? null
  );

  /** Category tab configs (from core constants) */
  readonly categoryTabs = computed(() => USAGE_CATEGORY_CONFIGS);

  /** Chart max value for Y-axis scaling */
  readonly chartMaxValue = computed(() => {
    const data = this._chartData();
    if (data.length === 0) return 0;
    const max = Math.max(...data.map((d) => d.amount));
    return Math.ceil(max / 2000) * 2000;
  });

  /** Chart Y-axis labels */
  readonly chartYLabels = computed(() => {
    const max = this.chartMaxValue();
    if (max === 0) return ['$0'];
    const step = max / 4;
    return Array.from({ length: 5 }, (_, i) => formatPrice(max - i * step));
  });

  /** Filtered breakdown rows by search */
  readonly filteredBreakdownRows = computed(() => {
    const query = this._searchQuery().toLowerCase().trim();
    const rows = this._breakdownRows();
    if (!query) return rows;
    return rows.filter(
      (r) =>
        r.dateLabel.toLowerCase().includes(query) ||
        r.lineItems.some((li) => li.sku.toLowerCase().includes(query))
    );
  });

  /** Filtered payment history by search */
  readonly filteredPaymentHistory = computed(() => {
    const query = this._searchQuery().toLowerCase().trim();
    const history = this._paymentHistory();
    if (!query) return history;
    return history.filter(
      (r) =>
        r.displayId.toLowerCase().includes(query) ||
        r.paymentMethodLabel.toLowerCase().includes(query) ||
        r.dateLabel.includes(query)
    );
  });

  /** Has active budgets with spending */
  readonly activeBudgets = computed(() =>
    this._budgets().filter((b) => b.budgetLimit > 0 || b.spent > 0)
  );

  /** Default payment method */
  readonly defaultPaymentMethod = computed(
    () => this._paymentMethods().find((m) => m.isDefault) ?? null
  );

  /** Has coupon */
  readonly hasCoupon = computed(() => this._coupon()?.isActive ?? false);

  // ============================================
  // ACTIONS
  // ============================================

  /** Set the active section */
  setActiveSection(section: UsageSection): void {
    this._activeSection.set(section);
    this.haptics.impact('light');
  }

  /** Set the timeframe filter */
  setTimeframe(timeframe: UsageTimeframe): void {
    this._timeframe.set(timeframe);
    this.loadDashboard();
  }

  /** Set the active product tab */
  setActiveProductTab(category: UsageProductCategory): void {
    this._activeProductTab.set(category);
    this.haptics.impact('light');
  }

  /** Toggle a breakdown row expansion */
  toggleBreakdownRow(date: string): void {
    const current = this._expandedBreakdownRow();
    this._expandedBreakdownRow.set(current === date ? null : date);
    this.haptics.impact('light');
  }

  /** Set the search query */
  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
  }

  // ============================================
  // DATA LOADING
  // ============================================

  async loadDashboard(): Promise<void> {
    this.logger.info('Loading usage dashboard', { timeframe: this._timeframe() });
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // ⚠️ TEMPORARY: Mock data
      await this.simulateDelay(600);

      this._overview.set(MOCK_USAGE_OVERVIEW);
      this._subscriptions.set([...MOCK_USAGE_SUBSCRIPTIONS]);
      this._chartData.set([...MOCK_USAGE_CHART_DATA]);
      this._productDetails.set([...MOCK_USAGE_PRODUCT_DETAILS]);
      this._topItems.set([...MOCK_USAGE_TOP_ITEMS]);
      this._breakdownRows.set([...MOCK_USAGE_BREAKDOWN_ROWS]);
      this._paymentHistory.set([...MOCK_USAGE_PAYMENT_HISTORY]);
      this._paymentMethods.set([...MOCK_USAGE_PAYMENT_METHODS]);
      this._billingInfo.set(MOCK_USAGE_BILLING_INFO);
      this._coupon.set(MOCK_USAGE_COUPON);
      this._budgets.set([...MOCK_USAGE_BUDGETS]);
      this._historyPage.set(1);
      this._historyHasMore.set(false);

      this.logger.info('Usage dashboard loaded');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load usage data';
      this._error.set(message);
      this.logger.error('Failed to load usage dashboard', err);
    } finally {
      this._isLoading.set(false);
    }
  }

  /** Refresh all usage data (pull-to-refresh) */
  async refresh(): Promise<void> {
    this.logger.info('Refreshing usage dashboard');
    await this.loadDashboard();
  }

  /** Load more payment history */
  async loadMoreHistory(): Promise<void> {
    if (!this._historyHasMore() || this._isLoadingMore()) return;
    this._isLoadingMore.set(true);
    try {
      await this.simulateDelay(300);
      this._historyHasMore.set(false);
    } catch (err) {
      this.logger.error('Failed to load more history', err);
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  // ============================================
  // PAYMENT METHOD MANAGEMENT
  // ============================================

  async setDefaultPaymentMethod(methodId: string): Promise<boolean> {
    this.logger.info('Setting default payment method', { methodId });
    try {
      await this.simulateDelay(500);
      this._paymentMethods.update((methods) =>
        methods.map((m) => ({ ...m, isDefault: m.id === methodId }))
      );
      await this.haptics.notification('success');
      this.toast.success('Default payment method updated');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update payment method';
      this.toast.error(message);
      await this.haptics.notification('error');
      return false;
    }
  }

  async removePaymentMethod(methodId: string): Promise<boolean> {
    const method = this._paymentMethods().find((m) => m.id === methodId);
    if (!method) return false;
    if (method.isDefault) {
      this.toast.error('Cannot remove default payment method');
      return false;
    }

    const previous = this._paymentMethods();
    try {
      this._paymentMethods.update((methods) => methods.filter((m) => m.id !== methodId));
      await this.simulateDelay(500);
      await this.haptics.notification('success');
      this.toast.success('Payment method removed');
      return true;
    } catch (err) {
      this._paymentMethods.set(previous);
      const message = err instanceof Error ? err.message : 'Failed to remove payment method';
      this.toast.error(message);
      await this.haptics.notification('error');
      return false;
    }
  }

  /** Format price (delegates to @nxt1/core) */
  formatPrice(cents: number): string {
    return formatPrice(cents);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
