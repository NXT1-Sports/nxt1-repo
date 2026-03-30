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
  viewChild,
  OnInit,
  AfterViewInit,
  OnDestroy,
  type TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import {
  NxtSectionNavWebComponent,
  type SectionNavChangeEvent,
} from '../../components/section-nav-web';
import {
  NxtOptionScrollerWebComponent,
  type OptionScrollerChangeEvent,
} from '../../components/option-scroller-web';
import { NxtRefresherComponent, type RefreshEvent } from '../../components/refresh-container';
import { NxtOverlayService } from '../../components/overlay';
import { NxtHeaderPortalService } from '../../services/header-portal';
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
    NxtIconComponent,
    NxtSectionNavWebComponent,
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
  ],
  template: `
    <!-- Portal: center — "Billing & Usage" title + Buy Credits in top nav -->
    <ng-template #centerPortalContent>
      <div class="header-portal-usage">
        <span class="header-portal-title">Billing & Usage</span>
        <button type="button" class="header-portal-buy-btn" (click)="onBuyCredits()">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Buy Credits</span>
        </button>
      </div>
    </ng-template>

    <!-- Portal: right — help button, sits inline before the bell -->
    <ng-template #rightPortalContent>
      <button
        type="button"
        class="nav-action-btn help-action-btn"
        aria-label="How billing works"
        (click)="showHelpDialog()"
      >
        <nxt1-icon name="help-circle-outline" size="22" aria-hidden="true" />
      </button>
    </ng-template>

    <!-- SEO: Main content area with semantic structure -->
    <main class="usage-main" role="main">
      <!-- Pull-to-Refresh (gracefully noop without IonContent) -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="usage-dashboard">
        <!-- Mobile option scroller (hidden on desktop, visible ≤768px) -->
        <div class="usage-mobile-scroller">
          <nxt1-option-scroller-web
            [options]="$any(svc.sectionNavs())"
            [selectedId]="svc.activeSection()"
            [stretchToFill]="true"
            [showDivider]="true"
            (selectionChange)="onMobileTabChange($event)"
          />
        </div>

        <!-- Two-column layout: Sidebar nav + Content (matches explore pattern) -->
        <div class="dashboard-layout nxt1-section-layout">
          <nxt1-section-nav-web
            [items]="$any(svc.sectionNavs())"
            [activeId]="svc.activeSection()"
            ariaLabel="Billing sections"
            [attr.data-testid]="testIds.SECTION_NAV"
            (selectionChange)="onSectionNavChange($event)"
          />

          <section class="section-content nxt1-section-content" role="tabpanel">
            @if (svc.error() && !hasData()) {
              <nxt1-usage-error-state
                [message]="svc.error() ?? 'Failed to load usage data'"
                [attr.data-testid]="testIds.ERROR_STATE"
                (retry)="svc.loadDashboard()"
              />
            } @else if (svc.isLoading() && !hasData()) {
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
        </div>
      </div>
    </main>
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
        padding-top: var(--nxt1-spacing-6, 24px);
        padding-bottom: var(--nxt1-spacing-16);
      }

      /* ==============================
       HEADER PORTAL STYLES
       Centered title teleported into top nav
       ============================== */

      .header-portal-usage {
        display: flex;
        align-items: center;
        width: 100%;
        padding: 0 var(--nxt1-spacing-2, 8px);
        position: relative;
      }

      .header-portal-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        letter-spacing: -0.01em;
        white-space: nowrap;
        user-select: none;
        position: absolute;
        left: var(--nxt1-spacing-2, 8px);
      }

      .header-portal-buy-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 6px 16px;
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        color: var(--nxt1-color-text-primary, #ffffff);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.06));
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
        margin: 0 auto;
      }

      .header-portal-buy-btn:hover {
        color: var(--nxt1-color-text-primary, #ffffff);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border-color: rgba(255, 255, 255, 0.14);
      }

      .header-portal-buy-btn:active {
        transform: scale(0.98);
      }

      /* ==============================
       TWO-COLUMN LAYOUT (matches explore pattern)
       Left: sticky vertical section nav (180px)
       Right: content panel
       ============================== */

      .dashboard-layout {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: var(--nxt1-spacing-6, 24px);
        align-items: start;
      }

      .section-content {
        min-width: 0;
      }

      /* Mobile option scroller — hidden on desktop */
      .usage-mobile-scroller {
        display: none;
      }

      /* Hide "Buy Credits" button in overview on desktop as it's in the top nav */
      @media (min-width: 769px) {
        ::ng-deep .buy-credits-btn {
          display: none !important;
        }
      }

      @media (max-width: 768px) {
        .usage-mobile-scroller {
          display: block;
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--nxt1-color-bg-primary);
        }

        .usage-main {
          padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
        }

        .usage-dashboard {
          padding: 0 var(--nxt1-spacing-4, 16px);
          padding-bottom: var(--nxt1-spacing-16);
        }

        .dashboard-layout {
          display: block;
          padding-top: var(--nxt1-spacing-4, 16px);
        }

        nxt1-section-nav-web {
          display: none;
        }

        .header-portal-buy-btn span {
          display: none;
        }

        .header-portal-buy-btn {
          padding: 6px 10px;
          min-width: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageShellWebComponent implements OnInit, AfterViewInit, OnDestroy {
  protected readonly testIds = USAGE_TEST_IDS;
  protected readonly svc = inject(UsageService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly headerPortal = inject(NxtHeaderPortalService);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);

  // Template refs for header portal
  private readonly centerPortalContent = viewChild<TemplateRef<unknown>>('centerPortalContent');
  private readonly rightPortalContent = viewChild<TemplateRef<unknown>>('rightPortalContent');

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

  ngAfterViewInit(): void {
    const centerTpl = this.centerPortalContent();
    if (centerTpl) this.headerPortal.setCenterContent(centerTpl);
    const rightTpl = this.rightPortalContent();
    if (rightTpl) this.headerPortal.setRightContent(rightTpl);
  }

  ngOnDestroy(): void {
    this.headerPortal.clearAll();
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

  protected onMobileTabChange(event: OptionScrollerChangeEvent): void {
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
    this.overlay.open({
      component: UsageHelpContentComponent,
      size: 'lg',
      showCloseButton: true,
      backdropDismiss: true,
      ariaLabel: 'How Billing Works',
    });
  }
}
