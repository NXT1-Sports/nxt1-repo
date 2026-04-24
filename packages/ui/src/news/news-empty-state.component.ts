/**
 * @fileoverview News Empty State Component
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Empty state display for news feed with category-specific messaging.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-news-empty-state
 *   [category]="'saved'"
 *   (ctaClick)="onBrowseNews()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { type NewsCategoryId, NEWS_EMPTY_STATES } from '@nxt1/core';
import { NxtIconComponent } from '../components/icon';

@Component({
  selector: 'nxt1-news-empty-state',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div class="news-empty">
      <!-- Icon -->
      <div class="news-empty__icon-wrapper">
        <nxt1-icon [name]="emptyState().icon" [size]="44" className="news-empty__icon" />
      </div>

      <!-- Title -->
      <h3 class="news-empty__title">{{ emptyState().title }}</h3>

      <!-- Message -->
      <p class="news-empty__message">{{ emptyState().message }}</p>

      <!-- CTA Button -->
      @if (emptyState().ctaLabel) {
        <button type="button" class="news-empty__cta" (click)="onCtaClick()">
          {{ emptyState().ctaLabel }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         NEWS EMPTY STATE - Category-Specific
         ============================================ */

      :host {
        display: block;

        --empty-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --empty-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --empty-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --empty-border: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .news-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 60px 24px;
        min-height: 400px;
      }

      .news-empty__icon-wrapper {
        width: 88px;
        height: 88px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 24px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--empty-surface);
        border: 1px solid var(--empty-border);
        color: var(--empty-text-primary);
      }

      .news-empty__icon {
        display: block;
      }

      .news-empty__title {
        margin: 0 0 8px;
        font-size: 20px;
        font-weight: 600;
        color: var(--empty-text-primary);
      }

      .news-empty__message {
        margin: 0 0 24px;
        font-size: 15px;
        line-height: 1.5;
        color: var(--empty-text-secondary);
        max-width: 300px;
      }

      /* CTA Button */
      .news-empty__cta {
        padding: 12px 24px;
        background: var(--nxt1-color-primary, #ccff00);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-onPrimary, #000);
        cursor: pointer;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease;
      }

      .news-empty__cta:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(204, 255, 0, 0.3);
      }

      .news-empty__cta:active {
        transform: scale(0.98);
      }

      .news-empty__cta:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsEmptyStateComponent {
  /** Current category to show empty state for */
  readonly category = input<NewsCategoryId>('for-you');

  /** Custom title override */
  readonly title = input<string | undefined>(undefined);

  /** Custom message override */
  readonly message = input<string | undefined>(undefined);

  /** Custom CTA label override */
  readonly ctaLabel = input<string | undefined>(undefined);

  /** Custom icon override */
  readonly icon = input<string | undefined>(undefined);

  /** Emitted when CTA button is clicked */
  readonly ctaClick = output<void>();

  /**
   * Get empty state config for current category.
   */
  readonly emptyState = computed(() => {
    const categoryConfig = NEWS_EMPTY_STATES[this.category()] || NEWS_EMPTY_STATES['for-you'];

    return {
      icon: this.icon() || categoryConfig.icon,
      title: this.title() || categoryConfig.title,
      message: this.message() || categoryConfig.message,
      ctaLabel: this.ctaLabel() || categoryConfig.ctaLabel,
    };
  });

  /**
   * Handle CTA button click.
   */
  onCtaClick(): void {
    this.ctaClick.emit();
  }
}
