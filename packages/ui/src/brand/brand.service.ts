/**
 * @fileoverview Brand Vault Service
 * @module @nxt1/ui/brand
 * @version 1.0.0
 *
 * Manages Brand Vault state: the 2×2 category grid and the currently
 * selected category that is passed to Agent X.
 */

import { Injectable, computed, signal } from '@angular/core';
import type { BrandCategory } from '@nxt1/core';
import { BRAND_CATEGORIES } from '@nxt1/core';

@Injectable({ providedIn: 'root' })
export class BrandService {
  private readonly _selectedCategory = signal<BrandCategory | null>(null);

  /** Currently selected brand category (null when none selected). */
  readonly selectedCategory = computed(() => this._selectedCategory());

  /** All brand categories to display in the 2×2 grid. */
  readonly gridCategories = computed<readonly BrandCategory[]>(() => [...BRAND_CATEGORIES]);

  /**
   * Select a brand category — persists selection and prepares Agent X context.
   */
  async selectCategory(category: BrandCategory): Promise<void> {
    this._selectedCategory.set(category);
  }
}
