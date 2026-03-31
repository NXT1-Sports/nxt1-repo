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

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  inject,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonInfiniteScroll, IonInfiniteScrollContent } from '@ionic/angular/standalone';
import {
  type ExploreItem,
  type ExploreTabId,
  EXPLORE_EMPTY_STATES,
  EXPLORE_INITIAL_STATES,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { ExploreSkeletonComponent } from './explore-skeleton.component';
import { ExploreItemComponent } from './explore-item.component';
import { NxtStateViewComponent } from '../components/state-view';

@Component({
  selector: 'nxt1-explore-list',
  standalone: true,
  imports: [
    CommonModule,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    ExploreSkeletonComponent,
    ExploreItemComponent,
    NxtStateViewComponent,
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
      <nxt1-state-view
        variant="error"
        title="Something went wrong"
        [message]="error()"
        actionLabel="Try Again"
        actionIcon="refresh"
        (action)="onRetry()"
      />
    }

    <!-- Empty State (after search) -->
    @else if (isEmpty() && hasQuery()) {
      <nxt1-state-view
        variant="empty"
        icon="search"
        [title]="emptyState().title"
        [message]="emptyState().message"
      />
    }

    <!-- Initial State (no search yet) -->
    @else if (isEmpty() && !hasQuery()) {
      <nxt1-state-view
        variant="empty"
        icon="search"
        [title]="initialState().title"
        [message]="initialState().message"
      />
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
      feed: 'home-outline',
      news: 'newspaper-outline',
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

  private readonly ngZone = inject(NgZone);

  protected async onInfiniteScroll(event: CustomEvent): Promise<void> {
    this.loadMore.emit();
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        (event.target as HTMLIonInfiniteScrollElement)?.complete();
      }, 1000);
    });
  }
}
