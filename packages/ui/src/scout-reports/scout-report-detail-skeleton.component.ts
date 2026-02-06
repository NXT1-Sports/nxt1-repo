/**
 * @fileoverview Scout Report Detail Skeleton Component - Loading State
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Skeleton loading placeholder for scout report detail pages.
 * Matches the full detail page layout for seamless transitions.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Architecture (2026 Best Practices):
 * - Uses global skeleton design tokens
 * - Theme-aware via CSS custom properties
 * - Accessible (role, aria-label, reduced motion)
 *
 * @example
 * ```html
 * @if (isLoading()) {
 *   <nxt1-scout-report-detail-skeleton />
 * }
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-scout-report-detail-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="detail-skeleton"
      role="progressbar"
      aria-label="Loading scout report details"
      aria-hidden="true"
    >
      <!-- Hero Section Skeleton -->
      <div class="detail-skeleton__hero">
        <div class="detail-skeleton__image">
          <div class="skeleton-shimmer"></div>
        </div>
        <div class="detail-skeleton__overlay"></div>

        <!-- Info overlay -->
        <div class="detail-skeleton__info">
          <div class="detail-skeleton__name">
            <div class="skeleton-shimmer"></div>
          </div>
          <div class="detail-skeleton__meta">
            <div class="skeleton-shimmer"></div>
          </div>
          <div class="detail-skeleton__location">
            <div class="skeleton-shimmer"></div>
          </div>
        </div>
      </div>

      <!-- Rating Section Skeleton -->
      <div class="detail-skeleton__rating">
        <div class="detail-skeleton__rating-main">
          <div class="skeleton-shimmer"></div>
        </div>
        <div class="detail-skeleton__rating-tier">
          <div class="skeleton-shimmer"></div>
        </div>
      </div>

      <!-- Quick Stats Skeleton -->
      <div class="detail-skeleton__stats">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="detail-skeleton__stat-item">
            <div class="detail-skeleton__stat-value">
              <div class="skeleton-shimmer"></div>
            </div>
            <div class="detail-skeleton__stat-label">
              <div class="skeleton-shimmer"></div>
            </div>
          </div>
        }
      </div>

      <!-- Breakdown Section Skeleton -->
      <div class="detail-skeleton__section">
        <div class="detail-skeleton__section-title">
          <div class="skeleton-shimmer"></div>
        </div>
        <div class="detail-skeleton__breakdown">
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <div class="detail-skeleton__breakdown-item">
              <div class="detail-skeleton__breakdown-label">
                <div class="skeleton-shimmer"></div>
              </div>
              <div class="detail-skeleton__breakdown-bar">
                <div class="skeleton-shimmer"></div>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Notes Section Skeleton -->
      <div class="detail-skeleton__section">
        <div class="detail-skeleton__section-title">
          <div class="skeleton-shimmer"></div>
        </div>
        <div class="detail-skeleton__notes">
          <div class="detail-skeleton__note-line detail-skeleton__note-line--full">
            <div class="skeleton-shimmer"></div>
          </div>
          <div class="detail-skeleton__note-line detail-skeleton__note-line--medium">
            <div class="skeleton-shimmer"></div>
          </div>
          <div class="detail-skeleton__note-line detail-skeleton__note-line--short">
            <div class="skeleton-shimmer"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         SCOUT REPORT DETAIL SKELETON
         2026 Theme-Aware Design Tokens
         ============================================ */

      :host {
        display: block;
      }

      .detail-skeleton {
        display: flex;
        flex-direction: column;
      }

      /* ============================================
         SHIMMER ANIMATION (Theme-Aware)
         ============================================ */

      .skeleton-shimmer {
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          var(--nxt1-color-loading-skeleton) 0%,
          var(--nxt1-color-loading-skeletonShimmer) 50%,
          var(--nxt1-color-loading-skeleton) 100%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s ease-in-out infinite;
        border-radius: inherit;
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
        .skeleton-shimmer {
          animation: none;
          background: var(--nxt1-color-loading-skeleton);
        }
      }

      /* ============================================
         HERO SECTION
         ============================================ */

      .detail-skeleton__hero {
        position: relative;
        height: 300px;
        background: var(--nxt1-color-loading-skeleton);

        @media (max-width: 768px) {
          height: 250px;
        }
      }

      .detail-skeleton__image {
        width: 100%;
        height: 100%;
      }

      .detail-skeleton__overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(to bottom, transparent 50%, var(--nxt1-color-bg-primary) 100%);
      }

      .detail-skeleton__info {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: var(--nxt1-spacing-4, 16px);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .detail-skeleton__name {
        height: 32px;
        width: 60%;
        border-radius: var(--nxt1-radius-sm, 4px);
        overflow: hidden;
      }

      .detail-skeleton__meta {
        height: 20px;
        width: 45%;
        border-radius: var(--nxt1-radius-sm, 4px);
        overflow: hidden;
      }

      .detail-skeleton__location {
        height: 16px;
        width: 35%;
        border-radius: var(--nxt1-radius-sm, 4px);
        overflow: hidden;
      }

      /* ============================================
         RATING SECTION
         ============================================ */

      .detail-skeleton__rating {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4, 16px);
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-surface-100);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .detail-skeleton__rating-main {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        overflow: hidden;
      }

      .detail-skeleton__rating-tier {
        height: 40px;
        width: 120px;
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
      }

      /* ============================================
         QUICK STATS SECTION
         ============================================ */

      .detail-skeleton__stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-surface-100);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);

        @media (max-width: 480px) {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .detail-skeleton__stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .detail-skeleton__stat-value {
        width: 40px;
        height: 28px;
        border-radius: var(--nxt1-radius-sm, 4px);
        overflow: hidden;
      }

      .detail-skeleton__stat-label {
        width: 60px;
        height: 14px;
        border-radius: var(--nxt1-radius-sm, 4px);
        overflow: hidden;
      }

      /* ============================================
         SECTIONS
         ============================================ */

      .detail-skeleton__section {
        padding: var(--nxt1-spacing-4, 16px);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .detail-skeleton__section-title {
        height: 24px;
        width: 140px;
        border-radius: var(--nxt1-radius-sm, 4px);
        margin-bottom: var(--nxt1-spacing-4, 16px);
        overflow: hidden;
      }

      /* Breakdown */
      .detail-skeleton__breakdown {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .detail-skeleton__breakdown-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .detail-skeleton__breakdown-label {
        width: 100px;
        height: 16px;
        border-radius: var(--nxt1-radius-sm, 4px);
        overflow: hidden;
        flex-shrink: 0;
      }

      .detail-skeleton__breakdown-bar {
        flex: 1;
        height: 8px;
        border-radius: var(--nxt1-radius-full, 9999px);
        overflow: hidden;
      }

      /* Notes */
      .detail-skeleton__notes {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .detail-skeleton__note-line {
        height: 16px;
        border-radius: var(--nxt1-radius-sm, 4px);
        overflow: hidden;
      }

      .detail-skeleton__note-line--full {
        width: 100%;
      }

      .detail-skeleton__note-line--medium {
        width: 80%;
      }

      .detail-skeleton__note-line--short {
        width: 50%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportDetailSkeletonComponent {}
