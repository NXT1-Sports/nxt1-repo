/**
 * @fileoverview Brand Shell — Web (Zero Ionic)
 * @module @nxt1/ui/brand/web
 * @version 1.0.0
 *
 * Web-optimized Brand Vault shell.
 * 100% SSR-safe with semantic HTML. Zero Ionic components.
 *
 * Displays the brand category grid using NxtIconComponent for design token SVGs.
 */

import { Component, ChangeDetectionStrategy, inject, output } from '@angular/core';
import type { BrandCategory } from '@nxt1/core';
import { BRAND_PAGE_TITLE, BRAND_PAGE_SUBTITLE } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { BrandCategoryCardComponent } from '../brand-category-card.component';
import { BrandService } from '../brand.service';

@Component({
  selector: 'nxt1-brand-shell-web',
  standalone: true,
  imports: [NxtDesktopPageHeaderComponent, BrandCategoryCardComponent],
  template: `
    <main class="brand-main" [attr.data-testid]="testIds.CONTAINER">
      <!-- Desktop Page Header -->
      <nxt1-desktop-page-header [title]="title" [subtitle]="subtitle" />

      <!-- Featured — Connections full-width -->
      @if (brand.featuredCategory(); as featured) {
        <div class="brand-featured">
          <nxt1-brand-category-card
            [category]="featured"
            [wide]="true"
            (cardClick)="onCategorySelect($event)"
          />
        </div>
      }

      <!-- Category Grid — 2x2 -->
      <section class="brand-grid" [attr.data-testid]="testIds.GRID" aria-label="Brand categories">
        @for (category of brand.gridCategories(); track category.id) {
          <nxt1-brand-category-card [category]="category" (cardClick)="onCategorySelect($event)" />
        }
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .brand-main {
        min-height: 100%;
        padding: 0 0 48px;
        background: var(--nxt1-color-bg-primary);
      }

      .brand-featured {
        margin-top: 8px;
      }

      .brand-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        grid-auto-rows: 1fr;
        gap: 12px;
        margin-top: 12px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandShellWebComponent {
  protected readonly brand = inject(BrandService);

  /** Emitted when a category is selected — parent navigates to Agent X */
  readonly categorySelect = output<BrandCategory>();

  protected readonly testIds = TEST_IDS.BRAND;
  protected readonly title = BRAND_PAGE_TITLE;
  protected readonly subtitle = BRAND_PAGE_SUBTITLE;

  async onCategorySelect(category: BrandCategory): Promise<void> {
    await this.brand.selectCategory(category);
    this.categorySelect.emit(category);
  }
}
