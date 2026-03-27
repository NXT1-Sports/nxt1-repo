/**
 * @fileoverview News Article Card Component
 * @module @nxt1/ui/news
 * @version 2.0.0
 *
 * Professional news article card — clean, minimal layout used
 * across athlete profiles, team profiles, and the main news feed.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Hero image with 16:9 aspect ratio (lazy loading)
 * - 2-line clamped headline
 * - 3-line clamped excerpt
 * - Source pill (avatar + name + verified badge)
 * - Metadata bar: time ago, reading time
 * - Haptic feedback on tap
 * - SSR-safe, design-token CSS
 *
 * @example
 * ```html
 * <nxt1-news-article-card
 *   [article]="article"
 *   (articleClick)="onArticleClick($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { type NewsArticle } from '@nxt1/core';
import { NxtImageComponent } from '../components/image';
import { HapticsService } from '../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-news-article-card',
  standalone: true,
  imports: [NxtImageComponent],
  template: `
    <article
      class="news-card"
      (click)="handleCardClick($event)"
      role="article"
      [attr.aria-label]="ariaLabel()"
      tabindex="0"
    >
      <!-- Hero Image Section -->
      <div class="news-card__image-wrapper">
        <nxt1-image
          [src]="article().imageUrl || ''"
          [alt]="article().title"
          class="news-card__image"
          fit="cover"
        />
      </div>

      <!-- Content Section -->
      <div class="news-card__content">
        <!-- Headline -->
        <h3 class="news-card__title">{{ article().title }}</h3>

        <!-- Excerpt -->
        <p class="news-card__excerpt">{{ article().excerpt }}</p>

        <!-- Metadata Bar -->
        <div class="news-card__meta">
          <!-- Source Pill -->
          <div class="news-card__source-pill">
            @if (article().faviconUrl) {
              <img
                [src]="article().faviconUrl"
                [alt]="article().source"
                class="news-card__favicon"
                width="16"
                height="16"
              />
            }
            <span class="news-card__source-name">{{ article().source }}</span>
          </div>

          <!-- Time Ago -->
          <span class="news-card__time-ago">{{ timeAgo() }}</span>
        </div>
      </div>
    </article>
  `,
  styles: [
    `
      /* ============================================
         NEWS ARTICLE CARD - Professional Sports News Layout
         100% Theme Aware (Light + Dark Mode)
         ============================================ */

      :host {
        display: block;
      }

      /* Card Container */
      .news-card {
        position: relative;
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-radius-lg, 16px);
        overflow: hidden;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        cursor: pointer;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .news-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      }

      .news-card:active {
        transform: scale(0.98);
      }

      .news-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      /* ============================================
         IMAGE SECTION
         ============================================ */

      .news-card__image-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        overflow: hidden;
      }

      .news-card__image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      /* ============================================
         CONTENT SECTION
         ============================================ */

      .news-card__content {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
      }

      /* Title */
      .news-card__title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.3;
        color: var(--nxt1-color-text-primary, #fff);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Excerpt */
      .news-card__excerpt {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Metadata Bar */
      .news-card__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }

      .news-card__source-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px 4px 4px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-radius-full, 9999px);
        height: 28px;
      }

      .news-card__source-pill nxt1-avatar {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }

      .news-card__source-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
        white-space: nowrap;
        line-height: 1;
      }

      .news-card__favicon {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        object-fit: contain;
        flex-shrink: 0;
      }

      .news-card__time-ago {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 480px) {
        .news-card__content {
          padding: 12px;
        }

        .news-card__title {
          font-size: 15px;
        }

        .news-card__excerpt {
          font-size: 13px;
          -webkit-line-clamp: 2;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsArticleCardComponent {
  private readonly haptics = inject(HapticsService);

  /** Article data to display */
  readonly article = input.required<NewsArticle>();

  /** Emitted when card is clicked */
  readonly articleClick = output<NewsArticle>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  protected readonly timeAgo = computed(() => {
    const date = new Date(this.article().publishedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  protected readonly ariaLabel = computed(() => {
    const article = this.article();
    return `${article.title}. ${article.excerpt}. Published ${this.timeAgo()}. From ${article.source}.`;
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected async handleCardClick(_event: Event): Promise<void> {
    await this.haptics.impact('light');
    this.articleClick.emit(this.article());
  }
}
