/**
 * @fileoverview Scout Report List Component - Grid/List Container
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Container component for displaying scout report cards.
 * Supports grid, list, and compact view modes with virtual scrolling support.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Grid/List/Compact view modes
 * - Loading skeleton states
 * - Empty state handling
 * - Error state with retry
 * - Infinite scroll support
 * - Stagger entrance animation
 *
 * @example
 * ```html
 * <nxt1-scout-report-list
 *   [reports]="reports()"
 *   [viewMode]="viewMode()"
 *   [isLoading]="isLoading()"
 *   [isEmpty]="isEmpty()"
 *   (cardClick)="onCardClick($event)"
 *   (bookmark)="onBookmark($event)"
 *   (loadMore)="onLoadMore()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonIcon,
  IonButton,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline,
  bookmarkOutline,
  diamondOutline,
  alertCircleOutline,
  refreshOutline,
  filterOutline,
} from 'ionicons/icons';
import type { ScoutReport, ScoutReportViewMode, ScoutReportCategoryId } from '@nxt1/core';
import { SCOUT_REPORT_SKELETON_COUNT } from '@nxt1/core';
import { ScoutReportCardComponent } from './scout-report-card.component';
import { ScoutReportSkeletonComponent } from './scout-report-skeleton.component';
import { ScoutReportEmptyStateComponent } from './scout-report-empty-state.component';

// Register icons
addIcons({
  searchOutline,
  bookmarkOutline,
  diamondOutline,
  alertCircleOutline,
  refreshOutline,
  filterOutline,
});

@Component({
  selector: 'nxt1-scout-report-list',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    IonButton,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    ScoutReportCardComponent,
    ScoutReportSkeletonComponent,
    ScoutReportEmptyStateComponent,
  ],
  template: `
    <!-- Loading State: Skeleton Grid -->
    @if (isLoading()) {
      <div
        class="report-list"
        [class.report-list--grid]="viewMode() === 'grid'"
        [class.report-list--list]="viewMode() === 'list'"
        [class.report-list--compact]="viewMode() === 'compact'"
      >
        @for (i of skeletonArray; track i) {
          <nxt1-scout-report-skeleton
            [viewMode]="viewMode()"
            [style.animation-delay.ms]="i * 50"
            class="report-list__item report-list__item--skeleton"
          />
        }
      </div>
    }

    <!-- Error State -->
    @else if (error()) {
      <div class="report-list__error">
        <ion-icon name="alert-circle-outline" class="report-list__error-icon"></ion-icon>
        <h3 class="report-list__error-title">Something went wrong</h3>
        <p class="report-list__error-message">{{ error() }}</p>
        <ion-button fill="outline" (click)="retry.emit()">
          <ion-icon name="refresh-outline" slot="start"></ion-icon>
          Try Again
        </ion-button>
      </div>
    }

    <!-- Empty State -->
    @else if (isEmpty()) {
      <nxt1-scout-report-empty-state
        [category]="activeCategory()"
        (action)="emptyCta.emit()"
        (clearFilters)="clearFilters.emit()"
      />
    }

    <!-- Reports Grid/List -->
    @else {
      <div
        class="report-list"
        [class.report-list--grid]="viewMode() === 'grid'"
        [class.report-list--list]="viewMode() === 'list'"
        [class.report-list--compact]="viewMode() === 'compact'"
      >
        @for (report of reports(); track report.id; let i = $index) {
          <nxt1-scout-report-card
            [report]="report"
            [viewMode]="viewMode()"
            [style.animation-delay.ms]="i * 50"
            class="report-list__item"
            (cardClick)="cardClick.emit($event)"
            (bookmark)="bookmark.emit($event)"
          />
        }
      </div>

      <!-- Infinite Scroll -->
      @if (hasMore()) {
        <ion-infinite-scroll (ionInfinite)="onInfiniteScroll($event)" [disabled]="isLoadingMore()">
          <ion-infinite-scroll-content
            loadingSpinner="crescent"
            loadingText="Loading more reports..."
          />
        </ion-infinite-scroll>
      }

      <!-- Loading More Indicator -->
      @if (isLoadingMore()) {
        <div class="report-list__loading-more">
          @for (i of [0, 1]; track i) {
            <nxt1-scout-report-skeleton [viewMode]="viewMode()" />
          }
        </div>
      }
    }
  `,
  styles: [
    `
      /* ============================================
         REPORT LIST - Grid/List Layout
         ============================================ */

      :host {
        display: block;
        width: 100%;
      }

      .report-list {
        display: grid;
        gap: var(--nxt1-spacing-4, 16px);
        padding: var(--nxt1-spacing-4, 16px);
      }

      /* Grid View */
      .report-list--grid {
        grid-template-columns: repeat(2, 1fr);
      }

      /* Desktop: 3 columns */
      @media (min-width: 768px) {
        .report-list--grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* Large desktop: 4 columns */
      @media (min-width: 1200px) {
        .report-list--grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      /* List View */
      .report-list--list {
        grid-template-columns: 1fr;
        max-width: 800px;
        margin: 0 auto;
      }

      /* Compact View */
      .report-list--compact {
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-2, 8px);
      }

      /* ============================================
         ITEM ANIMATIONS
         ============================================ */

      .report-list__item {
        animation: card-entrance 0.3s ease-out both;
      }

      .report-list__item--skeleton {
        animation: skeleton-entrance 0.2s ease-out both;
      }

      @keyframes card-entrance {
        from {
          opacity: 0;
          transform: translateY(16px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes skeleton-entrance {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .report-list__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8, 32px);
        text-align: center;
        min-height: 300px;
      }

      .report-list__error-icon {
        font-size: 64px;
        color: var(--nxt1-color-error, #ef4444);
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .report-list__error-title {
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        font-size: 20px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .report-list__error-message {
        margin: 0 0 var(--nxt1-spacing-4, 16px);
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* ============================================
         LOADING MORE
         ============================================ */

      .report-list__loading-more {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-4, 16px);
        padding: 0 var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-4, 16px);
      }

      @media (min-width: 768px) {
        .report-list__loading-more {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* Infinite scroll styling */
      ion-infinite-scroll-content {
        --color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportListComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Scout reports to display */
  readonly reports = input<ScoutReport[]>([]);

  /** View mode */
  readonly viewMode = input<ScoutReportViewMode>('grid');

  /** Whether initial loading */
  readonly isLoading = input<boolean>(false);

  /** Whether loading more */
  readonly isLoadingMore = input<boolean>(false);

  /** Whether list is empty */
  readonly isEmpty = input<boolean>(false);

  /** Error message */
  readonly error = input<string | null>(null);

  /** Whether more data available */
  readonly hasMore = input<boolean>(false);

  /** Active category for empty state */
  readonly activeCategory = input<ScoutReportCategoryId>('all');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when a card is clicked */
  readonly cardClick = output<ScoutReport>();

  /** Emitted when bookmark is toggled */
  readonly bookmark = output<string>();

  /** Emitted to load more data */
  readonly loadMore = output<void>();

  /** Emitted to retry after error */
  readonly retry = output<void>();

  /** Emitted when empty state CTA is clicked */
  readonly emptyCta = output<void>();

  /** Emitted to clear filters */
  readonly clearFilters = output<void>();

  // ============================================
  // PROPERTIES
  // ============================================

  /** Array for skeleton loop */
  protected readonly skeletonArray = Array.from(
    { length: SCOUT_REPORT_SKELETON_COUNT },
    (_, i) => i
  );

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle infinite scroll event.
   */
  protected async onInfiniteScroll(event: CustomEvent): Promise<void> {
    this.loadMore.emit();

    // Complete the infinite scroll
    const target = event.target as HTMLIonInfiniteScrollElement;
    setTimeout(() => {
      target.complete();
    }, 500);
  }
}
