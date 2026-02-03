/**
 * @fileoverview Explore List Component - Results Container
 * @module @nxt1/ui/explore
 * @version 1.0.0
 *
 * Container for explore search results with loading, empty, and error states.
 * Uses ExploreItemComponent for individual items.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-explore-list
 *   [items]="items()"
 *   [activeTab]="activeTab()"
 *   [isLoading]="isLoading()"
 *   [isEmpty]="isEmpty()"
 *   [error]="error()"
 *   (loadMore)="onLoadMore()"
 *   (retry)="onRetry()"
 *   (itemClick)="onItemClick($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonInfiniteScroll, IonInfiniteScrollContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  schoolOutline,
  playCircleOutline,
  personOutline,
  peopleOutline,
  alertCircleOutline,
  searchOutline,
  refreshOutline,
} from 'ionicons/icons';
import {
  type ExploreItem,
  type ExploreTabId,
  EXPLORE_EMPTY_STATES,
  EXPLORE_INITIAL_STATES,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { ExploreSkeletonComponent } from './explore-skeleton.component';
import { ExploreItemComponent } from './explore-item.component';

addIcons({
  schoolOutline,
  playCircleOutline,
  personOutline,
  peopleOutline,
  alertCircleOutline,
  searchOutline,
  refreshOutline,
});

@Component({
  selector: 'nxt1-explore-list',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    ExploreSkeletonComponent,
    ExploreItemComponent,
  ],
  template: `
    <!-- Loading State -->
    @if (isLoading()) {
      <div class="explore-list__loading">
        @for (i of skeletonArray; track i) {
          <nxt1-explore-skeleton />
        }
      </div>
    }

    <!-- Error State -->
    @else if (error()) {
      <div class="explore-list__error">
        <div class="error-icon">
          <ion-icon name="alert-circle-outline" />
        </div>
        <h3 class="error-title">Something went wrong</h3>
        <p class="error-message">{{ error() }}</p>
        <button class="error-retry" (click)="onRetry()">
          <ion-icon name="refresh-outline" />
          Try Again
        </button>
      </div>
    }

    <!-- Empty State (after search) -->
    @else if (isEmpty() && hasQuery()) {
      <div class="explore-list__empty">
        <div class="empty-icon">
          <ion-icon name="search-outline" />
        </div>
        <h3 class="empty-title">{{ emptyState().title }}</h3>
        <p class="empty-message">{{ emptyState().message }}</p>
      </div>
    }

    <!-- Initial State (no search yet) -->
    @else if (isEmpty() && !hasQuery()) {
      <div class="explore-list__initial">
        <div class="initial-icon">
          <ion-icon [name]="initialState().icon" />
        </div>
        <h3 class="initial-title">{{ initialState().title }}</h3>
        <p class="initial-message">{{ initialState().message }}</p>
      </div>
    }

    <!-- Results List -->
    @else {
      <div class="explore-list__results">
        @for (item of items(); track item.id) {
          <nxt1-explore-item [item]="item" (itemClick)="onItemClick($event)" />
        }
      </div>

      <!-- Infinite Scroll -->
      @if (hasMore()) {
        <ion-infinite-scroll (ionInfinite)="onInfiniteScroll($event)">
          <ion-infinite-scroll-content loadingSpinner="crescent" />
        </ion-infinite-scroll>
      }

      <!-- Loading More Indicator -->
      @if (isLoadingMore()) {
        <div class="explore-list__loading-more">
          @for (i of [1, 2]; track i) {
            <nxt1-explore-skeleton />
          }
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
        --list-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --list-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --list-text-muted: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --list-primary: var(--nxt1-color-primary, #ccff00);
        --list-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      :host-context(.light),
      :host-context([data-theme='light']) {
        --list-text-primary: var(--nxt1-color-text-primary, #1a1a1a);
        --list-text-secondary: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        --list-text-muted: var(--nxt1-color-text-tertiary, rgba(0, 0, 0, 0.5));
      }

      .explore-list__loading,
      .explore-list__loading-more {
        padding: var(--nxt1-spacing-4, 16px);
      }

      .explore-list__results {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-4, 16px);
      }

      /* Error State */
      .explore-list__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-4, 16px);
        text-align: center;
      }

      .error-icon {
        width: 64px;
        height: 64px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: rgba(255, 59, 48, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .error-icon ion-icon {
        font-size: 32px;
        color: #ff3b30;
      }

      .error-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--list-text-primary);
        margin: 0 0 var(--nxt1-spacing-2, 8px) 0;
      }

      .error-message {
        font-size: 14px;
        color: var(--list-text-secondary);
        margin: 0 0 var(--nxt1-spacing-4, 16px) 0;
        max-width: 280px;
      }

      .error-retry {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-5, 20px);
        background: var(--list-primary);
        color: #000;
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition:
          transform 0.2s ease,
          opacity 0.2s ease;
      }

      .error-retry:active {
        transform: scale(0.95);
      }

      /* Empty State */
      .explore-list__empty,
      .explore-list__initial {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-4, 16px);
        text-align: center;
      }

      .empty-icon,
      .initial-icon {
        width: 64px;
        height: 64px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--list-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .empty-icon ion-icon,
      .initial-icon ion-icon {
        font-size: 32px;
        color: var(--list-text-muted);
      }

      .empty-title,
      .initial-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--list-text-primary);
        margin: 0 0 var(--nxt1-spacing-2, 8px) 0;
      }

      .empty-message,
      .initial-message {
        font-size: 14px;
        color: var(--list-text-secondary);
        margin: 0;
        max-width: 280px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreListComponent {
  private readonly haptics = inject(HapticsService);

  // Inputs
  readonly items = input<ExploreItem[]>([]);
  readonly activeTab = input<ExploreTabId>('colleges');
  readonly isLoading = input(false);
  readonly isLoadingMore = input(false);
  readonly isEmpty = input(false);
  readonly hasQuery = input(false);
  readonly error = input<string | null>(null);
  readonly hasMore = input(false);

  // Outputs
  readonly loadMore = output<void>();
  readonly retry = output<void>();
  readonly itemClick = output<ExploreItem>();

  // Constants
  protected readonly skeletonArray = [1, 2, 3, 4, 5, 6];

  protected readonly emptyState = computed(() => EXPLORE_EMPTY_STATES[this.activeTab()]);

  protected readonly initialState = computed(() => {
    const state = EXPLORE_INITIAL_STATES[this.activeTab()];
    const iconMap: Record<ExploreTabId, string> = {
      colleges: 'school-outline',
      athletes: 'person-outline',
      teams: 'people-outline',
      videos: 'play-circle-outline',
      leaderboards: 'trophy-outline',
      'scout-reports': 'clipboard-outline',
      camps: 'calendar-outline',
      events: 'ticket-outline',
    };
    return { ...state, icon: iconMap[this.activeTab()] };
  });

  protected async onItemClick(item: ExploreItem): Promise<void> {
    this.itemClick.emit(item);
  }

  protected async onRetry(): Promise<void> {
    await this.haptics.impact('medium');
    this.retry.emit();
  }

  protected async onInfiniteScroll(event: CustomEvent): Promise<void> {
    this.loadMore.emit();
    setTimeout(() => {
      (event.target as HTMLIonInfiniteScrollElement)?.complete();
    }, 1000);
  }
}
