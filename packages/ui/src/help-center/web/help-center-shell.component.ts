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
  viewChild,
  AfterViewInit,
  OnDestroy,
  type TemplateRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NxtHeaderPortalService } from '../../services/header-portal';
import { NxtSectionNavWebComponent } from '../../components/section-nav-web';
import type { SectionNavItem, SectionNavChangeEvent } from '../../components/section-nav-web';
import { NxtPlatformService } from '../../services/platform';
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
  imports: [CommonModule, FormsModule, NxtSectionNavWebComponent, NxtIconComponent],
  template: `
    <!-- Portal: center — "Help Center" title + search bar in top nav -->
    <ng-template #centerPortalContent>
      <div class="header-portal-help">
        <span class="header-portal-title">Help Center</span>
        <div class="header-portal-search">
          <nxt1-icon name="search" [size]="16" class="header-portal-search-icon" />
          <input
            type="search"
            [ngModel]="helpService.searchQuery()"
            (ngModelChange)="onSearch($event)"
            placeholder="Search help articles..."
            class="header-portal-search-input"
          />
        </div>
      </div>
    </ng-template>

    <!-- Main Content -->
    <main class="help-main">
      <div class="help-dashboard">
        <!-- Mobile-only inline search bar (hidden on desktop where header portal shows it) -->
        <div class="help-mobile-search-bar">
          <div class="help-mobile-search-inner">
            <nxt1-icon name="search" [size]="16" class="help-mobile-search-icon" />
            <input
              type="search"
              [value]="helpService.searchQuery()"
              (input)="onSearch($any($event.target).value)"
              placeholder="Search help articles..."
              class="help-mobile-search-input"
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
          <div class="help-layout nxt1-section-layout">
            <nxt1-section-nav-web
              [items]="sectionNavItems()"
              [activeId]="activeSection()"
              ariaLabel="Help center sections"
              (selectionChange)="onSectionNavChange($event)"
            />

            <section class="help-section-content nxt1-section-content" role="region">
              @if (showAllSections() || activeSection() === 'categories') {
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

              @if (
                (showAllSections() || activeSection() === 'popular') &&
                helpService.popularFaqs().length > 0
              ) {
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

              @if (showAllSections() || activeSection() === 'support') {
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

      /* Header portal styles */
      .header-portal-help {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 0 var(--nxt1-spacing-2, 8px);
        position: relative;
      }

      .header-portal-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        letter-spacing: -0.01em;
        white-space: nowrap;
        user-select: none;
        position: absolute;
        left: var(--nxt1-spacing-2, 8px);
      }

      .header-portal-search {
        position: relative;
        width: 100%;
        max-width: 320px;
      }

      .header-portal-search-icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--nxt1-color-text-tertiary);
        pointer-events: none;
      }

      .header-portal-search-input {
        width: 100%;
        height: 32px;
        padding: 0 10px 0 32px;
        border-radius: 8px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-primary);
        font-size: 13px;
        outline: none;
        transition:
          border-color 150ms ease,
          box-shadow 150ms ease;
      }

      .header-portal-search-input::placeholder {
        color: var(--nxt1-color-text-tertiary);
      }

      .header-portal-search-input:focus {
        border-color: var(--nxt1-color-primary);
        box-shadow: 0 0 0 2px rgba(var(--nxt1-color-primary-rgb, 59, 130, 246), 0.15);
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

      /* Mobile inline search bar — shown only on mobile, hidden on desktop */
      .help-mobile-search-bar {
        display: none;
      }

      @media (max-width: 768px) {
        .help-main {
          padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
        }

        .help-dashboard {
          padding: 0 var(--nxt1-spacing-4, 16px);
          padding-bottom: var(--nxt1-spacing-16);
        }

        .help-layout {
          display: block;
        }

        nxt1-section-nav-web {
          display: none;
        }

        .header-portal-search {
          display: none;
        }

        .header-portal-help {
          justify-content: flex-start;
        }

        .header-portal-title {
          position: static;
        }

        /* Show inline search bar on mobile */
        .help-mobile-search-bar {
          display: block;
          padding: var(--nxt1-spacing-3, 12px) 0 var(--nxt1-spacing-4, 16px);
        }

        .help-mobile-search-inner {
          position: relative;
          display: flex;
          align-items: center;
        }

        .help-mobile-search-icon {
          position: absolute;
          left: 12px;
          color: var(--nxt1-color-text-tertiary);
          pointer-events: none;
        }

        .help-mobile-search-input {
          width: 100%;
          height: 40px;
          padding: 0 12px 0 36px;
          border-radius: 10px;
          border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
          background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.06));
          color: var(--nxt1-color-text-primary);
          font-size: 14px;
          outline: none;
          -webkit-appearance: none;
          appearance: none;
          transition:
            border-color 150ms ease,
            box-shadow 150ms ease;
        }

        .help-mobile-search-input::placeholder {
          color: var(--nxt1-color-text-tertiary);
        }

        .help-mobile-search-input:focus {
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 0 2px rgba(var(--nxt1-color-primary-rgb, 59, 130, 246), 0.15);
        }

        /* Hide the native search clear button on webkit */
        .help-mobile-search-input::-webkit-search-cancel-button {
          -webkit-appearance: none;
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
export class HelpCenterShellWebComponent implements AfterViewInit, OnDestroy {
  protected readonly helpService = inject(HelpCenterService);
  private readonly headerPortal = inject(NxtHeaderPortalService);
  private readonly platform = inject(NxtPlatformService);
  private readonly _activeSection = signal<'categories' | 'popular' | 'support'>('categories');

  // Template ref for header portal
  private readonly centerPortalContent = viewChild<TemplateRef<unknown>>('centerPortalContent');

  readonly showBack = input(true);
  readonly back = output<void>();
  readonly navigate = output<HelpNavigateEvent>();

  /** On mobile web, show all sections stacked (no section nav). Desktop uses @switch. */
  protected readonly showAllSections = computed(() => this.platform.isMobile());

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

  ngAfterViewInit(): void {
    const centerTpl = this.centerPortalContent();
    if (centerTpl) this.headerPortal.setCenterContent(centerTpl);
  }

  ngOnDestroy(): void {
    this.headerPortal.clearAll();
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
