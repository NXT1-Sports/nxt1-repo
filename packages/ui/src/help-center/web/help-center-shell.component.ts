/**
 * @fileoverview Help Center Shell - Web (Tailwind SSR)
 * @module @nxt1/ui/help-center/web
 * @version 3.0.0
 *
 * Web-optimized Help Center using pure Tailwind CSS.
 * 100% SSR-safe with no hydration issues.
 *
 * ⭐ WEB ONLY - Pure Tailwind, SSR-optimized ⭐
 *
 * Design Token Integration:
 * - Uses @nxt1/design-tokens CSS custom properties
 * - Tailwind classes map to design tokens via preset
 * - Dark/light mode via [data-theme] attribute
 */

import { Component, ChangeDetectionStrategy, inject, output, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HelpCenterService } from '../_shared/help-center.service';
import type { HelpArticle, HelpCategoryId, HelpCategory } from '@nxt1/core';

/** Navigation events */
export interface HelpNavigateEvent {
  readonly type: 'article' | 'category' | 'faq' | 'contact';
  readonly id?: string;
  readonly slug?: string;
}

@Component({
  selector: 'nxt1-help-center-shell-web',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Page Header -->
    <header
      class="bg-bg-primary/95 border-border-subtle sticky top-0 z-10 border-b backdrop-blur-sm"
    >
      <div class="mx-auto flex max-w-4xl items-center gap-4 px-4 py-4">
        @if (showBack()) {
          <button
            type="button"
            (click)="back.emit()"
            class="bg-surface-100 hover:bg-surface-200 text-text-secondary hover:text-text-primary flex h-10 w-10 items-center justify-center rounded-full transition-colors"
            aria-label="Go back"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        }
        <h1 class="text-text-primary text-xl font-semibold">Help Center</h1>
      </div>
    </header>

    <!-- Main Content -->
    <main class="mx-auto max-w-4xl px-4 py-6 pb-24">
      <!-- Search Bar -->
      <div class="mb-8">
        <div class="relative">
          <svg
            class="text-text-tertiary absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            [ngModel]="helpService.searchQuery()"
            (ngModelChange)="onSearch($event)"
            placeholder="Search help articles..."
            class="bg-surface-100 border-border-subtle text-text-primary placeholder:text-text-tertiary focus:ring-primary/30 focus:border-primary h-12 w-full rounded-xl border pr-4 pl-12 transition-all duration-200 focus:ring-2 focus:outline-none"
          />
        </div>
      </div>

      <!-- Search Results -->
      @if (helpService.isSearching()) {
        <section class="mb-8">
          <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide uppercase">
            Search Results
          </h2>

          @if (helpService.filteredArticles().length === 0) {
            <div class="bg-surface-100 rounded-xl p-8 text-center">
              <svg
                class="text-text-tertiary mx-auto mb-3 h-12 w-12"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                />
              </svg>
              <p class="text-text-secondary">No articles found for your search.</p>
              <button
                type="button"
                (click)="helpService.clearSearch()"
                class="text-primary hover:text-primary-400 mt-4 font-medium transition-colors"
              >
                Clear search
              </button>
            </div>
          } @else {
            <div class="bg-surface-100 divide-border-subtle divide-y overflow-hidden rounded-xl">
              @for (article of helpService.filteredArticles(); track article.id) {
                <button
                  type="button"
                  (click)="onArticleClick(article)"
                  class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
                >
                  <div
                    class="bg-surface-200 group-hover:bg-surface-300 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg transition-colors"
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
                  <svg
                    class="text-text-tertiary group-hover:text-text-secondary h-5 w-5 flex-shrink-0 transition-colors"
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
          }
        </section>
      } @else {
        <!-- Featured Articles -->
        @if (helpService.featuredArticles().length > 0) {
          <section class="mb-8">
            <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide uppercase">
              Featured
            </h2>
            <div class="bg-surface-100 divide-border-subtle divide-y overflow-hidden rounded-xl">
              @for (article of helpService.featuredArticles(); track article.id) {
                <button
                  type="button"
                  (click)="onArticleClick(article)"
                  class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
                >
                  <div
                    class="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
                  >
                    <svg
                      class="text-primary h-5 w-5"
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
                    <div class="flex items-center gap-2">
                      <h3 class="text-text-primary truncate text-base font-medium">
                        {{ article.title }}
                      </h3>
                      @if (article.isNew) {
                        <span
                          class="bg-primary text-text-inverse flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                        >
                          New
                        </span>
                      }
                    </div>
                    <p class="text-text-secondary line-clamp-1 text-sm">{{ article.excerpt }}</p>
                  </div>
                  <svg
                    class="text-text-tertiary group-hover:text-text-secondary h-5 w-5 flex-shrink-0 transition-colors"
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

        <!-- Categories -->
        <section class="mb-8">
          <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide uppercase">
            Browse by Topic
          </h2>
          <div class="bg-surface-100 divide-border-subtle divide-y overflow-hidden rounded-xl">
            @for (category of helpService.categories(); track category.id) {
              <button
                type="button"
                (click)="onCategoryClick(category.id)"
                class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
              >
                <div
                  class="bg-surface-200 group-hover:bg-surface-300 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg transition-colors"
                >
                  <span class="text-lg" [innerHTML]="getCategoryIcon(category)"></span>
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="text-text-primary text-base font-medium">{{ category.label }}</h3>
                  @if (category.description) {
                    <p class="text-text-secondary line-clamp-1 text-sm">
                      {{ category.description }}
                    </p>
                  }
                </div>
                <svg
                  class="text-text-tertiary group-hover:text-text-secondary h-5 w-5 flex-shrink-0 transition-colors"
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

        <!-- Popular Questions -->
        @if (helpService.popularFaqs().length > 0) {
          <section class="mb-8">
            <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide uppercase">
              Popular Questions
            </h2>
            <div class="bg-surface-100 divide-border-subtle divide-y overflow-hidden rounded-xl">
              @for (faq of helpService.popularFaqs(); track faq.id) {
                <button
                  type="button"
                  (click)="onFaqClick(faq.id)"
                  class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
                >
                  <div
                    class="bg-surface-200 group-hover:bg-surface-300 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg transition-colors"
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
                    class="text-text-tertiary group-hover:text-text-secondary h-5 w-5 flex-shrink-0 transition-colors"
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

        <!-- Contact Support -->
        <section class="mb-8">
          <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide uppercase">
            Need More Help?
          </h2>
          <div class="bg-surface-100 overflow-hidden rounded-xl">
            <button
              type="button"
              (click)="onContactClick()"
              class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
            >
              <div
                class="bg-primary/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
              >
                <svg
                  class="text-primary h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-text-primary text-base font-medium">Contact Support</h3>
                <p class="text-text-secondary text-sm">Get help from our team</p>
              </div>
              <svg
                class="text-text-tertiary group-hover:text-text-secondary h-5 w-5 flex-shrink-0 transition-colors"
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
          </div>
        </section>
      }

      <!-- Footer -->
      <footer class="py-8 text-center">
        <p class="text-text-tertiary text-sm">Can't find what you're looking for?</p>
        <a
          href="mailto:support@nxt1sports.com"
          class="text-primary hover:text-primary-400 text-sm font-medium transition-colors"
        >
          support&#64;nxt1sports.com
        </a>
      </footer>
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

      /* Line clamp utility */
      .line-clamp-1 {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* Ensure smooth transitions when theme changes */
      :host * {
        transition-property: background-color, border-color, color;
        transition-duration: var(--nxt1-duration-normal, 200ms);
        transition-timing-function: var(--nxt1-ease-in-out);
      }

      /* Disable transition for interactive elements to prevent flickering */
      :host button,
      :host a,
      :host input {
        transition: all var(--nxt1-duration-fast, 100ms) var(--nxt1-ease-in-out);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterShellWebComponent {
  protected readonly helpService = inject(HelpCenterService);

  readonly showBack = input(true);
  readonly back = output<void>();
  readonly navigate = output<HelpNavigateEvent>();

  protected onSearch(query: string): void {
    this.helpService.setSearchQuery(query);
  }

  protected onArticleClick(article: HelpArticle): void {
    this.navigate.emit({
      type: 'article',
      id: article.id,
      slug: article.slug,
    });
  }

  protected onCategoryClick(categoryId: HelpCategoryId): void {
    this.navigate.emit({
      type: 'category',
      id: categoryId,
    });
  }

  protected onFaqClick(faqId: string): void {
    this.navigate.emit({
      type: 'faq',
      id: faqId,
    });
  }

  protected onContactClick(): void {
    this.navigate.emit({
      type: 'contact',
    });
  }

  /** Get category icon as emoji for SSR-safe rendering */
  protected getCategoryIcon(category: HelpCategory): string {
    const iconMap: Record<string, string> = {
      'rocket-outline': '🚀',
      'fitness-outline': '🏃',
      'clipboard-outline': '📋',
      'people-outline': '👥',
      'shield-outline': '🛡️',
      'school-outline': '🎓',
      'person-outline': '👤',
      'videocam-outline': '📹',
      'diamond-outline': '💎',
      'settings-outline': '⚙️',
      'lock-closed-outline': '🔒',
      'construct-outline': '🔧',
    };
    return iconMap[category.icon] ?? '📄';
  }
}
