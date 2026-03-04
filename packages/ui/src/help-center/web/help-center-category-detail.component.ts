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
import { HelpCenterService } from '../_shared/help-center.service';
import type { HelpArticle, HelpCategoryId } from '@nxt1/core';

@Component({
  selector: 'nxt1-help-category-detail-web',
  standalone: true,
  imports: [CommonModule, NxtDesktopPageHeaderComponent],
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
          <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide uppercase">
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
                  <svg
                    class="text-text-secondary h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    @switch (article.type) {
                      @case ('video') {
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      }
                      @case ('guide') {
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                      }
                      @case ('tutorial') {
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 14l9-5-9-5-9 5 9 5zm0 7l9-5-9-5-9 5 9 5z"
                        />
                      }
                      @default {
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      }
                    }
                  </svg>
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
                  <svg
                    class="text-text-tertiary group-hover:text-text-secondary h-5 w-5 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            }
          </div>
        </section>
      } @else {
        <!-- Empty State -->
        <div class="bg-surface-100 rounded-xl p-12 text-center">
          <svg
            class="text-text-tertiary mx-auto mb-4 h-16 w-16"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 class="text-text-primary mb-2 text-lg font-medium">No articles yet</h3>
          <p class="text-text-secondary">Check back soon for new content in this category.</p>
        </div>
      }

      <!-- FAQs for this category -->
      @if (faqs().length > 0) {
        <section class="mb-8">
          <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide uppercase">
            Frequently Asked
          </h2>
          <div class="bg-surface-100 divide-border-subtle divide-y overflow-hidden rounded-xl">
            @for (faq of faqs(); track faq.id) {
              <button
                type="button"
                (click)="onFaqClick(faq.id)"
                class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
              >
                <div
                  class="bg-surface-200 group-hover:bg-surface-300 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
                >
                  <svg
                    class="text-text-secondary h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="text-text-primary text-base font-medium">{{ faq.question }}</h3>
                </div>
                <svg
                  class="text-text-tertiary group-hover:text-text-secondary h-5 w-5 shrink-0 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
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
        </section>
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

  /** FAQ navigation event */
  readonly faqClick = output<string>();

  /** Category data */
  readonly category = computed(() => this.helpService.getCategoryById(this.categoryId()));

  /** Category title */
  readonly categoryTitle = computed(() => this.category()?.label ?? 'Category');

  /** Articles in this category */
  readonly articles = computed(() => this.helpService.getArticlesByCategory(this.categoryId()));

  /** FAQs in this category */
  readonly faqs = computed(() => this.helpService.getFaqsByCategory(this.categoryId()));

  protected onArticleClick(article: HelpArticle): void {
    this.articleClick.emit({ id: article.id, slug: article.slug });
  }

  protected onFaqClick(faqId: string): void {
    this.faqClick.emit(faqId);
  }
}
