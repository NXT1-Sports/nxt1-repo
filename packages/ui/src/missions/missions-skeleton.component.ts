/**
 * @fileoverview Missions Skeleton Component - Loading States
 * @module @nxt1/ui/missions
 * @version 1.0.0
 *
 * Loading skeleton components for missions feature.
 * Provides visual feedback during data loading.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Progress ring skeleton
 * - Category skeleton
 * - Mission item skeleton
 * - Shimmer animations
 *
 * @example
 * ```html
 * <nxt1-missions-skeleton />
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-missions-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="skeleton-container">
      <!-- Progress Ring Skeleton -->
      @if (showProgress()) {
        <div class="skeleton-progress">
          <div class="skeleton-ring skeleton-shimmer"></div>
          <div class="skeleton-progress-info">
            <div class="skeleton-text skeleton-text--lg skeleton-shimmer"></div>
            <div class="skeleton-text skeleton-text--md skeleton-shimmer"></div>
            <div class="skeleton-text skeleton-text--sm skeleton-shimmer"></div>
          </div>
        </div>
      }

      <!-- Categories Skeleton -->
      <div class="skeleton-categories">
        @for (i of categoryCount; track i) {
          <div class="skeleton-category">
            <!-- Category Header -->
            <div class="skeleton-category-header">
              <div class="skeleton-icon skeleton-shimmer"></div>
              <div class="skeleton-category-text">
                <div class="skeleton-text skeleton-text--md skeleton-shimmer"></div>
                <div class="skeleton-text skeleton-text--sm skeleton-shimmer"></div>
              </div>
              <div class="skeleton-chevron skeleton-shimmer"></div>
            </div>

            <!-- Category Progress Bar -->
            <div class="skeleton-progress-bar skeleton-shimmer"></div>

            <!-- Mission Items (only show for first category) -->
            @if (i === 0) {
              <div class="skeleton-missions">
                @for (j of missionCount; track j) {
                  <div class="skeleton-mission">
                    <div class="skeleton-checkbox skeleton-shimmer"></div>
                    <div class="skeleton-mission-content">
                      <div class="skeleton-text skeleton-text--md skeleton-shimmer"></div>
                      <div class="skeleton-text skeleton-text--sm skeleton-shimmer"></div>
                    </div>
                    <div class="skeleton-points skeleton-shimmer"></div>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       MISSIONS SKELETON
       Loading state with shimmer animations
       ============================================ */

      :host {
        display: block;
      }

      .skeleton-container {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      /* ============================================
       SHIMMER ANIMATION
       ============================================ */

      .skeleton-shimmer {
        position: relative;
        overflow: hidden;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .skeleton-shimmer::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.08) 50%,
          transparent 100%
        );
        animation: shimmer 1.5s infinite;
      }

      @keyframes shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      /* ============================================
       PROGRESS SKELETON
       ============================================ */

      .skeleton-progress {
        display: flex;
        align-items: center;
        gap: 24px;
        padding: 20px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-ui-radius-xl, 16px);
      }

      .skeleton-ring {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .skeleton-progress-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* ============================================
       TEXT SKELETONS
       ============================================ */

      .skeleton-text {
        border-radius: var(--nxt1-ui-radius-sm, 4px);
      }

      .skeleton-text--sm {
        width: 60%;
        height: 12px;
      }

      .skeleton-text--md {
        width: 80%;
        height: 16px;
      }

      .skeleton-text--lg {
        width: 50%;
        height: 24px;
      }

      /* ============================================
       CATEGORY SKELETON
       ============================================ */

      .skeleton-categories {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .skeleton-category {
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        overflow: hidden;
      }

      .skeleton-category-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
      }

      .skeleton-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        flex-shrink: 0;
      }

      .skeleton-category-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .skeleton-chevron {
        width: 20px;
        height: 20px;
        border-radius: 50%;
      }

      .skeleton-progress-bar {
        height: 4px;
        margin: 0 16px 12px;
        border-radius: 2px;
      }

      /* ============================================
       MISSION ITEMS SKELETON
       ============================================ */

      .skeleton-missions {
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        padding: 8px;
      }

      .skeleton-mission {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
      }

      .skeleton-checkbox {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .skeleton-mission-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .skeleton-mission-content .skeleton-text--md {
        width: 70%;
      }

      .skeleton-mission-content .skeleton-text--sm {
        width: 90%;
      }

      .skeleton-points {
        width: 50px;
        height: 24px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionsSkeletonComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Whether to show progress skeleton */
  readonly showProgress = input<boolean>(true);

  // ============================================
  // COMPONENT DATA
  // ============================================

  /** Number of category skeletons */
  readonly categoryCount = [0, 1, 2, 3];

  /** Number of mission skeletons per expanded category */
  readonly missionCount = [0, 1, 2];
}

// ============================================
// INDIVIDUAL SKELETON COMPONENTS
// ============================================

@Component({
  selector: 'nxt1-missions-progress-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress-skeleton">
      <div class="skeleton-shimmer ring"></div>
      <div class="info">
        <div class="text text--lg skeleton-shimmer"></div>
        <div class="text text--md skeleton-shimmer"></div>
        <div class="text text--sm skeleton-shimmer"></div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .progress-skeleton {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 20px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-ui-radius-xl, 16px);
      }

      .ring {
        width: 90px;
        height: 90px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .text {
        border-radius: 4px;
      }

      .text--sm {
        width: 50%;
        height: 12px;
      }

      .text--md {
        width: 70%;
        height: 14px;
      }

      .text--lg {
        width: 40%;
        height: 22px;
      }

      .skeleton-shimmer {
        position: relative;
        overflow: hidden;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .skeleton-shimmer::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.08) 50%,
          transparent 100%
        );
        animation: shimmer 1.5s infinite;
      }

      @keyframes shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionsProgressSkeletonComponent {}

@Component({
  selector: 'nxt1-missions-item-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="item-skeleton">
      <div class="checkbox skeleton-shimmer"></div>
      <div class="content">
        <div class="text text--md skeleton-shimmer"></div>
        <div class="text text--sm skeleton-shimmer"></div>
      </div>
      <div class="points skeleton-shimmer"></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .item-skeleton {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px;
      }

      .checkbox {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .text {
        border-radius: 4px;
      }

      .text--sm {
        width: 85%;
        height: 12px;
      }

      .text--md {
        width: 65%;
        height: 14px;
      }

      .points {
        width: 48px;
        height: 24px;
        border-radius: 9999px;
        flex-shrink: 0;
      }

      .skeleton-shimmer {
        position: relative;
        overflow: hidden;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .skeleton-shimmer::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.08) 50%,
          transparent 100%
        );
        animation: shimmer 1.5s infinite;
      }

      @keyframes shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionsItemSkeletonComponent {}
