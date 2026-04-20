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
import { UsageService, type UsageSection } from '../usage.service';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';
import { UsageSkeletonComponent } from '../usage-skeleton.component';
import { UsageHelpContentComponent } from '../usage-help-content.component';
import { UsageErrorStateComponent } from '../usage-error-state.component';
import { UsageBottomSheetService } from '../usage-bottom-sheet.service';
import { AgentXControlPanelComponent, type AgentXControlPanelKind } from '../../agent-x';
import {
  BuyCreditsAutoTopupModalComponent,
  type BuyCreditsAutoTopupResult,
} from './buy-credits-autotopup-modal.component';
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
            <button type="button" class="header-portal-buy-btn" (click)="onCreateBudget()">
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
                <circle cx="12" cy="12" r="3"></circle>
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                ></path>
              </svg>
              <span>Manage Budget</span>
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
                  @if (svc.isOrgMember() && !svc.usePersonalBilling()) {
                    <!-- Org member on org billing: restricted overview — no financial data -->
                    <nxt1-usage-org-member-stub />
                  } @else {
                    <nxt1-usage-overview
                      [data]="svc.overview()"
                      [isPersonal]="svc.isPersonal()"
                      [isOrg]="svc.isOrg()"
                      [isOrgAdmin]="svc.isOrgAdmin()"
                      [orgWalletEmpty]="svc.orgWalletEmpty()"
                      [orgWalletRefilled]="svc.orgWalletRefilled()"
                      [usePersonalBilling]="svc.usePersonalBilling()"
                      [hideBuyCredits]="true"
                      [paymentHistory]="svc.filteredPaymentHistory()"
                      [historyHasMore]="svc.historyHasMore()"
                      (buyCredit)="onBuyCredits()"
                      (switchToBillingMode)="onSwitchBillingMode($event)"
                      (downloadReceipt)="onDownloadReceipt($event)"
                      (downloadInvoice)="onDownloadInvoice($event)"
                      (loadMore)="svc.loadMoreHistory()"
                    />

                    @if (svc.isOrg() && svc.isOrgAdmin()) {
                      <nxt1-usage-budgets
                        [budgets]="svc.budgets()"
                        [readOnly]="false"
                        (createBudget)="onCreateBudget()"
                        (editBudget)="onEditBudget($event)"
                        (editTeamBudget)="onEditTeamBudget($event)"
                      />
                    }
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
                    [budgets]="svc.budgets()"
                    [readOnly]="!svc.isOrgAdmin()"
                    (createBudget)="onCreateBudget()"
                    (editBudget)="onEditBudget($event)"
                    (editTeamBudget)="onEditTeamBudget($event)"
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
  private readonly usageBottomSheet = inject(UsageBottomSheetService);
  // private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly ngZone = inject(NgZone);
  private readonly platformId = inject(PLATFORM_ID);

  private _hiddenAt: number | null = null;
  /** Minimum ms away before a visibility change triggers a background refresh */
  private static readonly STALE_THRESHOLD_MS = 30_000;

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this._hiddenAt = Date.now();
      return;
    }
    // Tab became visible again
    const awayMs = this._hiddenAt !== null ? Date.now() - this._hiddenAt : 0;
    this._hiddenAt = null;
    if (this.svc.consumePortalRefresh() || awayMs >= UsageShellWebComponent.STALE_THRESHOLD_MS) {
      this.svc.loadDashboard(true);
    }
  };

  private readonly onWindowFocus = (): void => {
    // Fires when the NXT1 tab regains focus after the Stripe portal tab closes.
    // Only reload when we know the portal was opened — not on every window focus.
    if (this.svc.consumePortalRefresh()) {
      this.svc.loadDashboard(true);
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
      // Register outside NgZone: these events fire often and should not
      // trigger zone-wide change detection cycles on every tab switch.
      this.ngZone.runOutsideAngular(() => {
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        window.addEventListener('focus', this.onWindowFocus);
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
    await this.openBudgetControlPanel();
  }

  protected async onEditBudget(_budgetId: string): Promise<void> {
    await this.haptics.impact('light');
    await this.openBudgetControlPanel();
  }

  private async openBudgetControlPanel(): Promise<void> {
    const panel: AgentXControlPanelKind = 'budget';
    this.overlay.open({
      component: AgentXControlPanelComponent,
      inputs: {
        panel,
        presentation: 'modal',
      },
      size: 'xl',
      backdropDismiss: true,
      escDismiss: true,
      ariaLabel: 'Agent budget controls',
      panelClass: 'agent-x-control-panel-modal',
    });
  }

  protected async onEditTeamBudget(teamId: string): Promise<void> {
    await this.haptics.impact('light');
    const amountCents = await this.usageBottomSheet.showBudgetLimit();
    if (amountCents !== null) {
      await this.svc.updateTeamBudget(teamId, amountCents);
    }
  }

  protected async onManageBilling(): Promise<void> {
    this.haptics.impact('light');
    await this.svc.openBillingPortal();
  }

  protected async onBuyCredits(): Promise<void> {
    await this.haptics.impact('light');
    const ref = this.overlay.open<BuyCreditsAutoTopupModalComponent, BuyCreditsAutoTopupResult>({
      component: BuyCreditsAutoTopupModalComponent,
      size: 'sm',
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

  protected async onSwitchBillingMode(usePersonalBilling: boolean): Promise<void> {
    await this.haptics.impact('medium');
    await this.svc.switchBillingMode(usePersonalBilling);
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
      showCloseButton: true,
      backdropDismiss: true,
      ariaLabel: 'How Billing Works',
    });
  }
}
