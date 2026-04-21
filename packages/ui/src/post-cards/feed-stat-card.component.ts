/**
 * @fileoverview Atomic Feed Stat Card
 * @module @nxt1/ui/feed
 *
 * Renders a stat-line update card (game stats, season totals).
 * Used inside FeedCardShellComponent for FeedItemStat items.
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import type { FeedStatUpdateData } from '@nxt1/core';
import { FEED_CARD_TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../components/icon';

@Component({
  selector: 'nxt1-feed-stat-card',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="stat-card" [attr.data-testid]="testIds.STAT_CARD">
      <div class="stat-card__header" [attr.data-testid]="testIds.STAT_HEADER">
        <nxt1-icon name="barChart" [size]="16" />
        <span class="stat-card__context">{{ data().context }}</span>
        @if (data().gameResult) {
          <span
            class="stat-card__result"
            [class.stat-card__result--win]="data().gameResult!.startsWith('W')"
            [attr.data-testid]="testIds.STAT_RESULT"
          >
            {{ data().gameResult }}
          </span>
        }
      </div>
      <div class="stat-card__grid" [attr.data-testid]="testIds.STAT_GRID" role="grid">
        @for (stat of data().stats; track stat.label) {
          <div
            class="stat-card__cell"
            [class.stat-card__cell--highlight]="stat.isHighlight"
            [attr.data-testid]="testIds.STAT_CELL"
            role="gridcell"
          >
            <span class="stat-card__value">{{ stat.value }}</span>
            <span class="stat-card__label">{{ stat.label }}</span>
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

      .stat-card {
        border-radius: var(--nxt1-radius-md, 12px);
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }

      .stat-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 12px;
        font-weight: 600;
      }

      .stat-card__context {
        flex: 1;
        min-width: 0;
      }

      .stat-card__result {
        font-weight: 700;
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .stat-card__result--win {
        color: var(--nxt1-color-success, #22c55e);
      }

      .stat-card__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
        gap: 1px;
        background: rgba(255, 255, 255, 0.04);
      }

      .stat-card__cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 12px 8px;
        background: rgba(255, 255, 255, 0.02);
        gap: 4px;
      }

      .stat-card__cell--highlight {
        background: rgba(212, 255, 0, 0.06);
      }

      .stat-card__value {
        font-size: 20px;
        font-weight: 800;
        color: var(--nxt1-color-text-primary, #ffffff);
        font-variant-numeric: tabular-nums;
      }

      .stat-card__cell--highlight .stat-card__value {
        color: var(--nxt1-color-primary, #d4ff00);
      }

      .stat-card__label {
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
export class FeedStatCardComponent {
  readonly data = input.required<FeedStatUpdateData>();
  protected readonly testIds = FEED_CARD_TEST_IDS;
}
