/**
 * @fileoverview News Skeleton Component - Loading State
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * Skeleton loading placeholder for news article cards.
 * Matches the layout of NewsArticleCardComponent for seamless transitions.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Architecture (2026 Best Practices):
 * - Uses global skeleton animation from @nxt1/ui/styles
 * - Component owns layout/structure only
 * - Global CSS custom properties for skeleton colors
 * - Accessible (aria-hidden, reduced motion support)
 *
 * @example
 * ```html
 * @for (i of [1,2,3,4,5,6]; track i) {
 *   <nxt1-news-skeleton />
 * }
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type NewsSkeletonVariant = 'card' | 'featured' | 'compact';

@Component({
  selector: 'nxt1-news-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="news-skeleton"
      [class.news-skeleton--featured]="variant() === 'featured'"
      [class.news-skeleton--compact]="variant() === 'compact'"
      aria-hidden="true"
    >
      <!-- Hero Image Skeleton -->
      <div class="news-skeleton__image"></div>

      <!-- Content Area -->
      <div class="news-skeleton__content">
        <!-- Category Chip -->
        <div class="news-skeleton__chip"></div>

        <!-- Title Lines -->
        <div class="news-skeleton__title"></div>
        <div class="news-skeleton__title news-skeleton__title--short"></div>

        <!-- Excerpt Lines -->
        @if (variant() !== 'compact') {
          <div class="news-skeleton__excerpt"></div>
          <div class="news-skeleton__excerpt"></div>
          <div class="news-skeleton__excerpt news-skeleton__excerpt--short"></div>
        }

        <!-- Metadata Bar -->
        <div class="news-skeleton__meta">
          <div class="news-skeleton__avatar"></div>
          <div class="news-skeleton__meta-text"></div>
          <div class="news-skeleton__meta-text news-skeleton__meta-text--short"></div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         NEWS SKELETON - Loading Placeholder
         Uses global skeleton animation from @nxt1/ui/styles
         100% Theme Aware (Light + Dark Mode)
         ============================================ */

      :host {
        display: block;
      }

      /* Container - Card layout */
      .news-skeleton {
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-radius-lg, 16px);
        overflow: hidden;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      /* Shimmer effect - uses global animation and design tokens */
      .news-skeleton__image,
      .news-skeleton__chip,
      .news-skeleton__title,
      .news-skeleton__excerpt,
      .news-skeleton__avatar,
      .news-skeleton__meta-text {
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

      /* Hero Image */
      .news-skeleton__image {
        width: 100%;
        aspect-ratio: 16 / 9;
        border-radius: 0;
      }

      /* Content Area */
      .news-skeleton__content {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Category Chip */
      .news-skeleton__chip {
        width: 80px;
        height: 24px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* Title */
      .news-skeleton__title {
        height: 20px;
        width: 100%;
      }

      .news-skeleton__title--short {
        width: 75%;
      }

      /* Excerpt */
      .news-skeleton__excerpt {
        height: 16px;
        width: 100%;
      }

      .news-skeleton__excerpt--short {
        width: 60%;
      }

      /* Metadata Bar */
      .news-skeleton__meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
      }

      .news-skeleton__avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .news-skeleton__meta-text {
        height: 14px;
        width: 80px;
      }

      .news-skeleton__meta-text--short {
        width: 50px;
      }

      /* ============================================
         FEATURED VARIANT - Larger card
         ============================================ */

      .news-skeleton--featured .news-skeleton__image {
        aspect-ratio: 2 / 1;
      }

      .news-skeleton--featured .news-skeleton__content {
        padding: 20px;
        gap: 14px;
      }

      .news-skeleton--featured .news-skeleton__title {
        height: 24px;
      }

      /* ============================================
         COMPACT VARIANT - Horizontal layout
         ============================================ */

      .news-skeleton--compact {
        flex-direction: row;
        align-items: center;
      }

      .news-skeleton--compact .news-skeleton__image {
        width: 100px;
        height: 100px;
        aspect-ratio: 1;
        flex-shrink: 0;
        border-radius: var(--nxt1-radius-md, 12px);
        margin: 12px;
      }

      .news-skeleton--compact .news-skeleton__content {
        padding: 12px;
        padding-left: 0;
        gap: 8px;
      }

      .news-skeleton--compact .news-skeleton__title {
        height: 16px;
      }

      /* ============================================
         GLOBAL KEYFRAMES (if not defined globally)
         ============================================ */

      @keyframes skeleton-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .news-skeleton__image,
        .news-skeleton__chip,
        .news-skeleton__title,
        .news-skeleton__excerpt,
        .news-skeleton__avatar,
        .news-skeleton__meta-text {
          animation: none;
          background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsSkeletonComponent {
  /** Skeleton variant: 'card' (default), 'featured', or 'compact' */
  readonly variant = input<NewsSkeletonVariant>('card');
}
