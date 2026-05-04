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
  NgZone,
  PLATFORM_ID,
  OnInit,
  AfterViewInit,
  OnDestroy,
  type TemplateRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
import {
  UsageService,
  USAGE_CHECKOUT_POPUP_NAME,
  USAGE_CHECKOUT_RETURN_MESSAGE,
  type UsageSection,
} from '../usage.service';
import type { UsageBudget } from '@nxt1/core';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';
import { UsageSkeletonComponent } from '../usage-skeleton.component';
import { UsageHelpContentComponent } from '../usage-help-content.component';
import { UsageErrorStateComponent } from '../usage-error-state.component';
import { AgentXControlPanelComponent, type AgentXControlPanelKind } from '../../agent-x';
import { BuyCreditsAutoTopupModalComponent } from './buy-credits-autotopup-modal.component';
import type { BuyCreditsAutoTopupResult } from '../buy-credits-flow.shared';
import { UsageOrgMemberStubComponent } from '../usage-org-member-stub.component';
import {
  UsageOverviewComponent,
  UsageBreakdownTableComponent,
  UsageChartComponent,
  UsagePaymentInfoComponent,
  UsageBudgetsComponent,
  UsageAutoTopupComponent,
} from '../sections';
import type { UsageUser } from '../usage-shell.component';

// Re-export for convenience
export type { UsageUser };

