/**
 * @fileoverview Scout Reports Shell Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Main container/shell component for the scout reports feature.
 * Orchestrates header, filters, tabs, and list components.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Page header with title and actions
 * - Category tabs/chips horizontal scroller
 * - Search bar with debounce
 * - View mode toggle (grid/list/compact)
 * - Sort selector dropdown
 * - Filter panel trigger
 * - Pull-to-refresh support
 *
 * @example
 * ```html
 * <nxt1-scout-reports-shell
 *   [reports]="reports()"
 *   [isLoading]="isLoading()"
 *   [activeCategory]="activeCategory()"
 *   (categoryChange)="onCategoryChange($event)"
 *   (cardClick)="onCardClick($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  effect,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonIcon,
  IonButton,
  IonButtons,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  gridOutline,
  listOutline,
  reorderFourOutline,
  filterOutline,
  optionsOutline,
  searchOutline,
  chevronDownOutline,
  flameOutline,
  starOutline,
  bookmarkOutline,
  footballOutline,
  basketballOutline,
  baseballOutline,
  trophyOutline,
  appsOutline,
} from 'ionicons/icons';
import type { ScoutReport, ScoutReportViewMode, ScoutReportCategoryId } from '@nxt1/core';
import { SCOUT_REPORT_CATEGORIES } from '@nxt1/core';
import { ScoutReportListComponent } from './scout-report-list.component';
import { ScoutReportCategoryTabsComponent } from './scout-report-category-tabs.component';
import { ScoutReportSearchBarComponent } from './scout-report-search-bar.component';
import {
  ScoutReportSortSelectorComponent,
  type ScoutReportSortOption,
} from './scout-report-sort-selector.component';

// Register icons
addIcons({
  gridOutline,
  listOutline,
  reorderFourOutline,
  filterOutline,
  optionsOutline,
  searchOutline,
  chevronDownOutline,
  flameOutline,
  starOutline,
  bookmarkOutline,
  footballOutline,
  basketballOutline,
  baseballOutline,
  trophyOutline,
  appsOutline,
});

@Component({
  selector: 'nxt1-scout-reports-shell',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonButton,
    IonButtons,
    IonRefresher,
    IonRefresherContent,
    ScoutReportListComponent,
    ScoutReportCategoryTabsComponent,
    ScoutReportSearchBarComponent,
    ScoutReportSortSelectorComponent,
  ],
  template: `
    <!-- Header -->
    <ion-header class="shell-header" [class.shell-header--scrolled]="isScrolled()">
      <ion-toolbar>
        <!-- Title -->
        <ion-title>
          <span class="shell-title">Scout Reports</span>
          @if (totalCount() > 0 && !isLoading()) {
            <span class="shell-count">{{ totalCount() }}</span>
          }
        </ion-title>

        <!-- Header Actions -->
        <ion-buttons slot="end">
          <!-- View Mode Toggle -->
          <div class="view-toggle">
            <button
              class="view-toggle__btn"
              [class.view-toggle__btn--active]="viewMode() === 'grid'"
              (click)="setViewMode('grid')"
              aria-label="Grid view"
            >
              <ion-icon name="grid-outline"></ion-icon>
            </button>
            <button
              class="view-toggle__btn"
              [class.view-toggle__btn--active]="viewMode() === 'list'"
              (click)="setViewMode('list')"
              aria-label="List view"
            >
              <ion-icon name="list-outline"></ion-icon>
            </button>
            <button
              class="view-toggle__btn"
              [class.view-toggle__btn--active]="viewMode() === 'compact'"
              (click)="setViewMode('compact')"
              aria-label="Compact view"
            >
              <ion-icon name="reorder-four-outline"></ion-icon>
            </button>
          </div>

          <!-- Filter Button -->
          <ion-button fill="clear" (click)="openFilters.emit()">
            <ion-icon name="options-outline" slot="icon-only"></ion-icon>
            @if (activeFilterCount() > 0) {
              <span class="filter-badge">{{ activeFilterCount() }}</span>
            }
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <!-- Search & Sort Row -->
      <ion-toolbar class="search-toolbar">
        <nxt1-scout-report-search-bar
          [value]="searchQuery()"
          (valueChange)="onSearchChange($event)"
          (search)="onSearch($event)"
        />
        <nxt1-scout-report-sort-selector
          slot="end"
          [value]="sortOption()"
          (valueChange)="onSortChange($event)"
        />
      </ion-toolbar>

      <!-- Category Tabs -->
      <nxt1-scout-report-category-tabs
        [activeCategory]="activeCategory()"
        [categories]="categories"
        (categoryChange)="onCategoryChange($event)"
      />
    </ion-header>

    <!-- Content -->
    <ion-content [scrollEvents]="true" (ionScroll)="onScroll($event)">
      <!-- Pull to Refresh -->
      <ion-refresher slot="fixed" (ionRefresh)="onRefresh($event)">
        <ion-refresher-content
          pullingIcon="chevron-down-outline"
          pullingText="Pull to refresh"
          refreshingSpinner="crescent"
          refreshingText="Refreshing..."
        />
      </ion-refresher>

      <!-- Stats Bar -->
      @if (!isLoading() && totalCount() > 0) {
        <div class="stats-bar">
          <span class="stats-bar__text">
            Showing {{ reports().length }} of {{ totalCount() }} reports
          </span>
          @if (hasActiveFilters()) {
            <button class="stats-bar__clear" (click)="clearAllFilters.emit()">Clear filters</button>
          }
        </div>
      }

      <!-- Report List -->
      <nxt1-scout-report-list
        [reports]="reports()"
        [viewMode]="viewMode()"
        [isLoading]="isLoading()"
        [isLoadingMore]="isLoadingMore()"
        [isEmpty]="isEmpty()"
        [error]="error()"
        [hasMore]="hasMore()"
        [activeCategory]="activeCategory()"
        (cardClick)="cardClick.emit($event)"
        (bookmark)="bookmark.emit($event)"
        (loadMore)="loadMore.emit()"
        (retry)="retry.emit()"
        (emptyCta)="emptyCta.emit()"
        (clearFilters)="clearAllFilters.emit()"
      />
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
         SHELL - Main Container
         ============================================ */

      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-background, #0f0f0f);
      }

      /* ============================================
         HEADER
         ============================================ */

      .shell-header {
        --background: var(--nxt1-color-surface, #1a1a1a);
        transition: box-shadow 0.2s ease;
      }

      .shell-header--scrolled {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      }

      .shell-title {
        font-weight: 700;
        font-size: 20px;
        letter-spacing: -0.02em;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-text-primary, #ffffff),
          var(--nxt1-color-primary, #3b82f6)
        );
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .shell-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: var(--nxt1-spacing-2, 8px);
        padding: 2px 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-inverse, #0f0f0f);
        background: var(--nxt1-color-primary, #3b82f6);
        border-radius: var(--nxt1-radius-full, 9999px);
        -webkit-text-fill-color: currentColor;
      }

      /* ============================================
         VIEW TOGGLE
         ============================================ */

      .view-toggle {
        display: flex;
        gap: 2px;
        padding: 4px;
        background: var(--nxt1-color-surface-elevated, #252525);
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .view-toggle__btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: var(--nxt1-radius-md, 8px);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .view-toggle__btn:hover {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        background: var(--nxt1-color-surface, #1a1a1a);
      }

      .view-toggle__btn--active {
        color: var(--nxt1-color-primary, #3b82f6);
        background: var(--nxt1-color-primary-alpha-10, rgba(59, 130, 246, 0.1));
      }

      .view-toggle__btn ion-icon {
        font-size: 18px;
      }

      /* ============================================
         FILTER BADGE
         ============================================ */

      .filter-badge {
        position: absolute;
        top: 2px;
        right: 2px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        font-size: 10px;
        font-weight: 700;
        line-height: 16px;
        text-align: center;
        color: var(--nxt1-color-text-inverse, #0f0f0f);
        background: var(--nxt1-color-primary, #3b82f6);
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* ============================================
         SEARCH TOOLBAR
         ============================================ */

      .search-toolbar {
        --padding-start: var(--nxt1-spacing-4, 16px);
        --padding-end: var(--nxt1-spacing-4, 16px);
        --padding-top: 0;
        --padding-bottom: var(--nxt1-spacing-2, 8px);
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      /* ============================================
         STATS BAR
         ============================================ */

      .stats-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-surface, #1a1a1a);
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
      }

      .stats-bar__text {
        font-size: 13px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .stats-bar__clear {
        padding: 0;
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-primary, #3b82f6);
        background: none;
        border: none;
        cursor: pointer;
      }

      .stats-bar__clear:hover {
        text-decoration: underline;
      }

      /* ============================================
         CONTENT
         ============================================ */

      ion-content {
        --background: var(--nxt1-color-background, #0f0f0f);
      }

      /* ============================================
         THEME VARIANTS
         ============================================ */

      :host-context(.light-theme) {
        .shell-header {
          --background: var(--nxt1-color-surface, #ffffff);
        }

        .shell-header--scrolled {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .view-toggle {
          background: var(--nxt1-color-gray-100, #f3f4f6);
        }

        .view-toggle__btn:hover {
          background: var(--nxt1-color-gray-200, #e5e7eb);
        }

        .stats-bar {
          background: var(--nxt1-color-surface, #ffffff);
          border-color: var(--nxt1-color-gray-200, #e5e7eb);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportsShellComponent {
  private readonly platformId = inject(PLATFORM_ID);

  // ============================================
  // INPUTS
  // ============================================

  /** Scout reports to display */
  readonly reports = input<ScoutReport[]>([]);

  /** Whether initial loading */
  readonly isLoading = input<boolean>(false);

  /** Whether loading more */
  readonly isLoadingMore = input<boolean>(false);

  /** Total count for stats */
  readonly totalCount = input<number>(0);

  /** Error message */
  readonly error = input<string | null>(null);

  /** Whether more data available */
  readonly hasMore = input<boolean>(false);

  /** Active category */
  readonly activeCategory = input<ScoutReportCategoryId>('all');

  /** Search query */
  readonly searchQuery = input<string>('');

  /** Sort option */
  readonly sortOption = input<ScoutReportSortOption>('rating-desc');

  /** Number of active filters */
  readonly activeFilterCount = input<number>(0);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when a card is clicked */
  readonly cardClick = output<ScoutReport>();

  /** Emitted when bookmark is toggled */
  readonly bookmark = output<string>();

  /** Emitted to load more data */
  readonly loadMore = output<void>();

  /** Emitted to retry after error */
  readonly retry = output<void>();

  /** Emitted when empty state CTA is clicked */
  readonly emptyCta = output<void>();

  /** Emitted to clear all filters */
  readonly clearAllFilters = output<void>();

  /** Emitted to open filter panel */
  readonly openFilters = output<void>();

  /** Emitted when search changes */
  readonly searchChange = output<string>();

  /** Emitted when sort changes */
  readonly sortChange = output<ScoutReportSortOption>();

  /** Emitted when category changes */
  readonly categoryChange = output<ScoutReportCategoryId>();

  /** Emitted when view mode changes */
  readonly viewModeChange = output<ScoutReportViewMode>();

  /** Emitted on pull-to-refresh */
  readonly refresh = output<void>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Current view mode */
  protected readonly viewMode = signal<ScoutReportViewMode>('grid');

  /** Whether user has scrolled */
  protected readonly isScrolled = signal(false);

  /** Categories for tabs */
  protected readonly categories = SCOUT_REPORT_CATEGORIES;

  // ============================================
  // COMPUTED
  // ============================================

  /** Whether list is empty */
  protected readonly isEmpty = computed(() => !this.isLoading() && this.reports().length === 0);

  /** Whether filters are active */
  protected readonly hasActiveFilters = computed(
    () => this.activeFilterCount() > 0 || this.searchQuery().trim().length > 0
  );

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Persist view mode preference
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem('scout-reports-view-mode');
      if (saved && ['grid', 'list', 'compact'].includes(saved)) {
        this.viewMode.set(saved as ScoutReportViewMode);
      }
    }

    // Sync view mode to storage
    effect(() => {
      const mode = this.viewMode();
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('scout-reports-view-mode', mode);
      }
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Set view mode.
   */
  protected setViewMode(mode: ScoutReportViewMode): void {
    this.viewMode.set(mode);
    this.viewModeChange.emit(mode);
  }

  /**
   * Handle search input change.
   */
  protected onSearchChange(query: string): void {
    this.searchChange.emit(query);
  }

  /**
   * Handle search submit.
   */
  protected onSearch(query: string): void {
    this.searchChange.emit(query);
  }

  /**
   * Handle sort change.
   */
  protected onSortChange(option: ScoutReportSortOption): void {
    this.sortChange.emit(option);
  }

  /**
   * Handle category change.
   */
  protected onCategoryChange(category: ScoutReportCategoryId): void {
    this.categoryChange.emit(category);
  }

  /**
   * Handle scroll event for header shadow.
   */
  protected onScroll(event: CustomEvent): void {
    const scrollTop = event.detail.scrollTop;
    this.isScrolled.set(scrollTop > 10);
  }

  /**
   * Handle pull-to-refresh.
   */
  protected async onRefresh(event: CustomEvent): Promise<void> {
    this.refresh.emit();

    // Complete after a delay (parent should handle actual refresh)
    const refresher = event.target as HTMLIonRefresherElement;
    setTimeout(() => {
      refresher.complete();
    }, 1000);
  }
}
