/**
 * @fileoverview Feed Empty State Component
 * @module @nxt1/ui/feed
 * @version 1.0.0
 *
 * Empty state display for feed with actionable CTAs.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-feed-empty-state
 *   (ctaClick)="onExplorePeople()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../components/icon';

// ============================================
@Component({
  selector: 'nxt1-feed-empty-state',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div class="feed-empty">
      <div class="feed-empty__icon">
        <nxt1-icon [name]="icon()" [size]="48" />
      </div>
      <h3 class="feed-empty__title">{{ title() }}</h3>
      <p class="feed-empty__message">{{ message() }}</p>
      @if (cta()) {
        <button type="button" class="feed-empty__cta" (click)="ctaClick.emit()">
          <nxt1-icon name="plusCircle" [size]="16" />
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
    return this.customIcon() ?? 'chatBubble';
  });

  protected readonly title = computed(() => {
    return this.customTitle() ?? 'No posts yet';
  });

  protected readonly message = computed(() => {
    return this.customMessage() ?? 'Posts from the community will appear here.';
  });

  protected readonly cta = computed(() => {
    return this.customCta();
  });
}
