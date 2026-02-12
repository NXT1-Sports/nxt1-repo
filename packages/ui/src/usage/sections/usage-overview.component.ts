/**
 * @fileoverview Usage Overview Section — Summary Cards
 * @module @nxt1/ui/usage
 *
 * Three top-level overview cards: Current Metered Usage, Included Usage, Next Payment.
 * GitHub-style card layout with token-based design.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonRippleEffect } from '@ionic/angular/standalone';
import type { UsageOverview } from '@nxt1/core';
import { formatPrice } from '@nxt1/core';

@Component({
  selector: 'nxt1-usage-overview',
  standalone: true,
  imports: [CommonModule, IonRippleEffect],
  template: `
    <section class="usage-overview">
      <h2 class="section-heading">Overview</h2>

      <div class="overview-cards">
        <!-- Current Metered Usage -->
        <div class="overview-card">
          <ion-ripple-effect></ion-ripple-effect>
          <div class="card-header">
            <span class="card-label">Current metered usage</span>
          </div>
          <div class="card-value">{{ currentUsage() }}</div>
          <span class="card-caption"> Gross metered usage for {{ periodLabel() }}. </span>
        </div>

        <!-- Included Usage -->
        <div class="overview-card">
          <ion-ripple-effect></ion-ripple-effect>
          <div class="card-header">
            <span class="card-label">Current included usage</span>
            <button type="button" class="card-link" (click)="viewDetails.emit()">
              More details
            </button>
          </div>
          <div class="card-value">{{ includedUsage() }}</div>
          <span class="card-caption"> Included usage discounts for {{ periodLabel() }}. </span>
        </div>

        <!-- Next Payment Due -->
        <div class="overview-card">
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

      .card-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
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
  /** Overview data */
  readonly data = input.required<UsageOverview | null>();

  /** Emitted when "More details" is clicked */
  readonly viewDetails = output<void>();

  /** Emitted when "Payment history" link is clicked */
  readonly viewPaymentHistory = output<void>();

  protected readonly currentUsage = computed(() =>
    formatPrice(this.data()?.currentMeteredUsage ?? 0)
  );

  protected readonly includedUsage = computed(() =>
    formatPrice(this.data()?.currentIncludedUsage ?? 0)
  );

  protected readonly periodLabel = computed(() => this.data()?.period.label ?? '');

  protected readonly nextPayment = computed(() => {
    const d = this.data();
    if (!d?.nextPaymentDueDate) return '–';
    return formatPrice(d.nextPaymentAmount);
  });
}
