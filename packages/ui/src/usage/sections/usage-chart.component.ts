/**
 * @fileoverview Usage Chart Section — Pure CSS Line Chart
 * @module @nxt1/ui/usage
 *
 * Metered usage line chart with product tabs, billable detail,
 * included usage quotas, and top-products stacked bar.
 * Zero external chart libraries — pure CSS/SVG.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  UsageChartDataPoint,
  UsageProductDetail,
  UsageProductCategory,
  UsageTopItem,
  UsageTimeframe,
} from '@nxt1/core';
import { formatPrice, USAGE_TIMEFRAME_OPTIONS } from '@nxt1/core';

@Component({
  selector: 'nxt1-usage-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="usage-chart-section">
      <!-- METERED USAGE HEADER -->
      <div class="chart-section-header">
        <h2 class="section-heading">Metered usage</h2>
        <div class="timeframe-select">
          <select
            [value]="timeframe()"
            (change)="onTimeframeChange($event)"
            class="timeframe-dropdown"
          >
            @for (opt of timeframeOptions; track opt.id) {
              <option [value]="opt.id">{{ opt.label }}</option>
            }
          </select>
        </div>
      </div>

      <!-- LINE CHART -->
      <div class="chart-container">
        <div class="chart-header">
          <div>
            <h3 class="chart-title">Metered usage</h3>
            <span class="chart-subtitle">{{ periodLabel() }}</span>
          </div>
        </div>

        <div class="chart-legend">
          <span class="legend-item">
            <span class="legend-line"></span>
            Usage
          </span>
        </div>

        <div class="chart-area">
          <!-- Y-axis labels -->
          <div class="y-axis">
            @for (label of yLabels(); track label) {
              <span class="y-label">{{ label }}</span>
            }
          </div>

          <!-- Chart body with SVG polyline -->
          <div
            class="chart-body"
            (mousemove)="handlePointerMove($event)"
            (mouseleave)="clearHover()"
            (touchstart)="handlePointerMove($event)"
            (touchmove)="handlePointerMove($event)"
            (touchend)="clearHover()"
          >
            <!-- Grid lines -->
            <div class="grid-lines">
              @for (label of yLabels(); track label) {
                <div class="grid-line"></div>
              }
            </div>

            <!-- SVG Line -->
            @if (svgPath()) {
              <svg class="chart-svg" viewBox="0 0 1000 400" preserveAspectRatio="none">
                <polyline [attr.points]="svgPath()" class="chart-line" />
              </svg>
            }

            <!-- X-axis labels -->
            <div class="x-axis">
              @for (label of xLabels(); track label) {
                <span class="x-label">{{ label }}</span>
              }
            </div>
          </div>

          <!-- Hover tooltip (outside chart-body to avoid overflow clipping) -->
          @if (hoverPoint()) {
            <div class="hover-line" [style.--hover-x.px]="hoverX()"></div>
            <div class="hover-tooltip" [style.--hover-x.px]="hoverX()">
              <div class="hover-tooltip-label">{{ hoverPoint()!.label }}</div>
              <div class="hover-tooltip-value">{{ formatAmount(hoverPoint()!.amount) }}</div>
            </div>
          }
        </div>
      </div>

      <!-- PRODUCT TABS -->
      <div class="product-tabs-container">
        <h3 class="tabs-title">Usage by products</h3>

        <div class="product-tabs">
          @for (tab of productTabs(); track tab.category) {
            <button
              type="button"
              class="product-tab"
              [class.product-tab--active]="activeTab() === tab.category"
              (click)="tabChange.emit(tab.category)"
            >
              <span>{{ tab.label }}</span>
            </button>
          }
        </div>

        <!-- Active Tab Detail -->
        @if (activeDetail()) {
          <div class="tab-detail">
            <div class="detail-columns">
              <!-- Left: Billable usage -->
              <div class="detail-column">
                <div class="detail-header">
                  <h4 class="detail-label">Billable usage</h4>
                  <button type="button" class="card-link" (click)="viewBreakdown.emit()">
                    View details
                  </button>
                </div>
                <div class="detail-amount">{{ formatAmount(activeDetail()!.billableAmount) }}</div>
                <p class="detail-stats">
                  {{ formatAmount(activeDetail()!.consumedAmount) }} consumed usage –
                  {{ formatAmount(activeDetail()!.discountAmount) }} discounts
                </p>
                <p class="detail-description">{{ activeDetail()!.discountDescription }}</p>
              </div>

              <!-- Right: Included usage -->
              <div class="detail-column">
                <div class="detail-header">
                  <h4 class="detail-label">Included usage</h4>
                  <button type="button" class="card-link" (click)="manageBudgets.emit()">
                    Manage budgets
                  </button>
                </div>
                @for (quota of activeDetail()!.includedQuotas; track quota.label) {
                  <div class="quota-row">
                    <span class="quota-label">{{ quota.label }}</span>
                    <span class="quota-value">
                      {{ quota.used }} {{ quota.unit }} used / {{ quota.included | number }}
                      {{ quota.unit }} included
                    </span>
                  </div>
                  <div class="quota-bar-container">
                    <div
                      class="quota-bar"
                      [style.width.%]="getQuotaPercent(quota.used, quota.included)"
                    ></div>
                  </div>
                }
                @if (activeDetail()!.includedQuotas.length > 0) {
                  <p class="quota-reset">
                    Included usage limits reset in {{ activeDetail()!.includedResetDays }} days.
                  </p>
                }
              </div>
            </div>
          </div>
        }
      </div>

      <!-- TOP ITEMS STACKED BAR -->
      @if (topItems().length > 0) {
        <div class="top-items-section">
          <div class="top-items-header">
            <div>
              <h3 class="tabs-title">Usage by product</h3>
              <span class="chart-subtitle">Top {{ topItems().length }} products this month</span>
            </div>
          </div>

          <!-- Stacked Bar -->
          <div class="stacked-bar">
            @for (item of topItems(); track item.name) {
              <div
                class="stacked-segment"
                [style.flex-grow]="item.grossAmount"
                [style.background]="item.color"
              ></div>
            }
          </div>

          <!-- Legend Table -->
          <div class="top-items-table">
            <div class="top-items-table-header">
              <span>Product</span>
              <span class="text-right">Gross amount</span>
            </div>
            @for (item of topItems(); track item.name) {
              <div class="top-items-row">
                <div class="top-item-name">
                  <span class="top-item-dot" [style.background]="item.color"></span>
                  {{ item.name }}
                </div>
                <span class="top-item-amount">{{ formatAmount(item.grossAmount) }}</span>
              </div>
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .usage-chart-section {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .chart-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-5);
      }

      .section-heading {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .timeframe-dropdown {
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md, 8px);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        font-size: var(--nxt1-fontSize-sm);
        font-family: var(--nxt1-fontFamily-brand);
        cursor: pointer;
        outline: none;

        &:focus {
          border-color: var(--nxt1-color-primary);
        }

        option {
          background: var(--nxt1-color-surface-200);
          color: var(--nxt1-color-text-primary);
        }
      }

      /* ── CHART CONTAINER ─────────────── */

      .chart-container {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: var(--nxt1-spacing-5);
        margin-bottom: var(--nxt1-spacing-5);
      }

      .chart-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .chart-title {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .chart-subtitle {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .chart-legend {
        margin-bottom: var(--nxt1-spacing-4);
      }

      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
      }

      .legend-line {
        display: inline-block;
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-0-5);
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-radius-full);
      }

      .chart-area {
        display: flex;
        gap: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-60, 240px);
        position: relative;
      }

      .y-axis {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding-bottom: var(--nxt1-spacing-6);
        min-width: var(--nxt1-spacing-12);
        text-align: right;
      }

      .y-label {
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-mono);
      }

      .chart-body {
        flex: 1;
        position: relative;
        overflow: hidden;
      }

      /* Hover line positioned in chart-area (accounts for y-axis width) */
      .hover-line {
        position: absolute;
        top: 0;
        bottom: var(--nxt1-spacing-6);
        width: var(--nxt1-spacing-px, 1px);
        background: var(--nxt1-color-border-default);
        /* Offset by y-axis width + gap */
        left: calc(var(--nxt1-spacing-12) + var(--nxt1-spacing-2) + var(--hover-x, 0px));
        pointer-events: none;
      }

      /* Tooltip floats ABOVE the chart container */
      .hover-tooltip {
        position: absolute;
        bottom: calc(100% + var(--nxt1-spacing-2));
        /* Offset by y-axis width + gap, clamp to keep in bounds */
        left: clamp(
          calc(var(--nxt1-spacing-12) + var(--nxt1-spacing-6)),
          calc(var(--nxt1-spacing-12) + var(--nxt1-spacing-2) + var(--hover-x, 0px)),
          calc(100% - var(--nxt1-spacing-16))
        );
        transform: translateX(-50%);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        box-shadow: var(--nxt1-shadow-md);
        color: var(--nxt1-color-text-primary);
        z-index: var(--nxt1-zIndex-tooltip, 1070);
        pointer-events: none;
        white-space: nowrap;
      }

      .hover-tooltip-label {
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
        line-height: var(--nxt1-lineHeight-tight);
        margin-bottom: var(--nxt1-spacing-0-5);
      }

      .hover-tooltip-value {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        font-family: var(--nxt1-fontFamily-mono);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .grid-lines {
        position: absolute;
        inset: 0;
        bottom: var(--nxt1-spacing-6);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }

      .grid-line {
        height: var(--nxt1-spacing-px, 1px);
        background: var(--nxt1-color-border-subtle);
      }

      .chart-svg {
        position: absolute;
        inset: 0;
        bottom: var(--nxt1-spacing-6);
        width: 100%;
        height: calc(100% - var(--nxt1-spacing-6));
      }

      .chart-line {
        fill: none;
        stroke: var(--nxt1-color-primary);
        stroke-width: 2.5;
        stroke-linejoin: round;
        stroke-linecap: round;
      }

      .x-axis {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        justify-content: space-between;
        height: var(--nxt1-spacing-6);
        align-items: flex-end;
      }

      .x-label {
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ── PRODUCT TABS ─────────────── */

      .product-tabs-container {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: var(--nxt1-spacing-5);
        margin-bottom: var(--nxt1-spacing-5);
      }

      .tabs-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-4) 0;
      }

      .product-tabs {
        display: flex;
        gap: var(--nxt1-spacing-1);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        margin-bottom: var(--nxt1-spacing-5);
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;

        &::-webkit-scrollbar {
          display: none;
        }
      }

      .product-tab {
        display: flex;
        align-items: center;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        font-size: var(--nxt1-fontSize-sm);
        font-family: var(--nxt1-fontFamily-brand);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        background: none;
        border: none;
        border-bottom: var(--nxt1-spacing-0-5, 2px) solid transparent;
        cursor: pointer;
        white-space: nowrap;
        transition: all var(--nxt1-transition-fast);

        &:hover {
          color: var(--nxt1-color-text-primary);
        }

        &.product-tab--active {
          color: var(--nxt1-color-text-primary);
          border-bottom-color: var(--nxt1-color-primary);
        }
      }

      .tab-detail {
        animation: fadeIn var(--nxt1-duration-normal) var(--nxt1-easing-out);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(var(--nxt1-spacing-1, 4px));
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .detail-columns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-6);
      }

      @media (max-width: 768px) {
        .detail-columns {
          grid-template-columns: 1fr;
        }
      }

      .detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-2);
      }

      .detail-label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
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
        white-space: nowrap;
      }

      .card-link:hover {
        background: var(--nxt1-color-surface-200);
        text-decoration: underline;
      }

      .detail-amount {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin-bottom: var(--nxt1-spacing-2);
      }

      .detail-stats {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
      }

      .detail-description {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        line-height: var(--nxt1-lineHeight-normal);
        margin: 0;
      }

      .quota-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--nxt1-spacing-1);
      }

      .quota-label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .quota-value {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
      }

      .quota-bar-container {
        height: var(--nxt1-spacing-1-5);
        background: var(--nxt1-color-surface-300);
        border-radius: var(--nxt1-radius-full);
        overflow: hidden;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .quota-bar {
        height: 100%;
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-radius-full);
        transition: width var(--nxt1-duration-slow) var(--nxt1-easing-out);
        min-width: var(--nxt1-spacing-0-5, 2px);
      }

      .quota-reset {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
      }

      /* ── TOP ITEMS ─────────────── */

      .top-items-section {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: var(--nxt1-spacing-5);
      }

      .top-items-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .stacked-bar {
        display: flex;
        height: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-radius-full);
        overflow: hidden;
        gap: var(--nxt1-spacing-0-5);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .stacked-segment {
        border-radius: var(--nxt1-radius-xs);
        min-width: var(--nxt1-spacing-1);
      }

      .top-items-table {
        display: flex;
        flex-direction: column;
      }

      .top-items-table-header {
        display: flex;
        justify-content: space-between;
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        padding-bottom: var(--nxt1-spacing-2);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .top-items-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--nxt1-spacing-2) 0;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);

        &:last-child {
          border-bottom: none;
        }
      }

      .top-item-name {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
      }

      .top-item-dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-radius-full);
        flex-shrink: 0;
      }

      .top-item-amount {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-mono);
      }

      .text-right {
        text-align: right;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageChartComponent {
  readonly chartData = input.required<readonly UsageChartDataPoint[]>();
  readonly productTabs = input.required<readonly UsageProductDetail[]>();
  readonly activeTab = input.required<UsageProductCategory>();
  readonly topItems = input.required<readonly UsageTopItem[]>();
  readonly timeframe = input.required<UsageTimeframe>();
  readonly yLabels = input.required<readonly string[]>();

  readonly tabChange = output<UsageProductCategory>();
  readonly timeframeChange = output<UsageTimeframe>();
  readonly viewBreakdown = output<void>();
  readonly manageBudgets = output<void>();

  protected readonly timeframeOptions = USAGE_TIMEFRAME_OPTIONS;

  protected readonly activeDetail = computed(
    () => this.productTabs().find((t) => t.category === this.activeTab()) ?? null
  );

  private readonly hoverIndex = signal<number | null>(null);
  private readonly hoverXValue = signal(0);

  protected readonly hoverX = computed(() => this.hoverXValue());

  protected readonly hoverPoint = computed(() => {
    const index = this.hoverIndex();
    if (index === null) return null;
    return this.chartData()[index] ?? null;
  });

  protected readonly periodLabel = computed(() => {
    const data = this.chartData();
    if (data.length === 0) return '';
    const first = data[0];
    const last = data[data.length - 1];
    return `${first.label} – ${last.label}, ${new Date(first.date).getFullYear()}`;
  });

  protected readonly svgPath = computed(() => {
    const data = this.chartData();
    if (data.length < 2) return '';
    const max = Math.max(...data.map((d) => d.amount), 1);
    const step = 1000 / Math.max(data.length - 1, 1);

    return data
      .map((d, i) => {
        const x = Math.round(i * step);
        const y = Math.round(400 - (d.amount / max) * 380);
        return `${x},${y}`;
      })
      .join(' ');
  });

  protected readonly xLabels = computed(() => {
    const data = this.chartData();
    if (data.length <= 10) return data.map((d) => d.label);
    const step = Math.ceil(data.length / 10);
    return data.filter((_, i) => i % step === 0).map((d) => d.label);
  });

  protected onTimeframeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as UsageTimeframe;
    this.timeframeChange.emit(value);
  }

  protected handlePointerMove(event: MouseEvent | TouchEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const clientX =
      'touches' in event
        ? (event.touches[0]?.clientX ?? event.changedTouches[0]?.clientX)
        : event.clientX;

    if (clientX === undefined) return;

    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const count = this.chartData().length;
    if (count === 0) return;

    const step = rect.width / Math.max(count - 1, 1);
    const index = Math.min(Math.max(Math.round(x / step), 0), count - 1);

    this.hoverIndex.set(index);
    this.hoverXValue.set(index * step);
  }

  protected clearHover(): void {
    this.hoverIndex.set(null);
  }

  protected formatAmount(cents: number): string {
    return formatPrice(cents);
  }

  protected getQuotaPercent(used: number, total: number): number {
    if (total <= 0) return 0;
    return Math.min(100, Math.round((used / total) * 100));
  }
}
