/**
 * @fileoverview Profile Timeline Component - Posts Feed with Filters
 * @module @nxt1/ui/profile
 * @version 3.0.0
 *
 * Timeline content feed with sub-filters (All Posts, Pinned, Media).
 * Supports loading states, empty states, and infinite scroll.
 *
 * Uses the shared FeedPostCardComponent for consistent post card
 * rendering across the entire app (feed, explore, profile).
 * This follows the Instagram/Twitter pattern: one card component everywhere.
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
import { CommonModule } from '@angular/common';
import type {
  ProfilePost,
  ProfileUser,
  FeedPost,
  FeedAuthor,
  ProfileTimelineFilterId,
} from '@nxt1/core';
import {
  profilePostToFeedPost,
  profileUserToFeedAuthor,
  PROFILE_TIMELINE_FILTERS,
  PROFILE_TIMELINE_DEFAULT_FILTER,
} from '@nxt1/core';
import { ProfileSkeletonComponent } from './profile-skeleton.component';
import { NxtIconComponent } from '../components/icon';
import { FeedPostCardComponent } from '../feed/feed-post-card.component';

@Component({
  selector: 'nxt1-profile-timeline',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, ProfileSkeletonComponent, FeedPostCardComponent],
  template: `
    <div class="profile-timeline">
      <!-- Filter Tabs (only shown when filters enabled) -->
      @if (showFilters()) {
        <nav class="timeline-filters" role="tablist" aria-label="Timeline filters">
          @for (filter of filters; track filter.id) {
            <button
              type="button"
              role="tab"
              class="timeline-filter"
              [class.timeline-filter--active]="activeFilter() === filter.id"
              [attr.aria-selected]="activeFilter() === filter.id"
              [attr.aria-controls]="'timeline-panel-' + filter.id"
              (click)="setFilter(filter.id)"
            >
              <nxt1-icon [name]="filter.icon" [size]="14" />
              <span>{{ filter.label }}</span>
              @if (filter.id === 'pinned' && pinnedCount() > 0) {
                <span class="timeline-filter__badge">{{ pinnedCount() }}</span>
              }
            </button>
          }
          <!-- Active indicator bar -->
          <div
            class="timeline-filters__indicator"
            [style.width.%]="100 / filters.length"
            [style.transform]="'translateX(' + activeFilterIndex() * 100 + '%)'"
          ></div>
        </nav>
      }

      <!-- Loading State -->
      @if (isLoading()) {
        <div class="timeline-loading">
          @for (i of [1, 2, 3]; track i) {
            <nxt1-profile-skeleton variant="post" />
          }
        </div>
      }

      <!-- Error State -->
      @else if (error()) {
        <div class="timeline-error">
          <nxt1-icon name="alert-circle" [size]="48" />
          <h3>Something went wrong</h3>
          <p>{{ error() }}</p>
          <button class="retry-btn" (click)="retry.emit()">Try Again</button>
        </div>
      }

      <!-- Filtered Empty State -->
      @else if (isFilteredEmpty()) {
        <div class="timeline-empty">
          <div class="empty-icon">
            <nxt1-icon [name]="resolvedEmptyIcon()" [size]="36" />
          </div>
          <h3 class="empty-title">{{ resolvedEmptyTitle() }}</h3>
          <p class="empty-message">{{ resolvedEmptyMessage() }}</p>
          @if (isOwnProfile() && (!showFilters() || activeFilter() === 'all') && emptyCta()) {
            <button class="empty-cta" (click)="emptyCtaClick.emit()">
              {{ emptyCta() }}
            </button>
          }
        </div>
      }

      <!-- Posts List — Uses shared FeedPostCardComponent for consistent styles -->
      @else {
        <div class="timeline-posts" role="tabpanel" [id]="'timeline-panel-' + activeFilter()">
          @for (post of filteredFeedPosts(); track post.id; let idx = $index) {
            <nxt1-feed-post-card
              [post]="post"
              [hideAuthor]="true"
              [showMenu]="showMenu()"
              (postClick)="handlePostClick(idx)"
              (reactClick)="handleLikeClick(idx)"
              (repostClick)="handleCommentClick(idx)"
              (shareClick)="handleShareClick(idx)"
              (menuClick)="handleMenuClick(idx)"
            />
          }

          <!-- Load More (only for 'all' filter) -->
          @if (hasMore() && activeFilter() === 'all') {
            <div class="load-more">
              @if (isLoadingMore()) {
                <span class="load-more-spinner" aria-hidden="true"></span>
              } @else {
                <button class="load-more-btn" (click)="loadMore.emit()">Load More</button>
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
       Card styles delegated to shared FeedPostCardComponent
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
        display: flex;
        align-items: stretch;
        border-bottom: 1px solid var(--timeline-border);
        background: var(--timeline-bg);
        overflow: hidden;
      }

      .timeline-filter {
        flex: 1;
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

      .timeline-filters__indicator {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        background: var(--timeline-primary);
        border-radius: 2px 2px 0 0;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .timeline-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;

        nxt1-icon {
          font-size: 48px;
          color: var(--timeline-error);
          margin-bottom: 16px;
        }

        h3 {
          font-size: 18px;
          font-weight: 600;
          color: var(--timeline-text-primary);
          margin: 0 0 8px;
        }

        p {
          font-size: 14px;
          color: var(--timeline-text-secondary);
          margin: 0 0 20px;
        }
      }

      .retry-btn {
        padding: 10px 24px;
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
        }
      }

      /* ============================================
         EMPTY STATE
         ============================================ */

      .timeline-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 24px;
        text-align: center;
      }

      .empty-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--timeline-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;

        nxt1-icon {
          font-size: 36px;
          color: var(--timeline-text-tertiary);
        }
      }

      .empty-title {
        font-size: 20px;
        font-weight: 600;
        color: var(--timeline-text-primary);
        margin: 0 0 8px;
      }

      .empty-message {
        font-size: 15px;
        color: var(--timeline-text-secondary);
        margin: 0 0 24px;
        max-width: 300px;
      }

      .empty-cta {
        padding: 12px 32px;
        background: var(--timeline-primary);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: #000;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          filter: brightness(1.1);
        }

        &:active {
          transform: scale(0.97);
        }
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileTimelineComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Profile posts to display */
  readonly posts = input<readonly ProfilePost[]>([]);

  /** Profile owner — used to build FeedAuthor for card rendering */
  readonly profileUser = input<ProfileUser | null>(null);

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
  private readonly filterSync = effect(() => {
    const external = this.filter();
    if (external !== null) {
      this._activeFilter.set(external);
    }
  });

  /** Index of the active filter (for indicator positioning) */
  protected readonly activeFilterIndex = computed(() => {
    return this.filters.findIndex((f) => f.id === this._activeFilter());
  });

  /** Config for the currently active filter (for empty state text) */
  protected readonly activeFilterConfig = computed(() => {
    return this.filters.find((f) => f.id === this._activeFilter()) ?? this.filters[0];
  });

  /** Count of pinned posts (for badge on Pinned tab) */
  protected readonly pinnedCount = computed(() => {
    return this.posts().filter((p) => p.isPinned).length;
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

  /** Build FeedAuthor from profile user (shared across all posts) */
  private readonly feedAuthor = computed<FeedAuthor>(() => {
    const user = this.profileUser();
    if (user) return profileUserToFeedAuthor(user);

    // Fallback author when profileUser is not provided
    return {
      uid: '',
      profileCode: '',
      displayName: '',
      firstName: '',
      lastName: '',
      role: 'athlete',
      verificationStatus: 'unverified',
      isVerified: false,
    };
  });

  /** All ProfilePosts mapped to FeedPosts (before filtering) */
  private readonly allFeedPosts = computed<readonly FeedPost[]>(() => {
    const posts = this.posts();
    const author = this.feedAuthor();
    return posts.map((p) => profilePostToFeedPost(p, author));
  });

  /** Filtered posts based on active filter */
  protected readonly filteredPosts = computed<readonly ProfilePost[]>(() => {
    const posts = this.posts();
    const filter = this._activeFilter();

    switch (filter) {
      case 'pinned':
        return posts.filter((p) => p.isPinned);
      case 'media':
        return posts.filter(
          (p) =>
            p.type === 'image' ||
            p.type === 'video' ||
            p.type === 'highlight' ||
            !!p.thumbnailUrl ||
            !!p.mediaUrl
        );
      case 'all':
      default:
        return posts;
    }
  });

  /** Filtered FeedPosts for the card component */
  protected readonly filteredFeedPosts = computed<readonly FeedPost[]>(() => {
    const filteredProfilePosts = this.filteredPosts();
    const author = this.feedAuthor();
    return filteredProfilePosts.map((p) => profilePostToFeedPost(p, author));
  });

  /** Whether the filtered view is empty (posts exist but none match filter) */
  protected readonly isFilteredEmpty = computed(() => {
    return this.isEmpty() || this.filteredPosts().length === 0;
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
  // EVENT HANDLERS — Translate FeedPost events back to ProfilePost
  // ============================================

  protected handlePostClick(index: number): void {
    const post = this.filteredPosts()[index];
    if (post) this.postClick.emit(post);
  }

  protected handleLikeClick(index: number): void {
    const post = this.filteredPosts()[index];
    if (post) this.reactClick.emit(post);
  }

  protected handleCommentClick(index: number): void {
    const post = this.filteredPosts()[index];
    if (post) this.repostClick.emit(post);
  }

  protected handleShareClick(index: number): void {
    const post = this.filteredPosts()[index];
    if (post) this.shareClick.emit(post);
  }

  protected handleMenuClick(index: number): void {
    const post = this.filteredPosts()[index];
    if (post) this.menuClick.emit(post);
  }
}
