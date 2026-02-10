/**
 * @fileoverview Scout Reports Page Component (Mobile)
 * @module apps/mobile/features/scout-reports
 * @version 1.0.0
 *
 * Main page component for scout reports feature on mobile.
 * Uses NavController for Ionic-style navigation with native animations.
 *
 * Following 2026 NXT1 Architecture:
 * - Standalone component with OnPush change detection
 * - Signal-based state from service
 * - IonContent for proper Ionic page context
 * - NavController for programmatic navigation
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonHeader, IonContent, IonToolbar, NavController } from '@ionic/angular/standalone';
import {
  ScoutReportsShellComponent,
  ScoutReportsService,
  ScoutReportFilterPanelComponent,
} from '@nxt1/ui';
import type { ScoutReport, ScoutReportCategoryId, ScoutReportFilter } from '@nxt1/core';

@Component({
  selector: 'app-scout-reports',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonContent,
    IonToolbar,
    ScoutReportsShellComponent,
    ScoutReportFilterPanelComponent,
  ],
  template: `
    <ion-header class="ion-no-border" [translucent]="true">
      <ion-toolbar></ion-toolbar>
    </ion-header>
    <ion-content [fullscreen]="true">
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
    </ion-content>

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
      }
      ion-header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: -1;
        --background: transparent;
      }
      ion-toolbar {
        --background: transparent;
        --min-height: 0;
        --padding-top: 0;
        --padding-bottom: 0;
      }
      ion-content {
        --background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportsComponent implements OnInit {
  protected readonly service = inject(ScoutReportsService);
  private readonly navController = inject(NavController);

  /** Filter panel open state */
  protected isFilterPanelOpen = false;

  ngOnInit(): void {
    // Load initial data
    this.service.loadReports();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Navigate to report detail using NavController for native animation.
   */
  protected onCardClick(report: ScoutReport): void {
    this.navController.navigateForward(`/scout-reports/${report.id}`);
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
