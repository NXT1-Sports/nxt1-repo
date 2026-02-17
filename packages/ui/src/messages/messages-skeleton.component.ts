/**
 * @fileoverview Messages Skeleton Loading Component
 * @module @nxt1/ui/messages
 * @version 1.0.0
 *
 * Shimmer skeleton for conversation list items.
 * Uses design tokens for consistent loading states.
 *
 * ⭐ SHARED — Works on both web and mobile ⭐
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-messages-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-list" aria-hidden="true" role="status" aria-label="Loading conversations">
      @for (i of skeletonItems; track i) {
        <div class="skeleton-item">
          <div class="skeleton-avatar skeleton-shimmer"></div>
          <div class="skeleton-content">
            <div class="skeleton-row">
              <div class="skeleton-name skeleton-shimmer"></div>
              <div class="skeleton-time skeleton-shimmer"></div>
            </div>
            <div class="skeleton-message skeleton-shimmer"></div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .skeleton-list {
        display: flex;
        flex-direction: column;
      }

      .skeleton-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        border-bottom: var(--nxt1-spacing-px) solid var(--nxt1-color-border-subtle);
      }

      .skeleton-avatar {
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        border-radius: var(--nxt1-radius-full);
        flex-shrink: 0;
      }

      .skeleton-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .skeleton-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .skeleton-name {
        height: var(--nxt1-spacing-3_5);
        width: 45%;
        border-radius: var(--nxt1-radius-sm);
      }

      .skeleton-time {
        height: var(--nxt1-spacing-2_5);
        width: var(--nxt1-spacing-12);
        border-radius: var(--nxt1-radius-sm);
        flex-shrink: 0;
      }

      .skeleton-message {
        height: var(--nxt1-spacing-3);
        width: 75%;
        border-radius: var(--nxt1-radius-sm);
      }

      /* Shimmer animation using design tokens */
      .skeleton-shimmer {
        background: var(--nxt1-skeleton-gradient);
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.8s infinite ease-in-out;
      }

      @keyframes skeleton-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .skeleton-shimmer {
          animation: none;
          background: var(--nxt1-color-loading-skeleton);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesSkeletonComponent {
  /** Number of skeleton items to display */
  readonly count = input(6);

  get skeletonItems(): number[] {
    return Array.from({ length: this.count() }, (_, i) => i);
  }
}
