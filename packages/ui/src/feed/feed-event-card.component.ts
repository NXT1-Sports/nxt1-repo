/**
 * @fileoverview Atomic Feed Event/Schedule Card
 * @module @nxt1/ui/feed
 *
 * Renders a game/schedule card (upcoming, live, final).
 * Used inside FeedCardShellComponent for FeedItemEvent items.
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import type { FeedScheduleData } from '@nxt1/core';
import { FEED_CARD_TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../components/icon';

@Component({
  selector: 'nxt1-feed-event-card',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div
      class="event-card"
      [class.event-card--live]="data().status === 'live'"
      [attr.data-testid]="testIds.EVENT_CARD"
    >
      <div class="event-card__status">
        <span
          class="event-card__badge"
          [class]="'event-card__badge--' + data().status"
          [attr.data-testid]="testIds.EVENT_STATUS_BADGE"
        >
          {{ statusLabel() }}
        </span>
      </div>
      <div class="event-card__matchup" [attr.data-testid]="testIds.EVENT_MATCHUP">
        @if (data().isHome !== undefined) {
          <span class="event-card__ha">{{ data().isHome ? 'HOME' : 'AWAY' }}</span>
        }
        <span class="event-card__vs">vs</span>
        @if (data().opponentLogoUrl) {
          <img
            [src]="data().opponentLogoUrl"
            class="event-card__opp-logo"
            [alt]="data().opponent + ' logo'"
          />
        }
        <span class="event-card__opponent">{{ data().opponent }}</span>
      </div>
      @if (data().result) {
        <span
          class="event-card__result"
          [class.event-card__result--win]="data().result!.startsWith('W')"
          [attr.data-testid]="testIds.EVENT_RESULT"
        >
          {{ data().result }}
        </span>
      }
      @if (data().venue) {
        <span class="event-card__venue" [attr.data-testid]="testIds.EVENT_VENUE">
          <nxt1-icon name="location" [size]="12" />
          {{ data().venue }}
        </span>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .event-card {
        border-radius: var(--nxt1-radius-md, 12px);
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .event-card--live {
        border-color: rgba(239, 68, 68, 0.4);
        background: rgba(239, 68, 68, 0.06);
      }

      .event-card__status {
        display: flex;
      }

      .event-card__badge {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 3px 10px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: rgba(255, 255, 255, 0.08);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .event-card__badge--live {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
        animation: pulse-live 2s ease-in-out infinite;
      }

      .event-card__badge--final {
        background: rgba(212, 255, 0, 0.1);
        color: var(--nxt1-color-primary, #d4ff00);
      }

      .event-card__badge--upcoming {
        background: rgba(59, 130, 246, 0.1);
        color: #3b82f6;
      }

      .event-card__badge--postponed,
      .event-card__badge--cancelled {
        background: rgba(161, 161, 170, 0.1);
        color: #a1a1aa;
      }

      @keyframes pulse-live {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.6;
        }
      }

      .event-card__matchup {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .event-card__ha {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .event-card__vs {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .event-card__opp-logo {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        object-fit: cover;
      }

      .event-card__opponent {
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .event-card__result {
        font-size: 20px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .event-card__result--win {
        color: var(--nxt1-color-success, #22c55e);
      }

      .event-card__venue {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedEventCardComponent {
  readonly data = input.required<FeedScheduleData>();
  protected readonly testIds = FEED_CARD_TEST_IDS;

  protected readonly statusLabel = computed(() => {
    return this.data().status.toUpperCase();
  });
}
