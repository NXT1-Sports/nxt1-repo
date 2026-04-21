/**
 * @fileoverview Usage Overview Section — Summary Cards
 * @module @nxt1/ui/usage
 *
 * All billing entities (individual, org, team) now use the prepaid wallet model.
 * Shows: Wallet Balance + Processing Holds + Spent This Month.
 * Org users additionally get: Buy Credits button (admin only), billing mode badge/banners.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { IonRippleEffect } from '@ionic/angular/standalone';

import type { BillingMode, UsageOverview, UsagePaymentHistoryRecord } from '@nxt1/core';
import { formatPrice } from '@nxt1/core';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';
import { UsagePaymentHistoryComponent } from './usage-payment-history.component';

@Component({
  selector: 'nxt1-usage-overview',
  standalone: true,
  imports: [IonRippleEffect, UsagePaymentHistoryComponent],
  template: `
    <section class="usage-overview" [attr.data-testid]="testIds.OVERVIEW_SECTION">
      <!-- ── Billing mode banners (org members only) ──────────────────── -->
      @if (orgWalletEmpty()) {
        <div
          class="billing-banner billing-banner--warning"
          [attr.data-testid]="testIds.OVERVIEW_ORG_WALLET_EMPTY_BANNER"
        >
          <div class="banner-body">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span
              >Your organization's wallet is empty. Switch to personal billing to keep using Agent
              X.</span
            >
          </div>
          <button type="button" class="banner-btn" (click)="switchToBillingMode.emit('personal')">
            Use personal wallet
          </button>
        </div>
      }

      @if (orgWalletRefilled()) {
        <div
          class="billing-banner billing-banner--success"
          [attr.data-testid]="testIds.OVERVIEW_ORG_WALLET_REFILLED_BANNER"
        >
          <div class="banner-body">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span
              >Your org wallet has been refilled. Switch back to org billing to use shared
              credits.</span
            >
          </div>
          <button
            type="button"
            class="banner-btn"
            (click)="switchToBillingMode.emit('organization')"
          >
            Switch to org billing
          </button>
        </div>
      }

      <!-- ── Billing mode pill (when on personal override) ────────────── -->
      @if (billingMode() === 'personal') {
        <div class="mode-pill" [attr.data-testid]="testIds.OVERVIEW_PERSONAL_BILLING_PILL">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Using personal billing
          <button
            type="button"
            class="mode-pill__switch"
            (click)="switchToBillingMode.emit('organization')"
          >
            Switch to org billing
          </button>
        </div>
      }

      <!-- ── Wallet cards (all entities) ──────────────────────────────── -->
      <div class="overview-cards">
        <!-- Wallet Balance -->
        <div
          class="overview-card wallet-card"
          [class.overview-card--low]="isLowBalance() || isWalletEmpty()"
          [attr.data-testid]="testIds.OVERVIEW_WALLET_BALANCE"
        >
          <ion-ripple-effect></ion-ripple-effect>
          <div class="card-header">
            <span class="card-label">
              @if (isOrg() && billingMode() === 'organization') {
                Organization Credits
              } @else {
                Personal Credits
              }
            </span>
            <button
              type="button"
              class="wallet-buy-btn"
              [attr.data-testid]="testIds.OVERVIEW_BUY_CREDITS"
              (click)="buyCredit.emit()"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
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
              Add Credits
            </button>
          </div>
          <div class="card-value" [class.card-value--low]="isLowBalance() || isWalletEmpty()">
            {{ walletBalance() }}
          </div>
          <span class="card-caption">
            @if (isWalletEmpty()) {
              Wallet is empty — add credits to keep Agent X running.
            } @else if (isLowBalance()) {
              Balance is low — add credits to keep Agent X running.
            } @else {
              Pre-paid credits for Agent X operations.
            }
          </span>
        </div>

        <!-- Credits Used -->
        <div class="overview-card" [attr.data-testid]="testIds.OVERVIEW_SPENT_THIS_MONTH">
          <ion-ripple-effect></ion-ripple-effect>
          <div class="card-header">
            <span class="card-label">Credits used</span>
          </div>
          <div class="card-value">{{ currentUsage() }}</div>
          <span class="card-caption">Deducted from your wallet this month.</span>
        </div>
      </div>

      <!-- ── Payment History ────────────────────────────────────────────── -->
      <div class="payment-history-section">
        <h3 class="payment-history-heading">Recent payments</h3>
        <nxt1-usage-payment-history
          [records]="paymentHistory()"
          [hasMore]="historyHasMore()"
          (downloadReceipt)="downloadReceipt.emit($event)"
          (downloadInvoice)="downloadInvoice.emit($event)"
          (loadMore)="loadMore.emit()"
        />
      </div>
    </section>
  `,
  styles: [
    `
      .usage-overview {
        margin-bottom: var(--nxt1-spacing-8);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      /* ── Banners ─────────────────────────────────── */
      .billing-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-radius-lg, 12px);
        border: 1px solid;
        font-size: var(--nxt1-fontSize-sm);
        flex-wrap: wrap;
      }

      .billing-banner--warning {
        background: color-mix(in srgb, var(--nxt1-color-warning, #f59e0b) 10%, transparent);
        border-color: color-mix(in srgb, var(--nxt1-color-warning, #f59e0b) 35%, transparent);
        color: var(--nxt1-color-text-primary);
      }

      .billing-banner--success {
        background: color-mix(in srgb, var(--nxt1-color-success, #10b981) 10%, transparent);
        border-color: color-mix(in srgb, var(--nxt1-color-success, #10b981) 35%, transparent);
        color: var(--nxt1-color-text-primary);
      }

      .banner-body {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        flex: 1;
      }

      .banner-btn {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        background: none;
        border: 1px solid currentColor;
        border-radius: var(--nxt1-radius-md, 8px);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        cursor: pointer;
        color: inherit;
        white-space: nowrap;
        transition: background var(--nxt1-transition-fast);
      }

      .banner-btn:hover {
        background: color-mix(in srgb, currentColor 10%, transparent);
      }

      /* ── Mode pill ───────────────────────────────── */
      .mode-pill {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 25%, transparent);
        border-radius: 999px;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        align-self: flex-start;
      }

      .mode-pill__switch {
        background: none;
        border: none;
        cursor: pointer;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-primary);
        padding: 0;
        text-decoration: underline;
        white-space: nowrap;
      }

      /* ── Cards grid ──────────────────────────────── */
      .overview-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: var(--nxt1-spacing-4);
      }

      .overview-card {
        position: relative;
        overflow: hidden;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: var(--nxt1-spacing-5);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        cursor: pointer;
        transition: background var(--nxt1-transition-fast);
      }

      .overview-card--low {
        border-color: color-mix(in srgb, var(--nxt1-color-warning, #f59e0b) 40%, transparent);
      }

      .overview-card:hover {
        background: var(--nxt1-color-surface-200);
      }

      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
      }

      .card-label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .card-link {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-primary);
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-radius-sm, 4px);
        transition: background var(--nxt1-transition-fast);
        text-decoration: none;
        white-space: nowrap;
      }

      .card-link:hover {
        background: var(--nxt1-color-surface-200);
        text-decoration: underline;
      }

      .card-link--cta {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .card-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .card-value--low {
        color: var(--nxt1-color-warning, #f59e0b);
      }

      .card-caption {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .wallet-buy-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1-5, 6px);
        padding: var(--nxt1-spacing-1-5, 6px) var(--nxt1-spacing-4, 16px);
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: 1;
        border: none;
        cursor: pointer;
        white-space: nowrap;
        user-select: none;
        transition: opacity var(--nxt1-transition-fast, 0.15s ease);

        &:hover {
          opacity: 0.85;
        }

        &:active {
          opacity: 0.7;
          transform: scale(0.98);
        }
      }

      /* ── Payment history ────────────────────────────────── */
      .payment-history-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        margin-top: var(--nxt1-spacing-8);
      }

      .payment-history-heading {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageOverviewComponent {
  protected readonly testIds = USAGE_TEST_IDS;

  /** Overview data */
  readonly data = input.required<UsageOverview | null>();

  /** Whether this is a personal / B2C individual user */
  readonly isPersonal = input<boolean>(false);

  /** Whether this is an org member (director, coach, athlete on org-billed team) */
  readonly isOrg = input<boolean>(false);

  /** Whether this org member has admin rights to top up the org wallet */
  readonly isOrgAdmin = input<boolean>(false);

  /** True when on org billing but org wallet is empty — show "switch to personal" banner */
  readonly orgWalletEmpty = input<boolean>(false);

  /** True when on personal billing override but org wallet has been refilled — show "switch back" banner */
  readonly orgWalletRefilled = input<boolean>(false);

  /** Current backend-resolved billing mode */
  readonly billingMode = input<BillingMode>('personal');

  /** Hide the Add Credits button (e.g. on desktop web where it lives in the top nav) */
  readonly hideBuyCredits = input<boolean>(false);

  /** Payment history records (shown inline below cards) */
  readonly paymentHistory = input<readonly UsagePaymentHistoryRecord[]>([]);

  /** Whether there are more history records to load */
  readonly historyHasMore = input<boolean>(false);

  /** Emitted when "Add Credits" button is clicked */
  readonly buyCredit = output<void>();

  /** Emitted when a billing mode banner button is clicked */
  readonly switchToBillingMode = output<BillingMode>();

  /** Emitted when a receipt download is requested */
  readonly downloadReceipt = output<string>();

  /** Emitted when an invoice download is requested */
  readonly downloadInvoice = output<string>();

  /** Emitted when "Load more" is clicked in the payment history table */
  readonly loadMore = output<void>();

  /** Show Buy Credits: always for personal, org admins only (and only when on org billing) */
  protected readonly showBuyCredits = computed(() => {
    if (this.hideBuyCredits()) return false;
    if (this.isPersonal()) return true;
    return this.isOrg() && this.isOrgAdmin();
  });

  protected readonly currentUsage = computed(() =>
    formatPrice(this.data()?.currentMeteredUsage ?? 0)
  );

  protected readonly walletBalance = computed(() =>
    formatPrice(this.data()?.walletBalanceCents ?? 0)
  );

  /** Wallet is completely empty */
  protected readonly isWalletEmpty = computed(() => (this.data()?.walletBalanceCents ?? 0) === 0);

  /** Low balance warning — above $0 but below the backend-configured threshold */
  protected readonly isLowBalance = computed(() => {
    const bal = this.data()?.walletBalanceCents ?? 0;
    const threshold = this.data()?.lowBalanceThresholdCents ?? 200;
    return bal > 0 && bal < threshold;
  });
}
