/**
 * @fileoverview Help Article Detail - Full Article View
 * @module @nxt1/ui/help-center
 * @version 2.0.0
 *
 * Full article display with content, metadata, and related articles.
 * Clean native iOS/Android design.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
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
import {
  IonContent,
  IonList,
  IonListHeader,
  IonLabel,
  IonItem,
  IonChip,
} from '@ionic/angular/standalone';
import { NxtPageHeaderComponent } from '../components/page-header';
import { NxtIconComponent } from '../components/icon';
import { NxtStateViewComponent } from '../components/state-view';
import { HelpCenterService } from './help-center.service';
import { HapticsService } from '../services/haptics/haptics.service';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import type { HelpArticle, HelpCategoryId } from '@nxt1/core';

@Component({
  selector: 'nxt1-help-article-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonList,
    IonListHeader,
    IonLabel,
    IonItem,
    IonChip,
    NxtPageHeaderComponent,
    NxtIconComponent,
    NxtStateViewComponent,
  ],
  template: `
    <nxt1-page-header title="Article" [showBack]="true" (backClick)="back.emit()" />

    <ion-content class="article-content">
      @if (article()) {
        <div class="article-container">
          <!-- Article Header -->
          <header class="article-header">
            <!-- Category chip -->
            <ion-chip class="article-category" [outline]="true">
              {{ getCategoryLabel(article()!.category) }}
            </ion-chip>

            <!-- Title -->
            <h1 class="article-title">{{ article()!.title }}</h1>

            <!-- Metadata -->
            <div class="article-meta">
              <span class="article-meta__item">
                <nxt1-icon name="time" [size]="16" />
                {{ article()!.readingTimeMinutes }} min read
              </span>
            </div>
          </header>

          <!-- Article Content -->
          <article class="article-body" [innerHTML]="renderedContent()"></article>

          <!-- Feedback Section -->
          <div class="article-feedback">
            <p class="article-feedback__title">Was this helpful?</p>
            <div class="article-feedback__buttons">
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
            <ion-list class="article-related" lines="full">
              <ion-list-header>
                <ion-label>Related Articles</ion-label>
              </ion-list-header>

              @for (related of relatedArticles(); track related.id) {
                <ion-item class="related-item" button detail (click)="onRelatedClick(related)">
                  <nxt1-icon
                    [name]="getTypeIcon(related.type)"
                    [size]="22"
                    slot="start"
                    class="related-item__icon"
                  />
                  <ion-label>
                    <h3>{{ related.title }}</h3>
                    <p>{{ related.excerpt }}</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          }

          <!-- Updated date -->
          <div class="article-updated">Last updated {{ formatDate(article()!.updatedAt) }}</div>
        </div>
      } @else {
        <!-- Not Found -->
        <nxt1-state-view
          variant="not-found"
          title="Article not found"
          message="The article you're looking for doesn't exist or has been removed."
          actionLabel="Go Back"
          (action)="back.emit()"
          style="min-height: 60vh"
        />
      }
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .article-content {
        --background: var(--nxt1-color-bg-primary, var(--ion-background-color));
      }

      .article-container {
        padding: var(--nxt1-spacing-md, 16px);
        padding-bottom: calc(160px + env(safe-area-inset-bottom, 0));
        max-width: 720px;
        margin: 0 auto;
      }

      /* Header */
      .article-header {
        margin-bottom: var(--nxt1-spacing-lg, 24px);
      }

      .article-category {
        --background: transparent;
        --color: var(--nxt1-color-primary, #c8ff00);
        --border-color: var(--nxt1-color-primary, #c8ff00);
        font-size: var(--nxt1-font-size-xs, 12px);
        font-weight: 600;
        height: 26px;
        margin: 0 0 var(--nxt1-spacing-sm, 12px);
      }

      .article-title {
        margin: 0 0 var(--nxt1-spacing-sm, 12px);
        font-size: var(--nxt1-font-size-xxl, 24px);
        font-weight: 700;
        line-height: 1.3;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .article-meta {
        display: flex;
        gap: var(--nxt1-spacing-md, 16px);
      }

      .article-meta__item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-xxs, 4px);
        font-size: var(--nxt1-font-size-sm, 14px);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .article-meta__item nxt1-icon {
        font-size: 16px;
      }

      /* Body */
      .article-body {
        font-size: var(--nxt1-font-size-md, 16px);
        line-height: 1.7;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.8));
      }

      .article-body :first-child {
        margin-top: 0;
      }

      .article-body p {
        margin: 0 0 var(--nxt1-spacing-md, 16px);
      }

      .article-body h2,
      .article-body h3 {
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: var(--nxt1-spacing-lg, 24px) 0 var(--nxt1-spacing-sm, 12px);
      }

      .article-body ul,
      .article-body ol {
        padding-left: var(--nxt1-spacing-lg, 24px);
        margin: 0 0 var(--nxt1-spacing-md, 16px);
      }

      .article-body li {
        margin-bottom: var(--nxt1-spacing-xs, 8px);
      }

      .article-body a {
        color: var(--nxt1-color-primary, #c8ff00);
        text-decoration: none;
      }

      .article-body code {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.1));
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.9em;
      }

      /* Feedback */
      .article-feedback {
        margin: var(--nxt1-spacing-xl, 32px) 0;
        padding: var(--nxt1-spacing-md, 16px);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border-radius: var(--nxt1-radius-lg, 12px);
        text-align: center;
      }

      .article-feedback__title {
        margin: 0 0 var(--nxt1-spacing-sm, 12px);
        font-size: var(--nxt1-font-size-md, 16px);
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .article-feedback__buttons {
        display: flex;
        justify-content: center;
        gap: var(--nxt1-spacing-sm, 12px);
      }

      .feedback-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-xs, 8px);
        padding: var(--nxt1-spacing-xs, 8px) var(--nxt1-spacing-md, 16px);
        border-radius: var(--nxt1-radius-md, 8px);
        border: 1.5px solid var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        background: transparent;
        color: var(--nxt1-color-text-primary, #ffffff);
        font-family: inherit;
        font-size: var(--nxt1-font-size-sm, 14px);
        font-weight: 500;
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 100ms) var(--nxt1-ease-in-out);
      }

      .feedback-btn:active {
        opacity: 0.8;
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

      /* Related */
      .article-related {
        background: transparent;
        margin-top: var(--nxt1-spacing-lg, 24px);
      }

      ion-list-header {
        padding-left: 0;
        padding-right: 0;
        margin-bottom: var(--nxt1-spacing-xs, 4px);
      }

      ion-list-header ion-label {
        font-size: var(--nxt1-font-size-xs, 13px);
        font-weight: 600;
        letter-spacing: 0.5px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
      }

      .related-item {
        --background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --background-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        --padding-start: var(--nxt1-spacing-md, 16px);
        --padding-end: var(--nxt1-spacing-md, 16px);
        --min-height: 64px;
        --border-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        margin-bottom: 1px;
      }

      .related-item:first-of-type {
        border-radius: var(--nxt1-radius-lg, 12px) var(--nxt1-radius-lg, 12px) 0 0;
      }

      .related-item:last-of-type {
        border-radius: 0 0 var(--nxt1-radius-lg, 12px) var(--nxt1-radius-lg, 12px);
        --border-width: 0;
      }

      .related-item:only-of-type {
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .related-item ion-label h3 {
        font-size: var(--nxt1-font-size-md, 15px);
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin-bottom: 2px;
      }

      .related-item ion-label p {
        font-size: var(--nxt1-font-size-sm, 14px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .related-item__icon {
        font-size: 20px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.5));
        margin-right: var(--nxt1-spacing-sm, 12px);
      }

      /* Updated */
      .article-updated {
        margin-top: var(--nxt1-spacing-xl, 32px);
        padding-top: var(--nxt1-spacing-md, 16px);
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        font-size: var(--nxt1-font-size-sm, 13px);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        text-align: center;
      }

      /* Light Mode */
      :host-context(.light),
      :host-context([data-theme='light']) {
        .article-title {
          color: var(--nxt1-color-text-primary, #000000);
        }

        .article-meta__item {
          color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
        }

        .article-body {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.8));
        }

        .article-body h2,
        .article-body h3 {
          color: var(--nxt1-color-text-primary, #000000);
        }

        .article-body code {
          background: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.06));
        }

        .article-feedback {
          background: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.02));
        }

        .article-feedback__title {
          color: var(--nxt1-color-text-primary, #000000);
        }

        ion-list-header ion-label {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.6));
        }

        .related-item {
          --background: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.02));
          --background-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.04));
          --border-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.06));
        }

        .related-item ion-label h3 {
          color: var(--nxt1-color-text-primary, #000000);
        }

        .related-item ion-label p {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.6));
        }

        .related-item__icon {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.5));
        }

        .article-updated {
          border-top-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.06));
          color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.4));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpArticleDetailComponent {
  protected readonly helpService = inject(HelpCenterService);
  private readonly haptics = inject(HapticsService);
  private readonly sanitizer = inject(DomSanitizer);

  /** Article ID or slug */
  readonly articleId = input.required<string>();

  /** Emits when back button clicked */
  readonly back = output<void>();

  /** Emits when related article is selected */
  readonly articleSelect = output<{ id: string; slug: string }>();

  /** Emits feedback events */
  readonly feedback = output<{ articleId: string; helpful: boolean }>();

  /** Current article */
  protected readonly article = computed(() => {
    const id = this.articleId();
    return this.helpService.getArticleById(id) ?? this.helpService.getArticleBySlug(id);
  });

  /** Markdown parsed to sanitized HTML */
  protected readonly renderedContent = computed((): SafeHtml => {
    const content = this.article()?.content ?? '';
    const html = marked.parse(content, { async: false }) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  /** Related articles (same category, excluding current) */
  protected readonly relatedArticles = computed(() => {
    const current = this.article();
    if (!current) return [];
    return this.helpService
      .getArticlesByCategory(current.category)
      .filter((a) => a.id !== current.id)
      .slice(0, 3);
  });

  protected getCategoryLabel(categoryId: HelpCategoryId): string {
    return this.helpService.getCategoryById(categoryId)?.label ?? categoryId;
  }

  protected formatNumber(num: number): string {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  }

  protected formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  protected readonly feedbackState = signal<'none' | 'helpful' | 'not-helpful'>('none');

  protected async onHelpful(): Promise<void> {
    this.feedbackState.set('helpful');
    await this.haptics.notification('success');
    const current = this.article();
    if (current) {
      this.feedback.emit({ articleId: current.id, helpful: true });
    }
  }

  protected async onNotHelpful(): Promise<void> {
    this.feedbackState.set('not-helpful');
    await this.haptics.impact('light');
    const current = this.article();
    if (current) {
      this.feedback.emit({ articleId: current.id, helpful: false });
    }
  }

  protected async onRelatedClick(article: HelpArticle): Promise<void> {
    await this.haptics.impact('light');
    this.articleSelect.emit({ id: article.id, slug: article.slug });
  }

  protected getTypeIcon(type: string): string {
    switch (type) {
      case 'video':
        return 'videocam';
      case 'guide':
        return 'newspaper';
      case 'tutorial':
        return 'graduationCap';
      case 'faq':
        return 'help';
      default:
        return 'documentText';
    }
  }
}
