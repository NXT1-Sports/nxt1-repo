/**
 * @fileoverview Edit Profile Skeleton Component
 * @module @nxt1/ui/edit-profile
 * @version 1.0.0
 *
 * Skeleton loading state for Edit Profile feature.
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
 * <nxt1-edit-profile-skeleton />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-edit-profile-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-container">
      <!-- Progress Ring Skeleton -->
      <div class="progress-skeleton">
        <div class="ring-skeleton shimmer"></div>
        <div class="xp-bar-skeleton shimmer"></div>
        <div class="tier-skeleton shimmer"></div>
      </div>

      <!-- Quick Stats Skeleton -->
      <div class="stats-skeleton">
        <div class="stat-skeleton shimmer"></div>
        <div class="stat-skeleton shimmer"></div>
        <div class="stat-skeleton shimmer"></div>
      </div>

      <!-- Section Skeletons -->
      <div class="sections-skeleton">
        @for (i of [1, 2, 3, 4, 5]; track i) {
          <div class="section-skeleton shimmer" [style.animation-delay]="i * 0.1 + 's'"></div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       EDIT PROFILE SKELETON
       ============================================ */

      :host {
        display: block;
      }

      .skeleton-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-4);
      }

      /* Shimmer Animation - Uses global design tokens (2026 Theme-Aware) */
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
         PROGRESS SKELETON
         ============================================ */

      .progress-skeleton {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
      }

      .ring-skeleton {
        width: 140px;
        height: 140px;
        border-radius: var(--nxt1-radius-full);
      }

      .xp-bar-skeleton {
        width: 100%;
        height: 32px;
        border-radius: var(--nxt1-radius-lg);
      }

      .tier-skeleton {
        width: 200px;
        height: 44px;
        border-radius: var(--nxt1-radius-lg);
      }

      /* ============================================
         STATS SKELETON
         ============================================ */

      .stats-skeleton {
        display: flex;
        justify-content: space-around;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
      }

      .stat-skeleton {
        width: 60px;
        height: 48px;
        border-radius: var(--nxt1-radius-md);
      }

      /* ============================================
         SECTIONS SKELETON
         ============================================ */

      .sections-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .section-skeleton {
        height: 80px;
        border-radius: var(--nxt1-radius-xl);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProfileSkeletonComponent {}
