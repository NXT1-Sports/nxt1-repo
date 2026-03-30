/**
 * @fileoverview News Detail Page - Web App
 * @module @nxt1/web/features/news
 *
 * Route-based detail page for /news/:id.
 * Loads a single article by Firestore document ID and renders the shared
 * NewsArticleDetailComponent from @nxt1/ui.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  computed,
  AfterViewInit,
  OnDestroy,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { NewsArticleDetailComponent, NewsService } from '@nxt1/ui/news';
import { NxtHeaderPortalService } from '@nxt1/ui/services/header-portal';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtStateViewComponent } from '@nxt1/ui/components/state-view';
import { SeoService } from '../../core/services/seo.service';
import type { NewsArticle } from '@nxt1/core';

@Component({
  selector: 'app-news-detail',
  standalone: true,
  imports: [NewsArticleDetailComponent, NxtStateViewComponent],
  template: `
    <!-- Portal: Article detail view (Back to Discover) -->
    <ng-template #portalContent>
      <div class="header-portal-explore">
        <button type="button" class="header-portal-back-btn" (click)="goBack()">
          <svg
            width="18"
            height="18"
            viewBox="0 0 512 512"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="48"
            aria-hidden="true"
          >
            <path d="M328 112L184 256l144 144" />
          </svg>
          <span>Back to Discover</span>
        </button>
      </div>
    </ng-template>

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
      <nxt1-state-view
        variant="not-found"
        title="Article not found"
        [message]="error()"
        actionLabel="Go Back"
        (action)="goBack()"
      />
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

      /* HEADER PORTAL CSS */
      .header-portal-explore {
        display: flex;
        align-items: center;
        width: 100%;
        padding: 0 var(--nxt1-spacing-2, 8px);
        position: relative;
      }

      .header-portal-back-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }

      .header-portal-back-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-color: rgba(255, 255, 255, 0.14);
      }

      .header-portal-back-btn:active {
        transform: scale(0.98);
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

      nxt1-state-view {
        min-height: 60vh;
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
export class NewsDetailComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly newsService = inject(NewsService);
  private readonly logger = inject(NxtLoggingService).child('NewsDetailComponent');
  private readonly seo = inject(SeoService);
  private readonly headerPortal = inject(NxtHeaderPortalService);

  private readonly portalContent = viewChild<TemplateRef<unknown>>('portalContent');

  protected readonly article = this.newsService.selectedArticle;
  protected readonly isLoading = this.newsService.isLoading;
  protected readonly error = this.newsService.error;

  ngAfterViewInit(): void {
    const tpl = this.portalContent();
    if (tpl) {
      this.headerPortal.setCenterContent(tpl);
    }
  }

  ngOnDestroy(): void {
    this.headerPortal.clearCenterContent();
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/pulse']);
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
      canonicalUrl: `https://nxt1sports.com/explore/pulse/${article.id}`,
      image: article.imageUrl || undefined,
    });
  }
}
