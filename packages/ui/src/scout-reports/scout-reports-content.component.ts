/**
 * @fileoverview Scout Reports Content Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Content-only component for the Scout Reports feed.
 * Designed to be embedded within a parent shell (home/explore).
 *
 * ⭐ NO HEADER OR NAVIGATION - CONTENT ONLY ⭐
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Category sub-filter (horizontal scroller)
 * - Sort selector
 * - View mode toggle
 * - Scout report list with all states
 * - Pull-to-refresh support (via parent)
 *
 * This component is meant to be used INSIDE a parent shell that provides:
 * - The main page header
 * - The main feed options scroller
 * - Pull-to-refresh container
 *
 * @example
 * ```html
 * <!-- Inside a parent shell (home/explore) -->
 * @if (selectedFeed() === 'scout-reports') {
 *   <nxt1-scout-reports-content
 *     (reportSelect)="onReportSelect($event)"
 *   />
 * }
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  output,
  signal,
  computed,
  effect,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  gridOutline,
  listOutline,
  reorderFourOutline,
  filterOutline,
  optionsOutline,
} from 'ionicons/icons';
import type { ScoutReport, ScoutReportViewMode, ScoutReportCategoryId } from '@nxt1/core';
import { SCOUT_REPORT_CATEGORIES } from '@nxt1/core';
import { ScoutReportsService } from './scout-reports.service';
import { ScoutReportListComponent } from './scout-report-list.component';
import { ScoutReportCategoryTabsComponent } from './scout-report-category-tabs.component';
import {
  ScoutReportSortSelectorComponent,
  type ScoutReportSortOption,
} from './scout-report-sort-selector.component';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
addIcons({
  gridOutline,
  listOutline,
  reorderFourOutline,
  filterOutline,
  optionsOutline,
});

@Component({
  selector: 'nxt1-scout-reports-content',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    ScoutReportListComponent,
    ScoutReportCategoryTabsComponent,
    ScoutReportSortSelectorComponent,
  ],
  template: `
    <div class="scout-reports-content">
      <!-- Top Bar: Category Tabs + View Toggle + Sort -->
      <div class="scout-reports-content__top-bar">
        <!-- Category Sub-Filter -->
        <div class="scout-reports-content__categories">
          <nxt1-scout-report-category-tabs
            [activeCategory]="service.activeCategory()"
            [categories]="categories"
            (categoryChange)="onCategoryChange($event)"
          />
        </div>

        <!-- Actions (View Toggle + Filter) -->
        <div class="scout-reports-content__actions">
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
          <button
            type="button"
            class="scout-reports-content__filter-btn"
            (click)="onFilterClick()"
            aria-label="Open filters"
          >
            <ion-icon name="options-outline"></ion-icon>
            @if (activeFilterCount() > 0) {
              <span class="filter-badge">{{ activeFilterCount() }}</span>
            }
          </button>
        </div>
      </div>

      <!-- Sort Row -->
      <div class="scout-reports-content__sort-row">
        <nxt1-scout-report-sort-selector
          [value]="service.sortOption()"
          (valueChange)="onSortChange($event)"
        />
        @if (totalCount() > 0 && !service.isLoading()) {
          <span class="scout-reports-content__count"> {{ totalCount() }} reports </span>
        }
      </div>

      <!-- Report List -->
      <div class="scout-reports-content__list">
        <nxt1-scout-report-list
          [reports]="service.reports()"
          [viewMode]="viewMode()"
          [isLoading]="service.isLoading()"
          [isLoadingMore]="service.isLoadingMore()"
          [isEmpty]="isEmpty()"
          [error]="service.error()"
          [hasMore]="service.hasMore()"
          [activeCategory]="service.activeCategory()"
          (cardClick)="onReportClick($event)"
          (bookmark)="onBookmarkClick($event)"
          (loadMore)="onLoadMore()"
          (retry)="onRetry()"
          (emptyCta)="onEmptyCta()"
          (clearFilters)="onClearFilters()"
        />
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         SCOUT REPORTS CONTENT - Embeddable Feed Content
         No header/navigation - designed for shell embedding
         ============================================ */

      :host {
        display: block;
        height: 100%;
      }

      .scout-reports-content {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      /* ============================================
         TOP BAR (Category Filter + Actions)
         ============================================ */

      .scout-reports-content__top-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--nxt1-spacing-4, 16px);
        gap: var(--nxt1-spacing-3, 12px);
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-bg-primary, #0a0a0a);
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .scout-reports-content__categories {
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }

      .scout-reports-content__actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        flex-shrink: 0;
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
        width: 28px;
        height: 28px;
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
        color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-primary-alpha-10, rgba(204, 255, 0, 0.1));
      }

      .view-toggle__btn ion-icon {
        font-size: 16px;
      }

      /* ============================================
         FILTER BUTTON
         ============================================ */

      .scout-reports-content__filter-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        background: var(--nxt1-color-surface-elevated, #252525);
        border-radius: var(--nxt1-radius-md, 8px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .scout-reports-content__filter-btn:hover {
        background: var(--nxt1-color-surface, #1a1a1a);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .scout-reports-content__filter-btn ion-icon {
        font-size: 18px;
      }

      .filter-badge {
        position: absolute;
        top: 2px;
        right: 2px;
        min-width: 14px;
        height: 14px;
        padding: 0 3px;
        font-size: 9px;
        font-weight: 700;
        line-height: 14px;
        text-align: center;
        color: var(--nxt1-color-text-inverse, #0f0f0f);
        background: var(--nxt1-color-primary, #ccff00);
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* ============================================
         SORT ROW
         ============================================ */

      .scout-reports-content__sort-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-bg-primary, #0a0a0a);
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      .scout-reports-content__count {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
         REPORT LIST
         ============================================ */

      .scout-reports-content__list {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      /* ============================================
         LIGHT THEME
         ============================================ */

      :host-context(.light-theme) {
        .scout-reports-content__top-bar {
          background: var(--nxt1-color-bg-primary, #ffffff);
          border-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.08));
        }

        .view-toggle {
          background: var(--nxt1-color-gray-100, #f3f4f6);
        }

        .view-toggle__btn:hover {
          background: var(--nxt1-color-gray-200, #e5e7eb);
        }

        .scout-reports-content__filter-btn {
          background: var(--nxt1-color-gray-100, #f3f4f6);
        }

        .scout-reports-content__filter-btn:hover {
          background: var(--nxt1-color-gray-200, #e5e7eb);
        }

        .scout-reports-content__sort-row {
          background: var(--nxt1-color-bg-primary, #ffffff);
          border-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.06));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportsContentComponent implements OnInit {
  protected readonly service = inject(ScoutReportsService);
  private readonly haptics = inject(HapticsService);
  private readonly platformId = inject(PLATFORM_ID);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when a report is selected */
  readonly reportSelect = output<ScoutReport>();

  /** Emitted when filter panel should open */
  readonly openFilters = output<void>();

  /** Emitted when user triggers refresh (for parent to handle) */
  readonly refresh = output<void>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Current view mode */
  protected readonly viewMode = signal<ScoutReportViewMode>('grid');

  /** Categories for tabs */
  protected readonly categories = SCOUT_REPORT_CATEGORIES;

  // ============================================
  // COMPUTED
  // ============================================

  /** Total report count */
  readonly totalCount = computed(() => this.service.totalCount());

  /** Active filter count */
  readonly activeFilterCount = computed(() => this.service.activeFilterCount());

  /** Whether list is empty */
  protected readonly isEmpty = computed(
    () => !this.service.isLoading() && this.service.reports().length === 0
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
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Load initial data
    void this.service.loadReports();
  }

  // ============================================
  // PUBLIC METHODS (for parent shell to call)
  // ============================================

  /**
   * Refresh the scout reports.
   * Called by parent shell when pull-to-refresh triggers.
   */
  async refreshReports(): Promise<void> {
    await this.service.refresh();
  }

  // ============================================
  // VIEW MODE
  // ============================================

  protected async setViewMode(mode: ScoutReportViewMode): Promise<void> {
    await this.haptics.impact('light');
    this.viewMode.set(mode);
  }

  // ============================================
  // CATEGORY HANDLING
  // ============================================

  protected async onCategoryChange(categoryId: ScoutReportCategoryId): Promise<void> {
    await this.haptics.impact('light');
    await this.service.setCategory(categoryId);
  }

  // ============================================
  // SORT HANDLING
  // ============================================

  protected async onSortChange(option: ScoutReportSortOption): Promise<void> {
    await this.haptics.impact('light');
    await this.service.setSortOption(option);
  }

  // ============================================
  // FILTER HANDLING
  // ============================================

  protected async onFilterClick(): Promise<void> {
    await this.haptics.impact('light');
    this.openFilters.emit();
  }

  protected async onClearFilters(): Promise<void> {
    await this.haptics.impact('medium');
    await this.service.clearFilters();
  }

  // ============================================
  // REPORT INTERACTIONS
  // ============================================

  protected async onReportClick(report: ScoutReport): Promise<void> {
    await this.haptics.impact('light');
    this.reportSelect.emit(report);
  }

  protected async onBookmarkClick(reportId: string): Promise<void> {
    await this.haptics.impact('medium');
    await this.service.toggleBookmark(reportId);
  }

  // ============================================
  // LIST ACTIONS
  // ============================================

  protected async onLoadMore(): Promise<void> {
    await this.service.loadMore();
  }

  protected async onRetry(): Promise<void> {
    await this.service.loadReports();
  }

  protected onEmptyCta(): void {
    // Navigate to explore or clear filters
    this.onClearFilters();
  }
}
