/**
 * @fileoverview Help Article Detail - Web (Tailwind SSR)
 * @module @nxt1/ui/help-center/web
 * @version 3.0.0
 *
 * Web-optimized article detail page using pure Tailwind CSS.
 * 100% SSR-safe with no hydration issues.
 *
 * ⭐ WEB ONLY - Pure Tailwind, SSR-optimized ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtIconComponent } from '../../components/icon';
import { HelpCenterService } from '../_shared/help-center.service';
import type { HelpArticle, HelpCategoryId } from '@nxt1/core';

@Component({
  selector: 'nxt1-help-article-detail-web',
  standalone: true,
  imports: [CommonModule, NxtDesktopPageHeaderComponent, NxtIconComponent],
  template: `
    @if (article()) {
      <!-- Main Content -->
      <main class="mx-auto max-w-3xl px-4 py-8 pb-24">
        <!-- Desktop Page Header -->
        <nxt1-desktop-page-header title="Article" />
        <!-- Article Header -->
        <header class="mb-8">
          <!-- Category Tag -->
          <span
            class="border-primary text-primary mb-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold"
          >
            {{ getCategoryLabel(article()!.category) }}
          </span>

          <!-- Title -->
          <h1 class="text-text-primary mb-4 text-2xl font-bold leading-tight md:text-3xl">
            {{ article()!.title }}
          </h1>

          <!-- Metadata -->
          <div class="text-text-secondary flex flex-wrap items-center gap-4 text-sm">
            <span class="flex items-center gap-1.5">
              <nxt1-icon name="time" [size]="16" />
              {{ article()!.readingTimeMinutes }} min read
            </span>
          </div>
        </header>

        <!-- Article Body -->
        <article
          class="prose prose-invert prose-primary mb-8 max-w-none"
          [innerHTML]="article()!.content"
        ></article>

        <!-- Feedback Section -->
        <div class="bg-surface-100 mb-8 rounded-xl p-6">
          <p class="text-text-primary mb-4 text-center font-medium">Was this helpful?</p>
          <div class="flex justify-center gap-3">
            <button
              type="button"
              class="feedback-btn"
              [class.feedback-btn--helpful]="feedbackState() === 'helpful'"
              (click)="onHelpful()"
            >
              <nxt1-icon name="thumbsUp" [size]="20" />
              Yes ({{ article()!.helpfulCount }})
            </button>
            <button
              type="button"
              class="feedback-btn"
              [class.feedback-btn--not-helpful]="feedbackState() === 'not-helpful'"
              (click)="onNotHelpful()"
            >
              <nxt1-icon name="thumbsDown" [size]="20" />
              No ({{ article()!.notHelpfulCount }})
            </button>
          </div>
        </div>

        <!-- Related Articles -->
        @if (relatedArticles().length > 0) {
          <section class="mb-8">
            <h2 class="text-text-secondary mb-3 px-1 text-xs font-semibold tracking-wide">
              Related Articles
            </h2>
            <div class="bg-surface-100 divide-border-subtle divide-y overflow-hidden rounded-xl">
              @for (related of relatedArticles(); track related.id) {
                <button
                  type="button"
                  (click)="onRelatedClick(related)"
                  class="hover:bg-surface-200 group flex w-full items-center gap-4 p-4 text-left transition-colors"
                >
                  <div
                    class="bg-surface-200 group-hover:bg-surface-300 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
                  >
                    <nxt1-icon name="documentText" [size]="20" class="text-text-secondary" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-text-primary truncate text-base font-medium">
                      {{ related.title }}
                    </h3>
                    <p class="text-text-secondary line-clamp-1 text-sm">{{ related.excerpt }}</p>
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

        <!-- Updated Date -->
        <footer class="text-text-tertiary text-center text-sm">
          Last updated {{ formatDate(article()!.updatedAt) }}
        </footer>
      </main>
    } @else {
      <!-- Not Found -->
      <main class="mx-auto max-w-3xl px-4 py-16 text-center">
        <nxt1-icon name="documentText" [size]="80" class="text-text-tertiary mx-auto mb-6" />
        <h2 class="text-text-primary mb-2 text-xl font-semibold">Article not found</h2>
        <p class="text-text-secondary mb-6">
          The article you're looking for doesn't exist or has been removed.
        </p>
        <button
          type="button"
          (click)="back.emit()"
          class="border-border-strong text-text-primary hover:bg-surface-200 inline-flex items-center gap-2 rounded-lg border px-6 py-3 font-medium transition-colors"
        >
          <nxt1-icon name="chevronLeft" [size]="20" />
          Go Back
        </button>
      </main>
    }
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

      /* ============================================
       PROSE STYLING (100% Theme-Aware)
       All colors from design tokens
       ============================================ */
      .prose {
        color: var(--nxt1-color-text-secondary);
        line-height: 1.75;
      }

      .prose :where(h1, h2, h3, h4, h5, h6) {
        color: var(--nxt1-color-text-primary);
        font-weight: 600;
        margin-top: 1.5em;
        margin-bottom: 0.75em;
      }

      .prose h2 {
        font-size: 1.5rem;
      }

      .prose h3 {
        font-size: 1.25rem;
      }

      .prose p {
        margin-bottom: 1.25em;
      }

      .prose a {
        color: var(--nxt1-color-primary);
        text-decoration: underline;
        text-decoration-color: transparent;
        transition: text-decoration-color var(--nxt1-duration-fast);
      }

      .prose a:hover {
        text-decoration-color: var(--nxt1-color-primary);
      }

      .prose :where(ul, ol) {
        padding-left: 1.5em;
        margin-bottom: 1.25em;
      }

      .prose ul {
        list-style-type: disc;
      }

      .prose ul ::marker {
        color: var(--nxt1-color-text-tertiary);
      }

      .prose ol {
        list-style-type: decimal;
      }

      .prose ol ::marker {
        color: var(--nxt1-color-text-tertiary);
      }

      .prose li {
        margin-bottom: 0.5em;
      }

      .prose code {
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        padding: 0.125em 0.375em;
        border-radius: var(--nxt1-radius-sm);
        font-size: 0.875em;
        font-family: var(--nxt1-fontFamily-mono);
      }

      .prose pre {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        padding: 1em;
        border-radius: var(--nxt1-radius-default);
        overflow-x: auto;
        margin-bottom: 1.25em;
      }

      .prose pre code {
        background: transparent;
        padding: 0;
      }

      .prose blockquote {
        border-left: 4px solid var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary5);
        padding: 1em 1em 1em 1.5em;
        margin-left: 0;
        margin-right: 0;
        border-radius: 0 var(--nxt1-radius-default) var(--nxt1-radius-default) 0;
        font-style: italic;
        color: var(--nxt1-color-text-secondary);
      }

      .prose hr {
        border: none;
        border-top: 1px solid var(--nxt1-color-border-subtle);
        margin: 2em 0;
      }

      .prose strong {
        color: var(--nxt1-color-text-primary);
        font-weight: 600;
      }

      .prose img {
        border-radius: var(--nxt1-radius-default);
        max-width: 100%;
      }

      .prose table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 1.25em;
      }

      .prose th,
      .prose td {
        border: 1px solid var(--nxt1-color-border-subtle);
        padding: 0.75em 1em;
        text-align: left;
      }

      .prose th {
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-weight: 600;
      }

      .prose td {
        background: var(--nxt1-color-bg-primary);
      }

      /* Feedback Buttons - 100% design token colors */
      .feedback-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: var(--nxt1-radius-default, 8px);
        border: 1.5px solid var(--nxt1-color-border-strong);
        background: transparent;
        color: var(--nxt1-color-text-primary);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 100ms) ease;
      }

      .feedback-btn:hover {
        background: var(--nxt1-color-surface-200);
      }

      .feedback-btn--helpful {
        border-color: var(--nxt1-color-success, #22c55e);
        background: color-mix(in srgb, var(--nxt1-color-success, #22c55e) 12%, transparent);
        color: var(--nxt1-color-success, #22c55e);
      }

      .feedback-btn--not-helpful {
        border-color: var(--nxt1-color-error, #ef4444);
        background: color-mix(in srgb, var(--nxt1-color-error, #ef4444) 12%, transparent);
        color: var(--nxt1-color-error, #ef4444);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpArticleDetailWebComponent {
  private readonly helpService = inject(HelpCenterService);

  /** Article slug to display */
  readonly slug = input.required<string>();

  /** Back button event */
  readonly back = output<void>();

  /** Related article navigation */
  readonly relatedClick = output<{ id: string; slug: string }>();

  /** User feedback state */
  readonly feedbackState = signal<'none' | 'helpful' | 'not-helpful'>('none');

  /** Article data */
  readonly article = computed(() => this.helpService.getArticleBySlug(this.slug()));

  /** Related articles (same category, excluding current) */
  readonly relatedArticles = computed(() => {
    const current = this.article();
    if (!current) return [];
    return this.helpService
      .getArticlesByCategory(current.category)
      .filter((a) => a.id !== current.id)
      .slice(0, 3);
  });

  /** Get category label */
  protected getCategoryLabel(categoryId: HelpCategoryId): string {
    return this.helpService.getCategoryById(categoryId)?.label ?? categoryId;
  }

  /** Format number with K suffix */
  protected formatNumber(num: number): string {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  /** Format date to readable string */
  protected formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  protected onHelpful(): void {
    this.feedbackState.set('helpful');
  }

  protected onNotHelpful(): void {
    this.feedbackState.set('not-helpful');
  }

  protected onRelatedClick(article: HelpArticle): void {
    this.relatedClick.emit({ id: article.id, slug: article.slug });
  }
}
