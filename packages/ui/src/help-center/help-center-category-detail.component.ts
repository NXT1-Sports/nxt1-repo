/**
 * @fileoverview Help Category Detail - Category Articles List
 * @module @nxt1/ui/help-center
 * @version 2.0.0
 *
 * Shows all articles within a specific category.
 * Clean native iOS/Android list design.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonList,
  IonListHeader,
  IonLabel,
  IonItem,
  IonIcon,
  IonNote,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronForward,
  helpCircleOutline,
  bookOutline,
  videocamOutline,
  schoolOutline,
  documentTextOutline,
  timeOutline,
} from 'ionicons/icons';
import { NxtPageHeaderComponent } from '../components/page-header';
import { HelpCenterService } from './help-center.service';
import { HapticsService } from '../services/haptics/haptics.service';
import type { HelpArticle, HelpCategoryId } from '@nxt1/core';

@Component({
  selector: 'nxt1-help-category-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonList,
    IonListHeader,
    IonLabel,
    IonItem,
    IonIcon,
    IonNote,
    NxtPageHeaderComponent,
  ],
  template: `
    <nxt1-page-header [title]="categoryTitle()" [showBack]="true" (backClick)="back.emit()" />

    <ion-content class="category-content">
      <div class="category-container">
        <!-- Category Description -->
        @if (category()?.description) {
          <div class="category-header">
            <p>{{ category()?.description }}</p>
          </div>
        }

        <!-- Articles List -->
        @if (articles().length > 0) {
          <ion-list class="category-list" lines="full">
            <ion-list-header>
              <ion-label>Articles</ion-label>
            </ion-list-header>

            @for (article of articles(); track article.id) {
              <ion-item class="category-item" button detail (click)="onArticleClick(article)">
                <ion-icon
                  [name]="getTypeIcon(article.type)"
                  slot="start"
                  class="category-item__icon"
                />
                <ion-label>
                  <h3>{{ article.title }}</h3>
                  <p>{{ article.excerpt }}</p>
                </ion-label>
                <ion-note slot="end" class="category-item__time">
                  {{ article.readingTimeMinutes }} min
                </ion-note>
              </ion-item>
            }
          </ion-list>
        } @else {
          <!-- Empty State -->
          <div class="category-empty">
            <ion-icon name="document-text-outline" class="category-empty__icon" />
            <h3>No articles yet</h3>
            <p>Check back soon for new content in this category.</p>
          </div>
        }

        <!-- FAQs for this category -->
        @if (faqs().length > 0) {
          <ion-list class="category-list" lines="full">
            <ion-list-header>
              <ion-label>Frequently Asked</ion-label>
            </ion-list-header>

            @for (faq of faqs(); track faq.id) {
              <ion-item class="category-item" button detail (click)="onFaqClick(faq.id)">
                <ion-icon name="help-circle-outline" slot="start" class="category-item__icon" />
                <ion-label>
                  <h3>{{ faq.question }}</h3>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      .category-content {
        --background: var(--nxt1-color-bg-primary, var(--ion-background-color));
      }

      .category-container {
        padding-bottom: calc(80px + env(safe-area-inset-bottom, 0));
      }

      /* Header */
      .category-header {
        padding: var(--nxt1-spacing-md, 16px);
        padding-top: var(--nxt1-spacing-sm, 8px);
      }

      .category-header p {
        margin: 0;
        font-size: var(--nxt1-font-size-md, 15px);
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
      }

      /* Lists */
      .category-list {
        background: transparent;
        margin-bottom: var(--nxt1-spacing-md, 16px);
      }

      ion-list-header {
        padding-left: var(--nxt1-spacing-md, 16px);
        padding-right: var(--nxt1-spacing-md, 16px);
        margin-bottom: var(--nxt1-spacing-xs, 4px);
      }

      ion-list-header ion-label {
        font-size: var(--nxt1-font-size-xs, 13px);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
      }

      /* Items */
      .category-item {
        --background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --background-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        --padding-start: var(--nxt1-spacing-md, 16px);
        --padding-end: var(--nxt1-spacing-md, 16px);
        --inner-padding-end: var(--nxt1-spacing-sm, 8px);
        --min-height: 64px;
        --border-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        margin: 0 var(--nxt1-spacing-md, 16px);
        margin-bottom: 1px;
      }

      .category-item:first-of-type {
        border-radius: var(--nxt1-radius-lg, 12px) var(--nxt1-radius-lg, 12px) 0 0;
      }

      .category-item:last-of-type {
        border-radius: 0 0 var(--nxt1-radius-lg, 12px) var(--nxt1-radius-lg, 12px);
        --border-width: 0;
      }

      .category-item:only-of-type {
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .category-item ion-label h3 {
        font-size: var(--nxt1-font-size-md, 16px);
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin-bottom: var(--nxt1-spacing-xxs, 2px);
      }

      .category-item ion-label p {
        font-size: var(--nxt1-font-size-sm, 14px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        margin: 0;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* Icons */
      .category-item__icon {
        font-size: 22px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.5));
        margin-right: var(--nxt1-spacing-sm, 12px);
      }

      /* Time note */
      .category-item__time {
        font-size: var(--nxt1-font-size-xs, 12px);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      /* Empty State */
      .category-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-xxl, 48px) var(--nxt1-spacing-md, 16px);
        text-align: center;
      }

      .category-empty__icon {
        font-size: 48px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
        margin-bottom: var(--nxt1-spacing-md, 16px);
      }

      .category-empty h3 {
        margin: 0 0 var(--nxt1-spacing-xs, 8px);
        font-size: var(--nxt1-font-size-lg, 18px);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .category-empty p {
        margin: 0;
        font-size: var(--nxt1-font-size-md, 15px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
      }

      /* Light Mode */
      :host-context(.light),
      :host-context([data-theme='light']) {
        .category-header p {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.6));
        }

        ion-list-header ion-label {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.6));
        }

        .category-item {
          --background: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.02));
          --background-hover: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.04));
          --border-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.06));
        }

        .category-item ion-label h3 {
          color: var(--nxt1-color-text-primary, #000000);
        }

        .category-item ion-label p {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.6));
        }

        .category-item__icon {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.5));
        }

        .category-item__time {
          color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.4));
        }

        .category-empty__icon {
          color: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.3));
        }

        .category-empty h3 {
          color: var(--nxt1-color-text-primary, #000000);
        }

        .category-empty p {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.6));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCategoryDetailComponent {
  constructor() {
    addIcons({
      chevronForward,
      helpCircleOutline,
      bookOutline,
      videocamOutline,
      schoolOutline,
      documentTextOutline,
      timeOutline,
    });
  }

  protected readonly helpService = inject(HelpCenterService);
  private readonly haptics = inject(HapticsService);

  /** Category ID to display */
  readonly categoryId = input.required<HelpCategoryId>();

  /** Emits when back button clicked */
  readonly back = output<void>();

  /** Emits when article is selected */
  readonly articleSelect = output<{ id: string; slug: string }>();

  /** Emits when FAQ is selected */
  readonly faqSelect = output<string>();

  /** Current category */
  protected readonly category = computed(() => this.helpService.getCategoryById(this.categoryId()));

  /** Category title */
  protected readonly categoryTitle = computed(() => this.category()?.label ?? 'Category');

  /** Articles in this category */
  protected readonly articles = computed(() =>
    this.helpService.getArticlesByCategory(this.categoryId())
  );

  /** FAQs in this category */
  protected readonly faqs = computed(() => this.helpService.getFaqsByCategory(this.categoryId()));

  protected async onArticleClick(article: HelpArticle): Promise<void> {
    await this.haptics.impact('light');
    this.articleSelect.emit({ id: article.id, slug: article.slug });
  }

  protected async onFaqClick(faqId: string): Promise<void> {
    await this.haptics.impact('light');
    this.faqSelect.emit(faqId);
  }

  protected getTypeIcon(type: string): string {
    switch (type) {
      case 'video':
        return 'videocam-outline';
      case 'guide':
        return 'book-outline';
      case 'tutorial':
        return 'school-outline';
      case 'faq':
        return 'help-circle-outline';
      default:
        return 'document-text-outline';
    }
  }
}
