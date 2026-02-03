/**
 * @fileoverview Scout Report Empty State Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Premium empty state for when no scout reports match filters.
 * Category-specific messaging and actionable CTAs.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Category-specific icons and messaging
 * - Clear filters CTA
 * - Browse all CTA
 * - Subtle animation
 *
 * @example
 * ```html
 * <nxt1-scout-report-empty-state
 *   [category]="'bookmarked'"
 *   (action)="navigateToBrowse()"
 *   (clearFilters)="clearFilters()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  documentTextOutline,
  bookmarkOutline,
  footballOutline,
  basketballOutline,
  baseballOutline,
  starOutline,
  flameOutline,
  trophyOutline,
  searchOutline,
  filterOutline,
  addOutline,
} from 'ionicons/icons';
import type { ScoutReportCategoryId } from '@nxt1/core';

// Register icons
addIcons({
  documentTextOutline,
  bookmarkOutline,
  footballOutline,
  basketballOutline,
  baseballOutline,
  starOutline,
  flameOutline,
  trophyOutline,
  searchOutline,
  filterOutline,
  addOutline,
});

/**
 * Empty state configuration per category.
 */
interface EmptyStateConfig {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly showClearFilters: boolean;
}

/**
 * Empty state configs by category.
 */
const EMPTY_STATE_CONFIGS: Partial<Record<ScoutReportCategoryId, EmptyStateConfig>> & {
  default: EmptyStateConfig;
} = {
  all: {
    icon: 'document-text-outline',
    title: 'No Scout Reports Found',
    description: 'Try adjusting your search or filters to find athlete profiles.',
    actionLabel: 'Clear Filters',
    showClearFilters: true,
  },
  trending: {
    icon: 'flame-outline',
    title: 'No Trending Reports',
    description: 'Reports gaining traction will appear here. Check back soon!',
    actionLabel: 'Browse All Reports',
    showClearFilters: false,
  },
  'top-rated': {
    icon: 'star-outline',
    title: 'No Top Rated Reports',
    description: 'Highly rated athlete reports will appear here.',
    actionLabel: 'Browse All Reports',
    showClearFilters: false,
  },
  saved: {
    icon: 'bookmark-outline',
    title: 'No Saved Reports',
    description: 'Bookmark athlete reports to save them for later review.',
    actionLabel: 'Browse Athletes',
    showClearFilters: false,
  },
  'by-sport': {
    icon: 'football-outline',
    title: 'No Reports for Sport',
    description: 'Athlete reports will appear here. Try broadening your filters.',
    actionLabel: 'Clear Filters',
    showClearFilters: true,
  },
  default: {
    icon: 'document-text-outline',
    title: 'No Reports Found',
    description: 'Try adjusting your search or filters.',
    actionLabel: 'Clear Filters',
    showClearFilters: true,
  },
};

