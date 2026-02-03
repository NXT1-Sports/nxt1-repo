/**
 * @fileoverview Scout Report Skeleton Component - Loading State
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Skeleton loading placeholder for scout report cards.
 * Provides visual feedback during data loading.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-scout-report-skeleton [viewMode]="'grid'" />
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ScoutReportViewMode } from '@nxt1/core';

@Component({
  selector: 'nxt1-scout-report-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="skeleton-card"
      [class.skeleton-card--grid]="viewMode() === 'grid'"
      [class.skeleton-card--list]="viewMode() === 'list'"
      [class.skeleton-card--compact]="viewMode() === 'compact'"
      role="progressbar"
      aria-label="Loading scout report"
    >
      <!-- Image placeholder -->
      <div class="skeleton-card__image">
        <div class="skeleton-shimmer"></div>
      </div>

      <!-- Content placeholder -->
      <div class="skeleton-card__content">
        <!-- Name -->
        <div class="skeleton-card__name">
          <div class="skeleton-shimmer"></div>
        </div>

        <!-- Chips -->
        <div class="skeleton-card__chips">
          <div class="skeleton-card__chip">
            <div class="skeleton-shimmer"></div>
          </div>
          <div class="skeleton-card__chip">
            <div class="skeleton-shimmer"></div>
          </div>
        </div>

        @if (viewMode() !== 'compact') {
          <!-- Meta -->
          <div class="skeleton-card__meta">
            <div class="skeleton-shimmer"></div>
          </div>

          <!-- Stats -->
          <div class="skeleton-card__stats">
            <div class="skeleton-card__stat">
              <div class="skeleton-shimmer"></div>
            </div>
            <div class="skeleton-card__stat">
              <div class="skeleton-shimmer"></div>
            </div>
            <div class="skeleton-card__stat">
              <div class="skeleton-shimmer"></div>
            </div>
            <div class="skeleton-card__stat">
              <div class="skeleton-shimmer"></div>
            </div>
          </div>
        }

        <!-- Footer -->
        <div class="skeleton-card__footer">
          <div class="skeleton-card__footer-item">
            <div class="skeleton-shimmer"></div>
          </div>
          <div class="skeleton-card__footer-item">
            <div class="skeleton-shimmer"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         SKELETON CARD - Animation & Layout
         ============================================ */

      :host {
        display: block;
      }

      .skeleton-card {
        display: flex;
        flex-direction: column;
        background: var(--nxt1-skeleton-color-base);
        border: 1px solid var(--nxt1-color-border-secondary, rgba(255, 255, 255, 0.06));
        border-radius: var(--nxt1-skeleton-radius-xl);
        overflow: hidden;
      }

      /* List view */
      .skeleton-card--list {
        flex-direction: row;
        min-height: 180px;
      }

      .skeleton-card--list .skeleton-card__image {
        width: 140px;
        min-width: 140px;
        aspect-ratio: auto;
        height: 100%;
      }

      /* Compact view */
      .skeleton-card--compact {
        flex-direction: row;
        padding: var(--nxt1-spacing-3, 12px);
      }

      .skeleton-card--compact .skeleton-card__image {
        width: 60px;
        min-width: 60px;
        aspect-ratio: 3/4;
        border-radius: var(--nxt1-radius-md, 8px);
      }

      /* ============================================
         SHIMMER ANIMATION
         ============================================ */

      .skeleton-shimmer {
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          var(--nxt1-skeleton-color-base) 0%,
          var(--nxt1-skeleton-color-highlight) 25%,
          var(--nxt1-skeleton-color-accent) 50%,
          var(--nxt1-skeleton-color-highlight) 75%,
          var(--nxt1-skeleton-color-base) 100%
        );
        background-size: 200% 100%;
        animation: shimmer var(--nxt1-skeleton-animation-duration)
          var(--nxt1-skeleton-animation-timing) infinite;
        border-radius: inherit;
      }

      @keyframes shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      /* ============================================
         IMAGE PLACEHOLDER
         ============================================ */

      .skeleton-card__image {
        width: 100%;
        aspect-ratio: 3/4;
        background: var(--nxt1-skeleton-color-base);
      }

      /* ============================================
         CONTENT PLACEHOLDER
         ============================================ */

      .skeleton-card__content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3, 12px);
      }

      .skeleton-card--compact .skeleton-card__content {
        padding: 0 0 0 var(--nxt1-spacing-3, 12px);
        justify-content: center;
      }

      /* Name */
      .skeleton-card__name {
        height: var(--nxt1-skeleton-height-lg);
        width: 70%;
        border-radius: var(--nxt1-skeleton-radius-sm);
        overflow: hidden;
      }

      /* Chips */
      .skeleton-card__chips {
        display: flex;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .skeleton-card__chip {
        height: 22px;
        width: 50px;
        border-radius: var(--nxt1-skeleton-radius-full);
        overflow: hidden;
      }

      .skeleton-card__chip:last-child {
        width: 40px;
      }

      /* Meta */
      .skeleton-card__meta {
        height: var(--nxt1-skeleton-height-sm);
        width: 60%;
        border-radius: var(--nxt1-skeleton-radius-sm);
        overflow: hidden;
      }

      /* Stats */
      .skeleton-card__stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px);
        background: var(--nxt1-skeleton-color-base);
        border-radius: var(--nxt1-skeleton-radius-md);
      }

      .skeleton-card__stat {
        height: 32px;
        border-radius: var(--nxt1-skeleton-radius-sm);
        overflow: hidden;
      }

      /* Footer */
      .skeleton-card__footer {
        display: flex;
        justify-content: space-between;
        padding-top: var(--nxt1-spacing-2, 8px);
        border-top: 1px solid var(--nxt1-color-border-secondary, rgba(255, 255, 255, 0.06));
        margin-top: auto;
      }

      .skeleton-card__footer-item {
        height: var(--nxt1-skeleton-height-sm);
        width: 50px;
        border-radius: var(--nxt1-skeleton-radius-sm);
        overflow: hidden;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportSkeletonComponent {
  /** View mode to match actual card layout */
  readonly viewMode = input<ScoutReportViewMode>('grid');
}
