/**
 * @fileoverview Feed Empty State Component
 * @module @nxt1/ui/feed
 * @version 1.0.0
 *
 * Empty state display for feed with actionable CTAs.
 * Customizable per filter type.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-feed-empty-state
 *   [filterType]="'following'"
 *   (ctaClick)="onExplorePeople()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sparklesOutline,
  peopleOutline,
  footballOutline,
  schoolOutline,
  playCircleOutline,
  trendingUpOutline,
  addCircleOutline,
} from 'ionicons/icons';
import { type FeedFilterType, FEED_EMPTY_STATES, FEED_FILTER_OPTIONS } from '@nxt1/core';

// Register icons
addIcons({
  sparklesOutline,
  peopleOutline,
  footballOutline,
  schoolOutline,
  playCircleOutline,
  trendingUpOutline,
  addCircleOutline,
});

@Component({
  selector: 'nxt1-feed-empty-state',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <div class="feed-empty">
      <div class="feed-empty__icon">
        <ion-icon [name]="icon()"></ion-icon>
      </div>
      <h3 class="feed-empty__title">{{ title() }}</h3>
      <p class="feed-empty__message">{{ message() }}</p>
      @if (cta()) {
        <button type="button" class="feed-empty__cta" (click)="ctaClick.emit()">
          <ion-icon name="add-circle-outline"></ion-icon>
          <span>{{ cta() }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         FEED EMPTY STATE
         2026 Professional Design
         ============================================ */

      :host {
        display: block;

        --empty-bg: var(--nxt1-color-surface-50, rgba(255, 255, 255, 0.02));
        --empty-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --empty-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --empty-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --empty-primary: var(--nxt1-color-primary, #d4ff00);
        --empty-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
      }

      .feed-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 24px;
        text-align: center;
        min-height: 400px;
      }

      .feed-empty__icon {
        width: 88px;
        height: 88px;
        border-radius: 50%;
        background: var(--empty-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 24px;

        ion-icon {
          font-size: 40px;
          color: var(--empty-text-tertiary);
        }
      }

      .feed-empty__title {
        font-size: 20px;
        font-weight: 600;
        color: var(--empty-text-primary);
        margin: 0 0 8px;
      }

      .feed-empty__message {
        font-size: 15px;
        color: var(--empty-text-secondary);
        margin: 0 0 24px;
        max-width: 300px;
        line-height: 1.5;
      }

      .feed-empty__cta {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 14px 28px;
        background: var(--empty-primary);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: #000;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        ion-icon {
          font-size: 20px;
        }

        &:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }

        &:active {
          transform: scale(0.97);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedEmptyStateComponent {
  // ============================================
  // INPUTS
  // ============================================

  readonly filterType = input<FeedFilterType>('for-you');
  readonly customTitle = input<string | undefined>(undefined);
  readonly customMessage = input<string | undefined>(undefined);
  readonly customCta = input<string | undefined>(undefined);
  readonly customIcon = input<string | undefined>(undefined);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly ctaClick = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly icon = computed(() => {
    if (this.customIcon()) return this.customIcon()!;
    const filterOption = FEED_FILTER_OPTIONS.find((f) => f.id === this.filterType());
    return filterOption?.icon ?? 'sparkles-outline';
  });

  protected readonly title = computed(() => {
    if (this.customTitle()) return this.customTitle()!;
    return FEED_EMPTY_STATES[this.filterType()]?.title ?? 'No posts yet';
  });

  protected readonly message = computed(() => {
    if (this.customMessage()) return this.customMessage()!;
    return FEED_EMPTY_STATES[this.filterType()]?.message ?? 'Check back later for updates.';
  });

  protected readonly cta = computed(() => {
    if (this.customCta() !== undefined) return this.customCta();
    return FEED_EMPTY_STATES[this.filterType()]?.cta;
  });
}
