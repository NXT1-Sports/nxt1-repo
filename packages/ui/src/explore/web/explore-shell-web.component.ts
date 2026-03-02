/**
 * @fileoverview Explore Shell Component — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 2.0.0
 *
 * Web-optimized Explore Shell using design token CSS.
 * 100% SSR-safe with semantic HTML for Grade A+ SEO.
 * Zero Ionic components — pure Angular + design tokens.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * For mobile app, use ExploreShellComponent (Ionic variant) instead.
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
import { FormsModule } from '@angular/forms';
import {
  type ExploreTabId,
  type ExploreItem,
  type ScoutReport,
  type FeedPost,
  type FeedAuthor,
  type FeedFilterType,
  EXPLORE_SEARCH_CONFIG,
  EXPLORE_TABS,
  isFeedTab,
} from '@nxt1/core';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtSectionNavWebComponent } from '../../components/section-nav-web';
import type { SectionNavItem, SectionNavChangeEvent } from '../../components/section-nav-web';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { ExploreService } from '../explore.service';
import { ExploreListWebComponent } from './explore-list-web.component';
import { ExploreSkeletonComponent } from '../explore-skeleton.component';
import { ExploreForYouWebComponent } from './explore-for-you-web.component';
import { ScoutReportsContentComponent } from '../../scout-reports/scout-reports-content.component';
import { NewsContentComponent } from '../../news/news-content.component';
import { FeedListComponent } from '../../feed/feed-list.component';
import { FeedService } from '../../feed/feed.service';
import type { ExploreUser } from '../explore-shell.component';
import { ExploreFilterModalService } from '../explore-filter-modal.service';

@Component({
  selector: 'nxt1-explore-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NxtDesktopPageHeaderComponent,
    NxtSectionNavWebComponent,
    ExploreListWebComponent,
    ExploreSkeletonComponent,
    ExploreForYouWebComponent,
    ScoutReportsContentComponent,
    NewsContentComponent,
    FeedListComponent,
  ],
  template: `
    <!-- SEO: Main content area with semantic structure -->
    <main class="explore-main">
      <div class="explore-dashboard">
        <!-- Desktop Page Header -->
        <nxt1-desktop-page-header
          title="Explore"
          subtitle="Discover athletes, teams, colleges, and more."
        />

        <!-- Search Suggestions Overlay -->
        @if (explore.isSearchFocused() && !explore.hasQuery()) {
          <section class="search-suggestions px-4 py-4" aria-labelledby="suggestions-heading">
            <h2 id="suggestions-heading" class="sr-only">Search Suggestions</h2>

            <!-- Recent Searches -->
            @if (explore.recentSearches().length > 0) {
              <div class="mb-6">
                <h3 class="text-text-tertiary mb-3 text-xs font-semibold tracking-wider uppercase">
                  Recent
                </h3>
                @for (search of explore.recentSearches(); track search) {
                  <button
                    type="button"
                    class="bg-surface-100 hover:bg-surface-200 mb-2 flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all active:scale-[0.98]"
                    (click)="onSuggestionClick(search)"
                  >
                    <!-- Time Icon -->
                    <svg
                      class="text-text-tertiary h-[18px] w-[18px] flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span class="text-text-primary flex-1 truncate text-[15px] font-medium">{{
                      search
                    }}</span>
                    <svg
                      class="text-text-tertiary h-4 w-4 flex-shrink-0 opacity-50"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                }
              </div>
            }

            <!-- Trending Searches -->
            @if (explore.trendingSearches().length > 0) {
              <div>
                <h3 class="text-text-tertiary mb-3 text-xs font-semibold tracking-wider uppercase">
                  Trending
                </h3>
                @for (search of explore.trendingSearches(); track search) {
                  <button
                    type="button"
                    class="bg-surface-100 hover:bg-surface-200 mb-2 flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all active:scale-[0.98]"
                    (click)="onSuggestionClick(search)"
                  >
                    <!-- Trending Icon -->
                    <svg
                      class="text-text-tertiary h-[18px] w-[18px] flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                    <span class="text-text-primary flex-1 truncate text-[15px] font-medium">{{
                      search
                    }}</span>
                    <svg
                      class="text-text-tertiary h-4 w-4 flex-shrink-0 opacity-50"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                }
              </div>
            }
          </section>
        }

        <!-- Two-column layout: Sidebar nav + Content (like Help Center) -->
        @if (!explore.isSearchFocused() || explore.hasQuery()) {
          <div class="explore-layout">
            <nxt1-section-nav-web
              [items]="tabOptions()"
              [activeId]="explore.activeTab()"
              ariaLabel="Explore tabs"
              (selectionChange)="onSectionTabChange($event)"
            />

            <section class="explore-section-content" role="tabpanel">
              <button
                type="button"
                class="tab-filter-btn"
                aria-label="Open filters"
                (click)="onFilterClick()"
              >
                <svg
                  class="h-[18px] w-[18px]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 4a1 1 0 011-1h16a1 1 0 01.8 1.6L14 13.5V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.5L3.2 4.6A1 1 0 013 4z"
                  />
                </svg>
                @if (activeFilterCount() > 0) {
                  <span class="tab-filter-badge">{{ activeFilterCount() }}</span>
                }
              </button>

              <!-- For You Tab: Multi-category curated landing view -->
              @if (explore.activeTab() === 'for-you' && !explore.hasQuery()) {
                <nxt1-explore-for-you-web
                  [user]="user()"
                  (itemTap)="onItemClick($event)"
                  (categorySelect)="onForYouCategorySelect($event)"
                />
                <!-- Feed Tab: Personalized content stream -->
              } @else if (explore.activeTab() === 'feed' && !explore.hasQuery()) {
                <nxt1-feed-list
                  [posts]="feedService.posts()"
                  [isLoading]="feedService.isLoading()"
                  [isLoadingMore]="feedService.isLoadingMore()"
                  [isEmpty]="feedService.isEmpty()"
                  [error]="feedService.error()"
                  [hasMore]="feedService.hasMore()"
                  [compactCards]="true"
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
                  [compactCards]="true"
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
                  <nxt1-explore-list-web
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
            </section>
          </div>
        }
      </div>
    </main>
  `,
  styles: [
    `
      /* ============================================
         EXPLORE SHELL (WEB) — Design Token CSS
         Zero Ionic, SSR-safe, fills web shell layout
         ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .explore-main {
        background: var(--nxt1-color-bg-primary);
        min-height: 100%;
      }

      .explore-dashboard {
        padding: 0;
        padding-bottom: var(--nxt1-spacing-16);
      }

      /* ==============================
         TWO-COLUMN LAYOUT (Help Center style)
         Left: sticky vertical section nav
         Right: tab content
         ============================== */

      .explore-layout {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: var(--nxt1-spacing-6, 24px);
        align-items: start;
        padding-top: var(--nxt1-spacing-2, 8px);
      }

      .explore-section-content {
        min-width: 0;
      }

      @media (max-width: 768px) {
        .explore-layout {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-4, 16px);
        }
      }

      .header-filter-btn,
      .tab-filter-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.75));
        cursor: pointer;
      }

      .header-filter-btn:hover,
      .tab-filter-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .header-filter-badge,
      .tab-filter-badge {
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
export class ExploreShellWebComponent implements OnInit {
  protected readonly explore = inject(ExploreService);
  protected readonly feedService = inject(FeedService);
  private readonly filterModal = inject(ExploreFilterModalService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('ExploreShellWeb');

  // Inputs
  readonly user = input<ExploreUser | null>(null);

  // Outputs
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
  protected readonly activeFilterCount = computed(() =>
    this.explore.getActiveFilterCount(this.explore.activeTab())
  );

  protected readonly tabOptions = computed<readonly SectionNavItem[]>(() => {
    const counts = this.explore.tabCounts();
    return EXPLORE_TABS.map((tab) => ({
      id: tab.id,
      label: tab.label,
      badge: counts[tab.id] > 0 ? counts[tab.id] : undefined,
    }));
  });

  ngOnInit(): void {
    this.logger.info('Explore shell (web) initialized');
    void this.ensureFeedLoadedForTab(this.explore.activeTab());
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

  protected onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const query = (target.value ?? '').trim();
    this.searchValue.set(target.value);

    if (query.length >= EXPLORE_SEARCH_CONFIG.minQueryLength) {
      this.explore.search(query);
    } else if (!query) {
      this.explore.clearSearch();
    }
  }

  protected onSearchClear(): void {
    this.searchValue.set('');
    this.explore.clearSearch();
  }

  protected async onSuggestionClick(query: string): Promise<void> {
    await this.haptics.impact('light');
    this.searchValue.set(query);
    await this.explore.search(query);
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

  // ── Tab Selection ──

  protected async onTabChange(tabId: string): Promise<void> {
    await this.haptics.impact('light');
    const id = tabId as ExploreTabId;
    await this.explore.switchTab(id);
    await this.ensureFeedLoadedForTab(id);
    this.tabChange.emit(id);
  }

  protected async onSectionTabChange(event: SectionNavChangeEvent): Promise<void> {
    await this.onTabChange(event.id);
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
