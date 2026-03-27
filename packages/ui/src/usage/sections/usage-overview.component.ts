/**
 * @fileoverview Usage Overview Section — Summary Cards
 * @module @nxt1/ui/usage
 *
 * B2C (Personal): Wallet Balance + Processing Holds + Buy Credits.
 * B2B (Org/Team): Current Metered Usage + Next Payment Due.
 * GitHub-style card layout with token-based design.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonRippleEffect } from '@ionic/angular/standalone';

import type { UsageOverview } from '@nxt1/core';
import { formatPrice } from '@nxt1/core';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';

@Component({
  selector: 'nxt1-usage-overview',
  standalone: true,
  imports: [CommonModule, IonRippleEffect],
  template: `
    <section class="usage-overview" [attr.data-testid]="testIds.OVERVIEW_SECTION">
      @if (isPersonal()) {
        <!-- ═══════ B2C: WALLET VIEW ═══════ -->
        <div class="overview-cards">
          <!-- Wallet Balance -->
          <div
            class="overview-card wallet-card"
            [attr.data-testid]="testIds.OVERVIEW_WALLET_BALANCE"
          >
            <ion-ripple-effect></ion-ripple-effect>
            <div class="card-header">
              <span class="card-label">Wallet balance</span>
              <button
                type="button"
                class="card-link card-link--cta"
                [attr.data-testid]="testIds.OVERVIEW_BUY_CREDITS"
                (click)="buyCredit.emit()"
              >
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
                Buy Credits
              </button>
            </div>
            <div class="card-value" [class.card-value--low]="isLowBalance()">
              {{ walletBalance() }}
            </div>
            <span class="card-caption"> Pre-paid credits for Agent X operations. </span>
          </div>

          <!-- Processing Holds -->
          <div class="overview-card" [attr.data-testid]="testIds.OVERVIEW_PENDING_HOLDS">
            <ion-ripple-effect></ion-ripple-effect>
            <div class="card-header">
              <span class="card-label">Processing</span>
            </div>
            <div class="card-value">{{ pendingHolds() }}</div>
            <span class="card-caption">
              Reserved for in-flight operations. Released when complete.
            </span>
          </div>

          <!-- Period Spend -->
          <div class="overview-card" [attr.data-testid]="testIds.OVERVIEW_SPENT_THIS_MONTH">
            <ion-ripple-effect></ion-ripple-effect>
            <div class="card-header">
              <span class="card-label">Spent this month</span>
              <button
                type="button"
                class="card-link"
                [attr.data-testid]="testIds.OVERVIEW_VIEW_HISTORY"
                (click)="viewPaymentHistory.emit()"
              >
                View history
              </button>
            </div>
            <div class="card-value">{{ currentUsage() }}</div>
            <span class="card-caption">
              {{ periodLabel() }}
            </span>
          </div>
        </div>
      } @else {
        <!-- ═══════ B2B: METERED VIEW ═══════ -->
        <div class="overview-cards">
          <!-- Current Metered Usage -->
          <div class="overview-card" [attr.data-testid]="testIds.OVERVIEW_METERED_USAGE">
            <ion-ripple-effect></ion-ripple-effect>
            <div class="card-header">
              <span class="card-label">Current metered usage</span>
            </div>
            <div class="card-value">{{ currentUsage() }}</div>
            <span class="card-caption"> Gross metered usage for {{ periodLabel() }}. </span>
          </div>

          <!-- Next Payment Due -->
          <div class="overview-card" [attr.data-testid]="testIds.OVERVIEW_NEXT_PAYMENT">
            <ion-ripple-effect></ion-ripple-effect>
            <div class="card-header">
              <span class="card-label">Next payment due</span>
              <button type="button" class="card-link" (click)="viewPaymentHistory.emit()">
                Payment history
              </button>
            </div>
            <div class="card-value">{{ nextPayment() }}</div>
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .usage-overview {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .section-heading {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-5) 0;
      }

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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageOverviewComponent {
  protected readonly testIds = USAGE_TEST_IDS;

  /** Overview data */
  readonly data = input.required<UsageOverview | null>();

  /** Whether this is a personal / B2C wallet user */
  readonly isPersonal = input<boolean>(false);

  /** Emitted when "Payment history" link is clicked */
  readonly viewPaymentHistory = output<void>();

  /** Emitted when "Buy Credits" button is clicked */
  readonly buyCredit = output<void>();

  protected readonly currentUsage = computed(() =>
    formatPrice(this.data()?.currentMeteredUsage ?? 0)
  );

  protected readonly periodLabel = computed(() => this.data()?.period.label ?? '');

  protected readonly nextPayment = computed(() => {
    const d = this.data();
    if (!d?.nextPaymentDueDate) return '–';
    return formatPrice(d.nextPaymentAmount);
  });

  protected readonly walletBalance = computed(() =>
    formatPrice(this.data()?.walletBalanceCents ?? 0)
  );

  protected readonly pendingHolds = computed(() =>
    formatPrice(this.data()?.pendingHoldsCents ?? 0)
  );

  /** Low balance warning — below $5 */
  protected readonly isLowBalance = computed(() => (this.data()?.walletBalanceCents ?? 0) < 500);
}
