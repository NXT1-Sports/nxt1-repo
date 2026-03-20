/**
 * @fileoverview Explore Shell Component - Main Container
 * @module @nxt1/ui/explore
 * @version 1.0.0
 *
 * Main container for the Explore/Search feature using shared NxtPageHeaderComponent.
 * Search bar replaces title in header, tab scroller below, and results list.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-explore-shell
 *   [user]="user()"
 *   (avatarClick)="openSidenav()"
 *   (tabChange)="onTabChange($event)"
 *   (itemClick)="onItemClick($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { timeOutline, trendingUpOutline, chevronForwardOutline } from 'ionicons/icons';
import {
  type ExploreTabId,
  type ExploreItem,
  type ScoutReport,
  EXPLORE_TABS,
  EXPLORE_SEARCH_CONFIG,
  isFeedTab,
} from '@nxt1/core';
import type { FeedPost, FeedAuthor, FeedFilterType } from '@nxt1/core';
import { NxtPageHeaderComponent } from '../components/page-header';
import { NxtIconComponent } from '../components/icon';
import { NxtSearchBarComponent, type SearchBarSubmitEvent } from '../components/search-bar';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import { NxtLoggingService } from '../services/logging/logging.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { ExploreService } from './explore.service';
import { ExploreListComponent } from './explore-list.component';
import { ExploreSkeletonComponent } from './explore-skeleton.component';
import { ScoutReportsContentComponent } from '../scout-reports/scout-reports-content.component';
import { NewsContentComponent } from '../news/news-content.component';
import { FeedListComponent } from '../feed/feed-list.component';
import { FeedService } from '../feed/feed.service';
import { ExploreFilterModalService } from './explore-filter-modal.service';

// Register icons for search suggestions
/** User info for header display */
export interface ExploreUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
  readonly followingCount?: number;
  readonly followingIds?: readonly string[];
}

