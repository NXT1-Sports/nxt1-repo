/**
 * @fileoverview Activity Skeleton Component - Loading State
 * @module @nxt1/ui/activity
 * @version 2.0.0
 *
 * Skeleton loading placeholder for activity items.
 * Matches the layout of ActivityItemComponent for seamless transitions.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Architecture (2026 Best Practices):
 * - Uses global skeleton animation from @nxt1/ui/styles/base/skeleton.css
 * - Component owns layout/structure only
 * - Global CSS custom properties for skeleton colors
 * - Accessible (aria-hidden, reduced motion support)
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
         Uses global skeleton animation from @nxt1/ui/styles
         ============================================ */

      :host {
        display: block;
      }

      /* Container layout - matches ActivityItemComponent */
      .activity-skeleton {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        background: var(--nxt1-color-surface-primary, var(--ion-background-color));
        border-bottom: 0.5px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      /* Shimmer effect - uses global animation and design tokens */
      .activity-skeleton__avatar,
      .activity-skeleton__title,
      .activity-skeleton__time,
      .activity-skeleton__body,
      .activity-skeleton__source,
      .activity-skeleton__dot {
        background: var(
          --nxt1-skeleton-gradient,
          linear-gradient(
            90deg,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 25%,
            var(--nxt1-color-loading-skeletonShimmer, rgba(255, 255, 255, 0.15)) 50%,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 75%
          )
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s infinite ease-in-out;
        border-radius: var(--nxt1-radius-sm, 4px);
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

      /* 
       * Theme support handled by design tokens:
       * --nxt1-color-loading-skeleton changes per theme
       * No manual overrides needed for light/dark/sport themes
       */

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .activity-skeleton__avatar,
        .activity-skeleton__title,
        .activity-skeleton__time,
        .activity-skeleton__body,
        .activity-skeleton__source,
        .activity-skeleton__dot {
          animation: none;
          opacity: 0.6;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivitySkeletonComponent {}
