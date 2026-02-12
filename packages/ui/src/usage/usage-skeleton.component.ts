/**
 * @fileoverview Usage Dashboard Skeleton — Loading State
 * @module @nxt1/ui/usage
 *
 * Professional skeleton loading state matching the dashboard two-panel layout.
 * Desktop: sidebar nav skeleton + content panel skeleton.
 * Mobile: horizontal scroll tabs skeleton + content skeleton.
 *
 * Uses shimmer animation matching all other NXT1 skeleton components.
 * 100% design-token based — zero hardcoded values.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-usage-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-layout" aria-hidden="true" role="presentation">
      <!-- Sidebar Nav Skeleton (Desktop) / Tab Nav Skeleton (Mobile) -->
      <nav class="skeleton-nav">
        @for (i of [1, 2, 3, 4, 5, 6]; track i) {
          <div class="skeleton-nav-item shimmer" [style.animation-delay]="i * 0.05 + 's'">
            <div class="skel skel--nav-label" [style.width.%]="navWidths[i - 1]"></div>
          </div>
        }
      </nav>

      <!-- Content Panel Skeleton -->
      <div class="skeleton-content">
        <!-- Overview Cards (3 cards) -->
        <div class="skeleton-overview">
          @for (i of [1, 2, 3]; track i) {
            <div class="skeleton-card" [style.animation-delay]="i * 0.1 + 's'">
              <div class="skel skel--label shimmer"></div>
              <div class="skel skel--value shimmer"></div>
              <div class="skel skel--meta shimmer"></div>
              <div class="skel skel--link shimmer"></div>
            </div>
          }
        </div>

        <!-- Subscriptions Section -->
        <div class="skeleton-section" style="animation-delay: 0.4s">
          <div class="skel skel--section-title shimmer"></div>
          <div class="skeleton-sub-cards">
            @for (i of [1, 2]; track i) {
              <div class="skeleton-sub-card" [style.animation-delay]="0.45 + i * 0.1 + 's'">
                <div class="skeleton-sub-header">
                  <div class="skel skel--sub-name shimmer"></div>
                  <div class="skel skel--sub-badge shimmer"></div>
                </div>
                <div class="skel skel--sub-price shimmer"></div>
                <div class="skel skel--sub-detail shimmer"></div>
                <div class="skel skel--sub-link shimmer"></div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       SKELETON SHIMMER ANIMATION
       Matches all other NXT1 skeleton components
       ============================================ */

      @keyframes skeleton-shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      /* ==============================
       TWO-PANEL LAYOUT (matches shell)
       ============================== */

      .skeleton-layout {
        display: grid;
        grid-template-columns: 200px 1fr;
        gap: var(--nxt1-spacing-8);
        align-items: start;
      }

      /* ==============================
       SHIMMER BASE
       ============================== */

      .skel {
        border-radius: var(--nxt1-radius-sm, 4px);
        background: linear-gradient(
          90deg,
          var(--nxt1-color-loading-skeleton) 25%,
          var(--nxt1-color-loading-skeletonShimmer) 50%,
          var(--nxt1-color-loading-skeleton) 75%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer var(--nxt1-skeleton-animation-duration, 1.5s)
          var(--nxt1-skeleton-animation-timing, ease-in-out) infinite;
      }

      /* ==============================
       SIDEBAR NAV SKELETON
       ============================== */

      .skeleton-nav {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0-5);
        position: sticky;
        top: var(--nxt1-spacing-6);
      }

      .skeleton-nav-item {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-radius-md, 8px);
      }

      .skel--nav-label {
        height: var(--nxt1-skeleton-height-sm, 14px);
      }

      /* ==============================
       OVERVIEW CARDS
       ============================== */

      .skeleton-overview {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-4);
      }

      .skeleton-card {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: var(--nxt1-spacing-5);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .skel--label {
        height: var(--nxt1-skeleton-height-xs, 12px);
        width: 40%;
      }

      .skel--value {
        height: var(--nxt1-skeleton-height-xl, 28px);
        width: 55%;
      }

      .skel--meta {
        height: var(--nxt1-skeleton-height-sm, 14px);
        width: 70%;
      }

      .skel--link {
        height: var(--nxt1-skeleton-height-sm, 14px);
        width: 35%;
        margin-top: var(--nxt1-spacing-1);
      }

      /* ==============================
       SUBSCRIPTIONS SECTION
       ============================== */

      .skeleton-section {
        margin-top: var(--nxt1-spacing-8);
      }

      .skel--section-title {
        height: var(--nxt1-skeleton-height-lg, 20px);
        width: 30%;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .skeleton-sub-cards {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      .skeleton-sub-card {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: var(--nxt1-spacing-5);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2-5);
      }

      .skeleton-sub-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .skel--sub-name {
        height: var(--nxt1-skeleton-height-md, 16px);
        width: 45%;
      }

      .skel--sub-badge {
        height: var(--nxt1-skeleton-height-sm, 14px);
        width: var(--nxt1-spacing-14);
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .skel--sub-price {
        height: var(--nxt1-skeleton-height-xl, 28px);
        width: 30%;
      }

      .skel--sub-detail {
        height: var(--nxt1-skeleton-height-sm, 14px);
        width: 60%;
      }

      .skel--sub-link {
        height: var(--nxt1-skeleton-height-sm, 14px);
        width: 25%;
        margin-top: var(--nxt1-spacing-1);
      }

      /* ==============================
       MOBILE: Horizontal tabs + stacked
       ============================== */

      @media (max-width: 768px) {
        .skeleton-layout {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-4);
        }

        .skeleton-nav {
          flex-direction: row;
          overflow-x: auto;
          gap: var(--nxt1-spacing-2);
          position: static;
          padding-bottom: var(--nxt1-spacing-3);
          border-bottom: 1px solid var(--nxt1-color-border-subtle);
          scrollbar-width: none;
        }

        .skeleton-nav::-webkit-scrollbar {
          display: none;
        }

        .skeleton-nav-item {
          flex-shrink: 0;
          width: var(--nxt1-spacing-24);
          padding: var(--nxt1-spacing-1-5) var(--nxt1-spacing-3);
          border-radius: var(--nxt1-radius-full, 9999px);
          background: var(--nxt1-color-surface-100);
          border: 1px solid var(--nxt1-color-border-subtle);
        }

        .skeleton-overview {
          grid-template-columns: 1fr;
        }
      }

      /* ==============================
       REDUCED MOTION
       ============================== */

      @media (prefers-reduced-motion: reduce) {
        .skel {
          animation: none;
          background: var(--nxt1-color-loading-skeleton);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageSkeletonComponent {
  /** Nav label widths for visual variety (percentages) */
  protected readonly navWidths = [65, 80, 55, 90, 70, 75];
}