@Component({
  selector: 'nxt1-usage-shell-web',
  standalone: true,
  imports: [
    NxtSectionNavWebComponent,
    NxtOptionScrollerWebComponent,
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
  ],
  template: `
    <!-- Portal: center — "Billing & Usage" title + Action Button in top nav -->
    <ng-template #centerPortalContent>
      <div class="nxt1-header-portal">
        <span class="nxt1-header-portal__title">Billing & Usage</span>

        <div class="nxt1-header-portal__center">
          @if (svc.isPersonal()) {
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
              <span>Add Credits</span>
            </button>
          } @else if (svc.isOrg() && svc.isOrgAdmin()) {
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
              <span>Add Credits</span>
            </button>
          }
        </div>
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
    </ng-template>

    <!-- SEO: Main content area with semantic structure -->
    <main class="usage-main" role="main">
      <!-- Pull-to-Refresh (gracefully noop without IonContent) -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="usage-dashboard">
        <!-- Mobile option scroller — sectionNavs() already filters tabs per role -->
        <div class="usage-mobile-scroller">
          <nxt1-option-scroller-web
            [options]="$any(svc.sectionNavs())"
            [selectedId]="svc.activeSection()"
            [stretchToFill]="!mobileScrollerNeedsScroll()"
            [scrollable]="mobileScrollerNeedsScroll()"
            [showDivider]="true"
            (selectionChange)="onMobileTabChange($event)"
          />
        </div>

        <!-- Two-column layout: Sidebar nav + Content (matches explore pattern) -->
        <div class="dashboard-layout nxt1-section-layout">
          <!-- sectionNavs() already returns the correct filtered set per role -->
          <nxt1-section-nav-web
            [items]="$any(svc.sectionNavs())"
            [activeId]="svc.activeSection()"
            ariaLabel="Billing sections"
            [attr.data-testid]="testIds.SECTION_NAV"
            (selectionChange)="onSectionNavChange($event)"
          />

          <section class="section-content nxt1-section-content" role="tabpanel">
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
                      [hideBuyCredits]="true"
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
                    [timeframe]="svc.chartTimeframe()"
                    [yLabels]="svc.chartYLabels()"
                    [chartMaxCents]="svc.chartMaxValue()"
                    (timeframeChange)="svc.setChartTimeframe($event)"
                    (viewBreakdown)="svc.setActiveSection('breakdown')"
                  />
                }

                @case ('breakdown') {
                  <nxt1-usage-breakdown-table
                    [rows]="svc.filteredBreakdownRows()"
                    [expandedRow]="svc.expandedBreakdownRow()"
                    [periodLabel]="svc.breakdownPeriodLabel()"
                    [timeframe]="svc.breakdownTimeframe()"
                    (toggleRow)="svc.toggleBreakdownRow($event)"
                    (timeframeChange)="svc.setBreakdownTimeframe($event)"
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

      .billing-mode-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-4, 16px);
        padding: var(--nxt1-spacing-3, 12px);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-lg, 0.75rem);
        background: var(--nxt1-color-surface-100);
      }

      .billing-mode-toggle__label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
      }

      .billing-mode-toggle__actions {
        display: inline-flex;
        gap: var(--nxt1-spacing-1, 4px);
        padding: 2px;
        border-radius: var(--nxt1-borderRadius-md, 0.5rem);
        background: var(--nxt1-color-surface-200);
      }

      .billing-mode-toggle__btn {
        border: 1px solid transparent;
        border-radius: var(--nxt1-borderRadius-sm, 0.375rem);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        padding: 6px 10px;
        cursor: pointer;
        transition:
          color var(--nxt1-transition-fast, 0.15s ease),
          background var(--nxt1-transition-fast, 0.15s ease),
          border-color var(--nxt1-transition-fast, 0.15s ease);
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
       HEADER PORTAL STYLES
       Wrapper + title from design-tokens .nxt1-header-portal
       ============================== */

      .header-portal-buy-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1-5, 6px);
        padding: var(--nxt1-spacing-1-5, 6px) var(--nxt1-spacing-4, 16px);
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: 1;
        white-space: nowrap;
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        cursor: pointer;
        transition:
          background var(--nxt1-transition-fast, 0.15s ease),
          border-color var(--nxt1-transition-fast, 0.15s ease);
        user-select: none;
      }

      .header-portal-buy-btn:hover {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-default);
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

      /* Org-member stub: occupies the full content area (no sidebar nav alongside it) */
      .section-content--full {
        grid-column: 1 / -1;
      }

      /* Mobile option scroller — hidden on desktop */
      .usage-mobile-scroller {
        display: none;
      }

      /* Buy Credits button hidden on desktop via [hideBuyCredits] input */

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

        .billing-mode-toggle {
          align-items: flex-start;
          flex-direction: column;
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
  // private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);

  private _hiddenAt: number | null = null;
  /** Minimum ms away before a visibility change triggers a background refresh */
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
    // Tab became visible again
    const awayMs = this._hiddenAt !== null ? Date.now() - this._hiddenAt : 0;
    this._hiddenAt = null;
    if (this.svc.consumePortalRefresh() || awayMs >= UsageShellWebComponent.STALE_THRESHOLD_MS) {
      void this.svc.refreshAfterExternalBillingReturn();
    }
  };

  private readonly onWindowFocus = (): void => {
    // Fires when the NXT1 tab regains focus after the Stripe portal tab closes.
    // Only reload when we know the portal was opened — not on every window focus.
    if (this.svc.consumePortalRefresh()) {
      void this.svc.refreshAfterExternalBillingReturn();
    }
  };

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

  /** Whether the mobile scroller needs horizontal scrolling (org = 5 tabs) */
  protected readonly mobileScrollerNeedsScroll = computed(() => this.svc.sectionNavs().length > 3);

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    this.svc.loadDashboard(true);
    if (isPlatformBrowser(this.platformId)) {
      this.handleCheckoutReturnFromUrl();
      // Register outside NgZone: these events fire often and should not
      // trigger zone-wide change detection cycles on every tab switch.
      this.ngZone.runOutsideAngular(() => {
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        window.addEventListener('focus', this.onWindowFocus);
        window.addEventListener('message', this.onCheckoutWindowMessage);
      });
    }
  }

  ngAfterViewInit(): void {
    const centerTpl = this.centerPortalContent();
    if (centerTpl) this.headerPortal.setCenterContent(centerTpl);
    const rightTpl = this.rightPortalContent();
    if (rightTpl) this.headerPortal.setRightContent(rightTpl);
  }

  ngOnDestroy(): void {
    this.headerPortal.clearAll();
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

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this.svc.setActiveSection(event.id as UsageSection);
  }

  protected onMobileTabChange(event: OptionScrollerChangeEvent): void {
    this.svc.setActiveSection(event.option.id as UsageSection);
  }

  protected async onManageSubscriptions(): Promise<void> {
    await this.haptics.impact('light');
    await this.svc.openBillingPortal();
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
    const panel: AgentXControlPanelKind = 'budget';
    this.overlay.open({
      component: AgentXControlPanelComponent,
      inputs: {
        panel,
        presentation: 'modal',
        budgetTargetTeamId: teamId ?? null,
        budgetDraftMode,
      },
      size: 'xl',
      backdropDismiss: true,
      escDismiss: true,
      ariaLabel: 'Budget settings',
      panelClass: 'agent-x-control-panel-modal',
    });
  }

  protected async onManageBilling(): Promise<void> {
    this.haptics.impact('light');
    await this.svc.openBillingPortal();
  }

  protected async onBuyCredits(): Promise<void> {
    await this.haptics.impact('light');
    const ref = this.overlay.open<BuyCreditsAutoTopupModalComponent, BuyCreditsAutoTopupResult>({
      component: BuyCreditsAutoTopupModalComponent,
      size: 'lg',
      backdropDismiss: true,
      escDismiss: true,
      ariaLabel: 'Add Credits',
      inputs: {
        initialAutoTopupEnabled: this.svc.autoTopUpEnabled(),
        initialThresholdCents: this.svc.autoTopUpThresholdCents(),
        initialAutoTopupAmountCents: this.svc.autoTopUpAmountCents(),
      },
    });
    const result = await ref.closed;
    if (result.reason !== 'close' || !result.data) return;

    const data = result.data;
    if (data.type === 'buy') {
      const organizationId = this.svc.isOrgAdmin()
        ? (this.svc.billingContext()?.organizationId ?? undefined)
        : undefined;
      await this.svc.buyCredits(data.amountCents, organizationId);
    } else if (data.type === 'auto-topup') {
      await this.svc.configureAutoTopUp({
        enabled: data.enabled,
        thresholdCents: data.thresholdCents,
        amountCents: data.amountCents,
      });
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

  // ============================================
  // HELP DIALOG
  // ============================================

  protected showHelpDialog(): void {
    this.haptics.impact('light');
    this.overlay.open({
      component: UsageHelpContentComponent,
      size: 'lg',
      backdropDismiss: true,
      ariaLabel: 'How Billing Works',
      panelClass: 'usage-help-modal',
      inputs: {
        isPersonal: this.svc.isPersonal(),
        billingContext: this.svc.billingContext(),
      },
    });
  }
}
