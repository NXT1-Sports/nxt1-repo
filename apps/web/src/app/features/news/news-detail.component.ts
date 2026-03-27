/**
 * @fileoverview News Detail Page - Web App
 * @module @nxt1/web/features/news
 *
 * Route-based detail page for /news/:id.
 * Loads a single article by Firestore document ID and renders the shared
 * NewsArticleDetailComponent from @nxt1/ui.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { NewsArticleDetailComponent, NewsService } from '@nxt1/ui/news';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { SeoService } from '../../core/services/seo.service';
import type { NewsArticle } from '@nxt1/core';

@Component({
  selector: 'app-news-detail',
  standalone: true,
  imports: [NewsArticleDetailComponent],
  template: `
    @if (isLoading()) {
      <div class="news-detail-loading">
        <div class="news-detail-loading__skeleton animate-pulse">
          <div class="news-detail-loading__hero"></div>
          <div class="news-detail-loading__title"></div>
          <div class="news-detail-loading__meta"></div>
          <div class="news-detail-loading__body"></div>
          <div class="news-detail-loading__body"></div>
          <div class="news-detail-loading__body short"></div>
        </div>
      </div>
    } @else if (error()) {
      <div class="news-detail-error">
        <div class="news-detail-error__content">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 512 512"
            fill="none"
            stroke="currentColor"
            stroke-width="32"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M256 80c-8.66 0-16.58 7.36-16 16l8 216a8 8 0 008 8h0a8 8 0 008-8l8-216c.58-8.64-7.34-16-16-16z"
              fill="currentColor"
            />
            <circle cx="256" cy="416" r="16" fill="currentColor" />
          </svg>
          <h2>Article not found</h2>
          <p>{{ error() }}</p>
          <button class="news-detail-error__btn" (click)="goBack()">Back to News</button>
        </div>
      </div>
    } @else if (article()) {
      <nxt1-news-article-detail
        [article]="article()"
        (back)="goBack()"
        (readFullStory)="onReadFullStory($event)"
      />
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .news-detail-loading {
        padding: 0;
      }
      .news-detail-loading__skeleton {
        max-width: 800px;
        margin: 0 auto;
      }
      .news-detail-loading__hero {
        width: 100%;
        aspect-ratio: 16/10;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border-radius: 0;
      }
      .news-detail-loading__title {
        height: 32px;
        width: 80%;
        margin: 24px 16px 12px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border-radius: 8px;
      }
      .news-detail-loading__meta {
        height: 16px;
        width: 40%;
        margin: 0 16px 24px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border-radius: 6px;
      }
      .news-detail-loading__body {
        height: 14px;
        width: 100%;
        margin: 8px 16px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border-radius: 6px;
      }
      .news-detail-loading__body.short {
        width: 60%;
      }

      .news-detail-error {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
        padding: 24px;
      }
      .news-detail-error__content {
        text-align: center;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
      }
      .news-detail-error__content svg {
        margin-bottom: 16px;
        opacity: 0.4;
      }
      .news-detail-error__content h2 {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0 0 8px;
      }
      .news-detail-error__content p {
        margin: 0 0 24px;
      }
      .news-detail-error__btn {
        padding: 10px 24px;
        border-radius: 12px;
        border: none;
        cursor: pointer;
        background: var(--nxt1-color-brand, #6c63ff);
        color: #fff;
        font-weight: 600;
        font-size: 0.875rem;
      }
      .news-detail-error__btn:hover {
        opacity: 0.9;
      }

      .animate-pulse {
        animation: pulse 1.5s ease-in-out infinite;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly newsService = inject(NewsService);
  private readonly logger = inject(NxtLoggingService).child('NewsDetailComponent');
  private readonly seo = inject(SeoService);

  protected readonly article = this.newsService.selectedArticle;
  protected readonly isLoading = this.newsService.isLoading;
  protected readonly error = this.newsService.error;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/news']);
      return;
    }

    // If already loaded (navigated from list), skip fetch
    const current = this.newsService.selectedArticle();
    if (current?.id === id) {
      this.updateSeo(current);
      return;
    }

    // Load from backend
    await this.newsService.loadArticleById(id);

    const loaded = this.newsService.selectedArticle();
    if (loaded) {
      this.updateSeo(loaded);
    }
  }

  protected goBack(): void {
    this.newsService.clearSelectedArticle();
    this.location.back();
  }

  protected onReadFullStory(sourceUrl: string): void {
    this.logger.info('Read full story clicked', { sourceUrl });
  }

  private updateSeo(article: NewsArticle): void {
    this.seo.updatePage({
      title: article.title,
      description:
        article.excerpt || `Read the latest on ${article.sport} news from ${article.source}`,
      canonicalUrl: `https://nxt1sports.com/news/${article.id}`,
      image: article.imageUrl || undefined,
    });
  }
}
