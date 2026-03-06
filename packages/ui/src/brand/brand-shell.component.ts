/**
 * @fileoverview Brand Shell — Mobile (Ionic)
 * @module @nxt1/ui/brand
 * @version 1.0.0
 *
 * Mobile shell for the Brand Vault page.
 * Displays a 2x2 grid of brand categories that open Agent X with context.
 *
 * Uses Ionic components for native mobile UX.
 */

import { Component, ChangeDetectionStrategy, inject, output } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import type { BrandCategory } from '@nxt1/core';
import { BRAND_PAGE_SUBTITLE } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { BrandService } from './brand.service';
import { BrandCategoryCardComponent } from './brand-category-card.component';
import { NxtPageHeaderComponent } from '../components/page-header/page-header.component';

@Component({
  selector: 'nxt1-brand-shell',
  standalone: true,
  imports: [IonContent, NxtPageHeaderComponent, BrandCategoryCardComponent],
  template: `
    <div class="brand-shell" [attr.data-testid]="testIds.CONTAINER">
      <!-- Page Header — FIXED above scroll area -->
      <nxt1-page-header (menuClick)="avatarClick.emit()">
        <div pageHeaderSlot="title" class="header-logo">
          <span class="header-title-text">Brand</span>
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
            <path
              d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
            />
            <polygon
              points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
            />
          </svg>
        </div>
      </nxt1-page-header>

      <!-- Scrollable content — ion-content creates the scroll boundary -->
      <ion-content [fullscreen]="true" class="brand-content">
        <!-- Subtitle — centered -->
        <p class="brand-subtitle" [attr.data-testid]="testIds.HEADER">{{ subtitle }}</p>

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
        <div class="brand-grid" [attr.data-testid]="testIds.GRID">
          @for (category of brand.gridCategories(); track category.id) {
            <nxt1-brand-category-card
              [category]="category"
              (cardClick)="onCategorySelect($event)"
            />
          }
        </div>
      </ion-content>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .brand-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .brand-content {
        flex: 1;
        --background: transparent;
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

      .brand-subtitle {
        margin: 0;
        padding: 16px 20px 4px;
        font-size: 15px;
        font-weight: 400;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.55));
        line-height: 1.45;
        text-align: center;
      }

      .brand-featured {
        padding: 16px 20px 0;
      }

      .brand-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        grid-auto-rows: 1fr;
        gap: 10px;
        padding: 10px 20px;
        padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandShellComponent {
  protected readonly brand = inject(BrandService);

  /** Emitted when a category is selected — parent navigates to Agent X */
  readonly categorySelect = output<BrandCategory>();

  /** Emitted when hamburger is clicked — parent opens sidenav */
  readonly avatarClick = output<void>();

  protected readonly testIds = TEST_IDS.BRAND;
  protected readonly subtitle = BRAND_PAGE_SUBTITLE;

  async onCategorySelect(category: BrandCategory): Promise<void> {
    await this.brand.selectCategory(category);
    this.categorySelect.emit(category);
  }
}
