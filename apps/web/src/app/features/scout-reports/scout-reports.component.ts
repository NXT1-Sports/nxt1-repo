/**
 * @fileoverview Scout Reports Page Component (Web)
 * @module apps/web/features/scout-reports
 * @version 1.0.0
 *
 * Main page component for scout reports feature on web.
 * Wraps the shared shell component with web-specific providers.
 *
 * Following 2026 NXT1 Architecture:
 * - Standalone component with OnPush change detection
 * - Signal-based state from service
 * - SSR-safe implementation
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import {
  ScoutReportsShellComponent,
  ScoutReportsService,
  ScoutReportFilterPanelComponent,
} from '@nxt1/ui/scout-reports';
import type { ScoutReport, ScoutReportCategoryId, ScoutReportFilter } from '@nxt1/core';

@Component({
  selector: 'app-scout-reports',
  standalone: true,
  imports: [CommonModule, ScoutReportsShellComponent, ScoutReportFilterPanelComponent],
  template: `
    <!-- Scout Reports Shell -->
    <nxt1-scout-reports-shell
      [reports]="service.reports()"
      [isLoading]="service.isLoading()"
      [isLoadingMore]="service.isLoadingMore()"
      [totalCount]="service.totalCount()"
      [error]="service.error()"
      [hasMore]="service.hasMore()"
      [activeCategory]="service.activeCategory()"
      [searchQuery]="service.searchQuery()"
      [sortOption]="service.sortOption()"
      [activeFilterCount]="service.activeFilterCount()"
      (cardClick)="onCardClick($event)"
      (bookmark)="onBookmark($event)"
      (loadMore)="onLoadMore()"
      (retry)="onRetry()"
      (emptyCta)="onEmptyCta()"
      (clearAllFilters)="onClearFilters()"
      (openFilters)="onOpenFilters()"
      (searchChange)="onSearchChange($event)"
      (sortChange)="onSortChange($event)"
      (categoryChange)="onCategoryChange($event)"
      (refresh)="onRefresh()"
    />

    <!-- Filter Panel -->
    <nxt1-scout-report-filter-panel
      [filter]="service.filter()"
      [isOpen]="isFilterPanelOpen"
      (filterChange)="onFilterChange($event)"
      (close)="onCloseFilters()"
    />
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        background: var(--nxt1-color-background, #0f0f0f);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportsComponent implements OnInit {
  protected readonly service = inject(ScoutReportsService);
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);

  /** Filter panel open state */
  protected isFilterPanelOpen = false;

  ngOnInit(): void {
    // Set page meta for SEO
    this.title.setTitle('Scout Reports | NXT1 - Athlete Recruiting Platform');
    this.meta.updateTag({
      name: 'description',
      content:
        'Browse comprehensive scout reports on top high school athletes. Ratings, stats, and analysis for college recruiting.',
    });

    // Load initial data
    this.service.loadReports();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Navigate to report detail.
   */
  protected onCardClick(report: ScoutReport): void {
    this.router.navigate(['/scout-reports', report.id]);
  }

  /**
   * Toggle bookmark.
   */
  protected onBookmark(reportId: string): void {
    this.service.toggleBookmark(reportId);
  }

  /**
   * Load more reports.
   */
  protected onLoadMore(): void {
    this.service.loadMore();
  }

  /**
   * Retry after error.
   */
  protected onRetry(): void {
    this.service.loadReports();
  }

  /**
   * Empty state CTA click.
   */
  protected onEmptyCta(): void {
    this.service.setCategory('all');
    this.service.clearFilters();
  }

  /**
   * Clear all filters.
   */
  protected onClearFilters(): void {
    this.service.clearFilters();
  }

  /**
   * Open filter panel.
   */
  protected onOpenFilters(): void {
    this.isFilterPanelOpen = true;
  }

  /**
   * Close filter panel.
   */
  protected onCloseFilters(): void {
    this.isFilterPanelOpen = false;
  }

  /**
   * Apply filter changes.
   */
  protected onFilterChange(filter: ScoutReportFilter): void {
    this.service.setFilter(filter);
    this.isFilterPanelOpen = false;
  }

  /**
   * Handle search change.
   */
  protected onSearchChange(query: string): void {
    this.service.setSearchQuery(query);
  }

  /**
   * Handle sort change.
   */
  protected onSortChange(option: string): void {
    this.service.setSortOption(option);
  }

  /**
   * Handle category change.
   */
  protected onCategoryChange(category: ScoutReportCategoryId): void {
    this.service.setCategory(category);
  }

  /**
   * Handle pull-to-refresh.
   */
  protected onRefresh(): void {
    this.service.loadReports();
  }
}
