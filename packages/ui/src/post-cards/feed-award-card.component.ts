/**
 * @fileoverview Atomic Feed Award Card
 * @module @nxt1/ui/feed
 *
 * Renders an award/honor achievement card.
 * Used inside FeedCardShellComponent for FeedItemAward items.
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import type { FeedAwardData } from '@nxt1/core';
import { FEED_CARD_TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../components/icon';

@Component({
  selector: 'nxt1-feed-award-card',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="award-card" [attr.data-testid]="testIds.AWARD_CARD">
      <div class="award-card__icon" [attr.data-testid]="testIds.AWARD_ICON">
        <nxt1-icon [name]="data().icon || 'trophy'" [size]="28" />
      </div>
      <div class="award-card__info" [attr.data-testid]="testIds.AWARD_INFO">
        <span class="award-card__name">{{ data().awardName }}</span>
        @if (data().organization) {
          <span class="award-card__org">{{ data().organization }}</span>
        }
        @if (data().season) {
          <span class="award-card__season">{{ data().season }}</span>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .award-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px;
        border-radius: var(--nxt1-radius-md, 12px);
        background: linear-gradient(
          135deg,
          rgba(212, 255, 0, 0.06) 0%,
          rgba(212, 255, 0, 0.02) 100%
        );
        border: 1px solid rgba(212, 255, 0, 0.15);
      }

      .award-card__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: rgba(212, 255, 0, 0.1);
        color: var(--nxt1-color-primary, #d4ff00);
        flex-shrink: 0;
      }

      .award-card__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .award-card__name {
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .award-card__org {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .award-card__season {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedAwardCardComponent {
  readonly data = input.required<FeedAwardData>();
  protected readonly testIds = FEED_CARD_TEST_IDS;
}
