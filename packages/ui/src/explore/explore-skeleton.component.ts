/**
 * @fileoverview Explore Skeleton Component - Loading State
 * @module @nxt1/ui/explore
 * @version 2.0.0
 *
 * Skeleton loading placeholder for explore items.
 * Provides shimmer animation while content loads.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Architecture (2026 Best Practices):
 * - Uses global skeleton animation from @nxt1/ui/styles/base/skeleton.css
 * - Component owns layout/structure only
 * - Global CSS custom properties for skeleton colors
 * - Light mode support via global tokens
 * - Accessible (aria-hidden, reduced motion support)
 *
 * @example
 * ```html
 * @for (i of [1,2,3,4,5,6]; track i) {
 *   <nxt1-explore-skeleton />
 * }
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-explore-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="explore-skeleton" aria-hidden="true">
      <!-- Avatar skeleton -->
      <div class="explore-skeleton__avatar"></div>

      <!-- Content skeleton -->
      <div class="explore-skeleton__content">
        <div class="explore-skeleton__title"></div>
        <div class="explore-skeleton__subtitle"></div>
        <div class="explore-skeleton__meta"></div>
      </div>

      <!-- Action skeleton -->
      <div class="explore-skeleton__action"></div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         EXPLORE SKELETON - Loading Placeholder
         Uses global skeleton animation from @nxt1/ui/styles
         ============================================ */

      :host {
        display: block;
      }

      /* Container layout - matches ExploreItemComponent */
      .explore-skeleton {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-bottom: var(--nxt1-spacing-2, 8px);
      }

      /* Shimmer effect - uses global animation and design tokens */
      .explore-skeleton__avatar,
      .explore-skeleton__title,
      .explore-skeleton__subtitle,
      .explore-skeleton__meta,
      .explore-skeleton__action {
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
      }

      /* Avatar */
      .explore-skeleton__avatar {
        width: 56px;
        height: 56px;
        flex-shrink: 0;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* Content */
      .explore-skeleton__content {
        flex: 1;
        min-width: 0;
      }

      .explore-skeleton__title {
        height: 16px;
        width: 70%;
        border-radius: var(--nxt1-radius-sm, 4px);
        margin-bottom: var(--nxt1-spacing-2, 8px);
      }

      .explore-skeleton__subtitle {
        height: 12px;
        width: 50%;
        border-radius: var(--nxt1-radius-sm, 4px);
        animation-delay: 0.1s;
        margin-bottom: var(--nxt1-spacing-1, 4px);
      }

      .explore-skeleton__meta {
        height: 10px;
        width: 30%;
        border-radius: var(--nxt1-radius-sm, 4px);
        animation-delay: 0.2s;
      }

      /* Action */
      .explore-skeleton__action {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        border-radius: var(--nxt1-radius-sm, 4px);
        animation-delay: 0.3s;
      }

      /* 
       * Theme support handled by design tokens:
       * --nxt1-color-loading-skeleton changes per theme
       * No manual overrides needed for light/dark/sport themes
       */

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .explore-skeleton__avatar,
        .explore-skeleton__title,
        .explore-skeleton__subtitle,
        .explore-skeleton__meta,
        .explore-skeleton__action {
          animation: none;
          opacity: 0.6;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreSkeletonComponent {}
