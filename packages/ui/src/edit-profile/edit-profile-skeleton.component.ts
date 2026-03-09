/**
 * @fileoverview Edit Profile Skeleton Component
 * @module @nxt1/ui/edit-profile
 * @version 2.0.0
 *
 * Skeleton loading state for Edit Profile.
 * Mirrors the exact layout: media gallery, Connected accounts (1 row button),
 * About you (4 rows), Sports info (2 rows), Physical (2 rows).
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'nxt1-edit-profile-skeleton',
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

      <!-- Connected accounts -->
      <div class="skeleton-section">
        <div class="skeleton-section-header shimmer"></div>
        <div class="skeleton-list-group">
          <div class="skeleton-row">
            <div class="skeleton-label shimmer"></div>
            <div class="skeleton-value shimmer"></div>
          </div>
        </div>
      </div>

      <!-- About you -->
      <div class="skeleton-section">
        <div class="skeleton-section-header shimmer"></div>
        <div class="skeleton-list-group">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="skeleton-row" [style.animation-delay]="i * 0.08 + 's'">
              <div class="skeleton-label shimmer"></div>
              <div class="skeleton-value shimmer"></div>
            </div>
          }
        </div>
      </div>

      <!-- Sports info -->
      <div class="skeleton-section">
        <div class="skeleton-section-header shimmer"></div>
        <div class="skeleton-list-group">
          @for (i of [1, 2]; track i) {
            <div class="skeleton-row" [style.animation-delay]="(i + 4) * 0.08 + 's'">
              <div class="skeleton-label shimmer"></div>
              <div class="skeleton-value shimmer"></div>
            </div>
          }
        </div>
      </div>

      <!-- Physical -->
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

      .skeleton-source-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-1);
      }

      .skeleton-source-row:not(:last-child) {
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .skeleton-source-left {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .skeleton-source-icon {
        width: var(--nxt1-spacing-8);
        height: var(--nxt1-spacing-8);
        border-radius: var(--nxt1-borderRadius-lg);
        flex-shrink: 0;
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
export class EditProfileSkeletonComponent {}
