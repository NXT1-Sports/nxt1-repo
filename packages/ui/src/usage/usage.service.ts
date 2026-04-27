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

import { Injectable, inject, signal, computed, effect, NgZone, OnDestroy } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  type BudgetInterval,
  formatPrice,
  USAGE_CATEGORY_CONFIGS,
  USAGE_HISTORY_PAGE_SIZE,
  type BillingMode,
  type BillingStateSummary,
  type UsageSection,
  type UsageTimeframe,
  type UsageOverview,
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
import { APP_EVENTS } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { NxtBrowserService } from '../services/browser/browser.service';
import { NxtModalService, type LoadingConfig } from '../services/modal';

// Re-export so consumers can import UsageSection from '@nxt1/ui/usage' as before
export type { UsageSection };

export interface UsageSectionNav {
  readonly id: UsageSection;
  readonly label: string;
}

export const USAGE_SECTION_NAVS: readonly UsageSectionNav[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'metered-usage', label: 'Metered usage' },
  { id: 'breakdown', label: 'Usage breakdown' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'payment-info', label: 'Payment info' },
  { id: 'auto-topup', label: 'Auto top-up' },
] as const;
export const USAGE_CHECKOUT_POPUP_NAME = 'nxt1-usage-checkout';
export const USAGE_CHECKOUT_RETURN_MESSAGE = 'nxt1:usage-checkout-return';
const STRIPE_CHECKOUT_SESSION_PLACEHOLDER_TOKEN = 'CHECKOUT_SESSION_ID';

function hasResolvedCheckoutSessionId(sessionId: string | null | undefined): sessionId is string {
  if (!sessionId) {
    return false;
  }

  const normalized = sessionId.trim();
  return normalized.length > 0 && !normalized.includes(STRIPE_CHECKOUT_SESSION_PLACEHOLDER_TOKEN);
}
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { UsageApiService } from './usage-api.service';

@Injectable({ providedIn: 'root' })
export class UsageService implements OnDestroy {
  private readonly api = inject(UsageApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly browser = inject(NxtBrowserService);
  private readonly modal = inject(NxtModalService);
  private readonly logger = inject(NxtLoggingService).child('UsageService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly ngZone = inject(NgZone);

  /** Interval handle for polling overview while agent holds are pending */
  private _holdsPollingInterval: ReturnType<typeof setInterval> | null = null;
  /** Interval handle for polling wallet balance every 60 s while the page is active */
  private _balancePollInterval: ReturnType<typeof setInterval> | null = null;
  /** Timeout handles for short-lived force-refresh retries after external billing flows */
  private _externalRefreshTimeouts: Array<ReturnType<typeof setTimeout>> = [];
  /** Monotonic token so stale async dashboard loads cannot overwrite newer state */
  private _dashboardLoadRequestId = 0;

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _overview = signal<UsageOverview | null>(null);
  private readonly _chartData = signal<readonly UsageChartDataPoint[]>([]);
  private readonly _productDetails = signal<readonly UsageProductDetail[]>([]);
  private readonly _topItems = signal<readonly UsageTopItem[]>([]);
  private readonly _breakdownRows = signal<readonly UsageBreakdownRow[]>([]);
  private readonly _paymentHistory = signal<readonly UsagePaymentHistoryRecord[]>([]);
  private readonly _paymentMethods = signal<readonly UsagePaymentMethod[]>([]);
  private readonly _billingInfo = signal<UsageBillingInfo | null>(null);
  private readonly _coupon = signal<UsageCoupon | null>(null);
  private readonly _budgets = signal<readonly UsageBudget[]>([]);
  private readonly _billingContext = signal<BillingStateSummary | null>(null);
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
  // NOTE: isOrgAdmin, isTeamAdmin, isOrgMember, and billingMode are ALL derived
  // from _billingContext (SSOT). Never store them as separate writable signals
  // — that creates flashes when one signal updates before the other during
  // billing-mode switches.
  /**
   * Authoritative allowed sections from backend.
   * Empty while loading — tabs are hidden until the backend responds.
   * Never computed on the frontend; always read from the dashboard payload.
   */
  private readonly _allowedSections = signal<readonly UsageSection[]>([]);

  // billingMode is derived from _billingContext (SSOT) — no separate writable signal
  /** Auto top-up enabled flag */
  private readonly _autoTopUpEnabled = signal(false);
  /** Balance threshold (cents) at which auto top-up fires */
  private readonly _autoTopUpThresholdCents = signal(0);
  /** Amount (cents) added when auto top-up fires */
  private readonly _autoTopUpAmountCents = signal(0);

  constructor() {
    // Auto-poll overview every 5 s while an agent job has an active hold.
    // Stops as soon as pendingHoldsCents drops to 0 or the service is destroyed.
    effect(() => {
      const hasHolds = this.pendingHoldsCents() > 0;
      if (hasHolds && !this._holdsPollingInterval) {
        // Run outside NgZone: a running setInterval inside the zone permanently
        // prevents app stabilization (Zone.js treats it as a live macrotask).
        // Signal writes (this._overview.set) are zone-independent.
        this.ngZone.runOutsideAngular(() => {
          this._holdsPollingInterval = setInterval(() => {
            this.api
              .getOverview()
              .then((overview) => this._overview.set(overview))
              .catch((err: unknown) => this.logger.warn('Holds polling failed', { error: err }));
          }, 5000);
        });
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
    this._stopBalancePoll();
    this._clearExternalRefreshRetries();
  }

  private _clearExternalRefreshRetries(): void {
    for (const timeoutId of this._externalRefreshTimeouts) {
      clearTimeout(timeoutId);
    }
    this._externalRefreshTimeouts = [];
  }

  /**
   * Force a short burst of fresh reloads after returning from Stripe-hosted
   * checkout/portal flows. The first load may race the webhook that credits the
   * wallet, so we revalidate a few more times before settling.
   */
  async refreshAfterExternalBillingReturn(options?: {
    readonly sessionId?: string | null;
    readonly organizationId?: string | null;
  }): Promise<void> {
    this._clearExternalRefreshRetries();

    if (hasResolvedCheckoutSessionId(options?.sessionId)) {
      try {
        await this.api.confirmCheckoutSession(
          options.sessionId,
          options.organizationId ?? undefined
        );
        this.logger.info('Stripe checkout session finalized on return', {
          sessionId: options.sessionId,
          organizationId: options.organizationId,
        });
      } catch (err) {
        this.logger.error('Failed to finalize Stripe checkout session on return', err, {
          sessionId: options.sessionId,
          organizationId: options.organizationId,
        });
      }
    } else if (options?.sessionId) {
      this.logger.warn(
        'Skipping Stripe checkout confirmation because return URL still contains placeholder session ID',
        {
          sessionId: options.sessionId,
          organizationId: options.organizationId,
        }
      );
    }

    void this.loadDashboard(true);

    this.ngZone.runOutsideAngular(() => {
      for (const delayMs of [1500, 3500, 6500]) {
        const timeoutId = setTimeout(() => {
          this._externalRefreshTimeouts = this._externalRefreshTimeouts.filter(
            (activeTimeoutId) => activeTimeoutId !== timeoutId
          );
          void this.loadDashboard(true);
        }, delayMs);
        this._externalRefreshTimeouts.push(timeoutId);
      }
    });
  }

  /**
   * Start a 60 s interval that re-fetches `/usage/overview` so that
   * `walletBalanceCents` stays current as Agent X deducts credits.
   * Safe to call multiple times — clears any existing interval first.
   */
  private _startBalancePoll(): void {
    this._stopBalancePoll();
    this.ngZone.runOutsideAngular(() => {
      this._balancePollInterval = setInterval(() => {
        this.api
          .getOverview()
          .then((overview) => this._overview.set(overview))
          .catch((err: unknown) => this.logger.warn('Balance poll failed', { error: err }));
      }, 60_000);
    });
  }

  /** Clear the balance poll interval. */
  private _stopBalancePoll(): void {
    if (this._balancePollInterval) {
      clearInterval(this._balancePollInterval);
      this._balancePollInterval = null;
    }
  }

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  readonly overview = computed(() => this._overview());
  readonly chartData = computed(() => this._chartData());
  readonly productDetails = computed(() => this._productDetails());
  readonly topItems = computed(() => this._topItems());
  readonly breakdownRows = computed(() => this._breakdownRows());
  readonly paymentHistory = computed(() => this._paymentHistory());
  readonly paymentMethods = computed(() => this._paymentMethods());
  readonly billingInfo = computed(() => this._billingInfo());
  readonly coupon = computed(() => this._coupon());
  readonly budgets = computed(() => this._budgets());
  readonly budgetTeamAllocations = computed(
    () => this._budgets().find((budget) => budget.teamAllocations?.length)?.teamAllocations ?? []
  );
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

  /** Whether the current user is an admin of the organization — derived from _billingContext (SSOT) */
  readonly isOrgAdmin = computed(() => this._billingContext()?.isOrgAdmin ?? false);
  /** Whether the current user is an admin of their assigned team — derived from _billingContext (SSOT) */
  readonly isTeamAdmin = computed(() => this._billingContext()?.isTeamAdmin ?? false);
  /**
   * True when this user is an org-billed member but not an admin.
   * Derived from _billingContext (SSOT) so billing-mode switches are atomic.
   * When billingMode='personal', resolveBillingTarget returns billingEntity='individual'
   * — so this correctly flips to false without waiting for loadDashboard.
   */
  readonly isOrgMember = computed(() => {
    const ctx = this._billingContext();
    if (!ctx) return false;
    const isOrgOrTeamBilled = ctx.billingEntity === 'organization' || ctx.billingEntity === 'team';
    return isOrgOrTeamBilled && !ctx.isOrgAdmin && !ctx.isTeamAdmin;
  });

  // ============================================
  // BILLING MODEL SIGNALS (B2C vs B2B)
  // ============================================

  /** Whether this is a personal / individual wallet user (B2C) */
  readonly isPersonal = computed(() => this._billingContext()?.billingEntity === 'individual');

  /** Whether this is an org / team wallet user (B2B) */
  readonly isOrg = computed(() => {
    const entity = this._billingContext()?.billingEntity;
    return entity === 'organization' || entity === 'team';
  });

  /** Current charge-routing mode resolved by the backend. */
  readonly billingMode = computed<BillingMode>(
    () => this._billingContext()?.billingMode ?? 'personal'
  );

  /** Whether the current user has an organization-funded billing option available. */
  readonly canSwitchToOrganizationBilling = computed(
    () => this._billingContext()?.hasOrganizationBilling ?? false
  );

  /** Whether the current user is actively routing charges to the personal wallet. */
  readonly isPersonalBillingMode = computed(() => this.billingMode() === 'personal');

  /**
   * True when this is an org member whose org wallet is empty AND they haven't
   * already switched to personal billing — prompts the "use my personal wallet?" banner.
   */
  readonly orgWalletEmpty = computed(
    () =>
      this.isOrg() &&
      this.billingMode() === 'organization' &&
      (this._billingContext()?.orgWalletEmpty ?? false)
  );

  /**
   * True when an org member is currently on personal billing BUT the org wallet
   * has been refilled (balance > 0) — prompts the "switch back to org billing?" banner.
   */
  readonly orgWalletRefilled = computed(() => {
    if (!this.isOrg() || this.billingMode() !== 'personal') return false;
    const walletBalance = this._billingContext()?.walletBalanceCents ?? 0;
    return walletBalance > 0;
  });

  /**
   * Resolved billing mode label for display.
   * Mirrors the backend-resolved charge-routing mode.
   */
  readonly effectiveBillingMode = computed<BillingMode>(() => this.billingMode());

  /** Whether the current user should see billing actions in shared UI. */
  readonly canManageBilling = computed(
    () => this.isPersonal() || this.isOrgAdmin() || this.isTeamAdmin()
  );

  /** Dynamic section nav — tailored per billing entity and admin role */
  /**
   * Sidebar nav tabs — derived directly from backend-provided `allowedSections`.
   * Empty while the dashboard is loading so tabs never flash or re-order.
   * Zero frontend conditional logic: the backend is the authoritative source.
   */
  readonly sectionNavs = computed((): readonly UsageSectionNav[] => {
    const allowed = this._allowedSections();
    if (allowed.length === 0) return []; // still loading — render nothing
    return USAGE_SECTION_NAVS.filter((n) => (allowed as readonly string[]).includes(n.id));
  });

  /**
   * Wallet balance in cents (personal and org wallets).
   * Reads _overview first because the 60 s balance poll keeps it current
   * as Agent X deducts credits. Falls back to _billingContext (set on
   * loadDashboard) so the value is available before the first poll fires.
   */
  readonly walletBalanceCents = computed(
    () => this._overview()?.walletBalanceCents ?? this._billingContext()?.walletBalanceCents ?? 0
  );

  /** Pending holds in cents (personal and org wallets) */
  readonly pendingHoldsCents = computed(
    () => this._billingContext()?.pendingHoldsCents ?? this._overview()?.pendingHoldsCents ?? 0
  );

  /** Whether auto top-up is configured */
  readonly autoTopUpEnabled = computed(() => this._autoTopUpEnabled());
  readonly autoTopUpThresholdCents = computed(() => this._autoTopUpThresholdCents());
  readonly autoTopUpAmountCents = computed(() => this._autoTopUpAmountCents());

  // ============================================
  // DERIVED COMPUTEDS
  // ============================================

  /** Current metered usage formatted */
  readonly currentUsageFormatted = computed(() =>
    formatPrice(this._overview()?.currentMeteredUsage ?? 0)
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
    if (max === 0) return 0;
    // Compute a "nice" ceiling scaled to the actual data magnitude
    // so small amounts (e.g. $2.07) don't get rounded up to $20.
    const rawStep = max / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
    const normalized = rawStep / magnitude;
    const niceFactor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return niceFactor * magnitude * 4;
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

  async ensureBillingAccessContext(force = false): Promise<void> {
    if (!force && this._billingContext() !== null) {
      return;
    }

    try {
      const billingCtx = force
        ? await this.api.getBillingStateFresh()
        : await this.api.getBillingState();
      this._billingContext.set(billingCtx);
      // isOrgAdmin / isTeamAdmin / isOrgMember / billingMode are all
      // derived from _billingContext (SSOT) — no separate .set() calls needed.
      this._autoTopUpEnabled.set(billingCtx.autoTopUpEnabled ?? false);
      this._autoTopUpThresholdCents.set(billingCtx.autoTopUpThresholdCents ?? 0);
      this._autoTopUpAmountCents.set(billingCtx.autoTopUpAmountCents ?? 0);
    } catch (err) {
      this.logger.warn('Failed to load billing access context', { error: err });
    }
  }

  async ensureBudgetEditorContext(force = false): Promise<void> {
    await this.ensureBillingAccessContext(force);

    const hasBudgetData = this._budgets().length > 0;

    if (!force && hasBudgetData) {
      return;
    }

    try {
      const budgets = force ? await this.api.getBudgetsFresh() : await this.api.getBudgets();
      this._budgets.set(budgets);
    } catch (err) {
      this.logger.warn('Failed to load budget editor context', { error: err });
    }
  }

  async loadDashboard(forceFresh = false): Promise<void> {
    const requestId = ++this._dashboardLoadRequestId;
    const timeframe = this._timeframe();
    this.logger.info('Loading usage dashboard', { timeframe, forceFresh });
    this.breadcrumb.trackStateChange('usage:loading', { timeframe, forceFresh });
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const [dashboard, billingCtx] = await Promise.all([
        forceFresh ? this.api.getDashboardFresh(timeframe) : this.api.getDashboard({ timeframe }),
        forceFresh ? this.api.getBillingStateFresh() : this.api.getBillingState(),
      ]);

      if (requestId !== this._dashboardLoadRequestId) {
        this.logger.info('Discarding stale usage dashboard response', { requestId, timeframe });
        return;
      }

      this._overview.set(dashboard.overview);
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
      // isOrgAdmin / isTeamAdmin / isOrgMember / billingMode are all
      // derived from _billingContext (SSOT) — no separate .set() calls needed.
      // Set authoritative sections from backend — this is what drives the sidebar tabs.
      // Setting this last ensures tabs appear in one atomic render after all data is ready.
      this._allowedSections.set(dashboard.allowedSections ?? []);
      // billingMode is derived from _billingContext (SSOT) — no separate signal write needed
      this._autoTopUpEnabled.set(billingCtx.autoTopUpEnabled ?? false);
      this._autoTopUpThresholdCents.set(billingCtx.autoTopUpThresholdCents ?? 0);
      this._autoTopUpAmountCents.set(billingCtx.autoTopUpAmountCents ?? 0);
      this._historyPage.set(1);
      this._historyHasMore.set(dashboard.paymentHistory.length >= USAGE_HISTORY_PAGE_SIZE);

      this.logger.info('Usage dashboard loaded', { entity: billingCtx.billingEntity });
      this.breadcrumb.trackStateChange('usage:loaded', { entity: billingCtx.billingEntity });
      this.analytics?.trackEvent(APP_EVENTS.USAGE_DASHBOARD_VIEWED, {
        timeframe,
        entity: billingCtx.billingEntity,
      });

      // Start a lightweight 60 s balance poll so walletBalanceCents stays
      // current as Agent X deducts credits during the session.
      this._startBalancePoll();
    } catch (err) {
      if (requestId !== this._dashboardLoadRequestId) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load usage data';
      this._error.set(message);
      this.logger.error('Failed to load usage dashboard', err);
      this.breadcrumb.trackStateChange('usage:error', { message });
    } finally {
      if (requestId === this._dashboardLoadRequestId) {
        this._isLoading.set(false);
      }
    }
  }

  /** Refresh all usage data (pull-to-refresh) */
  async refresh(): Promise<void> {
    this.logger.info('Refreshing usage dashboard');
    await this.loadDashboard(true);
  }

  /**
   * Called by the shell after opening the Stripe billing portal.
   * Ensures the next focus/visibility event triggers a guaranteed refresh
   * regardless of how long the user spent in the portal.
   */
  markPortalOpened(): void {
    this._pendingPortalRefresh = true;
  }

  /**
   * Returns true (and clears the flag) if a portal refresh is pending.
   * Called by the shell on visibilitychange / window focus.
   */
  consumePortalRefresh(): boolean {
    if (this._pendingPortalRefresh) {
      this._pendingPortalRefresh = false;
      return true;
    }
    return false;
  }

  /** True when the next focus/visibility event should force a dashboard reload */
  private _pendingPortalRefresh = false;

  private async runWithSharedLoader<T>(
    config: LoadingConfig,
    operation: () => Promise<T>
  ): Promise<T> {
    await this.modal.showLoading({
      backdropDismiss: false,
      spinner: 'crescent',
      ...config,
    });

    try {
      return await operation();
    } finally {
      await this.modal.hideLoading();
    }
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
  // STRIPE CUSTOMER PORTAL
  // ============================================

  /**
   * Open the Stripe Customer Portal for managing payment methods,
   * billing address, and invoices.
   * Backend creates a portal session and returns the URL.
   */
  async openBillingPortal(): Promise<void> {
    this.logger.info('Opening Stripe billing portal');
    this.breadcrumb.trackStateChange('usage:opening-billing-portal');
    const isNativePlatform = typeof window !== 'undefined' && Capacitor.isNativePlatform();

    try {
      const url = await this.runWithSharedLoader({ message: 'Opening billing portal...' }, () =>
        this.api.createPortalSession()
      );
      this.analytics?.trackEvent(APP_EVENTS.USAGE_BILLING_PORTAL_OPENED);
      // Flag the shell to force-refresh when the user returns from the portal
      this._pendingPortalRefresh = true;

      if (isNativePlatform) {
        // Native (Capacitor): use the in-app browser plugin
        await this.browser.open({ url, presentationStyle: 'fullscreen' });
      } else if (typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
        // Web/Desktop: open Stripe in a new tab and keep current page intact.
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) {
          this.toast.warning('Popup blocked. Please allow popups for this site to open Stripe.');
        }
      } else {
        await this.browser.open({ url, presentationStyle: 'fullscreen' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open billing portal';
      this.logger.error('Failed to open billing portal', err);
      this.toast.error(message);
      await this.haptics.notification('error');
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
      this.browser.open({ url: record.receiptUrl, presentationStyle: 'fullscreen' });
      return;
    }
    this.logger.info('Fetching receipt URL', { recordId });
    try {
      const url = await this.runWithSharedLoader({ message: 'Opening receipt...' }, () =>
        this.api.getReceiptUrl(recordId)
      );
      this.browser.open({ url, presentationStyle: 'fullscreen' });
    } catch (err) {
      this.logger.error('Failed to get receipt URL', err, { recordId });
      this.toast.error('Unable to open receipt. Please try again.');
    }
  }

  /** Open an invoice PDF for a payment history record */
  async openInvoice(recordId: string): Promise<void> {
    const record = this._paymentHistory().find((r) => r.id === recordId);
    if (record?.invoiceUrl) {
      this.browser.open({ url: record.invoiceUrl, presentationStyle: 'fullscreen' });
      return;
    }
    this.logger.info('Fetching invoice URL', { recordId });
    try {
      const url = await this.runWithSharedLoader({ message: 'Opening invoice...' }, () =>
        this.api.getInvoiceUrl(recordId)
      );
      this.browser.open({ url, presentationStyle: 'fullscreen' });
    } catch (err) {
      this.logger.error('Failed to get invoice URL', err, { recordId });
      this.toast.error('Unable to open invoice. Please try again.');
    }
  }

  // ============================================
  // BUDGET MANAGEMENT
  // ============================================

  /** Update the current organization budget configuration */
  async updateBudget(config: {
    monthlyBudget: number;
    budgetInterval: BudgetInterval;
    hardStop: boolean;
  }): Promise<boolean> {
    this.logger.info('Updating budget', config);
    this.breadcrumb.trackStateChange('usage:updating-budget', config);
    try {
      await this.runWithSharedLoader({ message: 'Saving budget...' }, async () => {
        const organizationId = this._billingContext()?.organizationId;
        if (!organizationId) {
          throw new Error('Organization context is required to update budgets');
        }

        await this.api.updateBudget({
          organizationId,
          monthlyBudget: config.monthlyBudget,
          budgetInterval: config.budgetInterval,
          hardStop: config.hardStop,
        });
        await Promise.all([
          this.ensureBillingAccessContext(true),
          this.ensureBudgetEditorContext(true),
        ]);
      });
      await this.haptics.notification('success');
      this.toast.success('Budget updated');
      this.analytics?.trackEvent(APP_EVENTS.USAGE_BUDGET_UPDATED, config);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update budget';
      this.logger.error('Failed to update budget', err, config);
      this.toast.error(message);
      await this.haptics.notification('error');
      return false;
    }
  }

  /** Update a team's budget configuration — org admin only */
  async updateTeamBudget(
    teamId: string,
    config: {
      monthlyBudget: number;
      budgetInterval: BudgetInterval;
    }
  ): Promise<boolean> {
    this.logger.info('Updating team budget', { teamId, ...config });
    this.breadcrumb.trackStateChange('usage:updating-team-budget', { teamId, ...config });
    try {
      await this.runWithSharedLoader({ message: 'Saving team budget...' }, async () => {
        const organizationId = this._billingContext()?.organizationId;
        if (!organizationId) {
          throw new Error('Organization context is required to update team budgets');
        }

        await this.api.updateTeamBudget(organizationId, teamId, config);
        await Promise.all([
          this.ensureBillingAccessContext(true),
          this.ensureBudgetEditorContext(true),
        ]);
      });
      await this.haptics.notification('success');
      this.toast.success('Team budget updated');
      this.analytics?.trackEvent(APP_EVENTS.USAGE_TEAM_BUDGET_UPDATED, {
        teamId,
        ...config,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update team budget';
      this.logger.error('Failed to update team budget', err, { teamId, ...config });
      this.toast.error(message);
      await this.haptics.notification('error');
      return false;
    }
  }

  // ============================================
  // BUY CREDITS (B2C)
  // ============================================

  /**
   * Purchase credits via Stripe Checkout.
   * Supports both personal wallet top-ups and organization wallet top-ups.
   * Opens the Stripe-hosted checkout page in the in-app browser.
   */
  async buyCredits(amountCents: number, organizationId?: string): Promise<void> {
    this.logger.info('Purchasing credits', { amountCents, organizationId });
    this.breadcrumb.trackStateChange('usage:buying-credits', { amountCents, organizationId });

    const hasSavedDefaultMethod = this.defaultPaymentMethod() !== null;
    const isNativePlatform = typeof window !== 'undefined' && Capacitor.isNativePlatform();

    try {
      const result = await this.runWithSharedLoader(
        {
          message: hasSavedDefaultMethod ? 'Processing payment...' : 'Opening secure checkout...',
        },
        () => this.api.buyCredits(amountCents, organizationId)
      );
      this.analytics?.trackEvent(APP_EVENTS.USAGE_CREDITS_PURCHASED, {
        amountCents,
        billingEntity: organizationId ? 'organization' : 'individual',
      });

      if (result.type === 'credited') {
        // Saved card charged directly — no redirect needed.
        await this.haptics.notification('success');
        this.toast.success(`$${(amountCents / 100).toFixed(2)} added to your wallet`);
        // Reload so balance card and payment history update immediately.
        await this.loadDashboard(true);
      } else {
        // Hosted checkout returns asynchronously and can race the webhook that
        // credits the wallet, so force a fresh reload when the user returns.
        this._pendingPortalRefresh = true;
        if (isNativePlatform) {
          await this.browser.open({ url: result.url, presentationStyle: 'fullscreen' });
        } else if (typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
          // Web/Desktop: open Stripe Checkout in a named tab with opener preserved.
          // This allows the return page to postMessage back and close itself.
          const opened = window.open(result.url, USAGE_CHECKOUT_POPUP_NAME);
          if (!opened) {
            this.toast.warning('Popup blocked. Please allow popups for this site to open Stripe.');
          }
        } else {
          await this.browser.open({ url: result.url, presentationStyle: 'fullscreen' });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start credit purchase';
      this.logger.error('Failed to purchase credits', err, { amountCents, organizationId });
      this.toast.error(message);
      await this.haptics.notification('error');
    }
  }

  /**
   * Toggle between org wallet billing and personal wallet billing.
   * Used by org roster members when the org wallet is empty.
   */
  async switchBillingMode(billingMode: BillingMode): Promise<boolean> {
    this.logger.info('Switching billing mode', { billingMode });
    this.breadcrumb.trackStateChange('usage:billing-mode-switch', { billingMode });
    try {
      await this.runWithSharedLoader({ message: 'Updating billing mode...' }, async () => {
        // The mutation response contains the freshly-resolved billing state
        // AND the new authoritative allowedSections. Apply both directly so the
        // entire UI (role-dependent rendering + sidebar tabs) updates atomically
        // in a single render tick — no re-fetch, no cache race, no flash.
        const { billingState, allowedSections } = await this.api.setBillingMode(billingMode);
        this._billingContext.set(billingState);
        this._allowedSections.set(allowedSections);
        this._autoTopUpEnabled.set(billingState.autoTopUpEnabled ?? false);
        this._autoTopUpThresholdCents.set(billingState.autoTopUpThresholdCents ?? 0);
        this._autoTopUpAmountCents.set(billingState.autoTopUpAmountCents ?? 0);

        // If the currently-active section is no longer allowed in the new mode,
        // snap back to 'overview' to prevent rendering a forbidden section.
        if (!(allowedSections as readonly UsageSection[]).includes(this._activeSection())) {
          this._activeSection.set('overview');
        }

        // Reload via true no-cache reads so the detailed dashboard data matches
        // the already-applied SSOT state. This avoids the old race where a stale
        // cached GET would arrive ~1 s later and revert the UI.
        await this.loadDashboard(true);
      });

      await this.haptics.notification('success');
      this.toast.success(
        billingMode === 'personal'
          ? 'Now using your personal wallet'
          : 'Switched back to organization billing'
      );
      const currentBillingState = this._billingContext();
      this.logger.info('Billing mode switched', {
        billingMode,
        entity: currentBillingState?.billingEntity ?? 'individual',
        walletBalanceCents: currentBillingState?.walletBalanceCents ?? 0,
      });
      this.analytics?.trackEvent(APP_EVENTS.USAGE_BILLING_MODE_SWITCHED, {
        billingMode,
        entity: this._billingContext()?.billingEntity ?? 'individual',
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update billing mode';
      this.logger.error('Failed to switch billing mode', err, { billingMode });
      this.toast.error(message);
      await this.haptics.notification('error');
      return false;
    }
  }

  /**
   * Configure (or disable) automatic wallet top-up.
   */
  async configureAutoTopUp(settings: {
    enabled: boolean;
    thresholdCents: number;
    amountCents: number;
  }): Promise<boolean> {
    this.logger.info('Configuring auto top-up', settings);
    this.breadcrumb.trackStateChange('usage:auto-topup-config', settings);
    try {
      await this.runWithSharedLoader(
        { message: settings.enabled ? 'Saving auto top-up...' : 'Disabling auto top-up...' },
        async () => {
          await this.api.configureAutoTopUp(settings);
          this._autoTopUpEnabled.set(settings.enabled);
          this._autoTopUpThresholdCents.set(settings.thresholdCents);
          this._autoTopUpAmountCents.set(settings.amountCents);
        }
      );
      await this.haptics.notification('success');
      this.toast.success(settings.enabled ? 'Auto top-up enabled' : 'Auto top-up disabled');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to configure auto top-up';
      this.logger.error('Failed to configure auto top-up', err, settings);
      this.toast.error(message);
      await this.haptics.notification('error');
      return false;
    }
  }

  /**
   * Request an invoice-based wallet top-up for school districts / large orgs.
   * Creates and sends a Stripe Invoice with net payment terms.
   */
  async requestInvoiceTopUp(request: {
    amountCents: number;
    poNumber?: string;
    netDays: 30 | 45 | 60;
  }): Promise<{
    invoiceId: string;
    invoiceUrl: string | null;
    hostedInvoiceUrl: string | null;
  } | null> {
    this.logger.info('Requesting invoice top-up', request);
    this.breadcrumb.trackStateChange('usage:invoice-topup', request);
    try {
      const result = await this.runWithSharedLoader({ message: 'Creating invoice...' }, () =>
        this.api.requestInvoiceTopUp(request)
      );
      await this.haptics.notification('success');
      this.toast.success('Invoice sent — funds will be credited when payment is received');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create invoice';
      this.logger.error('Failed to request invoice top-up', err, request);
      this.toast.error(message);
      await this.haptics.notification('error');
      return null;
    }
  }

  // ============================================
  // DELETE BUDGET
  // ============================================

  /** Delete a specific budget row by target + interval. */
  async deleteBudget(budget: UsageBudget): Promise<boolean> {
    this.logger.info('Deleting budget', {
      budgetId: budget.id,
      targetScope: budget.targetScope,
      targetId: budget.targetId,
      budgetInterval: budget.budgetInterval,
    });
    this.breadcrumb.trackStateChange('usage:deleting-budget', {
      budgetId: budget.id,
      targetScope: budget.targetScope,
      targetId: budget.targetId,
      budgetInterval: budget.budgetInterval,
    });
    try {
      await this.runWithSharedLoader({ message: 'Removing budget...' }, async () => {
        const organizationId = this._billingContext()?.organizationId;
        if (!organizationId) {
          throw new Error('Organization context is required to delete budgets');
        }

        if (budget.targetScope === 'team') {
          await this.api.deleteTeamBudget(organizationId, budget.targetId, {
            budgetInterval: budget.budgetInterval,
          });
        } else {
          await this.api.deleteBudget({
            organizationId,
            budgetInterval: budget.budgetInterval,
          });
        }

        await Promise.all([
          this.ensureBillingAccessContext(true),
          this.ensureBudgetEditorContext(true),
        ]);
      });
      await this.haptics.notification('success');
      this.toast.success('Budget removed');
      this.analytics?.trackEvent(APP_EVENTS.USAGE_BUDGET_DELETED, {
        targetScope: budget.targetScope,
        budgetInterval: budget.budgetInterval,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete budget';
      this.logger.error('Failed to delete budget', err, {
        budgetId: budget.id,
        targetScope: budget.targetScope,
        targetId: budget.targetId,
        budgetInterval: budget.budgetInterval,
      });
      this.toast.error(message);
      await this.haptics.notification('error');
      return false;
    }
  }
}
