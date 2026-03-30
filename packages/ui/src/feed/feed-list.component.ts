/**
 * @fileoverview Feed List Component - Polymorphic Feed with Virtual Scroll
 * @module @nxt1/ui/feed
 * @version 3.0.0
 *
 * List component for feed with skeleton, empty, and error states.
 * Renders via polymorphic Smart Shell + atomic cards.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Polymorphic rendering via FeedCardShell + @switch
 * - Skeleton loading state (no spinners)
 * - Filter-specific empty states
 * - Error state with retry
 * - Infinite scroll with auto-load
 * - Smooth item animations
 *
 * @example
 * ```html
 * <nxt1-feed-list
 *   [polymorphicFeed]="items()"
 *   [isLoading]="isLoading()"
 *   [isEmpty]="isEmpty()"
 *   [error]="error()"
 *   [hasMore]="hasMore()"
 *   (loadMore)="onLoadMore()"
 *   (retry)="onRetry()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { IonSpinner, IonInfiniteScroll, IonInfiniteScrollContent } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../components/icon';
import { NxtActivityCardComponent } from '../components/activity-card';
import {
  type FeedPost,
  type FeedAuthor,
  type FeedFilterType,
  type FeedItem,
  type FeedItemPost,
  type FeedItemEvent,
  type FeedItemStat,
  type FeedItemMetric,
  type FeedItemOffer,
  type FeedItemCommitment,
  type FeedItemVisit,
  type FeedItemCamp,
  type FeedItemAward,
  type FeedItemNews,
  type ContentCardItem,
  FEED_UI_CONFIG,
  feedOfferToContentCard,
  feedCommitmentToContentCard,
  feedVisitToContentCard,
  feedCampToContentCard,
  feedPostToFeedItem,
} from '@nxt1/core';
import { FEED_CARD_TEST_IDS } from '@nxt1/core/testing';
import { FeedCardShellComponent } from './feed-card-shell.component';
import { FeedPostContentComponent } from './feed-post-content.component';
import { FeedStatCardComponent } from './feed-stat-card.component';
import { FeedEventCardComponent } from './feed-event-card.component';
import { FeedMetricsCardComponent } from './feed-metrics-card.component';
import { FeedAwardCardComponent } from './feed-award-card.component';
import { FeedNewsCardComponent } from './feed-news-card.component';
import { FeedSkeletonComponent } from './feed-skeleton.component';
import { FeedEmptyStateComponent } from './feed-empty-state.component';

@Component({
  selector: 'nxt1-feed-list',
  standalone: true,
  imports: [
    NxtIconComponent,
    NxtActivityCardComponent,
    IonSpinner,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    FeedCardShellComponent,
    FeedPostContentComponent,
    FeedStatCardComponent,
    FeedEventCardComponent,
    FeedMetricsCardComponent,
    FeedAwardCardComponent,
    FeedNewsCardComponent,
    FeedSkeletonComponent,
    FeedEmptyStateComponent,
  ],
  template: `
    <div class="feed-list" data-testid="feed-list-container">
      <!-- Loading State: Skeletons -->
      @if (isLoading()) {
        <div class="feed-list__skeletons" data-testid="feed-list-skeletons">
          @for (i of skeletonArray; track i) {
            <nxt1-feed-skeleton variant="post-with-media" />
          }
        </div>
      }

      <!-- Error State -->
      @else if (error()) {
        <div class="feed-list__error" data-testid="feed-list-error">
          <div class="feed-list__error-icon">
            <nxt1-icon name="alertCircle" [size]="32" />
          </div>
          <h3 class="feed-list__error-title">Something went wrong</h3>
          <p class="feed-list__error-message">{{ error() }}</p>
          <button
            type="button"
            class="feed-list__error-action"
            data-testid="feed-list-retry-btn"
            (click)="retry.emit()"
          >
            <nxt1-icon name="refresh" [size]="16" />
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
        <div
          class="feed-list__posts"
          [class.feed-list__posts--compact]="compactCards()"
          data-testid="feed-list-posts"
        >
          @for (item of effectiveFeed(); track item.id; let i = $index) {
            <div
              class="feed-list__post-wrapper"
              [style.animation-delay]="i * animationDelay + 'ms'"
            >
              <nxt1-feed-card-shell
                [item]="item"
                [hideAuthor]="false"
                [showMenu]="showMenu()"
                [compact]="compactCards()"
                (authorClick)="handlePolyAuthorClick($event)"
                (contentClick)="handlePolyContentClick(i)"
                (menuClick)="handlePolyMenuClick(i)"
              >
                @switch (item.feedType) {
                  @case ('POST') {
                    <ng-container>
                      <nxt1-feed-post-content feedShellLead [data]="asPost(item)" mode="media" />
                      <nxt1-feed-post-content [data]="asPost(item)" mode="body" />
                    </ng-container>
                  }
                  @case ('EVENT') {
                    <nxt1-feed-event-card [data]="asEvent(item).eventData" />
                  }
                  @case ('STAT') {
                    <nxt1-feed-stat-card [data]="asStat(item).statData" />
                  }
                  @case ('METRIC') {
                    <nxt1-feed-metrics-card [data]="asMetric(item).metricsData" />
                  }
                  @case ('OFFER') {
                    <nxt1-activity-card [item]="toOfferCard(asOffer(item))" />
                  }
                  @case ('COMMITMENT') {
                    <nxt1-activity-card [item]="toCommitmentCard(asCommitment(item))" />
                  }
                  @case ('VISIT') {
                    <nxt1-activity-card [item]="toVisitCard(asVisit(item))" />
                  }
                  @case ('CAMP') {
                    <nxt1-activity-card [item]="toCampCard(asCamp(item))" />
                  }
                  @case ('AWARD') {
                    <nxt1-feed-award-card [data]="asAward(item).awardData" />
                  }
                  @case ('NEWS') {
                    <nxt1-feed-news-card [data]="asNews(item).newsData" />
                  }
                  @default {
                    @if (asFallbackContent(item); as content) {
                      <p class="feed-fallback-text">{{ content }}</p>
                    }
                  }
                }
              </nxt1-feed-card-shell>
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
        @if (!hasMore() && effectiveFeed().length > 0) {
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
        padding-top: 16px;
      }

      /* ============================================
         SKELETONS
         ============================================ */

      .feed-list__skeletons {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
      }

      @media (max-width: 640px) {
        .feed-list__skeletons {
          grid-template-columns: 1fr;
          gap: 0;
        }
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
        min-width: 0;
      }

      @media (min-width: 768px) {
        .feed-list__posts {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .feed-list__posts--compact {
          display: block;
          column-count: 2;
          column-gap: 16px;
        }
      }

      .feed-list__post-wrapper {
        min-width: 0;
      }

      .feed-list__post-wrapper {
        animation: feed-item-in 0.3s ease-out both;
      }

      .feed-list__posts--compact .feed-list__post-wrapper {
        display: inline-block;
        width: 100%;
        margin-bottom: 16px;
        break-inside: avoid;
        page-break-inside: avoid;
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

  /** Legacy feed posts (backward compatibility) */
  readonly posts = input<readonly FeedPost[]>([]);

  /** New polymorphic feed items (discriminated union FeedItem[]) */
  readonly polymorphicFeed = input<readonly FeedItem[]>([]);

  readonly isLoading = input(false);
  readonly isLoadingMore = input(false);
  readonly isEmpty = input(false);
  readonly error = input<string | null>(null);
  readonly hasMore = input(false);
  readonly filterType = input<FeedFilterType>('for-you');
  readonly showMenu = input(true);
  readonly compactCards = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly postClick = output<FeedPost>();
  readonly authorClick = output<FeedAuthor>();
  readonly reactClick = output<FeedPost>();
  readonly repostClick = output<FeedPost>();
  readonly shareClick = output<FeedPost>();
  readonly bookmarkClick = output<FeedPost>();
  readonly menuClick = output<FeedPost>();
  readonly itemClick = output<FeedItem>();
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
  protected readonly testIds = FEED_CARD_TEST_IDS;

  // ============================================
  // BRIDGE — Prefer polymorphicFeed; auto-convert legacy posts if needed
  // ============================================

  /**
   * Resolved feed data: uses `polymorphicFeed` when provided by parent,
   * otherwise auto-converts legacy `posts` input via `feedPostToFeedItem`.
   * This ensures the polymorphic template works with both new and old data sources.
   */
  protected readonly effectiveFeed = computed<readonly FeedItem[]>(() => {
    const poly = this.polymorphicFeed();
    if (poly.length > 0) return poly;
    return this.posts().map((p) => feedPostToFeedItem(p));
  });

  // ============================================
  // METHODS
  // ============================================

  protected onInfiniteScroll(event: CustomEvent): void {
    this.loadMore.emit();
    setTimeout(() => {
      (event.target as HTMLIonInfiniteScrollElement)?.complete();
    }, 500);
  }

  // ============================================
  // POLYMORPHIC EVENT HANDLERS
  // ============================================

  protected handlePolyAuthorClick(author: FeedAuthor): void {
    this.authorClick.emit(author);
  }

  protected handlePolyContentClick(index: number): void {
    const item = this.effectiveFeed()[index];
    if (item) this.itemClick.emit(item);
  }

  protected handlePolyMenuClick(index: number): void {
    const item = this.effectiveFeed()[index];
    if (item) this.itemClick.emit(item);
  }

  // ============================================
  // POLYMORPHIC → ContentCardItem CONVERTERS
  // ============================================

  protected toOfferCard(item: FeedItemOffer): ContentCardItem {
    return feedOfferToContentCard(item.offerData);
  }

  protected toCommitmentCard(item: FeedItemCommitment): ContentCardItem {
    return feedCommitmentToContentCard(item.commitmentData);
  }

  protected toVisitCard(item: FeedItemVisit): ContentCardItem {
    return feedVisitToContentCard(item.visitData);
  }

  protected toCampCard(item: FeedItemCamp): ContentCardItem {
    return feedCampToContentCard(item.campData);
  }

  // ============================================
  // TYPE-SAFE CAST HELPERS
  // ============================================

  protected asPost(item: FeedItem): FeedItemPost {
    return item as FeedItemPost;
  }

  protected asEvent(item: FeedItem): FeedItemEvent {
    return item as FeedItemEvent;
  }

  protected asStat(item: FeedItem): FeedItemStat {
    return item as FeedItemStat;
  }

  protected asMetric(item: FeedItem): FeedItemMetric {
    return item as FeedItemMetric;
  }

  protected asOffer(item: FeedItem): FeedItemOffer {
    return item as FeedItemOffer;
  }

  protected asCommitment(item: FeedItem): FeedItemCommitment {
    return item as FeedItemCommitment;
  }

  protected asVisit(item: FeedItem): FeedItemVisit {
    return item as FeedItemVisit;
  }

  protected asCamp(item: FeedItem): FeedItemCamp {
    return item as FeedItemCamp;
  }

  protected asAward(item: FeedItem): FeedItemAward {
    return item as FeedItemAward;
  }

  protected asNews(item: FeedItem): FeedItemNews {
    return item as FeedItemNews;
  }

  protected asFallbackContent(item: FeedItem): string | null {
    const record = item as unknown as Record<string, unknown>;
    return typeof record['content'] === 'string' ? record['content'] : null;
  }
}
