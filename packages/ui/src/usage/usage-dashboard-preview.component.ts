/**
 * @fileoverview Usage Dashboard Preview Component
 * @module @nxt1/ui/usage
 * @version 1.0.0
 *
 * Interactive mockup of the Billing & Usage dashboard for use on
 * the usage landing page. Shows a realistic preview of the overview
 * cards, subscription list, usage chart, and payment history inside
 * a browser-chrome window frame.
 *
 * Usage-specific — not a generic shared component.
 * Uses mock values for visual accuracy on the marketing page.
 *
 * 100% design-token styling where applicable. Micro-scale preview
 * elements use pixel values where token granularity is insufficient.
 * SSR-safe, responsive, purely presentational (aria-hidden).
 *
 * @example
 * ```html
 * <nxt1-usage-dashboard-preview />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtIconComponent } from '../components/icon';

// ============================================
// PREVIEW MOCK DATA
// ============================================

/** Mock overview cards for the preview. */
const PREVIEW_OVERVIEW = [
  {
    label: 'Current Usage',
    value: '$4.82',
    sublabel: 'This billing period',
    icon: 'trending-up-outline',
  },
  { label: 'Included Free', value: '$10.00', sublabel: '55% remaining', icon: 'gift-outline' },
  { label: 'Next Payment', value: 'Mar 1', sublabel: 'Auto-pay enabled', icon: 'calendar-outline' },
] as const;

/** Mock subscriptions for the preview. */
const PREVIEW_SUBSCRIPTIONS = [
  { name: 'NXT1 Pro', cost: '$9.99/mo', badge: 'Active', isFree: false },
  { name: 'AI Credits', cost: '$0.00/mo', badge: 'Free', isFree: true },
  { name: 'Media Storage', cost: '$2.99/mo', badge: 'Active', isFree: false },
] as const;

/** Mock chart data points (simplified bar heights as percentages). */
const PREVIEW_CHART_BARS = [
  { day: '1', height: 12 },
  { day: '4', height: 18 },
  { day: '7', height: 25 },
  { day: '10', height: 22 },
  { day: '13', height: 38 },
  { day: '16', height: 45 },
  { day: '19', height: 52 },
  { day: '22', height: 58 },
  { day: '25', height: 48 },
  { day: '28', height: 65 },
] as const;

/** Mock payment history rows. */
const PREVIEW_PAYMENTS = [
  {
    id: 'INV-2401',
    amount: '$12.98',
    status: 'Paid',
    date: 'Feb 1, 2026',
    method: 'Visa •••• 4242',
  },
  {
    id: 'INV-2312',
    amount: '$9.99',
    status: 'Paid',
    date: 'Jan 1, 2026',
    method: 'Visa •••• 4242',
  },
  {
    id: 'INV-2311',
    amount: '$12.98',
    status: 'Paid',
    date: 'Dec 1, 2025',
    method: 'Visa •••• 4242',
  },
] as const;

