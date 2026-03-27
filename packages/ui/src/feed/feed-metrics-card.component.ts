/**
 * @fileoverview Atomic Feed Metrics Card
 * @module @nxt1/ui/feed
 *
 * Renders combine/measurables data as a grid of metrics.
 * Used inside FeedCardShellComponent for FeedItemMetric items.
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import type { FeedMetricsData } from '@nxt1/core';
import { FEED_CARD_TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../components/icon';

@Component({
  selector: 'nxt1-feed-metrics-card',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="metrics-card" [attr.data-testid]="testIds.METRICS_CARD">
      <div class="metrics-card__header" [attr.data-testid]="testIds.METRICS_HEADER">
        <nxt1-icon name="barbell" [size]="16" />
        <span>{{ data().category || data().source }}</span>
      </div>
      <div class="metrics-card__grid" [attr.data-testid]="testIds.METRICS_GRID" role="grid">
        @for (metric of data().metrics; track metric.label) {
          <div class="metrics-card__cell" [attr.data-testid]="testIds.METRICS_CELL" role="gridcell">
            <span class="metrics-card__value">
              {{ metric.value }}<span class="metrics-card__unit">{{ metric.unit }}</span>
            </span>
            <span class="metrics-card__label">{{ metric.label }}</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .metrics-card {
        border-radius: var(--nxt1-radius-md, 12px);
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }

      .metrics-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 12px;
        font-weight: 600;
      }

      .metrics-card__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
        gap: 1px;
        background: rgba(255, 255, 255, 0.04);
      }

      .metrics-card__cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 14px 8px;
        background: rgba(255, 255, 255, 0.02);
        gap: 4px;
      }

      .metrics-card__value {
        font-size: 18px;
        font-weight: 800;
        color: var(--nxt1-color-text-primary, #ffffff);
        font-variant-numeric: tabular-nums;
      }

      .metrics-card__unit {
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        margin-left: 2px;
      }

      .metrics-card__label {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedMetricsCardComponent {
  readonly data = input.required<FeedMetricsData>();
  protected readonly testIds = FEED_CARD_TEST_IDS;
}
