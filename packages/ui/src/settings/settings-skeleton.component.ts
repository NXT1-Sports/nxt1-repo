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
                <div class="settings-skeleton__item-trailing shimmer"></div>
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
        padding: 16px 0;
      }

      /* ============================================
       SHIMMER ANIMATION
       ============================================ */

      .shimmer {
        background: linear-gradient(
          90deg,
          var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04)) 0%,
          var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08)) 50%,
          var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04)) 100%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
        border-radius: 4px;
      }

      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      /* ============================================
       SECTION
       ============================================ */

      .settings-skeleton__section {
        margin-bottom: 24px;
      }

      /* ============================================
       HEADER
       ============================================ */

      .settings-skeleton__header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        margin-bottom: 4px;
      }

      .settings-skeleton__header-icon {
        width: 36px;
        height: 36px;
        border-radius: 10px;
      }

      .settings-skeleton__header-text {
        width: 100px;
        height: 14px;
      }

      /* ============================================
       ITEMS CONTAINER
       ============================================ */

      .settings-skeleton__items {
        border-radius: 12px;
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
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 0.5px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      .settings-skeleton__item:last-child {
        border-bottom: none;
      }

      .settings-skeleton__item-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        flex-shrink: 0;
      }

      .settings-skeleton__item-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .settings-skeleton__item-label {
        width: 140px;
        height: 16px;
      }

      .settings-skeleton__item-description {
        width: 200px;
        height: 12px;
      }

      .settings-skeleton__item-trailing {
        width: 48px;
        height: 28px;
        border-radius: 14px;
        flex-shrink: 0;
      }

      /* ============================================
       LIGHT MODE
       ============================================ */

      :host-context(.light),
      :host-context([data-theme='light']) {
        .shimmer {
          background: linear-gradient(
            90deg,
            var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.04)) 0%,
            var(--nxt1-color-surface-300, rgba(0, 0, 0, 0.08)) 50%,
            var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.04)) 100%
          );
          background-size: 200% 100%;
        }

        .settings-skeleton__items {
          background: var(--nxt1-color-surface-primary, #ffffff);
          border-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.06));
        }

        .settings-skeleton__item {
          border-bottom-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.06));
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
      hasDescription: i % 2 === 0, // Every other item has description
    }));
  });
}
