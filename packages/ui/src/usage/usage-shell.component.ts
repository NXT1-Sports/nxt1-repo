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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { SHEET_PRESETS } from '../components/bottom-sheet';
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
import { NxtPlatformService } from '../services/platform/platform.service';
import { UsageService, type UsageSection } from './usage.service';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';
import { UsageSkeletonComponent } from './usage-skeleton.component';
import { UsageHelpContentComponent } from './usage-help-content.component';
import { UsageErrorStateComponent } from './usage-error-state.component';
import { UsageBottomSheetService } from './usage-bottom-sheet.service';
import {
  UsageOverviewComponent,
  UsageSubscriptionsComponent,
  UsageChartComponent,
  UsageBreakdownTableComponent,
  UsagePaymentHistoryComponent,
  UsagePaymentInfoComponent,
  UsageBudgetsComponent,
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
    UsageOverviewComponent,
    UsageSubscriptionsComponent,
    UsageChartComponent,
    UsageBreakdownTableComponent,
    UsagePaymentHistoryComponent,
    UsagePaymentInfoComponent,
    UsageBudgetsComponent,
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
          <nxt1-icon name="help-circle-outline" size="20" />
        </button>
      </nxt1-page-header>
    }

    <!-- Mobile: Twitter/TikTok Style Tab Selector (outside ion-content like Agent X) -->
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
            <!-- Side Navigation (Desktop only) -->
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
                    <nxt1-usage-overview
                      [data]="svc.overview()"
                      [isPersonal]="svc.isPersonal()"
                      (viewPaymentHistory)="svc.setActiveSection('payment-history')"
                      (buyCredit)="onBuyCredits()"
                    />

                    @if (svc.subscriptions().length > 0) {
                      <nxt1-usage-subscriptions
                        [subscriptions]="svc.subscriptions()"
                        (manage)="onManageSubscriptions()"
                      />
                    }

                    @if (svc.isOrg()) {
                      <nxt1-usage-budgets
                        [budgets]="svc.budgets()"
                        (createBudget)="onCreateBudget()"
                        (editBudget)="onEditBudget($event)"
                      />
                    }
                  }

                  @case ('metered-usage') {
                    <nxt1-usage-chart
                      [chartData]="svc.chartData()"
                      [timeframe]="svc.timeframe()"
                      [yLabels]="svc.chartYLabels()"
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

                  @case ('payment-history') {
                    <nxt1-usage-payment-history
                      [records]="svc.filteredPaymentHistory()"
                      [hasMore]="svc.historyHasMore()"
                      (downloadReceipt)="onDownloadReceipt($event)"
                      (downloadInvoice)="onDownloadInvoice($event)"
                      (loadMore)="svc.loadMoreHistory()"
                    />
                  }

                  @case ('payment-info') {
                    <nxt1-usage-payment-info
                      [billingInfo]="svc.billingInfo()"
                      [paymentMethods]="svc.paymentMethods()"
                      [coupon]="svc.coupon()"
                      (editBilling)="onEditBilling()"
                      (editPayment)="onEditPayment()"
                      (redeemCoupon)="onRedeemCoupon()"
                      (editAdditional)="onEditAdditional()"
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

        /* Hide desktop side nav on mobile */
        .section-nav {
          display: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageShellComponent implements OnInit {
  protected readonly testIds = USAGE_TEST_IDS;
  protected readonly svc = inject(UsageService);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  private readonly platform = inject(NxtPlatformService);
  private readonly modalController = inject(ModalController);
  private readonly usageBottomSheet = inject(UsageBottomSheetService);

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info */
  readonly user = input<UsageUser | null>(null);

  /** Whether to show the page header (back arrow + title). Hide on desktop web. */
  readonly showPageHeader = input<boolean>(true);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when back button is clicked */
  readonly back = output<void>();

  /** Emitted when avatar is clicked (open sidenav) */
  readonly avatarClick = output<void>();

  /** Emitted when user taps "Buy Credits" — host platform handles IAP flow */
  readonly buyCredits = output<void>();

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

    const modal = await this.modalController.create({
      component: UsageHelpContentComponent,
      cssClass: this.platform.isMobile() ? 'usage-help-sheet' : 'usage-help-modal',
      breakpoints: this.platform.isMobile() ? SHEET_PRESETS.STANDARD.breakpoints : undefined,
      initialBreakpoint: this.platform.isMobile()
        ? SHEET_PRESETS.STANDARD.initialBreakpoint
        : undefined,
      handle: this.platform.isMobile(),
      showBackdrop: true,
      backdropDismiss: true,
    });

    await modal.present();
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    this.svc.loadDashboard();
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

  protected onManageSubscriptions(): void {
    this.haptics.impact('light');
    // Navigate to subscription management
  }

  protected async onBuyCredits(): Promise<void> {
    await this.haptics.impact('light');
    this.buyCredits.emit();
  }

  protected onDownloadReceipt(_recordId: string): void {
    this.haptics.impact('light');
    // API call to get receipt URL and open
  }

  protected onDownloadInvoice(_recordId: string): void {
    this.haptics.impact('light');
    // API call to get invoice URL and open
  }

  protected async onCreateBudget(): Promise<void> {
    await this.haptics.impact('light');
    await this.usageBottomSheet.showBudgetLimit();
  }

  protected async onEditBudget(budgetId: string): Promise<void> {
    await this.haptics.impact('light');
    const budget = this.svc.budgets().find((b) => b.id === budgetId);
    await this.usageBottomSheet.showBudgetLimit(budget?.budgetLimit);
  }

  protected onEditBilling(): void {
    this.haptics.impact('light');
    // Open billing info editing form/bottom sheet
  }

  protected onEditPayment(): void {
    this.haptics.impact('light');
    // Open payment method form/bottom sheet
  }

  protected onRedeemCoupon(): void {
    this.haptics.impact('light');
    // Open coupon redemption form/bottom sheet
  }

  protected onEditAdditional(): void {
    this.haptics.impact('light');
    // Open additional info form/bottom sheet
  }
}
