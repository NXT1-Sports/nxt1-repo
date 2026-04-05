/**
 * @fileoverview Profile Timeline Component - Posts Feed with Filters
 * @module @nxt1/ui/profile
 * @version 4.0.0
 *
 * Timeline content feed with sub-filters (All Posts, Pinned, Media).
 * Supports loading states, empty states, and infinite scroll.
 *
 * Uses polymorphic Smart Shell + atomic card rendering.
 * Each FeedItem variant is rendered by its specialized atomic component,
 * composed via FeedCardShellComponent.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  effect,
} from '@angular/core';
import type {
  ProfilePost,
  FeedPost,
  FeedItem,
  FeedItemPost,
  FeedItemEvent,
  FeedItemStat,
  FeedItemMetric,
  FeedItemOffer,
  FeedItemCommitment,
  FeedItemVisit,
  FeedItemCamp,
  FeedItemAward,
  FeedItemNews,
  ProfileTimelineFilterId,
} from '@nxt1/core';
import {
  PROFILE_TIMELINE_FILTERS,
  PROFILE_TIMELINE_DEFAULT_FILTER,
  feedOfferToContentCard,
  feedCommitmentToContentCard,
  feedVisitToContentCard,
  feedCampToContentCard,
  feedPostToFeedItem,
} from '@nxt1/core';
import type { ContentCardItem } from '@nxt1/core';
import { PROFILE_TIMELINE_TEST_IDS } from '@nxt1/core/testing';
import { ProfileSkeletonComponent } from './profile-skeleton.component';
import { NxtIconComponent } from '../components/icon';
import { NxtStateViewComponent } from '../components/state-view';
import { NxtActivityCardComponent } from '../components/activity-card';
import { FeedCardShellComponent } from '../feed/feed-card-shell.component';
import { FeedPostContentComponent } from '../feed/feed-post-content.component';
import { FeedStatCardComponent } from '../feed/feed-stat-card.component';
import { FeedEventCardComponent } from '../feed/feed-event-card.component';
import { FeedMetricsCardComponent } from '../feed/feed-metrics-card.component';
import { FeedAwardCardComponent } from '../feed/feed-award-card.component';
import { FeedNewsCardComponent } from '../feed/feed-news-card.component';

@Component({
  selector: 'nxt1-profile-timeline',
  standalone: true,
  imports: [
    NxtIconComponent,
    NxtStateViewComponent,
    NxtActivityCardComponent,
    ProfileSkeletonComponent,
    FeedCardShellComponent,
    FeedPostContentComponent,
    FeedStatCardComponent,
    FeedEventCardComponent,
    FeedMetricsCardComponent,
    FeedAwardCardComponent,
    FeedNewsCardComponent,
  ],
  template: `
    <div class="profile-timeline" [attr.data-testid]="timelineTestIds.CONTAINER">
      <!-- Filter Tabs (only shown when filters enabled) -->
      @if (showFilters()) {
        <nav
          class="timeline-filters"
          role="tablist"
          aria-label="Timeline filters"
          [attr.data-testid]="timelineTestIds.FILTERS_NAV"
        >
          <div class="timeline-filters__scroll">
            @for (filter of filters; track filter.id) {
              <button
                type="button"
                role="tab"
                class="timeline-filter"
                [class.timeline-filter--active]="activeFilter() === filter.id"
                [attr.aria-selected]="activeFilter() === filter.id"
                [attr.aria-controls]="'timeline-panel-' + filter.id"
                [attr.data-testid]="timelineTestIds.FILTER_TAB"
                (click)="setFilter(filter.id)"
              >
                <nxt1-icon [name]="filter.icon" [size]="14" />
                <span>{{ filter.label }}</span>
                @if (filter.id === 'pinned' && pinnedCount() > 0) {
                  <span
                    class="timeline-filter__badge"
                    [attr.data-testid]="timelineTestIds.FILTER_BADGE"
                    >{{ pinnedCount() }}</span
                  >
                }
                @if (filter.id === 'offers' && filterBadgeCounts().offers > 0) {
                  <span
                    class="timeline-filter__badge"
                    [attr.data-testid]="timelineTestIds.FILTER_BADGE"
                    >{{ filterBadgeCounts().offers }}</span
                  >
                }
                @if (filter.id === 'events' && filterBadgeCounts().events > 0) {
                  <span
                    class="timeline-filter__badge"
                    [attr.data-testid]="timelineTestIds.FILTER_BADGE"
                    >{{ filterBadgeCounts().events }}</span
                  >
                }
              </button>
            }
          </div>
        </nav>
      }

      <!-- Loading State -->
      @if (isLoading()) {
        <div class="timeline-loading" [attr.data-testid]="timelineTestIds.LOADING">
          @for (i of [1, 2, 3]; track i) {
            <nxt1-profile-skeleton variant="post" />
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
          (action)="retry.emit()"
          [attr.data-testid]="timelineTestIds.ERROR"
        />
      }

      <!-- Filtered Empty State -->
      @else if (isFilteredEmpty()) {
        <nxt1-state-view
          variant="empty"
          [icon]="resolvedEmptyIcon()"
          [title]="resolvedEmptyTitle()"
          [message]="resolvedEmptyMessage()"
          [actionLabel]="
            isOwnProfile() && (!showFilters() || activeFilter() === 'all') && emptyCta()
              ? emptyCta()!
              : ''
          "
          (action)="emptyCtaClick.emit()"
          [attr.data-testid]="timelineTestIds.EMPTY"
        />
      }

      <!-- Posts List — Polymorphic Smart Shell + Atomic Cards -->
      @else {
        <div
          class="timeline-posts"
          role="tabpanel"
          [id]="'timeline-panel-' + activeFilter()"
          [attr.data-testid]="timelineTestIds.POSTS_PANEL"
        >
          @for (item of filteredPolyFeed(); track item.id; let idx = $index) {
            <nxt1-feed-card-shell
              [item]="item"
              [hideAuthor]="true"
              [showMenu]="showMenu()"
              (contentClick)="handlePolyPostClick(idx)"
              (menuClick)="handlePolyMenuClick(idx)"
            >
              @switch (item.feedType) {
                @case ('POST') {
                  <nxt1-feed-post-content [data]="asPost(item)" />
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
          }

          <!-- Load More (only for 'all' filter) -->
          @if (hasMore() && activeFilter() === 'all') {
            <div class="load-more" [attr.data-testid]="timelineTestIds.LOAD_MORE">
              @if (isLoadingMore()) {
                <span class="load-more-spinner" aria-hidden="true"></span>
              } @else {
                <button
                  class="load-more-btn"
                  [attr.data-testid]="timelineTestIds.LOAD_MORE_BTN"
                  (click)="loadMore.emit()"
                >
                  Load More
                </button>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       PROFILE TIMELINE - Posts Feed
       2026 Professional Native-Style Design
       Card styles delegated to FeedCardShellComponent + atomic cards
       ============================================ */

      :host {
        display: block;

        --timeline-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --timeline-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --timeline-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --timeline-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --timeline-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --timeline-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --timeline-primary: var(--nxt1-color-primary, #d4ff00);
        --timeline-error: var(--nxt1-color-error, #ff4444);
      }

      .profile-timeline {
        min-height: 200px;
      }

      /* ============================================
         FILTER TABS (Twitter/Instagram style)
         ============================================ */

      .timeline-filters {
        position: relative;
        border-bottom: 1px solid var(--timeline-border);
        background: var(--timeline-bg);
        overflow: hidden;
      }

      .timeline-filters__scroll {
        display: flex;
        align-items: stretch;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;

        &::-webkit-scrollbar {
          display: none;
        }
      }

      .timeline-filter {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 12px 16px;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        color: var(--timeline-text-tertiary);
        transition: color 0.2s ease;
        position: relative;
        white-space: nowrap;
        -webkit-tap-highlight-color: transparent;

        &:hover {
          color: var(--timeline-text-secondary);
        }
      }

      .timeline-filter--active {
        color: var(--timeline-primary);
        box-shadow: inset 0 -2px 0 var(--timeline-primary);
      }

      .timeline-filter__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        background: color-mix(in srgb, var(--timeline-primary) 15%, transparent);
        color: var(--timeline-primary);
        font-size: 10px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }

      /* ============================================
         LOAD MORE
         ============================================ */

      .load-more {
        display: flex;
        justify-content: center;
        padding: 24px;
      }

      .load-more-btn {
        padding: 12px 32px;
        background: var(--timeline-surface);
        border: 1px solid var(--timeline-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        color: var(--timeline-text-primary);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--timeline-primary);
        }
      }

      .load-more-spinner {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 2px solid var(--timeline-surface);
        border-top-color: var(--timeline-primary);
        animation: timelineSpin 0.8s linear infinite;
      }

      @keyframes timelineSpin {
        to {
          transform: rotate(360deg);
        }
      }

      .timeline-posts {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileTimelineComponent {
  // ============================================
  // TEST IDS
  // ============================================

  protected readonly timelineTestIds = PROFILE_TIMELINE_TEST_IDS;

  // ============================================
  // INPUTS
  // ============================================

  /** Profile posts to display */
  readonly posts = input<readonly ProfilePost[]>([]);

  /**
   * Unified activity feed (pre-built FeedPost[]).
   * When provided, this replaces the posts→FeedPost mapping
   * and includes all activity types (offers, events, stats, etc.).
   * Built by ProfileService.unifiedTimeline.
   */
  readonly unifiedFeed = input<readonly FeedPost[]>([]);

  /**
   * New polymorphic feed (discriminated union FeedItem[]).
   * When provided, the component renders via Smart Shell + atomic cards
   * instead of the legacy monolithic FeedPostCardComponent.
   * Built by the backend's TimelineService.
   */
  readonly polymorphicFeed = input<readonly FeedItem[]>([]);

  readonly isLoading = input(false);
  readonly isLoadingMore = input(false);
  readonly isEmpty = input(false);
  readonly error = input<string | null>(null);
  readonly hasMore = input(false);
  readonly isOwnProfile = input(false);
  readonly showMenu = input(false);
  /** Show the filter tabs (All Posts / Pinned / Media). Disable for news/videos sub-tabs. */
  readonly showFilters = input(true);
  /** External filter override — when set, drives filtering from outside (e.g. web sidebar). */
  readonly filter = input<ProfileTimelineFilterId | null>(null);
  /** Override empty state icon (used when filters are hidden) */
  readonly emptyIcon = input<string | null>(null);
  /** Override empty state title */
  readonly emptyTitle = input<string | null>(null);
  /** Override empty state message */
  readonly emptyMessage = input<string | null>(null);
  readonly emptyCta = input<string | null>(null);

  // ============================================
  // OUTPUTS — Still emit ProfilePost for backward compatibility
  // ============================================

  readonly postClick = output<ProfilePost>();
  readonly reactClick = output<ProfilePost>();
  readonly repostClick = output<ProfilePost>();
  readonly shareClick = output<ProfilePost>();
  readonly menuClick = output<ProfilePost>();
  readonly loadMore = output<void>();
  readonly retry = output<void>();
  readonly emptyCtaClick = output<void>();
  readonly filterChange = output<ProfileTimelineFilterId>();

  // ============================================
  // FILTER STATE
  // ============================================

  /** Available filter tabs */
  protected readonly filters = PROFILE_TIMELINE_FILTERS;

  /** Currently active filter */
  private readonly _activeFilter = signal<ProfileTimelineFilterId>(PROFILE_TIMELINE_DEFAULT_FILTER);
  protected readonly activeFilter = this._activeFilter.asReadonly();

  /** Sync external filter input to internal state */
  constructor() {
    effect(() => {
      const external = this.filter();
      if (external !== null) {
        this._activeFilter.set(external);
      }
    });
  }

  /** Config for the currently active filter (for empty state text) */
  protected readonly activeFilterConfig = computed(() => {
    return this.filters.find((f) => f.id === this._activeFilter()) ?? this.filters[0];
  });

  /** Count of pinned posts (for badge on Pinned tab) */
  protected readonly pinnedCount = computed(() => {
    const feed = this.effectiveFeed();
    if (feed.length > 0) return feed.filter((item) => item.isPinned).length;
    return this.posts().filter((p) => p.isPinned).length;
  });

  /** Badge counts for activity type filters */
  protected readonly filterBadgeCounts = computed(() => {
    const feed = this.effectiveFeed();
    return {
      offers: feed.filter((item) => item.feedType === 'OFFER' || item.feedType === 'COMMITMENT')
        .length,
      events: feed.filter(
        (item) => item.feedType === 'EVENT' || item.feedType === 'VISIT' || item.feedType === 'CAMP'
      ).length,
    };
  });

  /** Resolved empty icon: input override → filter config */
  protected readonly resolvedEmptyIcon = computed(() => {
    return this.emptyIcon() ?? this.activeFilterConfig().icon;
  });

  /** Resolved empty title: input override → filter config */
  protected readonly resolvedEmptyTitle = computed(() => {
    return this.emptyTitle() ?? this.activeFilterConfig().emptyTitle;
  });

  /** Resolved empty message: input override → filter config */
  protected readonly resolvedEmptyMessage = computed(() => {
    return this.emptyMessage() ?? this.activeFilterConfig().emptyMessage;
  });

  // ============================================
  // COMPUTED — Map ProfilePost[] → FeedPost[] for unified rendering
  // ============================================

  // ============================================
  // BRIDGE — Prefer polymorphicFeed; auto-convert legacy unifiedFeed if needed
  // ============================================

  /**
   * Resolved feed data: uses `polymorphicFeed` when provided by parent,
   * otherwise auto-converts legacy `unifiedFeed` input via `feedPostToFeedItem`.
   * This ensures the polymorphic template works with both new and old data sources.
   */
  private readonly effectiveFeed = computed<readonly FeedItem[]>(() => {
    const poly = this.polymorphicFeed();
    if (poly.length > 0) return poly;
    const unified = this.unifiedFeed();
    if (unified.length > 0) return unified.map((p) => feedPostToFeedItem(p));
    return [];
  });

  /** Build FeedAuthor from profile user (shared across all posts) */
  /** Whether the filtered view is empty (content exists but none match filter) */
  protected readonly isFilteredEmpty = computed(() => {
    if (this.isEmpty()) return true;
    return this.filteredPolyFeed().length === 0;
  });

  /** Filtered FeedItems for the polymorphic path */
  protected readonly filteredPolyFeed = computed<readonly FeedItem[]>(() => {
    const feed = this.effectiveFeed();
    const filter = this._activeFilter();

    switch (filter) {
      case 'all':
        return feed;
      case 'pinned':
        return feed.filter((item) => item.isPinned);
      case 'media':
        return feed.filter(
          (item) => item.feedType === 'POST' && (item as FeedItemPost).media.length > 0
        );
      case 'offers':
        return feed.filter((item) => item.feedType === 'OFFER' || item.feedType === 'COMMITMENT');
      case 'events':
        return feed.filter(
          (item) =>
            item.feedType === 'EVENT' || item.feedType === 'VISIT' || item.feedType === 'CAMP'
        );
      case 'stats':
        return feed.filter((item) => item.feedType === 'STAT' || item.feedType === 'METRIC');
      case 'news':
        return feed.filter((item) => item.feedType === 'NEWS' || item.feedType === 'SCOUT_REPORT');
      default:
        return feed;
    }
  });

  // ============================================
  // FILTER ACTIONS
  // ============================================

  protected setFilter(filterId: ProfileTimelineFilterId): void {
    if (this._activeFilter() === filterId) return;
    this._activeFilter.set(filterId);
    this.filterChange.emit(filterId);
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected handlePolyPostClick(index: number): void {
    // Try to resolve to legacy ProfilePost for backward compat
    const item = this.filteredPolyFeed()[index];
    if (!item) return;
    const post = this.posts().find((p) => p.id === item.id);
    if (post) this.postClick.emit(post);
  }

  protected handlePolyMenuClick(index: number): void {
    const item = this.filteredPolyFeed()[index];
    if (!item) return;
    const post = this.posts().find((p) => p.id === item.id);
    if (post) this.menuClick.emit(post);
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
  // Used in @switch template to narrow FeedItem without $any().
  // Each @case guarantees the feedType discriminator, so the cast is safe.
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
