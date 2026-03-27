/**
 * @fileoverview Usage Dashboard Shell — Web (SSR-Optimized)
 * @module @nxt1/ui/usage/web
 * @version 1.0.0
 *
 * Web-optimized Usage/Billing Shell using design token CSS.
 * 100% SSR-safe with semantic HTML for Grade A+ SEO.
 * Zero Ionic components — pure Angular + design tokens.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * SEO Features:
 * - Semantic HTML structure (<main>, <section>, <nav>)
 * - Proper heading hierarchy for screen readers
 * - Fast LCP with SSR
 * - No Ionic layout components (no IonContent/IonHeader)
 *
 * Design Token Integration:
 * - Uses @nxt1/design-tokens CSS custom properties
 * - Dark/light mode via [data-theme] attribute
 *
 * For mobile app, use UsageShellComponent (Ionic variant) instead.
 *
 * @example
 * ```html
 * <nxt1-usage-shell-web />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  computed,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import {
  NxtOptionScrollerWebComponent,
  type OptionScrollerChangeEvent,
} from '../../components/option-scroller-web';
import { NxtRefresherComponent, type RefreshEvent } from '../../components/refresh-container';
import { NxtToastService } from '../../services/toast/toast.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { UsageService, type UsageSection } from '../usage.service';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';
import { UsageSkeletonComponent } from '../usage-skeleton.component';
import { UsageHelpContentComponent } from '../usage-help-content.component';
import { UsageErrorStateComponent } from '../usage-error-state.component';
import {
  UsageOverviewComponent,
  UsageSubscriptionsComponent,
  UsageChartComponent,
  UsageBreakdownTableComponent,
  UsagePaymentHistoryComponent,
  UsagePaymentInfoComponent,
  UsageBudgetsComponent,
} from '../sections';
import type { UsageUser } from '../usage-shell.component';

// Re-export for convenience
export type { UsageUser };

@Component({
  selector: 'nxt1-usage-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtDesktopPageHeaderComponent,
    NxtOptionScrollerWebComponent,
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
    UsageHelpContentComponent,
  ],
  template: `
    <!-- SEO: Main content area with semantic structure -->
    <main class="usage-main" role="main">
      <!-- Pull-to-Refresh (gracefully noop without IonContent) -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="usage-dashboard">
        <!-- Desktop Page Header — hidden on mobile via CSS -->
        <div class="desktop-header-wrap">
          <nxt1-desktop-page-header
            title="Billing & Usage"
            subtitle="Manage your billing, usage, and payment details for your account."
            actionLabel="How it works"
            actionIcon="help-circle-outline"
            (actionClick)="showHelpDialog()"
          />
        </div>

        <!-- Section Tab Scroller — ALWAYS in DOM (prevents re-mount indicator glitch) -->
        <nxt1-option-scroller-web
          [options]="$any(svc.sectionNavs())"
          [selectedId]="svc.activeSection()"
          [stretchToFill]="true"
          [showDivider]="true"
          ariaLabel="Billing sections"
          [attr.data-testid]="testIds.SECTION_NAV"
          (selectionChange)="onSectionNavChange($event)"
        />

        <!-- Content – padded with design tokens -->
        <div class="content-wrapper">
          @if (svc.error() && !hasData()) {
            <nxt1-usage-error-state
              [message]="svc.error() ?? 'Failed to load usage data'"
              [attr.data-testid]="testIds.ERROR_STATE"
              (retry)="svc.loadDashboard()"
            />
          } @else {
            <section
              class="section-content"
              [attr.id]="'section-' + svc.activeSection()"
              role="tabpanel"
            >
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
            </section>
          }
        </div>
      </div>
    </main>

    <!-- Help Dialog (SSR-safe, no Ionic) -->
    @if (showHelp()) {
      <div class="dialog-backdrop" (click)="closeHelpDialog()"></div>
      <dialog class="help-dialog" [open]="showHelp()">
        <button type="button" class="dialog-close" (click)="closeHelpDialog()" aria-label="Close">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <nxt1-usage-help-content />
      </dialog>
    }
  `,
  styles: [
    `
      /* ============================================
       USAGE SHELL WEB — SSR-Optimized
       Zero Ionic, pure design tokens + semantic HTML
       100% Theme Aware (Light + Dark Mode)
       ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
        /* Cancel shell top padding so option scroller sits flush under the nav bar */
        margin-top: calc(-1 * var(--shell-content-padding-top, 0px));
      }

      .usage-main {
        background: var(--nxt1-color-bg-primary);
        min-height: 100%;
      }

      .usage-dashboard {
        padding: 0;
        padding-bottom: var(--nxt1-spacing-16);
      }

      /* ==============================
       DESKTOP HEADER — hide on mobile
       ============================== */

      .desktop-header-wrap {
        display: block;
      }

      @media (max-width: 768px) {
        .desktop-header-wrap {
          display: none;
        }
      }

      /* ==============================
       CONTENT WRAPPER — horizontal padding
       Scroller stays edge-to-edge (no padding on .usage-dashboard)
       ============================== */

      .content-wrapper {
        padding: var(--nxt1-spacing-5) var(--nxt1-spacing-4);
      }

      @media (min-width: 769px) {
        .content-wrapper {
          padding: var(--nxt1-spacing-6) var(--nxt1-spacing-6);
        }
      }

      /* ==============================
       CONTENT PANEL
       ============================== */

      .section-content {
        min-width: 0;
      }

      /* ==============================
       HELP DIALOG (SSR-safe)
       ============================== */

      .dialog-backdrop {
        position: fixed;
        inset: 0;
        background: var(--nxt1-color-bg-overlay, rgba(0, 0, 0, 0.6));
        backdrop-filter: blur(var(--nxt1-blur-sm, 4px));
        -webkit-backdrop-filter: blur(var(--nxt1-blur-sm, 4px));
        z-index: 1000;
        animation: fadeIn var(--nxt1-duration-normal, 200ms) var(--nxt1-easing-out, ease-out);
      }

      .help-dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 560px;
        max-width: 90vw;
        max-height: 85vh;
        background: var(--nxt1-color-surface-200, #1c1c1e);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-2xl, 24px);
        box-shadow: var(--nxt1-shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.5));
        overflow: hidden;
        z-index: 1001;
        padding: 0;
        margin: 0;
        animation: slideUp var(--nxt1-duration-normal, 200ms) var(--nxt1-easing-out, ease-out);
      }

      .dialog-close {
        position: absolute;
        top: var(--nxt1-spacing-4);
        right: var(--nxt1-spacing-4);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-full);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 100ms) var(--nxt1-easing-out, ease-out);
        z-index: 10;
      }

      .dialog-close:hover {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translate(-50%, -45%);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageShellWebComponent implements OnInit {
  protected readonly testIds = USAGE_TEST_IDS;
  protected readonly svc = inject(UsageService);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);

  // ============================================
  // STATE
  // ============================================

  /** Show help dialog signal */
  protected readonly showHelp = signal(false);

  // ============================================
  // INPUTS
  // ============================================

  /** Current user info */
  readonly user = input<UsageUser | null>(null);

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly hasData = computed(() => this.svc.overview() !== null);

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

  protected onSectionNavChange(event: OptionScrollerChangeEvent): void {
    this.svc.setActiveSection(event.option.id as UsageSection);
  }

  protected onManageSubscriptions(): void {
    this.haptics.impact('light');
    // Navigate to subscription management
  }

  protected onDownloadReceipt(_recordId: string): void {
    this.haptics.impact('light');
    // API call to get receipt URL and open
  }

  protected onDownloadInvoice(_recordId: string): void {
    this.haptics.impact('light');
    // API call to get invoice URL and open
  }

  protected onCreateBudget(): void {
    this.haptics.impact('light');
    // Open budget creation form/bottom sheet
  }

  protected onEditBudget(_budgetId: string): void {
    this.haptics.impact('light');
    // Open budget editing form/bottom sheet
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

  protected onBuyCredits(): void {
    this.haptics.impact('light');
    // Navigate to credit purchase flow
  }

  // ============================================
  // HELP DIALOG
  // ============================================

  protected showHelpDialog(): void {
    this.haptics.impact('light');
    this.showHelp.set(true);
  }

  protected closeHelpDialog(): void {
    this.showHelp.set(false);
  }
}
