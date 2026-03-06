/**
 * @fileoverview Brand Service — Shared State Management
 * @module @nxt1/ui/brand
 * @version 1.0.0
 *
 * Signal-based state management for the Brand Vault feature.
 * Shared between web and mobile applications.
 *
 * The Brand page displays a grid of categories. Tapping a category
 * opens Agent X with a pre-filled prompt specific to that category.
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { type BrandCategory, type BrandCategoryId, BRAND_CATEGORIES } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';

@Injectable({ providedIn: 'root' })
export class BrandService {
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('BrandService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _categories = signal<readonly BrandCategory[]>(BRAND_CATEGORIES);
  private readonly _selectedCategory = signal<BrandCategory | null>(null);
  private readonly _isLoading = signal(false);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** All brand categories */
  readonly categories = computed(() => this._categories());

  /** Featured category (connections — full-width at top) */
  readonly featuredCategory = computed(
    () => this._categories().find((c) => c.id === 'connections') ?? this._categories()[0]
  );

  /** Grid categories (everything except featured) */
  readonly gridCategories = computed(() =>
    this._categories().filter((c) => c.id !== 'connections')
  );

  /** Currently selected category */
  readonly selectedCategory = computed(() => this._selectedCategory());

  /** Loading state */
  readonly isLoading = computed(() => this._isLoading());

  /** Category count */
  readonly categoryCount = computed(() => this._categories().length);

  // ============================================
  // METHODS
  // ============================================

  /**
   * Track Brand page view.
   */
  trackPageView(): void {
    this.logger.info('Brand page viewed');
    this.analytics?.trackEvent(APP_EVENTS.BRAND_VIEWED);
    this.breadcrumb.trackStateChange('brand:viewed');
  }

  /**
   * Select a brand category.
   * Returns the agent prompt to use when navigating to Agent X.
   */
  async selectCategory(category: BrandCategory): Promise<string> {
    await this.haptics.impact('light');
    this._selectedCategory.set(category);

    this.logger.info('Brand category selected', { categoryId: category.id });
    this.analytics?.trackEvent(APP_EVENTS.BRAND_CATEGORY_SELECTED, {
      category_id: category.id,
      category_label: category.label,
    });
    this.breadcrumb.trackStateChange('brand:category-selected', {
      categoryId: category.id,
    });

    return category.agentPrompt;
  }

  /**
   * Get a category by its ID.
   */
  getCategoryById(id: BrandCategoryId): BrandCategory | undefined {
    return this._categories().find((c) => c.id === id);
  }

  /**
   * Clear the selected category.
   */
  clearSelection(): void {
    this._selectedCategory.set(null);
  }
}
