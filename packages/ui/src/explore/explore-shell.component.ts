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
import { FormsModule } from '@angular/forms';
import { IonContent, IonSearchbar, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  searchOutline,
  closeCircle,
  timeOutline,
  trendingUpOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import {
  type ExploreTabId,
  type ExploreItem,
  type ScoutReport,
  EXPLORE_TABS,
  EXPLORE_SEARCH_CONFIG,
} from '@nxt1/core';
import { NxtPageHeaderComponent } from '../components/page-header';
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

addIcons({
  searchOutline,
  closeCircle,
  timeOutline,
  trendingUpOutline,
  chevronForwardOutline,
});

/** User info for header display */
export interface ExploreUser {
  readonly photoURL?: string | null;
  readonly displayName?: string | null;
}

@Component({
  selector: 'nxt1-explore-shell',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonSearchbar,
    IonIcon,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    ExploreListComponent,
    ExploreSkeletonComponent,
    ScoutReportsContentComponent,
  ],
  template: `
    <!-- Professional Page Header (same as Activity/Home) - Search bar replaces title -->
    <!-- Hidden on desktop when using sidebar shell -->
    @if (!hideHeader()) {
      <nxt1-page-header
        [avatarSrc]="user()?.photoURL"
        [avatarName]="displayName()"
        (avatarClick)="onAvatarClick()"
      >
        <!-- Search bar in title slot (same positioning as text title) -->
        <ion-searchbar
          slot="title"
          mode="ios"
          [placeholder]="searchPlaceholder"
          [debounce]="300"
          [(ngModel)]="searchValue"
          (ionFocus)="onSearchFocus()"
          (ionBlur)="onSearchBlur()"
          (ionInput)="onSearchInput($event)"
          (ionClear)="onSearchClear()"
          [showCancelButton]="explore.isSearchFocused() ? 'always' : 'never'"
          cancelButtonText="Cancel"
          class="explore-searchbar"
        />
      </nxt1-page-header>
    }

    <!-- Twitter/TikTok Style Tab Selector (Options Scroller) - same as Activity -->
    @if (!explore.isSearchFocused() || explore.hasQuery()) {
      <nxt1-option-scroller
        [options]="tabOptions()"
        [selectedId]="explore.activeTab()"
        [config]="{ scrollable: true, stretchToFill: false, showDivider: true }"
        (selectionChange)="onTabChange($event)"
      />
    }

    <ion-content [fullscreen]="true" class="explore-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" />

      <div class="explore-container">
        <!-- Search Suggestions Overlay -->
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

        <!-- Search Results - Deferred for Performance -->
        @if (!explore.isSearchFocused() || explore.hasQuery()) {
          <!-- Scout Reports Tab: Embed dedicated content component -->
          @if (explore.activeTab() === 'scout-reports' && !explore.hasQuery()) {
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

      /* Searchbar styling - matches toolbar height exactly */
      .explore-searchbar {
        --background: var(--explore-surface);
        --border-radius: var(--nxt1-radius-full, 9999px);
        --box-shadow: none;
        --placeholder-color: var(--explore-text-muted);
        --placeholder-opacity: 1;
        --color: var(--explore-text-primary);
        --icon-color: var(--explore-text-muted);
        --clear-button-color: var(--explore-text-muted);
        --cancel-button-color: var(--explore-primary);
        height: 36px;
        min-height: 36px;
        max-height: 36px;
        padding: 0;
        margin: 0;
      }

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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreShellComponent implements OnInit {
  protected readonly explore = inject(ExploreService);
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

  // Local state
  protected readonly searchValue = signal('');
  protected readonly searchPlaceholder = EXPLORE_SEARCH_CONFIG.placeholder;

  // Computed
  protected readonly displayName = computed(() => this.user()?.displayName ?? 'User');

  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const counts = this.explore.tabCounts();
    return EXPLORE_TABS.map((tab) => ({
      id: tab.id,
      label: tab.label,
      badge: counts[tab.id] > 0 ? counts[tab.id] : undefined,
    }));
  });

  ngOnInit(): void {
    this.logger.info('Explore shell initialized');
  }

  protected onAvatarClick(): void {
    this.haptics.impact('light');
    this.avatarClick.emit();
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

  protected async onSearchInput(event: CustomEvent): Promise<void> {
    const query = (event.detail.value ?? '').trim();
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

  protected async onSuggestionClick(query: string): Promise<void> {
    await this.haptics.impact('light');
    this.searchValue.set(query);
    await this.explore.search(query);
  }

  protected async onTabChange(event: OptionScrollerChangeEvent): Promise<void> {
    await this.haptics.impact('light');
    const tabId = event.option.id as ExploreTabId;
    this.explore.switchTab(tabId);
    this.tabChange.emit(tabId);
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
}
