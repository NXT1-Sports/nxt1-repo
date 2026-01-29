/**
 * @fileoverview Activity Skeleton Component - Loading State
 * @module @nxt1/ui/activity
 * @version 1.0.0
 *
 * Skeleton loading placeholder for activity items.
 * Matches the layout of ActivityItemComponent for seamless transitions.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Shimmer animation
 * - Matches ActivityItem layout exactly
 * - Accessible (aria-hidden)
 *
 * @example
 * ```html
 * @for (i of [1,2,3,4,5,6]; track i) {
 *   <nxt1-activity-skeleton />
 * }
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-activity-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="activity-skeleton" aria-hidden="true">
      <!-- Avatar skeleton -->
      <div class="activity-skeleton__avatar"></div>

      <!-- Content skeleton -->
      <div class="activity-skeleton__content">
        <div class="activity-skeleton__header">
          <div class="activity-skeleton__title"></div>
          <div class="activity-skeleton__time"></div>
        </div>
        <div class="activity-skeleton__body"></div>
        <div class="activity-skeleton__source"></div>
      </div>

      <!-- Trailing skeleton -->
      <div class="activity-skeleton__trailing">
        <div class="activity-skeleton__dot"></div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       ACTIVITY SKELETON - Loading Placeholder
       ============================================ */

      :host {
        display: block;
      }

      .activity-skeleton {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        background: var(--nxt1-color-surface-primary, var(--ion-background-color));
        border-bottom: 0.5px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      /* Shimmer animation */
      @keyframes shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      .activity-skeleton__avatar,
      .activity-skeleton__title,
      .activity-skeleton__time,
      .activity-skeleton__body,
      .activity-skeleton__source,
      .activity-skeleton__dot {
        background: linear-gradient(
          90deg,
          var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04)) 25%,
          var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08)) 50%,
          var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04)) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite ease-in-out;
        border-radius: 4px;
      }

      /* Avatar */
      .activity-skeleton__avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* Content */
      .activity-skeleton__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .activity-skeleton__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .activity-skeleton__title {
        height: 16px;
        width: 60%;
      }

      .activity-skeleton__time {
        height: 12px;
        width: 40px;
        flex-shrink: 0;
      }

      .activity-skeleton__body {
        height: 14px;
        width: 90%;
      }

      .activity-skeleton__source {
        height: 12px;
        width: 30%;
      }

      /* Trailing */
      .activity-skeleton__trailing {
        flex-shrink: 0;
      }

      .activity-skeleton__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivitySkeletonComponent {}
