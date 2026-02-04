/**
 * @fileoverview Feed Skeleton Component
 * @module @nxt1/ui/feed
 * @version 1.0.0
 *
 * Loading skeleton for feed posts.
 * Professional skeleton animation for better perceived performance.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-feed-skeleton variant="post" />
 * <nxt1-feed-skeleton variant="post-with-media" />
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type FeedSkeletonVariant = 'post' | 'post-with-media' | 'compact';

@Component({
  selector: 'nxt1-feed-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="feed-skeleton" [class]="'feed-skeleton--' + variant()">
      <!-- Header Skeleton -->
      <div class="feed-skeleton__header">
        <div class="feed-skeleton__avatar"></div>
        <div class="feed-skeleton__author">
          <div class="feed-skeleton__name"></div>
          <div class="feed-skeleton__meta"></div>
        </div>
      </div>

      <!-- Content Skeleton -->
      <div class="feed-skeleton__content">
        <div class="feed-skeleton__text feed-skeleton__text--full"></div>
        <div class="feed-skeleton__text feed-skeleton__text--full"></div>
        <div class="feed-skeleton__text feed-skeleton__text--partial"></div>
      </div>

      <!-- Media Skeleton (for post-with-media variant) -->
      @if (variant() === 'post-with-media') {
        <div class="feed-skeleton__media"></div>
      }

      <!-- Actions Skeleton -->
      <div class="feed-skeleton__actions">
        <div class="feed-skeleton__action"></div>
        <div class="feed-skeleton__action"></div>
        <div class="feed-skeleton__action"></div>
        <div class="feed-skeleton__action feed-skeleton__action--right"></div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         FEED SKELETON - Loading State
         2026 Professional Animation
         ============================================ */

      :host {
        display: block;

        --skeleton-bg: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --skeleton-shimmer: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        --skeleton-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .feed-skeleton {
        padding: 16px;
        border-bottom: 1px solid var(--skeleton-border);

        @media (min-width: 768px) {
          padding: 20px 24px;
          border-radius: var(--nxt1-radius-lg, 12px);
          margin-bottom: 12px;
          border: 1px solid var(--skeleton-border);
        }
      }

      .feed-skeleton--compact {
        padding: 12px 16px;
      }

      /* ============================================
         HEADER
         ============================================ */

      .feed-skeleton__header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 12px;
      }

      .feed-skeleton__avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--skeleton-bg);
        flex-shrink: 0;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }

      .feed-skeleton__author {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .feed-skeleton__name {
        width: 140px;
        height: 16px;
        background: var(--skeleton-bg);
        border-radius: 4px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
        animation-delay: 0.1s;
      }

      .feed-skeleton__meta {
        width: 200px;
        height: 12px;
        background: var(--skeleton-bg);
        border-radius: 4px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
        animation-delay: 0.2s;
      }

      /* ============================================
         CONTENT
         ============================================ */

      .feed-skeleton__content {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
      }

      .feed-skeleton__text {
        height: 14px;
        background: var(--skeleton-bg);
        border-radius: 4px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }

      .feed-skeleton__text--full {
        width: 100%;
        animation-delay: 0.3s;
      }

      .feed-skeleton__text--partial {
        width: 65%;
        animation-delay: 0.4s;
      }

      /* ============================================
         MEDIA
         ============================================ */

      .feed-skeleton__media {
        aspect-ratio: 16 / 9;
        background: var(--skeleton-bg);
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-bottom: 12px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
        animation-delay: 0.5s;
      }

      /* ============================================
         ACTIONS
         ============================================ */

      .feed-skeleton__actions {
        display: flex;
        align-items: center;
        gap: 24px;
        padding-top: 12px;
        border-top: 1px solid var(--skeleton-border);
      }

      .feed-skeleton__action {
        width: 48px;
        height: 20px;
        background: var(--skeleton-bg);
        border-radius: 4px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
        animation-delay: 0.6s;
      }

      .feed-skeleton__action--right {
        margin-left: auto;
        width: 24px;
      }

      /* ============================================
         ANIMATION
         ============================================ */

      @keyframes skeleton-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }

      /* Shimmer effect for premium feel */
      @keyframes skeleton-shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      /* Apply shimmer to all skeleton elements */
      .feed-skeleton__avatar,
      .feed-skeleton__name,
      .feed-skeleton__meta,
      .feed-skeleton__text,
      .feed-skeleton__media,
      .feed-skeleton__action {
        background: linear-gradient(
          90deg,
          var(--skeleton-bg) 25%,
          var(--skeleton-shimmer) 50%,
          var(--skeleton-bg) 75%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s ease-in-out infinite;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedSkeletonComponent {
  readonly variant = input<FeedSkeletonVariant>('post');
}
