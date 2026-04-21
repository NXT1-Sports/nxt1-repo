/**
 * @fileoverview Explore Shell Component - Main Container
 * @module @nxt1/ui/explore
 * @version 1.0.0
 *
 * Main container for the Explore feature using shared NxtPageHeaderComponent.
 * Standard page title header with tab scroller below and results list.
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
  effect,
  NgZone,
  OnInit,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  timeOutline,
  trendingUpOutline,
  chevronForwardOutline,
  locateOutline,
  funnelOutline,
} from 'ionicons/icons';
import {
  type ExploreTabId,
  type ExploreItem,
  type ScoutReport,
  EXPLORE_TABS,
  EXPLORE_SEARCH_CONFIG,
} from '@nxt1/core';
import { NxtPageHeaderComponent } from '../components/page-header';
import { type SearchBarSubmitEvent } from '../components/search-bar';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import { NxtLoggingService } from '../services/logging/logging.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { ExploreService } from './explore.service';
import { ExploreFilterModalService } from './explore-filter-modal.service';
import type { PageHeaderAction } from '../components/page-header';
import { ExploreListComponent } from './explore-list.component';
import { ExploreSkeletonComponent } from './explore-skeleton.component';
import { ScoutReportsContentComponent } from '../scout-reports/scout-reports-content.component';
import { NewsContentComponent } from '../news/news-content.component';

import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

// Register icons for search suggestions
/** User info for header display */
export interface ExploreUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
  /** User's active sport (for default feed filtering) */
  readonly sport?: string | null;
  /** User's state/location (for default feed filtering) */
  readonly state?: string | null;
}

