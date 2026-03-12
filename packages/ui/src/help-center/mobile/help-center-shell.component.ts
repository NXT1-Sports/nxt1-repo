/**
 * @fileoverview Help Center Shell - Mobile (Ionic)
 * @module @nxt1/ui/help-center/mobile
 * @version 3.0.0
 *
 * Mobile-optimized Help Center using Ionic components.
 * Native iOS/Android feel with haptics, gestures, and native list styling.
 *
 * ⭐ MOBILE ONLY - Uses Ionic components ⭐
 */

import { Component, ChangeDetectionStrategy, inject, output, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonList,
  IonListHeader,
  IonLabel,
  IonItem,
  IonIcon,
  IonSearchbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronForward,
  chevronDownOutline,
  searchOutline,
  helpCircleOutline,
  bookOutline,
  videocamOutline,
  personOutline,
  schoolOutline,
  settingsOutline,
  shieldOutline,
  buildOutline,
  peopleOutline,
  cardOutline,
  homeOutline,
  lockClosedOutline,
  chatbubbleOutline,
  documentTextOutline,
  rocketOutline,
  fitnessOutline,
  clipboardOutline,
  diamondOutline,
  constructOutline,
} from 'ionicons/icons';
import { NxtPageHeaderComponent } from '../../components/page-header';
import { HelpCenterService } from '../_shared/help-center.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import type { HelpArticle, HelpCategoryId } from '@nxt1/core';

// Register icons
/** Navigation events */
export interface HelpNavigateEvent {
  readonly type: 'article' | 'category' | 'faq' | 'contact';
  readonly id?: string;
  readonly slug?: string;
}

