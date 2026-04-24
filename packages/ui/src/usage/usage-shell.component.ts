/**
 * @fileoverview Usage Dashboard Shell — Side Nav + Content Panel
 * @module @nxt1/ui/usage
 * @version 2.1.0
 *
 * Professional billing dashboard matching GitHub billing style.
 * Desktop: left sidebar nav + right content panel.
 * Mobile: horizontal scrollable tabs above content.
 *
 * Uses Ionic infrastructure (ion-content, page header, pull-to-refresh)
 * matching Agent X, Settings, and Explore shells.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-usage-shell
 *   [user]="currentUser()"
 *   (avatarClick)="openSidenav()"
 *   (back)="navigateBack()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  OnInit,
  OnDestroy,
  NgZone,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';
import { NxtIconComponent } from '../components/icon';
import { NxtPageHeaderComponent } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import { NxtToastService } from '../services/toast/toast.service';
import { HapticsService } from '../services/haptics/haptics.service';
import {
  UsageService,
  USAGE_CHECKOUT_POPUP_NAME,
  USAGE_CHECKOUT_RETURN_MESSAGE,
  type UsageSection,
} from './usage.service';
import type { UsageBudget } from '@nxt1/core';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';
import { UsageSkeletonComponent } from './usage-skeleton.component';
import { UsageHelpContentComponent } from './usage-help-content.component';
import { UsageErrorStateComponent } from './usage-error-state.component';
import { UsageBottomSheetService } from './usage-bottom-sheet.service';
import { AgentXControlPanelComponent } from '../agent-x';
import { UsageOrgMemberStubComponent } from './usage-org-member-stub.component';
import {
  UsageOverviewComponent,
  UsageBreakdownTableComponent,
  UsageChartComponent,
  UsagePaymentInfoComponent,
  UsageBudgetsComponent,
  UsageAutoTopupComponent,
} from './sections';

/**
 * User info for header display.
 */
export interface UsageUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
}

