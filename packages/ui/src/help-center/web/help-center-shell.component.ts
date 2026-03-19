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

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  output,
  input,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtSectionNavWebComponent } from '../../components/section-nav-web';
import type { SectionNavItem, SectionNavChangeEvent } from '../../components/section-nav-web';
import { NxtIconComponent } from '../../components/icon';
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
  imports: [
    CommonModule,
    FormsModule,
    NxtDesktopPageHeaderComponent,
    NxtSectionNavWebComponent,
    NxtIconComponent,
  ],
  template: `
    <!-- Main Content -->
    <main class="help-main">
      <div class="help-dashboard">
        <!-- Desktop Page Header -->
        <nxt1-desktop-page-header
          title="Help Center"
          subtitle="Find answers, guides, and support for your account."
        />
        <!-- Search Bar -->
        <div class="mb-8">
          <div class="relative">
            <nxt1-icon
              name="search"
              [size]="20"
              class="text-text-tertiary absolute left-4 top-1/2 -translate-y-1/2"
            />
            <input
              type="search"
              [ngModel]="helpService.searchQuery()"
              (ngModelChange)="onSearch($event)"
              placeholder="Search help articles..."
              class="bg-surface-100 border-border-subtle text-text-primary placeholder:text-text-tertiary focus:ring-primary/30 focus:border-primary h-12 w-full rounded-xl border pl-12 pr-4 transition-all duration-200 focus:outline-none focus:ring-2"
            />
          </div>
        </div>

        <!-- Search Results -->
        @if (helpService.isSearching()) {
          <section class="mb-8">
            <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide">
              Search Results
            </h2>

            @if (helpService.filteredArticles().length === 0) {
              <div class="bg-surface-100 rounded-xl p-8 text-center">
                <nxt1-icon name="search" [size]="48" class="text-text-tertiary mx-auto mb-3" />
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
                    <nxt1-icon
                      name="chevronRight"
                      [size]="20"
                      class="text-text-tertiary group-hover:text-text-secondary shrink-0 transition-colors"
                    />
                  </button>
                }
              </div>
            }
          </section>
        } @else {
          <div class="help-layout">
            <nxt1-section-nav-web
              [items]="sectionNavItems()"
              [activeId]="activeSection()"
              ariaLabel="Help center sections"
              (selectionChange)="onSectionNavChange($event)"
            />

            <section
              class="help-section-content"
              [attr.id]="'section-' + activeSection()"
              role="tabpanel"
            >
              @switch (activeSection()) {
                @case ('categories') {
                  <section class="mb-8">
                    <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide">
                      Browse by Topic
                    </h2>
                    <div
                      class="bg-surface-100 divide-border-subtle divide-y overflow-hidden rounded-xl"
                    >
                      @for (category of helpService.categories(); track category.id) {
                        <button
                          type="button"
                          (click)="onCategoryClick(category.id)"
                          class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
                        >
                          <div
                            class="bg-surface-200 group-hover:bg-surface-300 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
                          >
                            <nxt1-icon
                              [name]="getCategoryIconName(category)"
                              [size]="20"
                              class="text-text-secondary"
                            />
                          </div>
                          <div class="min-w-0 flex-1">
                            <h3 class="text-text-primary text-base font-medium">
                              {{ category.label }}
                            </h3>
                            @if (category.description) {
                              <p class="text-text-secondary line-clamp-1 text-sm">
                                {{ category.description }}
                              </p>
                            }
                          </div>
                          <nxt1-icon
                            name="chevronRight"
                            [size]="20"
                            class="text-text-tertiary group-hover:text-text-secondary shrink-0 transition-colors"
                          />
                        </button>
                      }
                    </div>
                  </section>
                }

                @case ('popular') {
                  <section class="mb-8">
                    <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide">
                      Popular Questions
                    </h2>
                    <div
                      class="bg-surface-100 divide-border-subtle divide-y overflow-hidden rounded-xl"
                    >
                      @for (faq of helpService.popularFaqs(); track faq.id) {
                        <div>
                          <button
                            type="button"
                            (click)="toggleFaq(faq.id)"
                            class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
                          >
                            <div
                              class="bg-surface-200 group-hover:bg-surface-300 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
                            >
                              <nxt1-icon name="help" [size]="20" class="text-text-secondary" />
                            </div>
                            <div class="min-w-0 flex-1">
                              <h3 class="text-text-primary text-base font-medium">
                                {{ faq.question }}
                              </h3>
                            </div>
                            <nxt1-icon
                              [name]="expandedFaqId() === faq.id ? 'chevronDown' : 'chevronRight'"
                              [size]="20"
                              class="text-text-tertiary group-hover:text-text-secondary shrink-0 transition-transform"
                            />
                          </button>
                          @if (expandedFaqId() === faq.id) {
                            <div
                              class="text-text-secondary border-border-subtle pl-18 border-t px-4 py-3 text-sm"
                              [innerHTML]="faq.answer"
                            ></div>
                          }
                        </div>
                      }
                    </div>
                  </section>
                }

                @case ('support') {
                  <section class="mb-8">
                    <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide">
                      Need More Help?
                    </h2>
                    <div class="bg-surface-100 overflow-hidden rounded-xl">
                      <button
                        type="button"
                        (click)="onContactClick()"
                        class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
                      >
                        <div
                          class="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        >
                          <nxt1-icon name="chatBubble" [size]="20" class="text-primary" />
                        </div>
                        <div class="min-w-0 flex-1">
                          <h3 class="text-text-primary text-base font-medium">Contact Support</h3>
                          <p class="text-text-secondary text-sm">Get help from our team</p>
                        </div>
                        <nxt1-icon
                          name="chevronRight"
                          [size]="20"
                          class="text-text-tertiary group-hover:text-text-secondary shrink-0 transition-colors"
                        />
                      </button>
                    </div>
                  </section>
                }
              }
            </section>
          </div>
        }
      </div>
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

      .help-main {
        background: var(--nxt1-color-bg-primary);
        min-height: 100%;
      }

      .help-dashboard {
        padding: 0;
        padding-bottom: var(--nxt1-spacing-16);
      }

      .help-layout {
        display: grid;
        grid-template-columns: 180px 1fr;
        gap: var(--nxt1-spacing-6, 24px);
        align-items: start;
        padding-top: var(--nxt1-spacing-2, 8px);
      }

      .help-section-content {
        min-width: 0;
      }

      @media (max-width: 768px) {
        .help-dashboard {
          padding: var(--nxt1-spacing-4) var(--nxt1-spacing-3);
          padding-bottom: var(--nxt1-spacing-16);
        }

        .help-layout {
          grid-template-columns: 1fr;
          gap: var(--nxt1-spacing-4);
        }
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
  private readonly _activeSection = signal<'categories' | 'popular' | 'support'>('categories');

  readonly showBack = input(true);
  readonly back = output<void>();
  readonly navigate = output<HelpNavigateEvent>();

  protected readonly sectionNavItems = computed((): readonly SectionNavItem[] => {
    const items: SectionNavItem[] = [];

    items.push({ id: 'categories', label: 'Browse by Topic' });

    if (this.helpService.popularFaqs().length > 0) {
      items.push({ id: 'popular', label: 'Popular Questions' });
    }

    items.push({ id: 'support', label: 'Support' });

    return items;
  });

  protected readonly activeSection = computed(() => {
    const selected = this._activeSection();
    const items = this.sectionNavItems();
    return items.some((item) => item.id === selected) ? selected : (items[0]?.id ?? 'categories');
  });

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this._activeSection.set(event.id as 'categories' | 'popular' | 'support');
  }

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

  protected readonly expandedFaqId = signal<string | null>(null);

  protected toggleFaq(faqId: string): void {
    this.expandedFaqId.update((current) => (current === faqId ? null : faqId));
  }

  protected onContactClick(): void {
    this.navigate.emit({
      type: 'contact',
    });
  }

  /** Get design token icon name for category */
  protected getCategoryIconName(category: HelpCategory): string {
    const iconMap: Record<string, string> = {
      'rocket-outline': 'rocket',
      'fitness-outline': 'barbell',
      'clipboard-outline': 'clipboard',
      'people-outline': 'users',
      'shield-outline': 'shield',
      'school-outline': 'school',
      'person-outline': 'person',
      'videocam-outline': 'videocam',
      'diamond-outline': 'sparkles',
      'settings-outline': 'settings',
      'lock-closed-outline': 'lock',
      'construct-outline': 'settings',
    };
    return iconMap[category.icon] ?? 'documentText';
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
