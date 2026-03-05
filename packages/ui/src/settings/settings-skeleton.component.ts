/**
 * @fileoverview Settings Skeleton Component - Loading State
 * @module @nxt1/ui/settings
 * @version 1.0.0
 *
 * Skeleton loading component for settings page.
 * Shows animated placeholders while data is loading.
 * Professional loading experience - no spinners.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Animated shimmer effect
 * - Matches settings item layout
 * - Theme-aware colors
 * - Multiple items for realistic feel
 *
 * @example
 * ```html
 * <nxt1-settings-skeleton [count]="6" />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-settings-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="settings-skeleton">
      @for (section of sections(); track section) {
        <div class="settings-skeleton__section">
          <!-- Section Header Skeleton -->
          <div class="settings-skeleton__header">
            <div class="settings-skeleton__header-icon shimmer"></div>
            <div class="settings-skeleton__header-text shimmer"></div>
          </div>

          <!-- Section Items Skeleton -->
          <div class="settings-skeleton__items">
            @for (item of sectionItems(); track $index) {
              <div class="settings-skeleton__item">
                <div class="settings-skeleton__item-icon shimmer"></div>
                <div class="settings-skeleton__item-content">
                  <div class="settings-skeleton__item-label shimmer"></div>
                  @if (item.hasDescription) {
                    <div class="settings-skeleton__item-description shimmer"></div>
                  }
                </div>

                @switch (item.trailingType) {
                  @case ('toggle') {
                    <div
                      class="settings-skeleton__item-trailing settings-skeleton__item-trailing--toggle shimmer"
                    ></div>
                  }
                  @case ('value') {
                    <div class="settings-skeleton__item-trailing-group">
                      <div
                        class="settings-skeleton__item-trailing settings-skeleton__item-trailing--value shimmer"
                      ></div>
                      <div
                        class="settings-skeleton__item-trailing settings-skeleton__item-trailing--chevron shimmer"
                      ></div>
                    </div>
                  }
                  @default {
                    <div
                      class="settings-skeleton__item-trailing settings-skeleton__item-trailing--chevron shimmer"
                    ></div>
                  }
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       SETTINGS SKELETON - Loading State
       100% Theme Aware
       ============================================ */

      :host {
        display: block;
      }

      .settings-skeleton {
        padding: 0;
      }

      /* ============================================
       SHIMMER ANIMATION (2026 Theme-Aware)
       Uses global design tokens - auto-switches per theme
       ============================================ */

      .shimmer {
        background: linear-gradient(
          90deg,
          var(--nxt1-color-loading-skeleton) 0%,
          var(--nxt1-color-loading-skeletonShimmer) 50%,
          var(--nxt1-color-loading-skeleton) 100%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s ease-in-out infinite;
        border-radius: var(--nxt1-radius-sm, 4px);
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
       SECTION
       ============================================ */

      .settings-skeleton__section {
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      /* ============================================
       HEADER
       ============================================ */

      .settings-skeleton__header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        margin-bottom: var(--nxt1-spacing-1, 4px);
      }

      .settings-skeleton__header-icon {
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-md, 10px);
      }

      .settings-skeleton__header-text {
        width: 72px;
        height: 12px;
      }

      /* ============================================
       ITEMS CONTAINER
       ============================================ */

      .settings-skeleton__items {
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--nxt1-color-surface-primary, var(--ion-background-color, #0a0a0a));
        border: 0.5px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        overflow: hidden;
      }

      /* ============================================
       ITEM
       ============================================ */

      .settings-skeleton__item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-3_5, 14px) var(--nxt1-spacing-4, 16px);
        min-height: 52px;
        border-bottom: 0.5px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      .settings-skeleton__item:last-child {
        border-bottom: none;
      }

      .settings-skeleton__item-icon {
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-radius-md, 8px);
        flex-shrink: 0;
      }

      .settings-skeleton__item-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .settings-skeleton__item-label {
        width: 148px;
        height: 16px;
      }

      .settings-skeleton__item-description {
        width: 182px;
        height: 12px;
      }

      .settings-skeleton__item-trailing-group {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .settings-skeleton__item-trailing {
        flex-shrink: 0;
      }

      .settings-skeleton__item-trailing--toggle {
        width: 48px;
        height: 28px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .settings-skeleton__item-trailing--value {
        width: 54px;
        height: 14px;
      }

      .settings-skeleton__item-trailing--chevron {
        width: 14px;
        height: 14px;
      }

      @media (max-width: 768px) {
        .settings-skeleton__item-label {
          width: 132px;
        }

        .settings-skeleton__item-description {
          width: 164px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSkeletonComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Number of sections to show */
  readonly sectionCount = input(3);

  /** Number of items per section */
  readonly itemsPerSection = input(4);

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly sections = computed(() => {
    return Array.from({ length: this.sectionCount() }, (_, i) => i);
  });

  protected readonly sectionItems = computed(() => {
    const count = this.itemsPerSection();
    return Array.from({ length: count }, (_, i) => ({
      hasDescription: i % 3 !== 1,
      trailingType: i % 4 === 0 ? 'toggle' : i % 4 === 1 ? 'value' : 'chevron',
    }));
  });
}
