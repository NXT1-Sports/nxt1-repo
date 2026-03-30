/**
 * @fileoverview News List Component - Feed List with States
 * @module @nxt1/ui/news
 * @version 1.0.0
 *
 * List component for news feed with skeleton, empty, and error states.
 * Supports infinite scroll and pull-to-refresh.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Skeleton loading state (no spinners)
 * - Category-specific empty states with CTAs
 * - Error state with retry action
 * - Infinite scroll with "Load more" button
 * - Smooth item transitions
 * - Virtual scrolling ready
 *
 * @example
 * ```html
 * <nxt1-news-list
 *   [articles]="articles()"
 *   [isLoading]="isLoading()"
 *   [isLoadingMore]="isLoadingMore()"
 *   [isEmpty]="isEmpty()"
 *   [error]="error()"
 *   [hasMore]="hasMore()"
 *   [activeCategory]="activeCategory()"
 *   (loadMore)="onLoadMore()"
 *   (retry)="onRetry()"
 *   (articleClick)="onArticleClick($event)"
 *   (bookmarkClick)="onBookmarkClick($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonSpinner } from '@ionic/angular/standalone';
import { type NewsArticle, type NewsCategoryId, NEWS_UI_CONFIG } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NewsArticleCardComponent } from './news-article-card.component';
import { NewsSkeletonComponent } from './news-skeleton.component';
import { NewsEmptyStateComponent } from './news-empty-state.component';
import { NxtStateViewComponent } from '../components/state-view';

// Register icons
@Component({
  selector: 'nxt1-news-list',
  standalone: true,
  imports: [
    CommonModule,
    IonSpinner,
    NewsArticleCardComponent,
    NewsSkeletonComponent,
    NewsEmptyStateComponent,
    NxtStateViewComponent,
  ],
  template: `
    <div class="news-list" [attr.data-testid]="testIds.LIST_CONTAINER">
      <!-- Loading State: Skeletons -->
      @if (isLoading()) {
        <div class="news-list__skeletons" [attr.data-testid]="testIds.SKELETON">
          @for (i of skeletonArray; track i) {
            <nxt1-news-skeleton variant="card" />
          }
        </div>
      }

      <!-- Error State -->
      @else if (error()) {
        <nxt1-state-view
          variant="error"
          title="Something went wrong"
          [message]="error()"
          actionLabel="Try Again"
          actionIcon="refresh"
          (action)="retry.emit()"
          [attr.data-testid]="testIds.ERROR_STATE"
        />
      }

      <!-- Empty State -->
      @else if (isEmpty()) {
        <nxt1-news-empty-state
          [category]="activeCategory()"
          (ctaClick)="emptyCta.emit()"
          [attr.data-testid]="testIds.EMPTY_STATE"
        />
      }

      <!-- Articles List -->
      @else {
        <div class="news-list__articles" [attr.data-testid]="testIds.LIST">
          @for (article of articles(); track article.id; let i = $index) {
            <div
              class="news-list__article-wrapper"
              [style.animation-delay]="i * 50 + 'ms'"
              [attr.data-testid]="testIds.LIST_ITEM"
            >
              <nxt1-news-article-card
                [article]="article"
                (articleClick)="articleClick.emit($event)"
              />
            </div>
          }
        </div>

        <!-- Load More / Infinite Scroll -->
        @if (hasMore()) {
          <div class="news-list__load-more" [attr.data-testid]="testIds.LOAD_MORE">
            @if (isLoadingMore()) {
              <ion-spinner name="crescent" color="primary"></ion-spinner>
            } @else {
              <button type="button" class="news-list__load-more-btn" (click)="loadMore.emit()">
                Load More Articles
              </button>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         NEWS LIST - Feed Container
         ============================================ */

      :host {
        display: block;
      }

      .news-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px;
      }

      /* ============================================
         SKELETON STATE
         ============================================ */

      .news-list__skeletons {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }

      @media (max-width: 640px) {
        .news-list__skeletons {
          grid-template-columns: 1fr;
        }
      }

      /* ============================================
         ARTICLES LIST
         ============================================ */

      .news-list__articles {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
        min-width: 0;
      }

      @media (max-width: 640px) {
        .news-list__articles {
          grid-template-columns: 1fr;
        }
      }

      /* Staggered fade-in animation */
      .news-list__article-wrapper {
        animation: slide-up-fade 0.3s ease forwards;
        opacity: 0;
      }

      @keyframes slide-up-fade {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ============================================
         LOAD MORE
         ============================================ */

      .news-list__load-more {
        display: flex;
        justify-content: center;
        padding: 16px 0 32px;
      }

      .news-list__load-more-btn {
        padding: 12px 24px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 14px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #fff);
        cursor: pointer;
        transition:
          background-color 0.15s ease,
          transform 0.15s ease;
      }

      .news-list__load-more-btn:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
      }

      .news-list__load-more-btn:active {
        transform: scale(0.98);
      }

      ion-spinner {
        --color: var(--nxt1-color-primary, #ccff00);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (min-width: 768px) {
        .news-list__articles {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          align-items: stretch;
        }

        .news-list__article-wrapper {
          min-width: 0;
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .news-list__article-wrapper {
          animation: none;
          opacity: 1;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsListComponent {
  protected readonly testIds = TEST_IDS.NEWS;

  /** Articles to display */
  readonly articles = input<NewsArticle[]>([]);

  /** Whether initial load is in progress */
  readonly isLoading = input<boolean>(false);

  /** Whether loading more items */
  readonly isLoadingMore = input<boolean>(false);

  /** Whether the feed is empty */
  readonly isEmpty = input<boolean>(false);

  /** Error message to display */
  readonly error = input<string | null>(null);

  /** Whether there are more items to load */
  readonly hasMore = input<boolean>(false);

  /** Currently active category (for empty state) */
  readonly activeCategory = input<NewsCategoryId>('for-you');

  /** Emitted when load more is triggered */
  readonly loadMore = output<void>();

  /** Emitted when retry is clicked */
  readonly retry = output<void>();

  /** Emitted when empty state CTA is clicked */
  readonly emptyCta = output<void>();

  /** Emitted when article is clicked */
  readonly articleClick = output<NewsArticle>();

  /** Array for skeleton rendering */
  readonly skeletonArray = Array.from({ length: NEWS_UI_CONFIG.SKELETON_COUNT }, (_, i) => i + 1);
}