@Component({
  selector: 'nxt1-help-center-shell-mobile',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonList,
    IonListHeader,
    IonLabel,
    IonItem,
    IonIcon,
    IonSearchbar,
    NxtPageHeaderComponent,
  ],
  template: `
    <nxt1-page-header title="Help Center" [showBack]="showBack()" (backClick)="back.emit()" />

    <ion-content class="help-content">
      <div class="help-container">
        <!-- Search Bar -->
        <div class="help-search">
          <ion-searchbar
            mode="ios"
            placeholder="Search help articles..."
            [debounce]="300"
            (ionInput)="onSearch($event)"
          />
        </div>

        <!-- Search Results -->
        @if (helpService.isSearching()) {
          <ion-list class="help-list" lines="full">
            <ion-list-header>
              <ion-label>Search Results</ion-label>
            </ion-list-header>

            @if (helpService.filteredArticles().length === 0) {
              <ion-item class="help-item help-item--empty">
                <ion-label class="ion-text-center">
                  <p>No articles found</p>
                </ion-label>
              </ion-item>
            } @else {
              @for (article of helpService.filteredArticles(); track article.id) {
                <ion-item class="help-item" button detail (click)="onArticleClick(article)">
                  <ion-icon
                    [name]="getTypeIcon(article.type)"
                    slot="start"
                    class="help-item__icon"
                  />
                  <ion-label>
                    <h3>{{ article.title }}</h3>
                    <p>{{ article.excerpt }}</p>
                  </ion-label>
                </ion-item>
              }
            }
          </ion-list>
        } @else {
          <!-- Categories -->
          <ion-list class="help-list" lines="full">
            <ion-list-header>
              <ion-label>Browse by Topic</ion-label>
            </ion-list-header>

            @for (category of helpService.categories(); track category.id) {
              <ion-item class="help-item" button detail (click)="onCategoryClick(category.id)">
                <ion-icon [name]="category.icon" slot="start" class="help-item__icon" />
                <ion-label>
                  <h3>{{ category.label }}</h3>
                  @if (category.description) {
                    <p>{{ category.description }}</p>
                  }
                </ion-label>
              </ion-item>
            }
          </ion-list>

          <!-- Popular Questions -->
          @if (helpService.popularFaqs().length > 0) {
            <ion-list class="help-list" lines="full">
              <ion-list-header>
                <ion-label>Popular Questions</ion-label>
              </ion-list-header>

              @for (faq of helpService.popularFaqs(); track faq.id) {
                <ion-item
                  class="help-item"
                  button
                  [detail]="true"
                  [detailIcon]="
                    expandedFaqId() === faq.id ? 'chevron-down-outline' : 'chevron-forward'
                  "
                  (click)="toggleFaq(faq.id)"
                >
                  <ion-icon name="help-circle-outline" slot="start" class="help-item__icon" />
                  <ion-label class="ion-text-wrap">
                    <h3>{{ faq.question }}</h3>
                    @if (expandedFaqId() === faq.id) {
                      <div class="faq-answer" [innerHTML]="faq.answer"></div>
                    }
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          }

          <!-- Contact Support -->
          <ion-list class="help-list" lines="full">
            <ion-list-header>
              <ion-label>Need More Help?</ion-label>
            </ion-list-header>

            <ion-item class="help-item" button detail (click)="onContactClick()">
              <ion-icon
                name="chatbubble-outline"
                slot="start"
                class="help-item__icon help-item__icon--primary"
              />
              <ion-label>
                <h3>Contact Support</h3>
                <p>Get help from our team</p>
              </ion-label>
            </ion-item>
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

      .help-content {
        --background: var(--nxt1-color-bg-primary, var(--ion-background-color));
      }

      .help-container {
        padding-bottom: calc(160px + env(safe-area-inset-bottom, 0));
      }

      .help-search {
        padding: var(--nxt1-spacing-md, 16px);
        padding-bottom: var(--nxt1-spacing-sm, 8px);
      }

      ion-searchbar {
        --background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.06));
        --border-radius: var(--nxt1-radius-lg, 12px);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        --icon-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        --color: var(--nxt1-color-text-primary, #ffffff);
        padding: 0;
      }

      .help-list {
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
        letter-spacing: 0.5px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
      }

      .help-item {
        --background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --background-hover: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        --padding-start: var(--nxt1-spacing-md, 16px);
        --padding-end: var(--nxt1-spacing-md, 16px);
        --inner-padding-end: var(--nxt1-spacing-sm, 8px);
        --min-height: 56px;
        --border-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        margin: 0 var(--nxt1-spacing-md, 16px);
        margin-bottom: 1px;
      }

      .help-item:first-of-type {
        border-radius: var(--nxt1-radius-lg, 12px) var(--nxt1-radius-lg, 12px) 0 0;
      }

      .help-item:last-of-type {
        border-radius: 0 0 var(--nxt1-radius-lg, 12px) var(--nxt1-radius-lg, 12px);
        --border-width: 0;
      }

      .help-item:only-of-type {
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .help-item--empty {
        --min-height: 80px;
      }

      .help-item ion-label h3 {
        font-size: var(--nxt1-font-size-md, 16px);
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin-bottom: var(--nxt1-spacing-xxs, 2px);
      }

      .help-item ion-label p {
        font-size: var(--nxt1-font-size-sm, 14px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        margin: 0;
        line-height: 1.4;
      }

      .help-item__icon {
        font-size: 22px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        margin-right: var(--nxt1-spacing-sm, 12px);
      }

      .help-item__icon--featured {
        color: var(--nxt1-color-primary, #c8ff00);
      }

      .help-item__icon--primary {
        color: var(--nxt1-color-primary, #c8ff00);
      }

      .help-chip {
        --background: var(--nxt1-color-primary, #c8ff00);
        --color: var(--nxt1-color-bg-primary, #0a0a0a);
        font-size: var(--nxt1-font-size-xs, 11px);
        font-weight: 600;
        height: 20px;
        padding: 0 8px;
      }

      /* FAQ Answer */
      .faq-answer {
        margin-top: var(--nxt1-spacing-sm, 8px);
        padding-top: var(--nxt1-spacing-sm, 8px);
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        font-size: var(--nxt1-font-size-sm, 14px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        line-height: 1.5;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpCenterShellMobileComponent {
  constructor() {
    addIcons({
      chevronForward,
      chevronDownOutline,
      searchOutline,
      helpCircleOutline,
      bookOutline,
      videocamOutline,
      personOutline,
      schoolOutline,
      settingsOutline,
      shieldOutline,
      buildOutline,
      peopleOutline,
      cardOutline,
      homeOutline,
      lockClosedOutline,
      chatbubbleOutline,
      documentTextOutline,
      rocketOutline,
      fitnessOutline,
      clipboardOutline,
      diamondOutline,
      constructOutline,
    });
  }

  protected readonly helpService = inject(HelpCenterService);
  private readonly haptics = inject(HapticsService);

  readonly showBack = input(true);
  readonly back = output<void>();
  readonly navigate = output<HelpNavigateEvent>();

  protected onSearch(event: CustomEvent): void {
    const query = event.detail.value ?? '';
    this.helpService.setSearchQuery(query);
  }

  protected async onArticleClick(article: HelpArticle): Promise<void> {
    await this.haptics.impact('light');
    this.navigate.emit({
      type: 'article',
      id: article.id,
      slug: article.slug,
    });
  }

  protected async onCategoryClick(categoryId: HelpCategoryId): Promise<void> {
    await this.haptics.impact('light');
    this.navigate.emit({
      type: 'category',
      id: categoryId,
    });
  }

  protected readonly expandedFaqId = signal<string | null>(null);

  protected async toggleFaq(faqId: string): Promise<void> {
    await this.haptics.impact('light');
    this.expandedFaqId.update((current) => (current === faqId ? null : faqId));
  }

  protected async onContactClick(): Promise<void> {
    await this.haptics.impact('medium');
    this.navigate.emit({
      type: 'contact',
    });
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