@Component({
  selector: 'nxt1-explore-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonContent,
    IonIcon,
    NxtIconComponent,
    NxtSearchBarComponent,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    ExploreListComponent,
    ExploreSkeletonComponent,
    ScoutReportsContentComponent,
    NewsContentComponent,
    FeedListComponent,
  ],
  template: `
    <!-- Professional Page Header with shared Top Nav search styling -->
    @if (!hideHeader()) {
      <nxt1-page-header [hideAvatar]="explore.isSearchFocused()" (menuClick)="onAvatarClick()">
        @if (!explore.isSearchFocused()) {
          <ion-button
            pageHeaderSlot="end"
            fill="clear"
            aria-label="Open filters"
            (click)="onFilterClick()"
            class="header-filter-btn"
          >
            <nxt1-icon name="funnel-outline" [size]="22" />
            @if (activeFilterCount() > 0) {
              <span class="header-filter-badge">{{ activeFilterCount() }}</span>
            }
          </ion-button>
        }

        <div pageHeaderSlot="inline-search">
          <nxt1-search-bar
            variant="mobile"
            placeholder="AI Search"
            [value]="searchValue()"
            [focused]="explore.isSearchFocused()"
            (searchInput)="onSearchInputFromBar($event)"
            (searchSubmit)="onSearchSubmitFromBar($event)"
            (searchClear)="onSearchClear()"
            (searchFocus)="onSearchFocus()"
            (searchBlur)="onSearchBlur()"
            (searchCancel)="onCancelSearch()"
          />
        </div>
      </nxt1-page-header>
    }

    <!-- Twitter/TikTok Style Tab Selector -->
    @if (!explore.isSearchFocused() || explore.hasQuery()) {
      <nxt1-option-scroller
        [options]="tabOptions()"
        [selectedId]="explore.activeTab()"
        [config]="{ scrollable: false, stretchToFill: true, centered: true, showDivider: true }"
        (selectionChange)="onTabChange($event)"
      />
    }

    <ion-content [fullscreen]="true" class="explore-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" />

      <div class="explore-container">
        <!-- Search Suggestions Overlay (shown when focused, no query) -->
        @if (explore.isSearchFocused() && !explore.hasQuery()) {
          <div class="search-suggestions">
            <!-- Recent Searches -->
            @if (explore.recentSearches().length > 0) {
              <div class="suggestions-section">
                <h4 class="suggestions-title">Recent</h4>
                @for (search of explore.recentSearches(); track search) {
                  <button class="suggestion-item" (click)="onSuggestionClick(search)">
                    <ion-icon name="time-outline" />
                    <span class="suggestion-text">{{ search }}</span>
                    <ion-icon name="chevron-forward-outline" class="suggestion-arrow" />
                  </button>
                }
              </div>
            }

            <!-- Trending Searches -->
            @if (explore.trendingSearches().length > 0) {
              <div class="suggestions-section">
                <h4 class="suggestions-title">Trending</h4>
                @for (search of explore.trendingSearches(); track search) {
                  <button class="suggestion-item" (click)="onSuggestionClick(search)">
                    <ion-icon name="trending-up-outline" />
                    <span class="suggestion-text">{{ search }}</span>
                    <ion-icon name="chevron-forward-outline" class="suggestion-arrow" />
                  </button>
                }
              </div>
            }
          </div>
        }

        <!-- Main Content -->
        @if (!explore.isSearchFocused() || explore.hasQuery()) {
          <!-- Discover Tab: Personalized posts feed -->
          @if (explore.activeTab() === 'for-you' && !explore.hasQuery()) {
            <nxt1-feed-list
              [posts]="feedService.posts()"
              [isLoading]="feedService.isLoading()"
              [isLoadingMore]="feedService.isLoadingMore()"
              [isEmpty]="feedService.isEmpty()"
              [error]="feedService.error()"
              [hasMore]="feedService.hasMore()"
              [filterType]="'for-you'"
              (postClick)="onPostSelect($event)"
              (authorClick)="onAuthorSelect($event)"
              (reactClick)="onLikeClick($event)"
              (repostClick)="onCommentClick($event)"
              (shareClick)="onShareClick($event)"
              (bookmarkClick)="onBookmarkClick($event)"
              (loadMore)="onFeedLoadMore()"
              (retry)="onFeedRetry()"
            />
          } @else if (explore.activeTab() === 'following' && !explore.hasQuery()) {
            <!-- Following Tab: Posts from followed users -->
            <nxt1-feed-list
              [posts]="feedService.posts()"
              [isLoading]="feedService.isLoading()"
              [isLoadingMore]="feedService.isLoadingMore()"
              [isEmpty]="feedService.isEmpty()"
              [error]="feedService.error()"
              [hasMore]="feedService.hasMore()"
              [filterType]="'following'"
              (postClick)="onPostSelect($event)"
              (authorClick)="onAuthorSelect($event)"
              (reactClick)="onLikeClick($event)"
              (repostClick)="onCommentClick($event)"
              (shareClick)="onShareClick($event)"
              (bookmarkClick)="onBookmarkClick($event)"
              (loadMore)="onFeedLoadMore()"
              (retry)="onFeedRetry()"
            />
          } @else if (explore.activeTab() === 'news' && !explore.hasQuery()) {
            <!-- News Tab: Sports recruiting news -->
            <nxt1-news-content
              (articleSelect)="onNewsArticleSelect($event)"
              (xpBadgeClick)="onXpBadgeClick()"
            />
          } @else if (explore.activeTab() === 'scout-reports' && !explore.hasQuery()) {
            <!-- Scout Reports Tab -->
            <nxt1-scout-reports-content
              (reportSelect)="onScoutReportSelect($event)"
              (openFilters)="onScoutReportFiltersOpen()"
            />
          } @else {
            @defer (on viewport; prefetch on idle) {
              <nxt1-explore-list
                [items]="explore.items()"
                [activeTab]="explore.activeTab()"
                [isLoading]="explore.isLoading()"
                [isLoadingMore]="explore.isLoadingMore()"
                [isEmpty]="explore.isEmpty()"
                [hasQuery]="explore.hasQuery()"
                [error]="explore.error()"
                [hasMore]="explore.hasMore()"
                (loadMore)="onLoadMore()"
                (retry)="onRetry()"
                (itemClick)="onItemClick($event)"
              />
            } @placeholder {
              <nxt1-explore-skeleton />
            } @loading (minimum 200ms) {
              <nxt1-explore-skeleton />
            }
          }
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
         EXPLORE SHELL - iOS 26 LIQUID GLASS DESIGN
         100% Theme Aware (Light + Dark Mode)
         Matches Activity/Home shell pattern exactly
         ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;

        /* Theme-aware CSS Variables */
        --explore-bg: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --explore-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        --explore-surface-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        --explore-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --explore-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --explore-primary: var(--nxt1-color-primary, #ccff00);
      }

      /* Mobile overrides now handled by NxtSearchBarComponent variant="mobile" */

      /* Content area */
      .explore-content {
        --background: var(--explore-bg);
      }

      .explore-container {
        min-height: 100%;
        padding-bottom: env(safe-area-inset-bottom, 0);
      }

      /* Content padding for scrolling */
      .explore-container {
        padding-bottom: 80px; /* Space for tab bar */
      }

      /* Search Suggestions */
      .search-suggestions {
        padding: var(--nxt1-spacing-4, 16px);
      }

      .suggestions-section {
        margin-bottom: var(--nxt1-spacing-6, 24px);
      }

      .suggestions-section:last-child {
        margin-bottom: 0;
      }

      .suggestions-title {
        font-size: 13px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--explore-text-muted);
        margin: 0 0 var(--nxt1-spacing-3, 12px) 0;
      }

      .suggestion-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
        padding: var(--nxt1-spacing-3, 12px);
        background: var(--explore-surface);
        border: none;
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        text-align: left;
        margin-bottom: var(--nxt1-spacing-2, 8px);
        transition: background-color 0.2s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .suggestion-item:hover {
        background: var(--explore-surface-hover);
      }

      .suggestion-item:active {
        transform: scale(0.98);
      }

      .suggestion-item ion-icon {
        flex-shrink: 0;
        font-size: 18px;
        color: var(--explore-text-muted);
      }

      .suggestion-text {
        flex: 1;
        font-size: 15px;
        font-weight: 500;
        color: var(--explore-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .suggestion-arrow {
        flex-shrink: 0;
        font-size: 16px;
        color: var(--explore-text-muted);
        opacity: 0.5;
      }

      .header-filter-btn {
        position: relative;
      }

      .header-filter-badge {
        position: absolute;
        top: 2px;
        right: 2px;
        min-width: 14px;
        height: 14px;
        padding: 0 3px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 9px;
        font-weight: 700;
        line-height: 14px;
        text-align: center;
        color: var(--nxt1-color-on-primary, #0a0a0a);
        background: var(--nxt1-color-primary, #ccff00);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreShellComponent implements OnInit {
  constructor() {
    addIcons({ timeOutline, trendingUpOutline, chevronForwardOutline });
  }

  protected readonly explore = inject(ExploreService);
  protected readonly feedService = inject(FeedService);
  private readonly filterModal = inject(ExploreFilterModalService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('ExploreShell');

  // Inputs
  readonly user = input<ExploreUser | null>(null);

  /** Hide page header on desktop (when using sidebar shell) */
  readonly hideHeader = input(false);

  // Outputs
  readonly avatarClick = output<void>();
  readonly tabChange = output<ExploreTabId>();
  readonly itemClick = output<ExploreItem>();
  readonly scoutReportSelect = output<ScoutReport>();
  readonly scoutReportFiltersOpen = output<void>();
  readonly postSelect = output<FeedPost>();
  readonly authorSelect = output<FeedAuthor>();
  readonly newsArticleSelect = output<{ id: string; title: string }>();
  readonly xpBadgeClick = output<void>();

  // Local state
  protected readonly searchValue = signal('');
  protected readonly searchPlaceholder = 'AI Search';

  // Computed
  protected readonly displayName = computed(() => this.user()?.displayName ?? 'User');
  protected readonly activeFilterCount = computed(() =>
    this.explore.getActiveFilterCount(this.explore.activeTab())
  );

  protected readonly hasFollowingOption = computed(() => {
    const followingCount = this.user()?.followingCount ?? 0;
    const followingIdsCount = this.user()?.followingIds?.length ?? 0;
    return followingCount > 0 || followingIdsCount > 0;
  });

  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const counts = this.explore.tabCounts();
    const visibleTabIds: ExploreTabId[] = ['for-you', 'news'];

    return visibleTabIds
      .map((tabId) => EXPLORE_TABS.find((tab) => tab.id === tabId))
      .filter((tab): tab is (typeof EXPLORE_TABS)[number] => tab !== undefined)
      .map((tab) => ({
        id: tab.id,
        label: tab.id === 'news' ? 'Pulse' : tab.id === 'for-you' ? 'Discover' : tab.label,
        badge: counts[tab.id] > 0 ? counts[tab.id] : undefined,
      }));
  });

  ngOnInit(): void {
    this.logger.info('Explore shell initialized');
    const activeTab = this.explore.activeTab();
    const isAllowedTab = activeTab === 'for-you' || activeTab === 'news';
    if (!isAllowedTab) {
      void this.explore.switchTab('for-you');
    }
    void this.ensureFeedLoadedForTab(this.explore.activeTab());
  }

  protected onAvatarClick(): void {
    this.haptics.impact('light');
    this.avatarClick.emit();
  }

  protected async onFilterClick(): Promise<void> {
    await this.haptics.impact('light');
    const tab = this.explore.activeTab();
    this.logger.debug('Explore header filter clicked', { tab });

    const result = await this.filterModal.open({
      tab,
      currentFilters: this.explore.getFiltersForTab(tab),
    });

    if (!result.applied) return;

    this.explore.setFiltersForTab(tab, result.filters);

    if (!isFeedTab(tab)) {
      await this.explore.refresh();
    }
  }

  protected onSearchFocus(): void {
    this.explore.setSearchFocused(true);
  }

  protected onSearchBlur(): void {
    setTimeout(() => {
      if (!this.searchValue()) {
        this.explore.setSearchFocused(false);
      }
    }, 200);
  }

  /** Handle search bar input from NxtSearchBarComponent */
  protected async onSearchInputFromBar(value: string): Promise<void> {
    this.searchValue.set(value);

    const query = value.trim();
    if (query.length >= EXPLORE_SEARCH_CONFIG.minQueryLength) {
      await this.explore.search(query);
    } else if (!query) {
      this.explore.clearSearch();
    }
  }

  protected async onSearchSubmitFromBar(event: SearchBarSubmitEvent): Promise<void> {
    const query = event.query;
    if (query.length >= EXPLORE_SEARCH_CONFIG.minQueryLength) {
      await this.explore.search(query);
    } else if (!query) {
      this.explore.clearSearch();
    }
  }

  protected onSearchClear(): void {
    this.searchValue.set('');
    this.explore.clearSearch();
  }

  /** Cancel search and blur input */
  protected onCancelSearch(): void {
    this.searchValue.set('');
    this.explore.clearSearch();
    this.explore.setSearchFocused(false);
  }

  protected async onSuggestionClick(query: string): Promise<void> {
    await this.haptics.impact('light');
    this.searchValue.set(query);
    await this.explore.search(query);
  }

  protected async onTabChange(event: OptionScrollerChangeEvent): Promise<void> {
    await this.haptics.impact('light');
    const tabId = event.option.id as ExploreTabId;
    await this.explore.switchTab(tabId);
    await this.ensureFeedLoadedForTab(tabId);
    this.tabChange.emit(tabId);
  }

  /**
   * Handle category selection from the "For You" landing view.
   * Switches to the selected tab so the user can browse that category.
   */
  protected async onForYouCategorySelect(tab: ExploreTabId): Promise<void> {
    await this.explore.switchTab(tab);
    await this.ensureFeedLoadedForTab(tab);
    this.tabChange.emit(tab);
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      const tab = this.explore.activeTab();
      const filterType = this.getFeedFilterType(tab);

      if (filterType) {
        await this.feedService.refresh();
      } else {
        await this.explore.refresh();
      }
    } finally {
      event.complete();
    }
  }

  protected async onLoadMore(): Promise<void> {
    await this.explore.loadMore();
  }

  protected async onRetry(): Promise<void> {
    this.explore.clearError();
    await this.explore.refresh();
  }

  protected onItemClick(item: ExploreItem): void {
    this.logger.debug('Item clicked', { id: item.id, type: item.type });
    this.itemClick.emit(item);
  }

  /**
   * Handle scout report selection - emit to parent for navigation
   */
  protected onScoutReportSelect(report: ScoutReport): void {
    this.logger.debug('Scout report selected', { reportId: report.id });
    this.scoutReportSelect.emit(report);
  }

  /**
   * Handle scout report filters open - emit to parent
   */
  protected onScoutReportFiltersOpen(): void {
    this.logger.debug('Scout report filters opened');
    this.scoutReportFiltersOpen.emit();
  }

  // ── Feed / Following / News Handlers ──

  protected onPostSelect(post: FeedPost): void {
    this.logger.debug('Post selected', { id: post.id, type: post.type });
    this.postSelect.emit(post);
  }

  protected onAuthorSelect(author: FeedAuthor): void {
    this.logger.debug('Author selected', { uid: author.uid, profileCode: author.profileCode });
    this.authorSelect.emit(author);
  }

  protected async onLikeClick(post: FeedPost): Promise<void> {
    await this.haptics.impact('light');
    await this.feedService.toggleLike(post);
  }

  protected async onCommentClick(post: FeedPost): Promise<void> {
    await this.haptics.impact('light');
    this.postSelect.emit(post);
  }

  protected async onShareClick(post: FeedPost): Promise<void> {
    await this.haptics.impact('medium');
    await this.feedService.sharePost(post);
  }

  protected async onBookmarkClick(post: FeedPost): Promise<void> {
    await this.haptics.impact('light');
    await this.feedService.toggleBookmark(post);
  }

  protected async onFeedLoadMore(): Promise<void> {
    await this.feedService.loadMore();
  }

  protected async onFeedRetry(): Promise<void> {
    const tab = this.explore.activeTab();
    const filterType = this.getFeedFilterType(tab);
    if (!filterType) return;
    await this.feedService.loadFeed(filterType);
  }

  private getFeedFilterType(tab: ExploreTabId): FeedFilterType | null {
    if (tab === 'for-you') return 'for-you';
    if (tab === 'feed') return 'for-you';
    if (tab === 'following') return 'following';
    return null;
  }

  private async ensureFeedLoadedForTab(tab: ExploreTabId): Promise<void> {
    const filterType = this.getFeedFilterType(tab);
    if (!filterType) return;

    const shouldReload =
      this.feedService.posts().length === 0 || this.feedService.activeFilter() !== filterType;

    if (!shouldReload) return;

    await this.feedService.loadFeed(filterType);
  }

  protected onNewsArticleSelect(article: { id: string; title: string }): void {
    this.logger.debug('News article selected', { id: article.id });
    this.newsArticleSelect.emit(article);
  }

  protected onXpBadgeClick(): void {
    this.xpBadgeClick.emit();
  }
}
