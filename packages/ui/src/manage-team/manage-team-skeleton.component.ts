/**
 * @fileoverview Manage Team Skeleton Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Skeleton loading state for Manage Team feature.
 * Shows animated placeholders while content is loading.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Animated shimmer effect
 * - Matches actual layout structure
 * - Theme-aware colors
 *
 * @example
 * ```html
 * <nxt1-manage-team-skeleton />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-manage-team-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-container">
      <!-- Header Skeleton -->
      <div class="header-skeleton">
        <div class="team-logo-skeleton shimmer"></div>
        <div class="team-info-skeleton">
          <div class="team-name-skeleton shimmer"></div>
          <div class="team-meta-skeleton shimmer"></div>
        </div>
        <div class="record-skeleton shimmer"></div>
      </div>

      <!-- Tabs Skeleton -->
      <div class="tabs-skeleton">
        @for (i of [1, 2, 3, 4, 5, 6]; track i) {
          <div class="tab-skeleton shimmer" [style.animation-delay]="i * 0.05 + 's'"></div>
        }
      </div>

      <!-- Quick Stats Skeleton -->
      <div class="stats-row-skeleton">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="stat-card-skeleton shimmer" [style.animation-delay]="i * 0.1 + 's'"></div>
        }
      </div>

      <!-- Content Skeleton -->
      <div class="content-skeleton">
        <!-- Section Cards -->
        @for (i of [1, 2, 3]; track i) {
          <div class="section-card-skeleton" [style.animation-delay]="i * 0.15 + 's'">
            <div class="section-header-skeleton">
              <div class="section-icon-skeleton shimmer"></div>
              <div class="section-title-skeleton shimmer"></div>
              <div class="section-arrow-skeleton shimmer"></div>
            </div>
          </div>
        }

        <!-- List Items -->
        <div class="list-skeleton">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="list-item-skeleton shimmer" [style.animation-delay]="i * 0.1 + 's'"></div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       MANAGE TEAM SKELETON - Loading States
       2026 Theme-Aware Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .skeleton-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
      }

      /* Shimmer Animation */
      .shimmer {
        background: linear-gradient(
          90deg,
          var(--nxt1-color-loading-skeleton) 0%,
          var(--nxt1-color-loading-skeletonShimmer) 50%,
          var(--nxt1-color-loading-skeleton) 100%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s infinite ease-in-out;
      }

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
        .shimmer {
          animation: none;
          background: var(--nxt1-color-loading-skeleton);
        }
      }

      /* ============================================
         HEADER SKELETON
         ============================================ */

      .header-skeleton {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
      }

      .team-logo-skeleton {
        width: 64px;
        height: 64px;
        border-radius: var(--nxt1-radius-lg);
        flex-shrink: 0;
      }

      .team-info-skeleton {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .team-name-skeleton {
        width: 180px;
        height: 24px;
        border-radius: var(--nxt1-radius-md);
      }

      .team-meta-skeleton {
        width: 120px;
        height: 16px;
        border-radius: var(--nxt1-radius-md);
      }

      .record-skeleton {
        width: 60px;
        height: 32px;
        border-radius: var(--nxt1-radius-md);
      }

      /* ============================================
         TABS SKELETON
         ============================================ */

      .tabs-skeleton {
        display: flex;
        gap: var(--nxt1-spacing-2);
        overflow-x: auto;
        padding: var(--nxt1-spacing-2) 0;
        scrollbar-width: none;
        -ms-overflow-style: none;

        &::-webkit-scrollbar {
          display: none;
        }
      }

      .tab-skeleton {
        width: 80px;
        height: 36px;
        border-radius: var(--nxt1-radius-full);
        flex-shrink: 0;
      }

      /* ============================================
         STATS ROW SKELETON
         ============================================ */

      .stats-row-skeleton {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      .stat-card-skeleton {
        height: 72px;
        border-radius: var(--nxt1-radius-lg);
      }

      @media (max-width: 640px) {
        .stats-row-skeleton {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* ============================================
         CONTENT SKELETON
         ============================================ */

      .content-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .section-card-skeleton {
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        padding: var(--nxt1-spacing-4);
      }

      .section-header-skeleton {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .section-icon-skeleton {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-lg);
      }

      .section-title-skeleton {
        flex: 1;
        height: 20px;
        border-radius: var(--nxt1-radius-md);
      }

      .section-arrow-skeleton {
        width: 24px;
        height: 24px;
        border-radius: var(--nxt1-radius-full);
      }

      /* ============================================
         LIST SKELETON
         ============================================ */

      .list-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        margin-top: var(--nxt1-spacing-4);
      }

      .list-item-skeleton {
        height: 64px;
        border-radius: var(--nxt1-radius-lg);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamSkeletonComponent {}
