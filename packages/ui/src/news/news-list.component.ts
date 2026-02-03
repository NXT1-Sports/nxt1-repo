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
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, refreshOutline } from 'ionicons/icons';
import { type NewsArticle, type NewsCategoryId, NEWS_UI_CONFIG } from '@nxt1/core';
import { NewsArticleCardComponent } from './news-article-card.component';
import { NewsSkeletonComponent } from './news-skeleton.component';
import { NewsEmptyStateComponent } from './news-empty-state.component';

// Register icons
addIcons({ alertCircleOutline, refreshOutline });

@Component({
  selector: 'nxt1-news-list',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    IonSpinner,
    NewsArticleCardComponent,
    NewsSkeletonComponent,
    NewsEmptyStateComponent,
  ],
  template: `
    <div class="news-list">
      <!-- Loading State: Skeletons -->
      @if (isLoading()) {
        <div class="news-list__skeletons">
          @for (i of skeletonArray; track i) {
            <nxt1-news-skeleton [variant]="i === 1 ? 'featured' : 'card'" />
          }
        </div>
      }

      <!-- Error State -->
      @else if (error()) {
        <div class="news-list__error">
          <div class="news-list__error-icon">
            <ion-icon name="alert-circle-outline"></ion-icon>
          </div>
          <h3 class="news-list__error-title">Something went wrong</h3>
          <p class="news-list__error-message">{{ error() }}</p>
          <button type="button" class="news-list__error-action" (click)="retry.emit()">
            <ion-icon name="refresh-outline"></ion-icon>
            <span>Try Again</span>
          </button>
        </div>
      }

      <!-- Empty State -->
      @else if (isEmpty()) {
        <nxt1-news-empty-state [category]="activeCategory()" (ctaClick)="emptyCta.emit()" />
      }

      <!-- Articles List -->
      @else {
        <div class="news-list__articles">
          @for (article of articles(); track article.id; let i = $index) {
            <div class="news-list__article-wrapper" [style.animation-delay]="i * 50 + 'ms'">
              <nxt1-news-article-card
                [article]="article"
                (articleClick)="articleClick.emit($event)"
                (bookmarkClick)="bookmarkClick.emit($event)"
                (shareClick)="shareClick.emit($event)"
              />
            </div>
          }
        </div>

        <!-- Load More / Infinite Scroll -->
        @if (hasMore()) {
          <div class="news-list__load-more">
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
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .news-list__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        min-height: 300px;
      }

      .news-list__error-icon {
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-feedback-errorSubtle, rgba(239, 68, 68, 0.1));
        border-radius: var(--nxt1-radius-full, 9999px);
        margin-bottom: 16px;
      }

      .news-list__error-icon ion-icon {
        font-size: 32px;
        color: var(--nxt1-color-feedback-error, #ef4444);
      }

      .news-list__error-title {
        margin: 0 0 8px;
        font-size: 18px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .news-list__error-message {
        margin: 0 0 20px;
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        max-width: 280px;
      }

      .news-list__error-action {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 14px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #fff);
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .news-list__error-action:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
      }

      .news-list__error-action ion-icon {
        font-size: 18px;
      }

      /* ============================================
         ARTICLES LIST
         ============================================ */

      .news-list__articles {
        display: flex;
        flex-direction: column;
        gap: 16px;
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
        }
      }

      @media (min-width: 1024px) {
        .news-list__articles {
          grid-template-columns: repeat(3, 1fr);
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

  /** Emitted when bookmark is clicked */
  readonly bookmarkClick = output<NewsArticle>();

  /** Emitted when share is clicked */
  readonly shareClick = output<NewsArticle>();

  /** Array for skeleton rendering */
  readonly skeletonArray = Array.from({ length: NEWS_UI_CONFIG.SKELETON_COUNT }, (_, i) => i + 1);
}
