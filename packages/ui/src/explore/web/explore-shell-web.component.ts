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
  effect,
  AfterViewInit,
  NgZone,
  OnInit,
  OnDestroy,
  ElementRef,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  type ExploreTabId,
  type ExploreItem,
  type ExploreFilters,
  type ScoutReport,
  type FeedPost,
  type FeedAuthor,
  type FeedFilterType,
  EXPLORE_SEARCH_CONFIG,
  EXPLORE_TABS,
  isFeedTab,
} from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../../components/option-scroller';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { NxtScrollService } from '../../services/scroll';
import { NxtHeaderPortalService } from '../../services/header-portal';
import { ExploreService } from '../explore.service';
import { ExploreListWebComponent } from './explore-list-web.component';
import { ExploreSkeletonComponent } from '../explore-skeleton.component';
import { ScoutReportsContentComponent } from '../../scout-reports/scout-reports-content.component';
import { NewsContentComponent } from '../../news/news-content.component';
import { FeedListComponent } from '../../feed/feed-list.component';
import { FeedService } from '../../feed/feed.service';
import type { ExploreUser } from '../explore-shell.component';
import { ExploreSidebarWebComponent } from './explore-sidebar-web.component';

@Component({
  selector: 'nxt1-explore-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NxtOptionScrollerComponent,
    ExploreListWebComponent,
    ExploreSkeletonComponent,
    ScoutReportsContentComponent,
    NewsContentComponent,
    FeedListComponent,
    ExploreSidebarWebComponent,
  ],
  template: `
    <!-- Portal: center — Explore title + Pulse/Discover tabs -->
    <ng-template #tabsPortalContent>
      <div class="header-portal-explore">
        <span class="header-portal-title">Explore</span>
        <div class="header-portal-tabs" role="tablist" aria-label="Explore tabs">
          @for (tab of tabOptions(); track tab.id) {
            <button
              type="button"
              role="tab"
              class="header-portal-tab"
              [class.active]="explore.activeTab() === tab.id"
              [attr.aria-selected]="explore.activeTab() === tab.id"
              (click)="onTabChange(tab.id)"
            >
              {{ tab.label }}
            </button>
          }
        </div>
      </div>
    </ng-template>

    <!-- SEO: Main content area with semantic structure -->
    @if (!explore.isSearchFocused() || explore.hasQuery()) {
      <div class="explore-mobile-tab-scroller" [attr.data-testid]="testIds.TAB_SCROLLER">
        <nxt1-option-scroller
          [options]="tabOptions()"
          [selectedId]="explore.activeTab()"
          [config]="mobileTabScrollerConfig"
          (selectionChange)="onMobileTabChange($event)"
        />
      </div>
    }

    <main class="explore-main">
      <div class="explore-dashboard">
        <!-- Search Suggestions Overlay -->
        @if (explore.isSearchFocused() && !explore.hasQuery()) {
          <section
            class="search-suggestions px-4 py-4"
            aria-labelledby="suggestions-heading"
            [attr.data-testid]="testIds.SUGGESTIONS_SECTION"
          >
            <h2 id="suggestions-heading" class="sr-only">Search Suggestions</h2>

            <!-- Recent Searches -->
            @if (explore.recentSearches().length > 0) {
              <div class="mb-6" [attr.data-testid]="testIds.RECENT_SEARCHES">
                <h3 class="text-text-tertiary mb-3 text-xs font-semibold uppercase tracking-wider">
                  Recent
                </h3>
                @for (search of explore.recentSearches(); track search; let i = $index) {
                  <button
                    type="button"
                    class="bg-surface-100 hover:bg-surface-200 mb-2 flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all active:scale-[0.98]"
                    [attr.data-testid]="testIds.SUGGESTION_ITEM + '-recent-' + i"
                    (click)="onSuggestionClick(search)"
                  >
                    <!-- Time Icon -->
                    <svg
                      class="text-text-tertiary h-[18px] w-[18px] shrink-0"
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
                      class="text-text-tertiary h-4 w-4 shrink-0 opacity-50"
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
              <div [attr.data-testid]="testIds.TRENDING_SEARCHES">
                <h3 class="text-text-tertiary mb-3 text-xs font-semibold uppercase tracking-wider">
                  Trending
                </h3>
                @for (search of explore.trendingSearches(); track search; let i = $index) {
                  <button
                    type="button"
                    class="bg-surface-100 hover:bg-surface-200 mb-2 flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all active:scale-[0.98]"
                    [attr.data-testid]="testIds.SUGGESTION_ITEM + '-trending-' + i"
                    (click)="onSuggestionClick(search)"
                  >
                    <!-- Trending Icon -->
                    <svg
                      class="text-text-tertiary h-[18px] w-[18px] shrink-0"
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
                      class="text-text-tertiary h-4 w-4 shrink-0 opacity-50"
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

        <!-- Content layout: Feed + Right sidebar -->
        @if (!explore.isSearchFocused() || explore.hasQuery()) {
          <div class="explore-layout">
            <section class="explore-section-content" role="tabpanel">
              <!-- Discover Tab: Personalized posts feed -->
              @if (explore.activeTab() === 'feed' && !explore.hasQuery()) {
                <nxt1-feed-list
                  [attr.data-testid]="testIds.FEED_PANEL"
                  [polymorphicFeed]="feedService.polymorphicFeed()"
                  [posts]="feedService.posts()"
                  [isLoading]="feedService.isLoading()"
                  [isLoadingMore]="feedService.isLoadingMore()"
                  [isEmpty]="feedService.isEmpty()"
                  [error]="feedService.error()"
                  [hasMore]="feedService.hasMore()"
                  [compactCards]="true"
                  [filterType]="'trending'"
                  (postClick)="onPostSelect($event)"
                  (authorClick)="onAuthorSelect($event)"
                  (reactClick)="onLikeClick($event)"
                  (repostClick)="onCommentClick($event)"
                  (shareClick)="onShareClick($event)"
                  (loadMore)="onFeedLoadMore()"
                  (retry)="onFeedRetry()"
                />
              } @else if (explore.activeTab() === 'news' && !explore.hasQuery()) {
                <!-- News Tab: Sports recruiting news -->
                <nxt1-news-content
                  [attr.data-testid]="testIds.NEWS_PANEL"
                  (articleSelect)="onNewsArticleSelect($event)"
                />
              } @else if (explore.activeTab() === 'scout-reports' && !explore.hasQuery()) {
                <!-- Scout Reports Tab -->
                <nxt1-scout-reports-content
                  [attr.data-testid]="testIds.SCOUT_REPORTS_PANEL"
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

            <nxt1-explore-sidebar-web
              class="explore-sidebar-column"
              [activeTab]="explore.activeTab()"
              [activeFilterCount]="activeFilterCount()"
              [hasQuery]="explore.hasQuery()"
              [query]="explore.query()"
              [filters]="currentFilters()"
              [userState]="effectiveUserState()"
              [detectingLocation]="_detectingLocation()"
              (filtersChange)="onSidebarFilterChange($event)"
              (detectLocation)="onDetectLocation()"
            />
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

      .explore-mobile-tab-scroller {
        display: none;
      }

      .explore-dashboard {
        width: 100%;
        max-width: 1320px;
        margin: 0 auto;
        padding: 0 var(--nxt1-spacing-5, 20px);
        padding-bottom: var(--nxt1-spacing-16);
      }

      /* ==============================
         HEADER PORTAL — Perplexity-style
         Centered tabs teleported into top nav
         ============================== */

      .header-portal-explore {
        display: flex;
        align-items: center;
        width: 100%;
        padding: 0 var(--nxt1-spacing-2, 8px);
        position: relative;
      }

      .header-portal-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        letter-spacing: -0.01em;
        white-space: nowrap;
        user-select: none;
        position: absolute;
        left: var(--nxt1-spacing-2, 8px);
      }

      .header-portal-tabs {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        padding: 3px;
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.06));
        margin: 0 auto;
      }

      .header-portal-tab {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 16px;
        border-radius: var(--nxt1-borderRadius-md, 0.375rem);
        font-size: 13px;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        background: transparent;
        border: none;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }

      .header-portal-tab:hover {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.75));
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
      }

      .header-portal-tab.active {
        color: var(--nxt1-color-text-primary, #ffffff);
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        font-weight: 600;
      }

      .header-portal-back-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }

      .header-portal-back-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-color: rgba(255, 255, 255, 0.14);
      }

      .header-portal-back-btn:active {
        transform: scale(0.98);
      }

      /* ==============================
         CONTENT LAYOUT
         Feed lane + right sidebar
         (Left nav removed — now in top nav portal)
         ============================== */

      .explore-layout {
        display: grid;
        grid-template-columns: minmax(0, 736px) minmax(232px, 248px);
        gap: var(--nxt1-spacing-6, 24px);
        align-items: start;
        justify-content: center;
        padding-top: var(--nxt1-spacing-2, 8px);
      }

      .explore-section-content {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
        overflow: hidden;
      }

      .explore-sidebar-column {
        min-width: 0;
      }

      @media (max-width: 1024px) {
        .explore-layout {
          grid-template-columns: 1fr;
        }

        .explore-sidebar-column {
          display: none;
        }
      }

      @media (max-width: 768px) {
        .header-portal-tabs {
          display: none;
        }

        .explore-mobile-tab-scroller {
          display: block;
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--nxt1-color-bg-primary);
        }

        .explore-dashboard {
          padding-inline: 0;
        }

        .explore-layout {
          gap: 0;
          padding-top: 0;
        }

        .explore-section-content {
          gap: 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreShellWebComponent implements OnInit, AfterViewInit, OnDestroy {
  protected readonly explore = inject(ExploreService);
  protected readonly feedService = inject(FeedService);
  private readonly haptics = inject(HapticsService);
  private readonly scrollService = inject(NxtScrollService);
  private readonly logger = inject(NxtLoggingService).child('ExploreShellWeb');
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly headerPortal = inject(NxtHeaderPortalService);

  // Template ref for portal content
  private readonly tabsPortalContent = viewChild<TemplateRef<unknown>>('tabsPortalContent');

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
  readonly detectLocation = output<void>();

  // Local state
  protected readonly testIds = TEST_IDS.EXPLORE;
  protected readonly searchValue = signal('');
  protected readonly searchPlaceholder = 'AI Search';
  protected readonly _detectingLocation = signal(false);
  private readonly _detectedState = signal<string | null>(null);

  /** User's state from auth OR detected via geolocation */
  protected readonly effectiveUserState = computed(
    () => this.user()?.state ?? this._detectedState() ?? null
  );

  // Computed
  protected readonly activeFilterCount = computed(() =>
    this.explore.getActiveFilterCount(this.explore.activeTab())
  );

  protected readonly currentFilters = computed(() =>
    this.explore.getFiltersForTab(this.explore.activeTab())
  );

  protected readonly mobileTabScrollerConfig = {
    scrollable: false,
    stretchToFill: true,
    centered: true,
    showDivider: true,
  } as const;

  protected readonly tabOptions = computed<OptionScrollerItem[]>(() => {
    const counts = this.explore.tabCounts();
    const visibleTabIds: ExploreTabId[] = ['feed', 'news'];

    return visibleTabIds
      .map((tabId) => EXPLORE_TABS.find((tab) => tab.id === tabId))
      .filter((tab): tab is (typeof EXPLORE_TABS)[number] => tab !== undefined)
      .map((tab) => ({
        id: tab.id,
        label: tab.id === 'news' ? 'Pulse' : tab.id === 'feed' ? 'Feed' : tab.label,
        badge: counts[tab.id] > 0 ? counts[tab.id] : undefined,
      }));
  });

  ngOnInit(): void {
    this.logger.info('Explore shell (web) initialized');

    const activeTab = this.explore.activeTab();
    const isAllowedTab = activeTab === 'feed' || activeTab === 'news';
    if (!isAllowedTab) {
      void this.explore.switchTab('feed');
    }
    void this.ensureFeedLoadedForTab(this.explore.activeTab());
  }

  /** Apply user's sport/state as default filters for Discover & Pulse */
  private readonly _initDefaultFilters = effect(() => {
    const u = this.user();
    if (u) {
      this.explore.initializeDefaultFilters(u.sport, u.state);
    }
  });

  ngAfterViewInit(): void {
    // Register center portal and clear any stale right-side action in the global top nav
    const centerTpl = this.tabsPortalContent();
    if (centerTpl) this.headerPortal.setCenterContent(centerTpl);
    this.headerPortal.clearRightContent();
  }

  ngOnDestroy(): void {
    this.headerPortal.clearAll();
  }

  protected async onSidebarFilterChange(filters: ExploreFilters): Promise<void> {
    const tab = this.explore.activeTab();
    this.explore.setFiltersForTab(tab, filters);

    if (!isFeedTab(tab)) {
      await this.explore.refresh();
    }
  }

  protected onDetectLocation(): void {
    this._detectingLocation.set(true);
    this.detectLocation.emit();
  }

  /** Called by parent wrapper after geolocation resolves */
  completeDetectLocation(state: string | null): void {
    this._detectingLocation.set(false);
    if (state) {
      this._detectedState.set(state);
    }
  }

  protected onSearchFocus(): void {
    this.explore.setSearchFocused(true);
  }

  private readonly ngZone = inject(NgZone);

  protected onSearchBlur(): void {
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        if (!this.searchValue()) {
          this.explore.setSearchFocused(false);
        }
      }, 200);
    });
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

    await this.scrollActiveContentToTop();
  }

  protected async onMobileTabChange(event: OptionScrollerChangeEvent): Promise<void> {
    await this.onTabChange(event.option.id);
  }

  /**
   * Handle category selection from the "For You" landing view.
   * Switches to the selected tab so the user can browse that category.
   */
  protected async onForYouCategorySelect(tab: ExploreTabId): Promise<void> {
    await this.explore.switchTab(tab);
    await this.ensureFeedLoadedForTab(tab);
    this.tabChange.emit(tab);
    await this.scrollActiveContentToTop();
  }

  private async scrollActiveContentToTop(): Promise<void> {
    const scrollContainer = this.getShellContentElement();

    if (scrollContainer) {
      await this.scrollService.scrollToTop({
        target: 'custom',
        scrollElement: scrollContainer,
        behavior: 'instant',
        enableHaptics: false,
      });
      return;
    }

    await this.scrollService.scrollToTop({
      target: 'window',
      behavior: 'instant',
      enableHaptics: false,
    });
  }

  private getShellContentElement(): HTMLElement | null {
    const host = this.elementRef.nativeElement;
    return host.closest('.shell__content');
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
    if (tab === 'feed') return 'trending';
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
}
