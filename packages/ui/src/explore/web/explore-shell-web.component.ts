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
  EXPLORE_TABS,
  EXPLORE_SEARCH_CONFIG,
} from '@nxt1/core';
import { NxtPageHeaderComponent } from '../../components/page-header';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtOptionScrollerWebComponent } from '../../components/option-scroller-web';
import { NxtHeroHeaderComponent } from '../../components/hero-header';
import { NxtPartnerMarqueeComponent } from '../../components/partner-marquee';
import type {
  OptionScrollerItem,
  OptionScrollerChangeEvent,
} from '../../components/option-scroller/option-scroller.types';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { ExploreService } from '../explore.service';
import { ExploreListWebComponent } from './explore-list-web.component';
import { ExploreSkeletonComponent } from '../explore-skeleton.component';
import { ScoutReportsContentComponent } from '../../scout-reports/scout-reports-content.component';
import type { ExploreUser } from '../explore-shell.component';

@Component({
  selector: 'nxt1-explore-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NxtPageHeaderComponent,
    NxtDesktopPageHeaderComponent,
    NxtOptionScrollerWebComponent,
    NxtHeroHeaderComponent,
    NxtPartnerMarqueeComponent,
    ExploreListWebComponent,
    ExploreSkeletonComponent,
    ScoutReportsContentComponent,
  ],
  template: `
    <!-- SEO: Page Header with semantic search -->
    @if (!hideHeader()) {
      <nxt1-page-header
        [avatarSrc]="user()?.photoURL"
        [avatarName]="displayName()"
        (avatarClick)="onAvatarClick()"
      >
        <!-- Native search input (SSR-friendly, accessible) -->
        <div pageHeaderSlot="title" class="search-container w-full">
          <div class="relative">
            <!-- Search Icon -->
            <svg
              class="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="search"
              [placeholder]="searchPlaceholder"
              [(ngModel)]="searchValue"
              (focus)="onSearchFocus()"
              (blur)="onSearchBlur()"
              (input)="onSearchInput($event)"
              class="bg-surface-100 text-text-primary placeholder:text-text-tertiary focus:ring-primary/30 focus:border-primary h-9 w-full rounded-full border border-transparent py-2 pr-10 pl-10 text-sm transition-all focus:ring-2 focus:outline-none"
              [attr.aria-label]="searchPlaceholder"
            />
            <!-- Clear button -->
            @if (searchValue()) {
              <button
                type="button"
                (click)="onSearchClear()"
                class="text-text-tertiary hover:text-text-secondary absolute top-1/2 right-3 -translate-y-1/2"
                aria-label="Clear search"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            }
          </div>
        </div>
      </nxt1-page-header>
    }

    <!-- SEO: Main content area with semantic structure -->
    <main class="explore-main">
      <div class="explore-dashboard">
        <!-- Desktop Page Header (visible when page header is hidden) -->
        @if (hideHeader()) {
          <nxt1-desktop-page-header
            title="Explore"
            subtitle="Discover athletes, teams, colleges, and more."
          />
        }

        <!-- Audience + Trust Sections (moved from Home) -->
        @if (!explore.isSearchFocused() && !explore.hasQuery()) {
          <nxt1-hero-header
            [showLogo]="false"
            [showPrimaryCta]="true"
            [showAnimatedBg]="true"
            [showTrustBadges]="true"
            [showAppBadges]="false"
          />

          <nxt1-partner-marquee
            title="Trusted By Leading Organizations"
            subtitle="Partnering with the best to power the future of sports recruiting"
            label="Our Partners"
            [showLabel]="true"
          />
        }

        <!-- Tab Navigation (web-native, zero Ionic) -->
        @if (!explore.isSearchFocused() || explore.hasQuery()) {
          <nav aria-label="Explore categories">
            <nxt1-option-scroller-web
              [options]="tabOptions()"
              [selectedId]="explore.activeTab()"
              [stretchToFill]="false"
              [showDivider]="true"
              (selectionChange)="onTabChange($event)"
            />
          </nav>
        }
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

        <!-- Search Results -->
        @if (!explore.isSearchFocused() || explore.hasQuery()) {
          <!-- Scout Reports Tab: Embed dedicated content component -->
          @if (explore.activeTab() === 'scout-reports' && !explore.hasQuery()) {
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
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
        padding-bottom: var(--nxt1-spacing-16);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreShellWebComponent implements OnInit {
  protected readonly explore = inject(ExploreService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('ExploreShellWeb');

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
    this.logger.info('Explore shell (web) initialized');
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

  protected async onTabChange(event: OptionScrollerChangeEvent): Promise<void> {
    await this.haptics.impact('light');
    const tabId = event.option.id as ExploreTabId;
    this.explore.switchTab(tabId);
    this.tabChange.emit(tabId);
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
