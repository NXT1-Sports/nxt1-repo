/**
 * @fileoverview Help Category Detail - Web (Tailwind SSR)
 * @module @nxt1/ui/help-center/web
 * @version 3.0.0
 *
 * Web-optimized category detail page using pure Tailwind CSS.
 * 100% SSR-safe with no hydration issues.
 *
 * ⭐ WEB ONLY - Pure Tailwind, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtIconComponent } from '../../components/icon';
import { HelpCenterService } from '../_shared/help-center.service';
import type { HelpArticle, HelpCategoryId } from '@nxt1/core';

@Component({
  selector: 'nxt1-help-category-detail-web',
  standalone: true,
  imports: [CommonModule, NxtDesktopPageHeaderComponent, NxtIconComponent],
  template: `
    <!-- Main Content -->
    <main class="mx-auto max-w-4xl px-4 py-6 pb-24">
      <!-- Desktop Page Header -->
      <nxt1-desktop-page-header [title]="categoryTitle()" />
      <!-- Category Description -->
      @if (category()?.description) {
        <div class="mb-6">
          <p class="text-text-secondary">{{ category()?.description }}</p>
        </div>
      }

      <!-- Articles List -->
      @if (articles().length > 0) {
        <section class="mb-8">
          <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide">
            Articles
          </h2>
          <div class="bg-surface-100 divide-border-subtle divide-y overflow-hidden rounded-xl">
            @for (article of articles(); track article.id) {
              <button
                type="button"
                (click)="onArticleClick(article)"
                class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
              >
                <div
                  class="bg-surface-200 group-hover:bg-surface-300 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
                >
                  <nxt1-icon
                    [name]="getArticleTypeIcon(article.type)"
                    [size]="20"
                    class="text-text-secondary"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="text-text-primary truncate text-base font-medium">
                    {{ article.title }}
                  </h3>
                  <p class="text-text-secondary line-clamp-1 text-sm">{{ article.excerpt }}</p>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                  <span class="text-text-tertiary text-xs"
                    >{{ article.readingTimeMinutes }} min</span
                  >
                  <nxt1-icon
                    name="chevronRight"
                    [size]="20"
                    class="text-text-tertiary group-hover:text-text-secondary transition-colors"
                  />
                </div>
              </button>
            }
          </div>
        </section>
      } @else {
        <!-- Empty State -->
        <div class="bg-surface-100 rounded-xl p-12 text-center">
          <nxt1-icon name="documentText" [size]="64" class="text-text-tertiary mx-auto mb-4" />
          <h3 class="text-text-primary mb-2 text-lg font-medium">No articles yet</h3>
          <p class="text-text-secondary">Check back soon for new content in this category.</p>
        </div>
      }
    </main>
  `,
  styles: [
    `
      /**
     * 100% Theme-Aware Styling
     * All colors use CSS custom properties from @nxt1/design-tokens
     * Automatically adapts to: dark, light, sport themes
     */
      :host {
        display: block;
        min-height: 100%;
        background-color: var(--nxt1-color-bg-primary);
        color: var(--nxt1-color-text-primary);
      }

      .line-clamp-1 {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* Smooth theme transitions */
      :host * {
        transition-property: background-color, border-color, color;
        transition-duration: var(--nxt1-duration-normal, 200ms);
        transition-timing-function: var(--nxt1-ease-in-out);
      }

      :host button {
        transition: all var(--nxt1-duration-fast, 100ms) var(--nxt1-ease-in-out);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCategoryDetailWebComponent {
  private readonly helpService = inject(HelpCenterService);

  /** Category ID to display */
  readonly categoryId = input.required<HelpCategoryId>();

  /** Back button event */
  readonly back = output<void>();

  /** Article navigation event */
  readonly articleClick = output<{ id: string; slug: string }>();

  /** Category data */
  readonly category = computed(() => this.helpService.getCategoryById(this.categoryId()));

  /** Category title */
  readonly categoryTitle = computed(() => this.category()?.label ?? 'Category');

  /** Articles in this category */
  readonly articles = computed(() => this.helpService.getArticlesByCategory(this.categoryId()));

  protected onArticleClick(article: HelpArticle): void {
    this.articleClick.emit({ id: article.id, slug: article.slug });
  }

  /** Get design token icon name for article type */
  protected getArticleTypeIcon(type: string): string {
    switch (type) {
      case 'video':
        return 'videocam';
      case 'guide':
        return 'newspaper';
      case 'tutorial':
        return 'graduationCap';
      default:
        return 'documentText';
    }
  }
}