@Component({
  selector: 'nxt1-scout-report-empty-state',
  standalone: true,
  imports: [CommonModule, IonIcon, IonButton],
  template: `
    <div class="empty-state">
      <!-- Animated Icon -->
      <div class="empty-state__icon-container">
        <div class="empty-state__icon-bg"></div>
        <ion-icon [name]="config().icon" class="empty-state__icon"></ion-icon>
      </div>

      <!-- Content -->
      <h3 class="empty-state__title">{{ config().title }}</h3>
      <p class="empty-state__description">{{ config().description }}</p>

      <!-- Actions -->
      <div class="empty-state__actions">
        @if (config().showClearFilters) {
          <ion-button fill="outline" color="medium" (click)="clearFilters.emit()">
            <ion-icon name="filter-outline" slot="start"></ion-icon>
            Clear Filters
          </ion-button>
        }

        <ion-button fill="solid" class="empty-state__cta" (click)="action.emit()">
          <ion-icon name="search-outline" slot="start"></ion-icon>
          {{ config().actionLabel }}
        </ion-button>
      </div>

      <!-- Decorative Elements -->
      <div class="empty-state__decoration">
        <div class="empty-state__dot empty-state__dot--1"></div>
        <div class="empty-state__dot empty-state__dot--2"></div>
        <div class="empty-state__dot empty-state__dot--3"></div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         EMPTY STATE - Premium Design
         ============================================ */

      :host {
        display: block;
        width: 100%;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-4, 16px);
        min-height: 400px;
        position: relative;
        overflow: hidden;
      }

      /* ============================================
         ICON CONTAINER
         ============================================ */

      .empty-state__icon-container {
        position: relative;
        width: 120px;
        height: 120px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      .empty-state__icon-bg {
        position: absolute;
        inset: 0;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-primary-alpha-20, rgba(59, 130, 246, 0.2)),
          var(--nxt1-color-secondary-alpha-20, rgba(139, 92, 246, 0.2))
        );
        animation: pulse-bg 2s ease-in-out infinite;
      }

      .empty-state__icon {
        position: relative;
        z-index: 1;
        font-size: 56px;
        color: var(--nxt1-color-primary, #3b82f6);
        animation: float 3s ease-in-out infinite;
      }

      @keyframes pulse-bg {
        0%,
        100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.1);
          opacity: 0.7;
        }
      }

      @keyframes float {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-8px);
        }
      }

      /* ============================================
         CONTENT
         ============================================ */

      .empty-state__title {
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        font-size: 22px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        letter-spacing: -0.02em;
      }

      .empty-state__description {
        margin: 0 0 var(--nxt1-spacing-6, 24px);
        font-size: 15px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        max-width: 320px;
      }

      /* ============================================
         ACTIONS
         ============================================ */

      .empty-state__actions {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      @media (min-width: 480px) {
        .empty-state__actions {
          flex-direction: row;
        }
      }

      .empty-state__cta {
        --background: linear-gradient(
          135deg,
          var(--nxt1-color-primary, #3b82f6),
          var(--nxt1-color-secondary, #8b5cf6)
        );
        --border-radius: var(--nxt1-radius-lg, 12px);
        font-weight: 600;
      }

      /* ============================================
         DECORATIVE ELEMENTS
         ============================================ */

      .empty-state__decoration {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }

      .empty-state__dot {
        position: absolute;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-primary-alpha-10, rgba(59, 130, 246, 0.1));
        animation: drift 20s linear infinite;
      }

      .empty-state__dot--1 {
        width: 200px;
        height: 200px;
        top: -100px;
        right: -50px;
        animation-duration: 25s;
      }

      .empty-state__dot--2 {
        width: 150px;
        height: 150px;
        bottom: -50px;
        left: -30px;
        animation-duration: 30s;
        animation-delay: -5s;
      }

      .empty-state__dot--3 {
        width: 80px;
        height: 80px;
        top: 50%;
        right: 10%;
        animation-duration: 20s;
        animation-delay: -10s;
      }

      @keyframes drift {
        0% {
          transform: translate(0, 0) rotate(0deg);
        }
        25% {
          transform: translate(20px, -20px) rotate(90deg);
        }
        50% {
          transform: translate(0, -40px) rotate(180deg);
        }
        75% {
          transform: translate(-20px, -20px) rotate(270deg);
        }
        100% {
          transform: translate(0, 0) rotate(360deg);
        }
      }

      /* ============================================
         THEME VARIANTS
         ============================================ */

      /* Light theme adjustments */
      :host-context(.light-theme) {
        .empty-state__title {
          color: var(--nxt1-color-gray-900, #111827);
        }

        .empty-state__description {
          color: var(--nxt1-color-gray-600, #4b5563);
        }

        .empty-state__dot {
          background: var(--nxt1-color-primary-alpha-5, rgba(59, 130, 246, 0.05));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportEmptyStateComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Active category to show context-specific empty state */
  readonly category = input<ScoutReportCategoryId>('all');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when main CTA is clicked */
  readonly action = output<void>();

  /** Emitted when clear filters is clicked */
  readonly clearFilters = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  /**
   * Get empty state config for current category.
   */
  protected readonly config = computed<EmptyStateConfig>(() => {
    const cat = this.category();
    return EMPTY_STATE_CONFIGS[cat] ?? EMPTY_STATE_CONFIGS.default;
  });
}
