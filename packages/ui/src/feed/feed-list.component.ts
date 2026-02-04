/**
 * @fileoverview Feed List Component - Virtual Scroll Feed
 * @module @nxt1/ui/feed
 * @version 1.0.0
 *
 * List component for feed with skeleton, empty, and error states.
 * Uses Ionic's virtual scroll for 2026 best practices.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Skeleton loading state (no spinners)
 * - Filter-specific empty states
 * - Error state with retry
 * - Infinite scroll with auto-load
 * - Smooth item animations
 * - Virtual scrolling for performance
 *
 * @example
 * ```html
 * <nxt1-feed-list
 *   [posts]="posts()"
 *   [isLoading]="isLoading()"
 *   [isLoadingMore]="isLoadingMore()"
 *   [isEmpty]="isEmpty()"
 *   [error]="error()"
 *   [hasMore]="hasMore()"
 *   [filterType]="filterType()"
 *   (loadMore)="onLoadMore()"
 *   (retry)="onRetry()"
 *   (postClick)="onPostClick($event)"
 *   (likeClick)="onLike($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonIcon,
  IonSpinner,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, refreshOutline } from 'ionicons/icons';
import { type FeedPost, type FeedAuthor, type FeedFilterType, FEED_UI_CONFIG } from '@nxt1/core';
import { FeedPostCardComponent } from './feed-post-card.component';
import { FeedSkeletonComponent } from './feed-skeleton.component';
import { FeedEmptyStateComponent } from './feed-empty-state.component';

// Register icons
addIcons({ alertCircleOutline, refreshOutline });

@Component({
  selector: 'nxt1-feed-list',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    IonSpinner,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    FeedPostCardComponent,
    FeedSkeletonComponent,
    FeedEmptyStateComponent,
  ],
  template: `
    <div class="feed-list">
      <!-- Loading State: Skeletons -->
      @if (isLoading()) {
        <div class="feed-list__skeletons">
          @for (i of skeletonArray; track i) {
            <nxt1-feed-skeleton [variant]="i % 2 === 0 ? 'post-with-media' : 'post'" />
          }
        </div>
      }

      <!-- Error State -->
      @else if (error()) {
        <div class="feed-list__error">
          <div class="feed-list__error-icon">
            <ion-icon name="alert-circle-outline"></ion-icon>
          </div>
          <h3 class="feed-list__error-title">Something went wrong</h3>
          <p class="feed-list__error-message">{{ error() }}</p>
          <button type="button" class="feed-list__error-action" (click)="retry.emit()">
            <ion-icon name="refresh-outline"></ion-icon>
            <span>Try Again</span>
          </button>
        </div>
      }

      <!-- Empty State -->
      @else if (isEmpty()) {
        <nxt1-feed-empty-state [filterType]="filterType()" (ctaClick)="emptyCta.emit()" />
      }

      <!-- Posts List -->
      @else {
        <div class="feed-list__posts">
          @for (post of posts(); track post.id; let i = $index) {
            <div
              class="feed-list__post-wrapper"
              [style.animation-delay]="i * animationDelay + 'ms'"
            >
              <nxt1-feed-post-card
                [post]="post"
                [showMenu]="showMenu()"
                (postClick)="postClick.emit($event)"
                (authorClick)="authorClick.emit($event)"
                (likeClick)="likeClick.emit($event)"
                (commentClick)="commentClick.emit($event)"
                (shareClick)="shareClick.emit($event)"
                (bookmarkClick)="bookmarkClick.emit($event)"
                (menuClick)="menuClick.emit($event)"
              />
            </div>
          }
        </div>

        <!-- Infinite Scroll -->
        @if (hasMore()) {
          <ion-infinite-scroll
            (ionInfinite)="onInfiniteScroll($event)"
            threshold="200px"
            [disabled]="!hasMore() || isLoadingMore()"
          >
            <ion-infinite-scroll-content loadingSpinner="crescent">
              @if (isLoadingMore()) {
                <div class="feed-list__loading-more">
                  <ion-spinner name="crescent"></ion-spinner>
                  <span>Loading more posts...</span>
                </div>
              }
            </ion-infinite-scroll-content>
          </ion-infinite-scroll>
        }

        <!-- End of Feed -->
        @if (!hasMore() && posts().length > 0) {
          <div class="feed-list__end">
            <span>You're all caught up! 🎉</span>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         FEED LIST - Container with States
         2026 Professional Design
         ============================================ */

      :host {
        display: block;

        --list-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --list-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --list-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --list-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --list-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --list-primary: var(--nxt1-color-primary, #d4ff00);
        --list-error: var(--nxt1-color-error, #ff4757);
      }

      .feed-list {
        min-height: 400px;
      }

      /* ============================================
         SKELETONS
         ============================================ */

      .feed-list__skeletons {
        display: flex;
        flex-direction: column;
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .feed-list__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 24px;
        text-align: center;
        min-height: 400px;
      }

      .feed-list__error-icon {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: rgba(255, 71, 87, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;

        ion-icon {
          font-size: 36px;
          color: var(--list-error);
        }
      }

      .feed-list__error-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--list-text-primary);
        margin: 0 0 8px;
      }

      .feed-list__error-message {
        font-size: 14px;
        color: var(--list-text-secondary);
        margin: 0 0 24px;
        max-width: 280px;
      }

      .feed-list__error-action {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px;
        background: var(--list-surface);
        border: 1px solid var(--list-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        color: var(--list-text-primary);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        ion-icon {
          font-size: 18px;
        }

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--list-primary);
        }
      }

      /* ============================================
         POSTS LIST
         ============================================ */

      .feed-list__posts {
        display: flex;
        flex-direction: column;
      }

      .feed-list__post-wrapper {
        animation: feed-item-in 0.3s ease-out both;
      }

      @keyframes feed-item-in {
        from {
          opacity: 0;
          transform: translateY(16px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ============================================
         INFINITE SCROLL
         ============================================ */

      ion-infinite-scroll {
        margin-top: 0;
      }

      .feed-list__loading-more {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 24px;
        font-size: 14px;
        color: var(--list-text-secondary);

        ion-spinner {
          color: var(--list-primary);
        }
      }

      /* ============================================
         END OF FEED
         ============================================ */

      .feed-list__end {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        font-size: 14px;
        color: var(--list-text-tertiary);
        border-top: 1px solid var(--list-border);
        margin-top: 16px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedListComponent {
  // ============================================
  // INPUTS
  // ============================================

  readonly posts = input<readonly FeedPost[]>([]);
  readonly isLoading = input(false);
  readonly isLoadingMore = input(false);
  readonly isEmpty = input(false);
  readonly error = input<string | null>(null);
  readonly hasMore = input(false);
  readonly filterType = input<FeedFilterType>('for-you');
  readonly showMenu = input(true);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly postClick = output<FeedPost>();
  readonly authorClick = output<FeedAuthor>();
  readonly likeClick = output<FeedPost>();
  readonly commentClick = output<FeedPost>();
  readonly shareClick = output<FeedPost>();
  readonly bookmarkClick = output<FeedPost>();
  readonly menuClick = output<FeedPost>();
  readonly loadMore = output<void>();
  readonly retry = output<void>();
  readonly emptyCta = output<void>();

  // ============================================
  // CONFIG
  // ============================================

  protected readonly skeletonArray = Array.from(
    { length: FEED_UI_CONFIG.SKELETON_COUNT },
    (_, i) => i + 1
  );
  protected readonly animationDelay = FEED_UI_CONFIG.ITEM_ANIMATION_DELAY;

  // ============================================
  // METHODS
  // ============================================

  protected onInfiniteScroll(event: CustomEvent): void {
    this.loadMore.emit();

    // Complete the infinite scroll after a short delay
    setTimeout(() => {
      (event.target as HTMLIonInfiniteScrollElement)?.complete();
    }, 500);
  }
}