@Component({
  selector: 'nxt1-usage-dashboard-preview',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="usage-preview" aria-hidden="true">
      <!-- Subtle glow behind dashboard -->
      <div class="preview-glow"></div>

      <!-- Dashboard window -->
      <div class="preview-window">
        <!-- Browser Chrome -->
        <div class="preview-chrome">
          <div class="chrome-dots">
            <span class="dot dot--close"></span>
            <span class="dot dot--min"></span>
            <span class="dot dot--max"></span>
          </div>
          <div class="chrome-title">Billing & Usage</div>
        </div>

        <!-- Dashboard Body -->
        <div class="preview-body">
          <!-- Overview Cards Row -->
          <div class="overview-cards">
            @for (card of overviewCards; track card.label) {
              <div class="overview-card">
                <div class="overview-card__icon">
                  <nxt1-icon [name]="card.icon" size="14" />
                </div>
                <div class="overview-card__content">
                  <span class="overview-card__label">{{ card.label }}</span>
                  <span class="overview-card__value">{{ card.value }}</span>
                  <span class="overview-card__sub">{{ card.sublabel }}</span>
                </div>
              </div>
            }
          </div>

          <!-- Two-Column Layout -->
          <div class="preview-columns">
            <!-- Left: Usage Chart -->
            <div class="chart-section">
              <div class="section-header">
                <span class="section-title">Metered Usage</span>
                <span class="section-badge">This month</span>
              </div>
              <div class="chart-container">
                <div class="chart-bars">
                  @for (bar of chartBars; track bar.day) {
                    <div class="chart-bar-group">
                      <div class="chart-bar" [style.height.%]="bar.height"></div>
                      <span class="chart-label">{{ bar.day }}</span>
                    </div>
                  }
                </div>
                <div class="chart-total">
                  <span class="chart-total__label">Cumulative</span>
                  <span class="chart-total__value">$4.82</span>
                </div>
              </div>
            </div>

            <!-- Right: Subscriptions -->
            <div class="subs-section">
              <div class="section-header">
                <span class="section-title">Subscriptions</span>
              </div>
              <div class="subs-list">
                @for (sub of subscriptions; track sub.name) {
                  <div class="sub-row">
                    <div class="sub-info">
                      <span class="sub-name">{{ sub.name }}</span>
                      <span class="sub-cost">{{ sub.cost }}</span>
                    </div>
                    <span class="sub-badge" [class.sub-badge--free]="sub.isFree">
                      {{ sub.badge }}
                    </span>
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- Payment History -->
          <div class="payments-section">
            <div class="section-header">
              <span class="section-title">Payment History</span>
            </div>
            <div class="payments-table">
              <div class="payments-header-row">
                <span>Invoice</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Date</span>
                <span>Method</span>
              </div>
              @for (payment of payments; track payment.id) {
                <div class="payments-row">
                  <span class="payment-id">{{ payment.id }}</span>
                  <span class="payment-amount">{{ payment.amount }}</span>
                  <span class="payment-status">{{ payment.status }}</span>
                  <span class="payment-date">{{ payment.date }}</span>
                  <span class="payment-method">{{ payment.method }}</span>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
     * USAGE DASHBOARD PREVIEW
     * 100% design-token styling — zero hardcoded values
     * ============================================ */

      :host {
        display: block;
        width: 100%;
      }

      .usage-preview {
        position: relative;
        width: 100%;
        max-width: 620px;
        margin: 0 auto;
      }

      /* ---- Glow ---- */
      .preview-glow {
        position: absolute;
        inset: 10% 5%;
        background: var(--nxt1-color-alpha-primary10);
        filter: blur(48px);
        border-radius: var(--nxt1-borderRadius-3xl);
        z-index: 0;
        pointer-events: none;
      }

      /* ---- Window ---- */
      .preview-window {
        position: relative;
        z-index: 1;
        border-radius: var(--nxt1-borderRadius-xl);
        overflow: hidden;
        background: var(--nxt1-color-bg-primary);
        border: 1px solid var(--nxt1-color-border-primary);
        box-shadow:
          0 4px 24px var(--nxt1-color-alpha-primary6),
          0 1px 4px var(--nxt1-color-alpha-primary4);
      }

      /* ---- Browser Chrome ---- */
      .preview-chrome {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        background: var(--nxt1-color-bg-secondary);
        border-bottom: 1px solid var(--nxt1-color-border-primary);
      }

      .chrome-dots {
        display: flex;
        gap: var(--nxt1-spacing-1_5);
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: var(--nxt1-borderRadius-full);
      }

      .dot--close {
        background: var(--nxt1-color-error);
      }
      .dot--min {
        background: var(--nxt1-color-warning);
      }
      .dot--max {
        background: var(--nxt1-color-success);
      }

      .chrome-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        letter-spacing: 0.02em;
      }

      /* ---- Body ---- */
      .preview-body {
        padding: var(--nxt1-spacing-4);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      /* ---- Overview Cards ---- */
      .overview-cards {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      .overview-card {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .overview-card__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .overview-card__content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
        min-width: 0;
      }

      .overview-card__label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 600;
      }

      .overview-card__value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        line-height: 1.1;
      }

      .overview-card__sub {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ---- Two-Column Layout ---- */
      .preview-columns {
        display: grid;
        grid-template-columns: 1.5fr 1fr;
        gap: var(--nxt1-spacing-4);
      }

      /* ---- Section Header ---- */
      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .section-badge {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        color: var(--nxt1-color-primary);
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        background: var(--nxt1-color-alpha-primary10);
        border-radius: var(--nxt1-borderRadius-full);
      }

      /* ---- Chart Section ---- */
      .chart-section {
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .chart-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .chart-bars {
        display: flex;
        align-items: flex-end;
        gap: var(--nxt1-spacing-2);
        height: 80px;
      }

      .chart-bar-group {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1);
      }

      .chart-bar {
        width: 100%;
        min-height: 4px;
        background: linear-gradient(
          to top,
          var(--nxt1-color-primary),
          var(--nxt1-color-alpha-primary50)
        );
        border-radius: var(--nxt1-borderRadius-xs) var(--nxt1-borderRadius-xs) 0 0;
        transition: height var(--nxt1-motion-duration-normal) var(--nxt1-motion-easing-inOut);
      }

      .chart-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        color: var(--nxt1-color-text-tertiary);
      }

      .chart-total {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: var(--nxt1-spacing-2);
        border-top: 1px solid var(--nxt1-color-border-primary);
      }

      .chart-total__label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .chart-total__value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-md);
        font-weight: 700;
        color: var(--nxt1-color-primary);
      }

      /* ---- Subscriptions ---- */
      .subs-section {
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .subs-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .sub-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-2);
        background: var(--nxt1-color-bg-primary);
        border-radius: var(--nxt1-borderRadius-md);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .sub-info {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
      }

      .sub-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .sub-cost {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .sub-badge {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-successBg);
        color: var(--nxt1-color-success);
      }

      .sub-badge--free {
        background: var(--nxt1-color-infoBg);
        color: var(--nxt1-color-info);
      }

      /* ---- Payment History ---- */
      .payments-section {
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .payments-table {
        display: flex;
        flex-direction: column;
      }

      .payments-header-row {
        display: grid;
        grid-template-columns: 1.2fr 1fr 0.8fr 1.2fr 1.4fr;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-bottom: 1px solid var(--nxt1-color-border-primary);
      }

      .payments-row {
        display: grid;
        grid-template-columns: 1.2fr 1fr 0.8fr 1.2fr 1.4fr;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2);
        border-bottom: 1px solid var(--nxt1-color-border-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-secondary);
      }

      .payments-row:last-child {
        border-bottom: none;
      }

      .payment-id {
        font-weight: 600;
        color: var(--nxt1-color-primary);
      }

      .payment-amount {
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .payment-status {
        color: var(--nxt1-color-success);
        font-weight: 600;
      }

      /* ---- Responsive ---- */
      @media (max-width: 640px) {
        .overview-cards {
          grid-template-columns: 1fr;
        }

        .preview-columns {
          grid-template-columns: 1fr;
        }

        .payments-header-row,
        .payments-row {
          grid-template-columns: 1fr 1fr;
        }

        .payments-header-row span:nth-child(n + 4),
        .payments-row span:nth-child(n + 4) {
          display: none;
        }
      }

      @media (max-width: 480px) {
        .preview-body {
          padding: var(--nxt1-spacing-3);
        }

        .overview-card {
          padding: var(--nxt1-spacing-2);
        }

        .chart-bars {
          height: 60px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtUsageDashboardPreviewComponent {
  protected readonly overviewCards = PREVIEW_OVERVIEW;
  protected readonly subscriptions = PREVIEW_SUBSCRIPTIONS;
  protected readonly chartBars = PREVIEW_CHART_BARS;
  protected readonly payments = PREVIEW_PAYMENTS;
}
