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

import { Injectable, inject, signal, computed, effect, OnDestroy } from '@angular/core';
import {
  formatPrice,
  USAGE_CATEGORY_CONFIGS,
  USAGE_HISTORY_PAGE_SIZE,
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
  type BillingContextSummary,
} from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';

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
  { id: 'budgets', label: 'Budgets' },
  { id: 'payment-info', label: 'Payment info' },
] as const;
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { UsageApiService } from './usage-api.service';

@Injectable({ providedIn: 'root' })
export class UsageService implements OnDestroy {
  private readonly api = inject(UsageApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('UsageService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  /** Interval handle for polling overview while agent holds are pending */
  private _holdsPollingInterval: ReturnType<typeof setInterval> | null = null;

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
  private readonly _billingContext = signal<BillingContextSummary | null>(null);
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

  constructor() {
    // Auto-poll overview every 5 s while an agent job has an active hold.
    // Stops as soon as pendingHoldsCents drops to 0 or the service is destroyed.
    effect(() => {
      const hasHolds = this.pendingHoldsCents() > 0;
      if (hasHolds && !this._holdsPollingInterval) {
        this._holdsPollingInterval = setInterval(() => {
          this.api
            .getOverview()
            .then((overview) => this._overview.set(overview))
            .catch(() => undefined);
        }, 5000);
      } else if (!hasHolds && this._holdsPollingInterval) {
        clearInterval(this._holdsPollingInterval);
        this._holdsPollingInterval = null;
      }
    });
  }

  ngOnDestroy(): void {
    if (this._holdsPollingInterval) {
      clearInterval(this._holdsPollingInterval);
      this._holdsPollingInterval = null;
    }
  }

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
  readonly billingContext = computed(() => this._billingContext());
  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly timeframe = computed(() => this._timeframe());
  readonly activeProductTab = computed(() => this._activeProductTab());
  readonly expandedBreakdownRow = computed(() => this._expandedBreakdownRow());
  readonly searchQuery = computed(() => this._searchQuery());
  readonly isLoadingMore = computed(() => this._isLoadingMore());
  readonly historyHasMore = computed(() => this._historyHasMore());
  readonly activeSection = computed(() => this._activeSection());

  // ============================================
  // BILLING MODEL SIGNALS (B2C vs B2B)
  // ============================================

  /** Whether this is a personal / individual wallet user (B2C) */
  readonly isPersonal = computed(() => this._billingContext()?.billingEntity === 'individual');

  /** Whether this is an org / team metered-billing user (B2B) */
  readonly isOrg = computed(() => {
    const entity = this._billingContext()?.billingEntity;
    return entity === 'organization' || entity === 'team';
  });

  /** Dynamic section nav — hides org-only sections for personal users */
  readonly sectionNavs = computed((): readonly UsageSectionNav[] => {
    if (this.isPersonal()) {
      // B2C: hide metered-usage chart, budgets, and payment-info
      return USAGE_SECTION_NAVS.filter(
        (n) => n.id !== 'metered-usage' && n.id !== 'budgets' && n.id !== 'payment-info'
      );
    }
    return USAGE_SECTION_NAVS;
  });

  /** Wallet balance in cents (B2C only) */
  readonly walletBalanceCents = computed(() => this._overview()?.walletBalanceCents ?? 0);

  /** Pending holds in cents (B2C only) */
  readonly pendingHoldsCents = computed(() => this._overview()?.pendingHoldsCents ?? 0);

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
    this.analytics?.trackEvent(APP_EVENTS.USAGE_TIMEFRAME_CHANGED, { timeframe });
    this.loadDashboard();
  }

  /** Set the active product tab */
  setActiveProductTab(category: UsageProductCategory): void {
    this._activeProductTab.set(category);
    this.analytics?.trackEvent(APP_EVENTS.USAGE_CATEGORY_CHANGED, { productCategory: category });
    this.haptics.impact('light');
  }

  /** Toggle a breakdown row expansion */
  toggleBreakdownRow(date: string): void {
    const current = this._expandedBreakdownRow();
    this._expandedBreakdownRow.set(current === date ? null : date);
    if (current !== date) {
      this.analytics?.trackEvent(APP_EVENTS.USAGE_BREAKDOWN_EXPANDED, { date });
    }
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
    this.breadcrumb.trackStateChange('usage:loading', { timeframe: this._timeframe() });
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const [dashboard, billingCtx] = await Promise.all([
        this.api.getDashboard({ timeframe: this._timeframe() }),
        this.api.getBillingContext(),
      ]);

      this._overview.set(dashboard.overview);
      this._subscriptions.set(dashboard.subscriptions);
      this._chartData.set(dashboard.chartData);
      this._productDetails.set(dashboard.productDetails);
      this._topItems.set(dashboard.topItems);
      this._breakdownRows.set(dashboard.breakdownRows);
      this._paymentHistory.set(dashboard.paymentHistory);
      this._paymentMethods.set(dashboard.paymentMethods);
      this._billingInfo.set(dashboard.billingInfo);
      this._coupon.set(dashboard.coupon);
      this._budgets.set(dashboard.budgets);
      this._billingContext.set(billingCtx);
      this._historyPage.set(1);
      this._historyHasMore.set(dashboard.paymentHistory.length >= USAGE_HISTORY_PAGE_SIZE);

      this.logger.info('Usage dashboard loaded', { entity: billingCtx.billingEntity });
      this.breadcrumb.trackStateChange('usage:loaded', { entity: billingCtx.billingEntity });
      this.analytics?.trackEvent(APP_EVENTS.USAGE_DASHBOARD_VIEWED, {
        timeframe: this._timeframe(),
        entity: billingCtx.billingEntity,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load usage data';
      this._error.set(message);
      this.logger.error('Failed to load usage dashboard', err);
      this.breadcrumb.trackStateChange('usage:error', { message });
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
      const nextPage = this._historyPage() + 1;
      const result = await this.api.getHistory(nextPage, USAGE_HISTORY_PAGE_SIZE);
      this._paymentHistory.update((prev) => [...prev, ...result.records]);
      this._historyPage.set(nextPage);
      this._historyHasMore.set(result.hasMore);
      this.analytics?.trackEvent(APP_EVENTS.USAGE_HISTORY_LOADED_MORE, { page: nextPage });
    } catch (err) {
      this.logger.error('Failed to load more history', err);
      this.breadcrumb.trackStateChange('usage:history-error', { page: this._historyPage() });
    } finally {
      this._isLoadingMore.set(false);
    }
  }

  // ============================================
  // PAYMENT METHOD MANAGEMENT
  // ============================================

  async setDefaultPaymentMethod(methodId: string): Promise<boolean> {
    this.logger.info('Setting default payment method', { methodId });
    this.breadcrumb.trackStateChange('usage:updating-payment-method', { methodId });
    const previous = this._paymentMethods();
    try {
      this._paymentMethods.update((methods) =>
        methods.map((m) => ({ ...m, isDefault: m.id === methodId }))
      );
      await this.api.setDefaultPaymentMethod(methodId);
      await this.haptics.notification('success');
      this.toast.success('Default payment method updated');
      this.analytics?.trackEvent(APP_EVENTS.USAGE_PAYMENT_METHOD_DEFAULT_SET, { methodId });
      return true;
    } catch (err) {
      this._paymentMethods.set(previous);
      const message = err instanceof Error ? err.message : 'Failed to update payment method';
      this.logger.error('Failed to set default payment method', err, { methodId });
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
      await this.api.removePaymentMethod(methodId);
      await this.haptics.notification('success');
      this.toast.success('Payment method removed');
      this.analytics?.trackEvent(APP_EVENTS.USAGE_PAYMENT_METHOD_REMOVED, { methodId });
      return true;
    } catch (err) {
      this._paymentMethods.set(previous);
      const message = err instanceof Error ? err.message : 'Failed to remove payment method';
      this.logger.error('Failed to remove payment method', err, { methodId });
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
  // RECEIPT & INVOICE DOWNLOADS
  // ============================================

  /** Open a receipt PDF for a payment history record */
  async openReceipt(recordId: string): Promise<void> {
    const record = this._paymentHistory().find((r) => r.id === recordId);
    if (record?.receiptUrl) {
      window.open(record.receiptUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    this.logger.info('Fetching receipt URL', { recordId });
    try {
      const url = await this.api.getReceiptUrl(recordId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      this.logger.error('Failed to get receipt URL', err, { recordId });
      this.toast.error('Unable to open receipt. Please try again.');
    }
  }

  /** Open an invoice PDF for a payment history record */
  async openInvoice(recordId: string): Promise<void> {
    const record = this._paymentHistory().find((r) => r.id === recordId);
    if (record?.invoiceUrl) {
      window.open(record.invoiceUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    this.logger.info('Fetching invoice URL', { recordId });
    try {
      const url = await this.api.getInvoiceUrl(recordId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      this.logger.error('Failed to get invoice URL', err, { recordId });
      this.toast.error('Unable to open invoice. Please try again.');
    }
  }

  // ============================================
  // BUDGET MANAGEMENT
  // ============================================

  /** Update the user's monthly budget (in cents) */
  async updateBudget(monthlyBudget: number): Promise<boolean> {
    this.logger.info('Updating budget', { monthlyBudget });
    this.breadcrumb.trackStateChange('usage:updating-budget', { monthlyBudget });
    try {
      await this.api.updateBudget(monthlyBudget);
      this._billingContext.update((ctx) => (ctx ? { ...ctx, monthlyBudget } : ctx));
      await this.haptics.notification('success');
      this.toast.success('Budget updated');
      this.analytics?.trackEvent(APP_EVENTS.USAGE_BUDGET_UPDATED, { monthlyBudget });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update budget';
      this.logger.error('Failed to update budget', err, { monthlyBudget });
      this.toast.error(message);
      await this.haptics.notification('error');
      return false;
    }
  }

  /** Update a team's monthly budget (in cents) — team admin only */
  async updateTeamBudget(teamId: string, monthlyBudget: number): Promise<boolean> {
    this.logger.info('Updating team budget', { teamId, monthlyBudget });
    this.breadcrumb.trackStateChange('usage:updating-team-budget', { teamId, monthlyBudget });
    try {
      await this.api.updateTeamBudget(teamId, monthlyBudget);
      this._billingContext.update((ctx) =>
        ctx?.teamId === teamId ? { ...ctx, monthlyBudget } : ctx
      );
      await this.haptics.notification('success');
      this.toast.success('Team budget updated');
      this.analytics?.trackEvent(APP_EVENTS.USAGE_TEAM_BUDGET_UPDATED, { teamId, monthlyBudget });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update team budget';
      this.logger.error('Failed to update team budget', err, { teamId, monthlyBudget });
      this.toast.error(message);
      await this.haptics.notification('error');
      return false;
    }
  }

  /** Save billing info (address, name, etc.) to Stripe */
  async saveBillingInfo(info: UsageBillingInfo): Promise<boolean> {
    this.logger.info('Saving billing info');
    this.breadcrumb.trackStateChange('usage:saving-billing-info');
    const previous = this._billingInfo();
    try {
      this._billingInfo.set(info);
      await this.api.updateBillingInfo(info);
      await this.haptics.notification('success');
      this.toast.success('Billing information updated');
      return true;
    } catch (err) {
      this._billingInfo.set(previous);
      const message = err instanceof Error ? err.message : 'Failed to update billing information';
      this.logger.error('Failed to save billing info', err);
      this.toast.error(message);
      await this.haptics.notification('error');
      return false;
    }
  }
}
