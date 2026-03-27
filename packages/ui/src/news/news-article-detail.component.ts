/**
 * @fileoverview News Article Detail Component
 * @module @nxt1/ui/news
 * @version 2.0.0
 *
 * Full-screen article reading experience with AI summary + "Read Full Story" CTA.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Full-width hero image with gradient overlay
 * - Floating back button and share action
 * - Real publisher attribution (favicon + name)
 * - Rich text AI-generated summary
 * - "Read Full Story" CTA linking to original source
 *
 * @example
 * ```html
 * <nxt1-news-article-detail
 *   [article]="selectedArticle()"
 *   (back)="onBack()"
 *   (share)="onShare()"
 *   (readFullStory)="onReadFullStory($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { type NewsArticle } from '@nxt1/core';
import { NxtImageComponent } from '../components/image';
import { HapticsService } from '../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-news-article-detail',
  standalone: true,
  imports: [NxtImageComponent],
  template: `
    @if (article()) {
      <article class="article-detail">
        <!-- Hero Section -->
        <div class="article-detail__hero">
          @if (article()!.imageUrl) {
            <nxt1-image
              [src]="article()!.imageUrl!"
              [alt]="article()!.title"
              class="article-detail__hero-image"
              fit="cover"
            />
          }

          <!-- Gradient Overlay -->
          <div class="article-detail__hero-overlay"></div>

          <!-- Floating Back Button -->
          <button
            type="button"
            class="article-detail__back-btn"
            data-testid="news-article-detail-back"
            (click)="onBackClick()"
            aria-label="Go back"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 512 512"
              fill="currentColor"
            >
              <path
                d="M328 112L184 256l144 144"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="48"
              />
            </svg>
          </button>

          <!-- Share Button -->
          <div class="article-detail__hero-actions">
            <button
              type="button"
              class="article-detail__action-btn"
              data-testid="news-article-detail-share"
              (click)="onShareClick()"
              aria-label="Share article"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 512 512"
                fill="currentColor"
              >
                <path
                  d="M336 192h40a40 40 0 0140 40v192a40 40 0 01-40 40H136a40 40 0 01-40-40V232a40 40 0 0140-40h40M336 128l-80-80-80 80M256 321V48"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="32"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Content Section -->
        <div class="article-detail__content">
          <!-- Title -->
          <h1 class="article-detail__title">{{ article()!.title }}</h1>

          <!-- Source + Date -->
          <div class="article-detail__meta">
            <div class="article-detail__source">
              @if (article()!.faviconUrl) {
                <img
                  [src]="article()!.faviconUrl"
                  [alt]="article()!.source"
                  class="article-detail__favicon"
                  width="24"
                  height="24"
                  loading="lazy"
                />
              }
              <div class="article-detail__source-info">
                <span class="article-detail__source-name">{{ article()!.source }}</span>
                <span class="article-detail__date">{{ formattedDate() }}</span>
              </div>
            </div>
          </div>

          <!-- Article Body (AI Summary) -->
          <div class="article-detail__body" [innerHTML]="article()!.content"></div>

          <!-- Read Full Story CTA -->
          <div class="article-detail__cta">
            <a
              [href]="article()!.sourceUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="article-detail__cta-btn"
              data-testid="news-article-detail-read-full"
              (click)="onReadFullStoryClick()"
            >
              Read Full Story on {{ article()!.source }}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 512 512"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="40"
              >
                <path
                  d="M384 224v184a40 40 0 01-40 40H104a40 40 0 01-40-40V168a40 40 0 0140-40h167"
                />
                <path d="M336 64h112v112" />
                <path d="M224 288L440 72" />
              </svg>
            </a>
          </div>
        </div>
      </article>
    }
  `,
  styles: [
    `
      /* ============================================
         NEWS ARTICLE DETAIL - AI Summary + CTA
         ============================================ */

      :host {
        display: block;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
        min-height: 100vh;
      }

      .article-detail {
        position: relative;
      }

      /* ============================================
         HERO SECTION
         ============================================ */

      .article-detail__hero {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 10;
        overflow: hidden;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      .article-detail__hero-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .article-detail__hero-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 60%;
        background: linear-gradient(
          to top,
          var(--nxt1-color-bg-primary, #0a0a0a) 0%,
          transparent 100%
        );
      }

      /* Back Button */
      .article-detail__back-btn {
        position: absolute;
        top: calc(env(safe-area-inset-top, 0px) + 12px);
        left: 12px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: white;
        cursor: pointer;
        z-index: 10;
        transition: background-color 0.15s ease;
      }

      .article-detail__back-btn:hover {
        background: rgba(0, 0, 0, 0.7);
      }

      /* Hero Actions */
      .article-detail__hero-actions {
        position: absolute;
        top: calc(env(safe-area-inset-top, 0px) + 12px);
        right: 12px;
        display: flex;
        gap: 8px;
        z-index: 10;
      }

      .article-detail__action-btn {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: white;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .article-detail__action-btn:hover {
        background: rgba(0, 0, 0, 0.7);
      }

      /* ============================================
         CONTENT SECTION
         ============================================ */

      .article-detail__content {
        padding: 24px 20px 48px;
        max-width: 680px;
        margin: 0 auto;
      }

      /* Title */
      .article-detail__title {
        margin: 0 0 20px;
        font-size: 28px;
        font-weight: 800;
        line-height: 1.2;
        color: var(--nxt1-color-text-primary, #fff);
      }

      /* Meta Info */
      .article-detail__meta {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 24px;
        padding-bottom: 24px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .article-detail__source {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .article-detail__favicon {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        object-fit: contain;
        flex-shrink: 0;
      }

      .article-detail__source-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .article-detail__source-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .article-detail__date {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* Article Body */
      .article-detail__body {
        font-size: 17px;
        line-height: 1.75;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.85));
      }

      .article-detail__body p {
        margin: 0 0 20px;
      }

      .article-detail__body h2 {
        font-size: 22px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 32px 0 16px;
      }

      .article-detail__body ul,
      .article-detail__body ol {
        margin: 0 0 20px;
        padding-left: 24px;
      }

      .article-detail__body li {
        margin-bottom: 8px;
      }

      .article-detail__body strong {
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
      }

      /* ============================================
         READ FULL STORY CTA
         ============================================ */

      .article-detail__cta {
        margin-top: 40px;
        padding-top: 32px;
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        text-align: center;
      }

      .article-detail__cta-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 14px 28px;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #000);
        font-size: 15px;
        font-weight: 700;
        text-decoration: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        transition:
          opacity 0.15s ease,
          transform 0.15s ease;
      }

      .article-detail__cta-btn:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }

      .article-detail__cta-btn:active {
        transform: translateY(0);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 480px) {
        .article-detail__title {
          font-size: 24px;
        }

        .article-detail__body {
          font-size: 16px;
        }

        .article-detail__content {
          padding: 20px 16px 40px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsArticleDetailComponent {
  private readonly haptics = inject(HapticsService);

  /** Article to display */
  readonly article = input<NewsArticle | null>(null);

  /** Emitted when back button is clicked */
  readonly back = output<void>();

  /** Emitted when share is clicked */
  readonly share = output<void>();

  /** Emitted when "Read Full Story" is clicked */
  readonly readFullStory = output<string>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  protected readonly formattedDate = computed(() => {
    const art = this.article();
    if (!art) return '';
    const date = new Date(art.publishedAt);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  async onBackClick(): Promise<void> {
    await this.haptics.impact('light');
    this.back.emit();
  }

  async onShareClick(): Promise<void> {
    await this.haptics.impact('light');
    this.share.emit();
  }

  onReadFullStoryClick(): void {
    const art = this.article();
    if (art) {
      this.readFullStory.emit(art.sourceUrl);
    }
  }
}
