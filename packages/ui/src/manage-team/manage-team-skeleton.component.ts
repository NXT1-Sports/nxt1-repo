/**
 * @fileoverview Manage Team Skeleton Component
 * @module @nxt1/ui/manage-team
 * @version 3.0.0
 *
 * Skeleton loading state for Manage Team.
 * Mirrors the exact layout: Media Gallery, Plan (1 row),
 * Connected accounts (1 row), About Info (4 rows),
 * Staff (1 row), Contact (2 rows), Roster (1 row), Stats (1 row).
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'nxt1-manage-team-skeleton',
  standalone: true,
  template: `
    <div class="skeleton-container">
      <!-- Media Gallery -->
      <div class="skeleton-media">
        <div class="skeleton-tile shimmer"></div>
        <div class="skeleton-tile shimmer"></div>
        <div class="skeleton-tile shimmer"></div>
        <div class="skeleton-tile-add shimmer"></div>
      </div>

      <!-- Connected accounts (1 row) -->
      <div class="skeleton-section">
        <div class="skeleton-section-header shimmer"></div>
        <div class="skeleton-list-group">
          <div class="skeleton-row" style="animation-delay: 0.08s">
            <div class="skeleton-label shimmer"></div>
            <div class="skeleton-value shimmer"></div>
          </div>
        </div>
      </div>

      <!-- About Info (4 rows) -->
      <div class="skeleton-section">
        <div class="skeleton-section-header shimmer"></div>
        <div class="skeleton-list-group">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-row" [style.animation-delay]="(i + 1) * 0.08 + 's'">
              <div class="skeleton-label shimmer"></div>
              <div class="skeleton-value shimmer"></div>
            </div>
          }
        </div>
      </div>

      <!-- Staff (1 row) -->
      <div class="skeleton-section">
        <div class="skeleton-section-header shimmer"></div>
        <div class="skeleton-list-group">
          <div class="skeleton-row" style="animation-delay: 0.48s">
            <div class="skeleton-label shimmer"></div>
            <div class="skeleton-value shimmer"></div>
          </div>
        </div>
      </div>

      <!-- Contact info (2 rows) -->
      <div class="skeleton-section">
        <div class="skeleton-section-header shimmer"></div>
        <div class="skeleton-list-group">
          @for (i of [1, 2]; track i) {
            <div class="skeleton-row" [style.animation-delay]="(i + 6) * 0.08 + 's'">
              <div class="skeleton-label shimmer"></div>
              <div class="skeleton-value shimmer"></div>
            </div>
          }
        </div>
      </div>

      <!-- Roster (1 row) -->
      <div class="skeleton-section">
        <div class="skeleton-section-header shimmer"></div>
        <div class="skeleton-list-group">
          <div class="skeleton-row" style="animation-delay: 0.72s">
            <div class="skeleton-label shimmer"></div>
            <div class="skeleton-value shimmer"></div>
          </div>
        </div>
      </div>

      <!-- Stats (1 row) -->
      <div class="skeleton-section">
        <div class="skeleton-section-header shimmer"></div>
        <div class="skeleton-list-group">
          <div class="skeleton-row" style="animation-delay: 0.80s">
            <div class="skeleton-label shimmer"></div>
            <div class="skeleton-value shimmer"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .skeleton-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-4) var(--nxt1-spacing-8);
      }

      /* Shimmer animation — theme-aware design tokens */
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

      @media (prefers-reduced-motion: reduce) {
        .shimmer {
          animation: none;
          background: var(--nxt1-color-loading-skeleton);
        }
      }

      /* ============================================
         MEDIA GALLERY SKELETON
         ============================================ */
      .skeleton-media {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: var(--nxt1-spacing-20);
        gap: var(--nxt1-spacing-2);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-3);
        overflow: hidden;
      }

      .skeleton-tile {
        width: var(--nxt1-spacing-20);
        height: var(--nxt1-spacing-24);
        border-radius: var(--nxt1-borderRadius-lg);
      }

      .skeleton-tile-add {
        width: var(--nxt1-spacing-20);
        height: var(--nxt1-spacing-24);
        border-radius: var(--nxt1-borderRadius-lg);
        opacity: 0.5;
      }

      /* ============================================
         LIST SECTION SKELETON
         ============================================ */
      .skeleton-section {
        display: flex;
        flex-direction: column;
      }

      .skeleton-section-header {
        width: 80px;
        height: 14px;
        border-radius: var(--nxt1-borderRadius-sm);
        margin: 0 var(--nxt1-spacing-1);
        margin-bottom: var(--nxt1-spacing-2);
      }

      .skeleton-list-group {
        display: flex;
        flex-direction: column;
      }

      .skeleton-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-1);
      }

      .skeleton-row:not(:last-child) {
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .skeleton-label {
        width: 72px;
        height: 16px;
        border-radius: var(--nxt1-borderRadius-sm);
        flex-shrink: 0;
      }

      .skeleton-value {
        width: 120px;
        height: 16px;
        border-radius: var(--nxt1-borderRadius-sm);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamSkeletonComponent {}