@Component({
  selector: 'nxt1-usage-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    UsageSkeletonComponent,
    UsageErrorStateComponent,
    UsageOrgMemberStubComponent,
    UsageOverviewComponent,
    UsageBreakdownTableComponent,
    UsageChartComponent,
    UsagePaymentInfoComponent,
    UsageBudgetsComponent,
    UsageAutoTopupComponent,
    NxtOptionScrollerComponent,
    NxtIconComponent,
  ],
  template: `
    <!-- Professional Page Header with Back Button (hidden on desktop web) -->
    @if (showPageHeader()) {
      <nxt1-page-header
        title="Billing & Usage"
        [showBack]="true"
        (backClick)="back.emit()"
        (menuClick)="avatarClick.emit()"
      >
        <button
          type="button"
          pageHeaderSlot="end"
          class="usage-help-header-btn"
          aria-label="How it works"
          [attr.data-testid]="testIds.HELP_BTN"
          (click)="showHelp()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </nxt1-page-header>
    }

    <!-- Mobile: Tab Selector — sectionNavs() already filters tabs per role -->
    <div class="mobile-tabs">
      <nxt1-option-scroller
        [options]="tabOptions()"
        [selectedId]="svc.activeSection()"
        [config]="scrollerConfig()"
        (selectionChange)="onTabChange($event)"
      />
    </div>

    <ion-content [fullscreen]="true" class="usage-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="usage-dashboard">
        @if (svc.activeSection() === 'overview' && svc.canSwitchToOrganizationBilling()) {
          <div class="billing-mode-toggle" [attr.data-testid]="testIds.BILLING_MODE_TOGGLE">
            <span class="billing-mode-toggle__label">Billing Mode</span>
            <div class="billing-mode-toggle__actions" role="tablist" aria-label="Billing mode">
              <button
                type="button"
                class="billing-mode-toggle__btn"
                [class.billing-mode-toggle__btn--active]="svc.billingMode() === 'organization'"
                [disabled]="svc.billingMode() === 'organization' || svc.isLoading()"
                [attr.data-testid]="testIds.BILLING_MODE_ORG_BTN"
                (click)="onSwitchBillingMode('organization')"
              >
                Organization
              </button>
              <button
                type="button"
                class="billing-mode-toggle__btn"
                [class.billing-mode-toggle__btn--active]="svc.billingMode() === 'personal'"
                [disabled]="svc.billingMode() === 'personal' || svc.isLoading()"
                [attr.data-testid]="testIds.BILLING_MODE_PERSONAL_BTN"
                (click)="onSwitchBillingMode('personal')"
              >
                Personal
              </button>
            </div>
          </div>
        }

        <!-- Desktop Page Title (visible when page header is hidden) -->
        @if (!showPageHeader()) {
          <header class="dashboard-header">
            <div class="header-row">
              <div class="header-text">
                <h1 class="dashboard-title">Billing & Usage</h1>
                <p class="dashboard-subtitle">
                  Manage your billing, usage, and payment details for your account.
                </p>
              </div>
              <button
                type="button"
                class="help-btn"
                [attr.data-testid]="testIds.HELP_BTN"
                (click)="showHelp()"
              >
                <nxt1-icon name="help-circle-outline" size="16" />
                <span>How it works</span>
              </button>
            </div>
          </header>
        }

        @if (svc.error() && !hasData()) {
          <nxt1-usage-error-state
            [message]="svc.error() ?? 'Failed to load usage data'"
            [attr.data-testid]="testIds.ERROR_STATE"
            (retry)="svc.loadDashboard()"
          />
        } @else {
          <div class="dashboard-layout">
            <!-- Side Navigation (Desktop only) — sectionNavs() filters per role -->
            <nav
              class="section-nav"
              role="tablist"
              aria-label="Billing sections"
              [attr.data-testid]="testIds.SECTION_NAV"
            >
              @for (nav of svc.sectionNavs(); track nav.id) {
                <button
                  class="nav-item"
                  [class.nav-item--active]="svc.activeSection() === nav.id"
                  role="tab"
                  [attr.aria-selected]="svc.activeSection() === nav.id"
                  (click)="svc.setActiveSection(nav.id)"
                >
                  {{ nav.label }}
                </button>
              }
            </nav>

            <!-- Content Panel -->
            <main class="section-content">
              <!-- Loading State -->
              @if (svc.isLoading() && !hasData()) {
                <nxt1-usage-skeleton [attr.data-testid]="testIds.LOADING_SKELETON" />
              } @else {
                @switch (svc.activeSection()) {
                  @case ('overview') {
                    @if (svc.isOrgMember() && svc.billingMode() === 'organization') {
                      <!-- Org member on org billing: restricted overview — no financial data -->
                      <nxt1-usage-org-member-stub />
                    } @else {
                      <nxt1-usage-overview
                        [data]="svc.overview()"
                        [isPersonal]="svc.isPersonal()"
                        [isOrg]="svc.isOrg()"
                        [isOrgAdmin]="svc.isOrgAdmin()"
                        [canSwitchToOrganizationBilling]="svc.canSwitchToOrganizationBilling()"
                        [orgWalletEmpty]="svc.orgWalletEmpty()"
                        [orgWalletRefilled]="svc.orgWalletRefilled()"
                        [billingMode]="svc.billingMode()"
                        [paymentHistory]="svc.filteredPaymentHistory()"
                        [historyHasMore]="svc.historyHasMore()"
                        (buyCredit)="onBuyCredits()"
                        (switchToBillingMode)="onSwitchBillingMode($event)"
                        (downloadReceipt)="onDownloadReceipt($event)"
                        (downloadInvoice)="onDownloadInvoice($event)"
                        (loadMore)="svc.loadMoreHistory()"
                      />
                    }
                    <!-- end @else (not org member) -->
                  }

                  @case ('metered-usage') {
                    <nxt1-usage-chart
                      [chartData]="svc.chartData()"
                      [timeframe]="svc.timeframe()"
                      [yLabels]="svc.chartYLabels()"
                      [chartMaxCents]="svc.chartMaxValue()"
                      (timeframeChange)="svc.setTimeframe($event)"
                      (viewBreakdown)="svc.setActiveSection('breakdown')"
                    />
                  }

                  @case ('breakdown') {
                    <nxt1-usage-breakdown-table
                      [rows]="svc.filteredBreakdownRows()"
                      [expandedRow]="svc.expandedBreakdownRow()"
                      [periodLabel]="svc.periodLabel()"
                      [timeframe]="svc.timeframe()"
                      (toggleRow)="svc.toggleBreakdownRow($event)"
                      (timeframeChange)="svc.setTimeframe($event)"
                    />
                  }

                  @case ('budgets') {
                    <nxt1-usage-budgets
                      [budgets]="svc.activeBudgets()"
                      [readOnly]="!svc.isOrgAdmin()"
                      (createBudget)="onCreateBudget()"
                      (editBudget)="onEditBudget($event)"
                      (removeBudget)="onDeleteBudget($event)"
                    />
                  }

                  @case ('payment-info') {
                    <nxt1-usage-payment-info
                      [billingInfo]="svc.billingInfo()"
                      [paymentMethods]="svc.paymentMethods()"
                      (manageBilling)="onManageBilling()"
                    />
                  }

                  @case ('auto-topup') {
                    <nxt1-usage-auto-topup
                      [enabled]="svc.autoTopUpEnabled()"
                      [thresholdCents]="svc.autoTopUpThresholdCents()"
                      [amountCents]="svc.autoTopUpAmountCents()"
                      (save)="onSaveAutoTopUp($event)"
                    />
                  }
                }
              }
            </main>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
       USAGE SHELL - Professional Billing Dashboard
       100% Theme Aware (Light + Dark Mode)
       Matches Agent X, Settings, Explore shells
       ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;

        /* Theme-aware CSS Variables */
        --usage-bg: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --usage-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      /* Light mode overrides */
      :host-context(.light),
      :host-context([data-theme='light']) {
        --usage-bg: var(--nxt1-color-bg-primary, #ffffff);
        --usage-surface: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.02));
      }

      /* Content area */
      .usage-content {
        --background: var(--usage-bg);
      }

      .usage-help-header-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: var(--nxt1-radius-full);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
      }

      .usage-help-header-btn:hover {
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-state-hover);
      }

      .usage-dashboard {
        max-width: 1120px;
        margin: 0 auto;
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
        min-height: 100%;
        padding-bottom: calc(var(--nxt1-spacing-20, 80px) + env(safe-area-inset-bottom, 0));
      }

      .billing-mode-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3);
        margin-bottom: var(--nxt1-spacing-4);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--nxt1-color-surface-100);
      }

      .billing-mode-toggle__label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      .billing-mode-toggle__actions {
        display: inline-flex;
        gap: var(--nxt1-spacing-1);
        padding: 2px;
        border-radius: var(--nxt1-radius-md, 10px);
        background: var(--nxt1-color-surface-200);
      }

      .billing-mode-toggle__btn {
        border: 1px solid transparent;
        border-radius: var(--nxt1-radius-sm, 8px);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        padding: 6px 10px;
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out);
      }

      .billing-mode-toggle__btn:hover:not(:disabled) {
        color: var(--nxt1-color-text-primary);
      }

      .billing-mode-toggle__btn--active {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-100);
        border-color: var(--nxt1-color-border-default);
      }

      .billing-mode-toggle__btn:disabled {
        opacity: 0.8;
        cursor: default;
      }

      /* ==============================
       DESKTOP PAGE TITLE
       (Only shown when page header is hidden)
       ============================== */

      .dashboard-header {
        margin-bottom: var(--nxt1-spacing-6);
        padding-bottom: var(--nxt1-spacing-6);
        border-bottom: 1px solid var(--nxt1-color-border-default);
      }

      .header-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
      }

      .header-text {
        flex: 1;
      }

      .help-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-body);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out);
        white-space: nowrap;
      }

      .help-btn nxt1-icon {
        color: var(--nxt1-color-text-tertiary);
        transition: color var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .help-btn:hover {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-subtle);
      }

      .help-btn:hover nxt1-icon {
        color: var(--nxt1-color-primary);
      }

      .dashboard-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-3xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-1) 0;
        line-height: var(--nxt1-lineHeight-tight);
      }

      .dashboard-subtitle {
        font-size: var(--nxt1-fontSize-base);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ==============================
       TWO-PANEL LAYOUT (Desktop)
       ============================== */

      .dashboard-layout {
        display: grid;
        grid-template-columns: 200px 1fr;
        gap: var(--nxt1-spacing-8);
        align-items: start;
      }

      /* ==============================
       SIDE NAV
       ============================== */

      /* Mobile tabs - option scroller (hidden on desktop, shown on mobile) */
      .mobile-tabs {
        display: none;
      }

      .section-nav {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0-5);
        position: sticky;
        top: var(--nxt1-spacing-6);
      }

      .nav-item {
        display: block;
        width: 100%;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-normal);
        color: var(--nxt1-color-text-secondary);
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        text-align: left;
        transition:
          color var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out),
          background var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .nav-item:hover {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-state-hover);
      }

      .nav-item--active {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-medium);
        background: var(--nxt1-color-surface-200);
      }

      /* ==============================
       CONTENT PANEL
       ============================== */

      .section-content {
        min-width: 0;
      }

      /* ==============================
       MOBILE: Horizontal scroll tabs
       ============================== */

      @media (max-width: 768px) {
        /* Show mobile option scroller tabs */
        .mobile-tabs {
          display: block;
        }

        .usage-dashboard {
          padding: var(--nxt1-spacing-4) var(--nxt1-spacing-3);
          padding-bottom: calc(var(--nxt1-spacing-40, 160px) + env(safe-area-inset-bottom, 0));
        }

        .dashboard-header {
          margin-bottom: var(--nxt1-spacing-4);
          padding-bottom: var(--nxt1-spacing-4);
        }

        .dashboard-title {
          font-size: var(--nxt1-fontSize-2xl);
        }

        .dashboard-layout {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-4);
        }

        .billing-mode-toggle {
          align-items: flex-start;
          flex-direction: column;
        }

        /* Hide desktop side nav on mobile */
        .section-nav {
          display: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageShellComponent implements OnInit, OnDestroy {
  protected readonly testIds = USAGE_TEST_IDS;
  protected readonly svc = inject(UsageService);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly usageBottomSheet = inject(UsageBottomSheetService);
  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);

  private _hiddenAt: number | null = null;
  private static readonly STALE_THRESHOLD_MS = 30_000;

  private handleCheckoutReturnFromUrl(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const currentUrl = new URL(window.location.href);
    const creditsStatus = currentUrl.searchParams.get('credits');
    const returnedOrganizationId = currentUrl.searchParams.get('organizationId');
    const sessionId = currentUrl.searchParams.get('session_id');
    if (!creditsStatus) {
      return;
    }

    if (window.opener && window.name === USAGE_CHECKOUT_POPUP_NAME) {
      window.opener.postMessage(
        {
          type: USAGE_CHECKOUT_RETURN_MESSAGE,
          status: creditsStatus,
          organizationId: returnedOrganizationId,
          sessionId,
        },
        window.location.origin
      );
      window.close();
      return;
    }

    if (creditsStatus === 'success') {
      const currentOrganizationId = this.svc.billingContext()?.organizationId ?? null;
      if (
        returnedOrganizationId &&
        currentOrganizationId &&
        returnedOrganizationId !== currentOrganizationId
      ) {
        this.toast.info(
          'Credits were added to a different organization wallet than the one open here.'
        );
      }
      void this.svc.refreshAfterExternalBillingReturn({
        sessionId,
        organizationId: returnedOrganizationId,
      });
    }

    currentUrl.searchParams.delete('credits');
    currentUrl.searchParams.delete('amount');
    currentUrl.searchParams.delete('organizationId');
    currentUrl.searchParams.delete('session_id');
    const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }

  private readonly onCheckoutWindowMessage = (event: MessageEvent): void => {
    if (!isPlatformBrowser(this.platformId) || event.origin !== window.location.origin) {
      return;
    }

    const data = event.data as
      | {
          type?: string;
          status?: string;
          organizationId?: string | null;
          sessionId?: string | null;
        }
      | null
      | undefined;
    if (data?.type !== USAGE_CHECKOUT_RETURN_MESSAGE) {
      return;
    }

    if (data.status === 'success') {
      const currentOrganizationId = this.svc.billingContext()?.organizationId ?? null;
      if (
        data.organizationId &&
        currentOrganizationId &&
        data.organizationId !== currentOrganizationId
      ) {
        this.toast.info(
          'Credits were added to a different organization wallet than the one open here.'
        );
      }
      void this.svc.refreshAfterExternalBillingReturn({
        sessionId: data.sessionId,
        organizationId: data.organizationId,
      });
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this._hiddenAt = Date.now();
      return;
    }

    const awayMs = this._hiddenAt !== null ? Date.now() - this._hiddenAt : 0;
    this._hiddenAt = null;
    if (this.svc.consumePortalRefresh() || awayMs >= UsageShellComponent.STALE_THRESHOLD_MS) {
      void this.svc.refreshAfterExternalBillingReturn();
    }
  };

  private readonly onWindowFocus = (): void => {
    if (this.svc.consumePortalRefresh()) {
      void this.svc.refreshAfterExternalBillingReturn();
    }
  };

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info */
  readonly user = input<UsageUser | null>(null);

  /** Whether to show the page header (back arrow + title). Hide on desktop web. */
  readonly showPageHeader = input<boolean>(true);

  /**
   * Optional override for the "Buy Credits" action.
   * When provided, this function is called instead of the default Stripe flow.
   * Use this on mobile to trigger Apple IAP instead of opening a Stripe URL.
   */
  readonly buyCreditsHandler = input<(() => Promise<void>) | null>(null);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when back button is clicked */
  readonly back = output<void>();

  /** Emitted when avatar is clicked (open sidenav) */
  readonly avatarClick = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly hasData = computed(() => this.svc.overview() !== null);

  /** Tab options for mobile option scroller */
  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    return this.svc.sectionNavs().map((nav) => ({
      id: nav.id,
      label: nav.label,
    }));
  });

  /** Scroller config adapts: stretch for 3 tabs (personal), scroll for 5 tabs (org) */
  protected readonly scrollerConfig = computed(() => {
    const count = this.tabOptions().length;
    return count <= 3
      ? { scrollable: false, stretchToFill: true, centered: true, showDivider: true }
      : { scrollable: true, stretchToFill: false, centered: false, showDivider: true };
  });

  /** Display name for header */
  protected displayName(): string {
    return this.user()?.displayName ?? 'User';
  }

  /** Handle tab change from option scroller */
  protected onTabChange(event: OptionScrollerChangeEvent): void {
    this.svc.setActiveSection(event.option.id as UsageSection);
  }

  /** Show the "How it works" help modal/bottom sheet */
  protected async showHelp(): Promise<void> {
    await this.haptics.impact('light');

    await this.bottomSheet.openSheet({
      component: UsageHelpContentComponent,
      componentProps: {
        isPersonal: this.svc.isPersonal(),
        billingContext: this.svc.billingContext(),
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      cssClass: 'usage-help-sheet',
    });
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    this.svc.loadDashboard(true);
    if (isPlatformBrowser(this.platformId)) {
      this.handleCheckoutReturnFromUrl();
      this.ngZone.runOutsideAngular(() => {
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        window.addEventListener('focus', this.onWindowFocus);
        window.addEventListener('message', this.onCheckoutWindowMessage);
      });
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('focus', this.onWindowFocus);
      window.removeEventListener('message', this.onCheckoutWindowMessage);
    }
  }

  // ============================================
  // PULL-TO-REFRESH
  // ============================================

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.svc.refresh();
    } finally {
      event.complete();
    }
  }

  protected async handleRefreshTimeout(): Promise<void> {
    await this.haptics.notification('warning');
    this.toast.warning('Refresh is taking longer than expected');
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async onManageSubscriptions(): Promise<void> {
    await this.haptics.impact('light');
    await this.svc.openBillingPortal();
  }

  protected async onBuyCredits(): Promise<void> {
    await this.haptics.impact('light');
    const handler = this.buyCreditsHandler();
    if (handler) {
      await handler();
      return;
    }
    const { amountCents, autoTopup } = await this.usageBottomSheet.showBuyCreditsWithAutoTopup({
      autoTopupEnabled: this.svc.autoTopUpEnabled(),
      autoTopupThresholdCents: this.svc.autoTopUpThresholdCents(),
      autoTopupAmountCents: this.svc.autoTopUpAmountCents(),
      allowIap: this.svc.isPersonalBillingMode(),
    });
    if (amountCents !== null) {
      // Pass organizationId for org admins so the top-up targets the org wallet
      const organizationId = this.svc.isOrgAdmin()
        ? (this.svc.billingContext()?.organizationId ?? undefined)
        : undefined;
      await this.svc.buyCredits(amountCents, organizationId);
    }
    if (autoTopup !== null) {
      await this.svc.configureAutoTopUp(autoTopup);
    }
  }

  protected async onSwitchBillingMode(billingMode: 'personal' | 'organization'): Promise<void> {
    await this.haptics.impact('medium');
    await this.svc.switchBillingMode(billingMode);
  }

  protected async onSaveAutoTopUp(settings: {
    enabled: boolean;
    thresholdCents: number;
    amountCents: number;
  }): Promise<void> {
    await this.haptics.impact('light');
    await this.svc.configureAutoTopUp(settings);
  }

  protected async onDownloadReceipt(recordId: string): Promise<void> {
    await this.haptics.impact('light');
    await this.svc.openReceipt(recordId);
  }

  protected async onDownloadInvoice(recordId: string): Promise<void> {
    await this.haptics.impact('light');
    await this.svc.openInvoice(recordId);
  }

  protected async onCreateBudget(): Promise<void> {
    await this.haptics.impact('light');
    await this.openBudgetControlPanel(undefined, 'new');
  }

  protected async onEditBudget(budget: UsageBudget): Promise<void> {
    await this.haptics.impact('light');
    await this.openBudgetControlPanel(
      budget.targetScope === 'team' ? budget.targetId : undefined,
      'current'
    );
  }

  protected async onDeleteBudget(budget: UsageBudget): Promise<void> {
    await this.haptics.impact('light');
    await this.svc.deleteBudget(budget);
  }

  private async openBudgetControlPanel(
    teamId?: string,
    budgetDraftMode: 'current' | 'new' = 'current'
  ): Promise<void> {
    await this.bottomSheet.openSheet({
      component: AgentXControlPanelComponent,
      componentProps: {
        panel: 'budget',
        presentation: 'sheet',
        budgetTargetTeamId: teamId ?? null,
        budgetDraftMode,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      cssClass: 'agent-x-control-panel-sheet',
    });
  }

  protected async onManageBilling(): Promise<void> {
    await this.haptics.impact('light');
    await this.svc.openBillingPortal();
  }
}
