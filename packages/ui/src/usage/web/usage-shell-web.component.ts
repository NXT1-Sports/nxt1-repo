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
import { NxtSectionNavWebComponent } from '../../components/section-nav-web';
import type { SectionNavChangeEvent } from '../../components/section-nav-web';
import { NxtRefresherComponent, type RefreshEvent } from '../../components/refresh-container';
import { NxtToastService } from '../../services/toast/toast.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { UsageService, USAGE_SECTION_NAVS, type UsageSection } from '../usage.service';
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
    NxtSectionNavWebComponent,
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
        <!-- Desktop Page Header -->
        <nxt1-desktop-page-header
          title="Billing & Usage"
          subtitle="Manage your billing, usage, and payment details for your account."
          actionLabel="How it works"
          actionIcon="help-circle-outline"
          (actionClick)="showHelpDialog()"
        />

        @if (svc.error() && !hasData()) {
          <nxt1-usage-error-state
            [message]="svc.error() ?? 'Failed to load usage data'"
            (retry)="svc.loadDashboard()"
          />
        } @else {
          <div class="dashboard-layout">
            <!-- Side Navigation (Desktop) / Scroll Tabs (Mobile) -->
            <nxt1-section-nav-web
              [items]="sectionNavs"
              [activeId]="svc.activeSection()"
              ariaLabel="Billing sections"
              (selectionChange)="onSectionNavChange($event)"
            />

            <!-- Content Panel -->
            <section
              class="section-content"
              [attr.id]="'section-' + svc.activeSection()"
              role="tabpanel"
            >
              <!-- Loading State -->
              @if (svc.isLoading() && !hasData()) {
                <nxt1-usage-skeleton />
              } @else {
                @switch (svc.activeSection()) {
                  @case ('overview') {
                    <nxt1-usage-overview
                      [data]="svc.overview()"
                      (viewPaymentHistory)="svc.setActiveSection('payment-history')"
                    />

                    @if (svc.subscriptions().length > 0) {
                      <nxt1-usage-subscriptions
                        [subscriptions]="svc.subscriptions()"
                        (manage)="onManageSubscriptions()"
                      />
                    }

                    <nxt1-usage-budgets
                      [budgets]="svc.budgets()"
                      (createBudget)="onCreateBudget()"
                      (editBudget)="onEditBudget($event)"
                    />
                  }

                  @case ('metered-usage') {
                    <nxt1-usage-chart
                      [chartData]="svc.chartData()"
                      [productTabs]="svc.productDetails()"
                      [activeTab]="svc.activeProductTab()"
                      [timeframe]="svc.timeframe()"
                      [yLabels]="svc.chartYLabels()"
                      (tabChange)="svc.setActiveProductTab($event)"
                      (timeframeChange)="svc.setTimeframe($event)"
                      (viewBreakdown)="svc.setActiveSection('breakdown')"
                      (manageBudgets)="svc.setActiveSection('overview')"
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
          </div>
        }
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
       TWO-PANEL LAYOUT (Desktop)
       ============================== */

      .dashboard-layout {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: var(--nxt1-spacing-6, 24px);
        align-items: start;
        padding-top: var(--nxt1-spacing-2, 8px);
      }

      /* Side nav styles are handled by NxtSectionNavWebComponent */

      /* ==============================
       CONTENT PANEL
       ============================== */

      .section-content {
        min-width: 0;
      }

      /* ==============================
       RESPONSIVE: Tablet & Mobile
       ============================== */

      @media (max-width: 768px) {
        .usage-dashboard {
          padding: var(--nxt1-spacing-4) var(--nxt1-spacing-3);
          padding-bottom: var(--nxt1-spacing-16);
        }

        .dashboard-layout {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-4, 16px);
        }
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
  protected readonly svc = inject(UsageService);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  protected readonly sectionNavs = USAGE_SECTION_NAVS;

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

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this.svc.setActiveSection(event.id as UsageSection);
  }

  protected onManageSubscriptions(): void {
    // Navigate to subscription management
  }

  protected onDownloadReceipt(_recordId: string): void {
    // API call to get receipt URL and open
  }

  protected onDownloadInvoice(_recordId: string): void {
    // API call to get invoice URL and open
  }

  protected onCreateBudget(): void {
    // Open budget creation form/bottom sheet
  }

  protected onEditBudget(_budgetId: string): void {
    // Open budget editing form/bottom sheet
  }

  protected onEditBilling(): void {
    // Open billing info editing form/bottom sheet
  }

  protected onEditPayment(): void {
    // Open payment method form/bottom sheet
  }

  protected onRedeemCoupon(): void {
    // Open coupon redemption form/bottom sheet
  }

  protected onEditAdditional(): void {
    // Open additional info form/bottom sheet
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