@Component({
  selector: 'nxt1-explore-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    ExploreListComponent,
    ExploreSkeletonComponent,
    ScoutReportsContentComponent,
    NewsContentComponent,
  ],
  template: `
    <!-- Professional Page Header with shared Top Nav search styling -->
    @if (!hideHeader()) {
      <nxt1-page-header
        (menuClick)="onAvatarClick()"
        [actions]="headerActions()"
        (actionClick)="onHeaderAction($event)"
      >
        <div pageHeaderSlot="title" class="header-logo">
          <span class="header-title-text">Explore</span>
          <svg
            class="header-brand-logo"
            viewBox="0 0 612 792"
            width="40"
            height="40"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="10"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path [attr.d]="agentXLogoPath" />
            <polygon [attr.points]="agentXLogoPolygon" />
          </svg>
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

    <!-- Detect Location Prompt — shown when user has no state -->
    @if (!user()?.state && !_detectedState()) {
      <div class="detect-location-banner">
        <div class="detect-location-text">
          <span class="detect-location-heading">Set your location</span>
          <span class="detect-location-sub">Get local news &amp; nearby athletes</span>
        </div>
        <button
          type="button"
          class="detect-location-btn"
          [disabled]="detectingLocation()"
          (click)="onDetectLocationClick()"
        >
          @if (detectingLocation()) {
            <span class="detect-location-spinner"></span>
          } @else {
            <ion-icon name="locate-outline" />
          }
          {{ detectingLocation() ? 'Detecting…' : 'Detect' }}
        </button>
      </div>
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
          @if (explore.activeTab() === 'news' && !explore.hasQuery()) {
            <!-- News Tab: Sports recruiting news -->
            <nxt1-news-content (articleSelect)="onNewsArticleSelect($event)" />
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
        padding-bottom: max(
          220px,
          calc(var(--nxt1-safe-area-bottom, env(safe-area-inset-bottom, 0px)) + 128px)
        );
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

      .header-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        width: 100%;
        margin-top: -8px;
        margin-left: -18px;
      }

      .header-title-text {
        display: inline-flex;
        align-items: center;
        font-family: var(--nxt1-font-family-brand, var(--ion-font-family));
        font-size: var(--nxt1-font-size-xl, 20px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        letter-spacing: var(--nxt1-letter-spacing-tight, -0.01em);
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1;
        transform: translateY(1px);
      }

      .header-brand-logo {
        display: block;
        flex-shrink: 0;
        color: var(--nxt1-color-text-primary, #ffffff);
        transform: translateY(1px);
      }

      /* Detect Location Banner */
      .detect-location-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 14px var(--nxt1-spacing-4, 16px) 0;
        padding: 10px 14px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .detect-location-text {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }

      .detect-location-heading {
        font-size: 13px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .detect-location-sub {
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .detect-location-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
        padding: 6px 12px;
        border: 1px solid rgba(204, 255, 0, 0.2);
        border-radius: var(--nxt1-borderRadius-md, 6px);
        background: rgba(204, 255, 0, 0.08);
        color: var(--nxt1-color-primary, #ccff00);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .detect-location-btn:disabled {
        opacity: 0.6;
      }

      .detect-location-btn ion-icon {
        font-size: 16px;
      }

      .detect-location-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid rgba(204, 255, 0, 0.3);
        border-top-color: var(--nxt1-color-primary, #ccff00);
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreShellComponent implements OnInit {
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;
  constructor() {
    addIcons({
      timeOutline,
      trendingUpOutline,
      chevronForwardOutline,
      locateOutline,
      funnelOutline,
    });
    effect(() => {
      const u = this.user();
      if (u) {
        this.explore.initializeDefaultFilters(u.sport, u.state);
      }
    });
  }

  protected readonly explore = inject(ExploreService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('ExploreShell');
  private readonly filterModal = inject(ExploreFilterModalService);

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
  readonly newsArticleSelect = output<{ id: string; title: string }>();
  readonly detectLocation = output<void>();

  // Local state
  protected readonly searchValue = signal('');
  protected readonly detectingLocation = signal(false);
  readonly _detectedState = signal<string | null>(null);

  // Computed
  protected readonly activeFilterCount = computed(() =>
    this.explore.getActiveFilterCount(this.explore.activeTab())
  );

  protected readonly headerActions = computed<PageHeaderAction[]>(() => {
    const count = this.activeFilterCount();
    return [
      {
        id: 'filter',
        icon: 'funnel-outline',
        label: 'Filters',
        badge: count > 0 ? count : undefined,
      },
    ];
  });

  protected readonly displayName = computed(() => this.user()?.displayName ?? 'User');
  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const counts = this.explore.tabCounts();
    const visibleTabIds: ExploreTabId[] = ['news'];

    return visibleTabIds
      .map((tabId) => EXPLORE_TABS.find((tab) => tab.id === tabId))
      .filter((tab): tab is (typeof EXPLORE_TABS)[number] => tab !== undefined)
      .map((tab) => ({
        id: tab.id,
        label: tab.id === 'news' ? 'Pulse' : tab.label,
        badge: counts[tab.id] > 0 ? counts[tab.id] : undefined,
      }));
  });

  ngOnInit(): void {
    this.logger.info('Explore shell initialized');
    const activeTab = this.explore.activeTab();
    if (activeTab !== 'news') {
      void this.explore.switchTab('news');
    }
  }

  protected onAvatarClick(): void {
    this.haptics.impact('light');
    this.avatarClick.emit();
  }

  protected onDetectLocationClick(): void {
    this.detectingLocation.set(true);
    this.haptics.impact('light');
    this.detectLocation.emit();
  }

  protected async onHeaderAction(action: PageHeaderAction): Promise<void> {
    if (action.id !== 'filter') return;
    await this.haptics.impact('light');
    const tab = this.explore.activeTab();
    const result = await this.filterModal.open({
      tab,
      currentFilters: this.explore.getFiltersForTab(tab),
    });
    if (result.applied) {
      this.explore.setFiltersForTab(tab, result.filters);
      this.logger.info('Explore filters applied', { tab, filters: result.filters });
    }
  }

  /** Called by parent wrapper after geolocation resolves */
  completeDetectLocation(state: string | null): void {
    this.detectingLocation.set(false);
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

  private readonly ionContent = viewChild(IonContent);

  protected async onTabChange(event: OptionScrollerChangeEvent): Promise<void> {
    await this.haptics.impact('light');
    const tabId = event.option.id as ExploreTabId;
    await this.explore.switchTab(tabId);
    this.tabChange.emit(tabId);

    // Scroll to top when switching tabs
    this.ionContent()?.scrollToTop(0);
  }

  /**
   * Handle category selection from the "For You" landing view.
   * Switches to the selected tab so the user can browse that category.
   */
  protected async onForYouCategorySelect(tab: ExploreTabId): Promise<void> {
    await this.explore.switchTab(tab);
    this.tabChange.emit(tab);
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.explore.refresh();
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

  protected onNewsArticleSelect(article: { id: string; title: string }): void {
    this.logger.debug('News article selected', { id: article.id });
    this.newsArticleSelect.emit(article);
  }
}
