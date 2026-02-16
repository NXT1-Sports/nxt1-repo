/**
 * @fileoverview Analytics Dashboard Skeleton — Loading State
 * @module @nxt1/ui/analytics-dashboard
 * @version 1.0.0
 *
 * Shared skeleton loader for analytics dashboard shells.
 * Used by both web and mobile variants to keep loading UX consistent.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-analytics-dashboard-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="analytics-skeleton" aria-label="Loading analytics data" role="status">
      <div class="skeleton-section">
        <div class="skeleton-grid">
          @for (placeholderIndex of metricCardPlaceholders; track placeholderIndex) {
            <div class="skeleton-card">
              <div class="skeleton-icon"></div>
              <div class="skeleton-value"></div>
              <div class="skeleton-label"></div>
              <div class="skeleton-trend"></div>
            </div>
          }
        </div>
      </div>

      <div class="skeleton-section">
        <div class="skeleton-chart">
          <div class="skeleton-chart-header"></div>
          <div class="skeleton-chart-area"></div>
        </div>
      </div>

      <div class="skeleton-section">
        <div class="skeleton-list">
          @for (placeholderIndex of listPlaceholders; track placeholderIndex) {
            <div class="skeleton-list-item"></div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .analytics-skeleton {
        animation: analytics-pulse 1.5s infinite ease-in-out;
      }

      @keyframes analytics-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      .skeleton-section {
        margin-bottom: var(--nxt1-spacing-6);
      }

      .skeleton-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-4);
      }

      @media (min-width: 768px) {
        .skeleton-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .skeleton-card {
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-4);
      }

      .skeleton-icon {
        width: 40px;
        height: 40px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-sm);
        margin-bottom: var(--nxt1-spacing-2);
      }

      .skeleton-value {
        width: 60%;
        height: 28px;
        background: var(--nxt1-color-surface-200);
        border-radius: 4px;
        margin-bottom: var(--nxt1-spacing-1);
      }

      .skeleton-label {
        width: 80%;
        height: 14px;
        background: var(--nxt1-color-surface-200);
        border-radius: 4px;
        margin-bottom: var(--nxt1-spacing-1);
      }

      .skeleton-trend {
        width: 50%;
        height: 12px;
        background: var(--nxt1-color-surface-200);
        border-radius: 4px;
      }

      .skeleton-chart {
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-4);
      }

      .skeleton-chart-header {
        width: 40%;
        height: 20px;
        background: var(--nxt1-color-surface-200);
        border-radius: 4px;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .skeleton-chart-area {
        width: 100%;
        height: 200px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-md);
      }

      .skeleton-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .skeleton-list-item {
        height: 72px;
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-borderRadius-md);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsDashboardSkeletonComponent {
  protected readonly metricCardPlaceholders = [1, 2, 3, 4] as const;
  protected readonly listPlaceholders = [1, 2, 3] as const;
}
