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
import { resolveNewsFaviconUrl, type NewsArticle } from '@nxt1/core';
import { NxtImageComponent } from '../components/image';
import { HapticsService } from '../services/haptics/haptics.service';

@Component({
  selector: 'nxt1-news-article-detail',
  standalone: true,
  imports: [NxtImageComponent],
  template: `
    @if (article()) {
      <article class="article-detail">
        <div class="article-detail__frame">
          <section class="article-detail__intro">
            <h1 class="article-detail__title">{{ article()!.title }}</h1>

            <p class="article-detail__excerpt">{{ article()!.excerpt }}</p>

            <div class="article-detail__meta-row">
              <div class="article-detail__publisher">
                @if (faviconUrl()) {
                  <img
                    [src]="faviconUrl()"
                    [alt]="article()!.source"
                    class="article-detail__favicon"
                    width="22"
                    height="22"
                    loading="lazy"
                  />
                }
                <span class="article-detail__source-name">{{ article()!.source }}</span>
              </div>

              <div class="article-detail__published">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 512 512"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="32"
                  aria-hidden="true"
                >
                  <circle cx="256" cy="256" r="192" />
                  <path d="M256 128v144l96 64" />
                </svg>
                <span>{{ timeAgo() }}</span>
              </div>
            </div>
          </section>

          <div class="article-detail__hero">
            @if (article()!.imageUrl) {
              <nxt1-image
                [src]="article()!.imageUrl!"
                [alt]="article()!.title"
                class="article-detail__hero-image"
                fit="cover"
              />
            } @else {
              <div class="article-detail__hero-placeholder" aria-hidden="true">
                <span class="article-detail__hero-placeholder-wordmark">NXT1</span>
              </div>
            }
          </div>

          <div class="article-detail__content">
            <div class="article-detail__body" [innerHTML]="article()!.content"></div>

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
        padding: 0 var(--nxt1-spacing-5) var(--nxt1-spacing-14);
      }

      .article-detail__frame {
        width: min(100%, 1040px);
        margin: 0 auto;
      }

      .article-detail__intro {
        padding-top: var(--nxt1-spacing-2);
        width: min(100%, 780px);
        margin: 0 auto var(--nxt1-spacing-7);
      }

      /* ============================================
         HERO SECTION
         ============================================ */

      .article-detail__hero {
        position: relative;
        width: min(100%, 780px);
        margin: 0 auto;
        aspect-ratio: 21 / 9;
        min-height: 220px;
        max-height: clamp(220px, 34vh, 380px);
        overflow: hidden;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-borderRadius-2xl);
        box-shadow: var(--nxt1-shadow-2xl);
      }

      .article-detail__hero-placeholder {
        width: 100%;
        height: 100%;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.05));
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .article-detail__hero-placeholder-wordmark {
        font-family: var(--nxt1-fontFamily-system);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-widest);
        color: var(
          --nxt1-color-text-disabled,
          var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.15))
        );
        user-select: none;
      }

      .article-detail__hero-image {
        display: block;
        width: 100%;
        height: 100%;
      }

      .article-detail__hero-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center;
      }

      /* ============================================
         CONTENT SECTION
         ============================================ */

      .article-detail__content {
        padding: var(--nxt1-spacing-7) 0 0;
        max-width: 780px;
        margin: 0 auto;
      }

      /* Title */
      .article-detail__title {
        margin: 0 0 var(--nxt1-spacing-3_5);
        font-size: clamp(1.6rem, 3vw, 2.2rem);
        font-family: var(--nxt1-fontFamily-brand);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-tight);
        color: var(--nxt1-color-text-primary);
      }

      .article-detail__excerpt {
        margin: 0 0 var(--nxt1-spacing-5);
        font-size: clamp(0.95rem, 1.5vw, 1.1rem);
        line-height: var(--nxt1-lineHeight-normal);
        color: var(--nxt1-color-text-secondary);
      }

      /* Meta Info */
      .article-detail__meta-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-4_5, 18px);
      }

      .article-detail__publisher {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2_5);
      }

      .article-detail__favicon {
        width: 22px;
        height: 22px;
        border-radius: var(--nxt1-borderRadius-sm);
        object-fit: contain;
        flex-shrink: 0;
      }

      .article-detail__source-name {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .article-detail__published {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
      }

      /* Article Body */
      .article-detail__body {
        font-size: var(--nxt1-fontSize-md);
        line-height: var(--nxt1-lineHeight-relaxed);
        color: var(--nxt1-color-text-secondary);
      }

      .article-detail__body p {
        margin: 0 0 var(--nxt1-spacing-5);
      }

      .article-detail__body h2 {
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin: var(--nxt1-spacing-8) 0 var(--nxt1-spacing-4);
      }

      .article-detail__body ul,
      .article-detail__body ol {
        margin: 0 0 var(--nxt1-spacing-5);
        padding-left: var(--nxt1-spacing-6);
      }

      .article-detail__body li {
        margin-bottom: var(--nxt1-spacing-2);
      }

      .article-detail__body strong {
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      /* ============================================
         READ FULL STORY CTA
         ============================================ */

      .article-detail__cta {
        margin-top: var(--nxt1-spacing-10);
        padding-top: var(--nxt1-spacing-8);
        border-top: 1px solid var(--nxt1-color-border-subtle);
        text-align: center;
      }

      .article-detail__cta-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-7);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        text-decoration: none;
        border-radius: var(--nxt1-borderRadius-full);
        transition:
          opacity var(--nxt1-duration-fast) ease,
          transform var(--nxt1-duration-fast) ease;
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
        .article-detail {
          padding-inline: var(--nxt1-spacing-3_5);
        }

        .article-detail__hero {
          aspect-ratio: 16 / 9;
          min-height: 200px;
          max-height: 260px;
          border-radius: var(--nxt1-borderRadius-xl);
        }

        .article-detail__title {
          font-size: var(--nxt1-fontSize-xl);
        }

        .article-detail__excerpt {
          font-size: var(--nxt1-fontSize-sm);
        }

        .article-detail__body {
          font-size: var(--nxt1-fontSize-base);
        }

        .article-detail__content {
          padding-top: var(--nxt1-spacing-5_5, 22px);
        }
      }

      @media (min-width: 768px) {
        .article-detail__hero {
          max-height: 420px;
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

  protected readonly faviconUrl = computed(() => {
    const art = this.article();
    return art ? resolveNewsFaviconUrl(art) : undefined;
  });

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

  protected readonly timeAgo = computed(() => {
    const art = this.article();
    if (!art) return '';

    const date = new Date(art.publishedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Published just now';
    if (diffMins < 60) return `Published ${diffMins} minutes ago`;
    if (diffHours < 24) return `Published ${diffHours} hours ago`;
    if (diffDays < 7) return `Published ${diffDays} days ago`;

    return `Published ${this.formattedDate()}`;
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
