/**
 * @fileoverview Explore List Component — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 1.0.0
 *
 * Container for explore search results with loading, empty, and error states.
 * Uses IntersectionObserver for infinite scroll instead of IonInfiniteScroll.
 * Inline SVGs replace IonIcon for state illustrations.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * For mobile app, use ExploreListComponent (Ionic variant) instead.
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  inject,
  viewChild,
  ElementRef,
  afterNextRender,
  DestroyRef,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { type ExploreItem, type ExploreTabId, EXPLORE_EMPTY_STATES } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { HapticsService } from '../../services/haptics/haptics.service';
import { ExploreSkeletonComponent } from '../explore-skeleton.component';
import { ExploreItemWebComponent } from './explore-item-web.component';

/** SVG path data for state illustrations */
const STATE_ICON_PATHS: Record<string, string> = {
  'alert-circle':
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
  refresh:
    'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  search:
    'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  school:
    'M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zM18.82 9L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z',
  person:
    'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  people:
    'M9 13.75c-2.34 0-7 1.17-7 3.5V19h14v-1.75c0-2.33-4.66-3.5-7-3.5zm6 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-1.75c0-2.33-4.66-3.5-7-3.5zM9 12c1.93 0 3.5-1.57 3.5-3.5S10.93 5 9 5 5.5 6.57 5.5 8.5 7.07 12 9 12zm6 0c1.93 0 3.5-1.57 3.5-3.5S16.93 5 15 5c-.54 0-1.04.13-1.5.35.63.89 1 1.98 1 3.15s-.37 2.26-1 3.15c.46.22.96.35 1.5.35z',
  'play-circle':
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z',
  trophy:
    'M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z',
  clipboard:
    'M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z',
  calendar:
    'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z',
  ticket:
    'M22 10V6c0-1.11-.9-2-2-2H4c-1.1 0-1.99.89-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-2-1.46c-1.19.69-2 1.99-2 3.46s.81 2.77 2 3.46V18H4v-2.54c1.19-.69 2-1.99 2-3.46 0-1.48-.81-2.77-2-3.46V6h16v2.54z',
} as const;

@Component({
  selector: 'nxt1-explore-list-web',
  standalone: true,
  imports: [CommonModule, ExploreSkeletonComponent, ExploreItemWebComponent],
  template: `
    <!-- Loading State -->
    @if (isLoading()) {
      <div class="explore-list__loading" [attr.data-testid]="testIds.LOADING_SKELETON">
        @for (i of skeletonArray; track i) {
          <nxt1-explore-skeleton />
        }
      </div>
    }

    <!-- Error State -->
    @else if (error()) {
      <div class="explore-list__error" [attr.data-testid]="testIds.ERROR_STATE">
        <div class="state-icon state-icon--error">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path [attr.d]="stateIconPaths['alert-circle']" />
          </svg>
        </div>
        <h3 class="state-title">Something went wrong</h3>
        <p class="state-message">{{ error() }}</p>
        <button class="retry-button" type="button" (click)="onRetry()">
          <svg class="retry-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path [attr.d]="stateIconPaths['refresh']" />
          </svg>
          Try Again
        </button>
      </div>
    }

    <!-- Empty State (after search) -->
    @else if (isEmpty() && hasQuery()) {
      <div class="explore-list__empty" [attr.data-testid]="testIds.EMPTY_STATE">
        <div class="state-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path [attr.d]="stateIconPaths['search']" />
          </svg>
        </div>
        <h3 class="state-title">{{ emptyState().title }}</h3>
        <p class="state-message">{{ emptyState().message }}</p>
      </div>
    }

    <!-- Results List -->
    @else {
      <div class="explore-list__results" [attr.data-testid]="testIds.LIST_CONTAINER">
        @for (item of items(); track item.id) {
          <nxt1-explore-item-web
            [item]="item"
            [attr.data-testid]="testIds.LIST_ITEM + '-' + item.id"
            (itemClick)="onItemClick($event)"
          />
        }
      </div>

      <!-- Infinite Scroll Sentinel -->
      @if (hasMore()) {
        <div
          #scrollSentinel
          class="scroll-sentinel"
          [attr.data-testid]="testIds.LOAD_MORE_TRIGGER"
          aria-hidden="true"
        ></div>
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
      /* ============================================
         EXPLORE LIST (WEB) — Design Token CSS
         Zero Ionic, SSR-safe
         ============================================ */

      :host {
        display: block;
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

      /* ============================================
         STATE ILLUSTRATIONS (Error / Empty / Initial)
         ============================================ */

      .explore-list__error,
      .explore-list__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-4, 16px);
        text-align: center;
      }

      .state-icon {
        width: 64px;
        height: 64px;
        border-radius: var(--nxt1-radius-full, 9999px);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-4, 16px);
      }

      .state-icon svg {
        width: 32px;
        height: 32px;
        color: var(--nxt1-color-text-tertiary);
      }

      .state-icon--error {
        background: rgba(255, 59, 48, 0.1);
      }

      .state-icon--error svg {
        color: #ff3b30;
      }

      .state-title {
        font-size: var(--nxt1-fontSize-lg, 18px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2, 8px) 0;
      }

      .state-message {
        font-size: var(--nxt1-fontSize-sm, 14px);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-4, 16px) 0;
        max-width: 280px;
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ============================================
         RETRY BUTTON
         ============================================ */

      .retry-button {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-5, 20px);
        background: var(--nxt1-color-primary, #ccff00);
        color: #000;
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: var(--nxt1-fontSize-sm, 14px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        cursor: pointer;
        transition:
          transform var(--nxt1-duration-fast, 150ms) ease,
          opacity var(--nxt1-duration-fast, 150ms) ease;
      }

      .retry-button:hover {
        opacity: 0.9;
      }

      .retry-button:active {
        transform: scale(0.95);
      }

      .retry-icon {
        width: 16px;
        height: 16px;
      }

      /* ============================================
         INFINITE SCROLL SENTINEL
         ============================================ */

      .scroll-sentinel {
        height: 1px;
        width: 100%;
      }

      @media (prefers-reduced-motion: reduce) {
        .retry-button {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreListWebComponent {
  private readonly haptics = inject(HapticsService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  private readonly scrollSentinel = viewChild<ElementRef<HTMLElement>>('scrollSentinel');
  private intersectionObserver?: IntersectionObserver;

  protected readonly testIds = TEST_IDS.EXPLORE;

  // ============================================
  // INPUTS
  // ============================================

  readonly items = input<ExploreItem[]>([]);
  readonly activeTab = input<ExploreTabId>('colleges');
  readonly isLoading = input(false);
  readonly isLoadingMore = input(false);
  readonly isEmpty = input(false);
  readonly hasQuery = input(false);
  readonly error = input<string | null>(null);
  readonly hasMore = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly loadMore = output<void>();
  readonly retry = output<void>();
  readonly itemClick = output<ExploreItem>();

  // ============================================
  // CONSTANTS
  // ============================================

  protected readonly skeletonArray = [1, 2, 3, 4, 5, 6];
  protected readonly stateIconPaths = STATE_ICON_PATHS;

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly emptyState = computed(() => EXPLORE_EMPTY_STATES[this.activeTab()]);

  // ============================================
  // LIFECYCLE — IntersectionObserver for infinite scroll
  // ============================================

  constructor() {
    afterNextRender(() => {
      this.setupIntersectionObserver();
      this.destroyRef.onDestroy(() => this.intersectionObserver?.disconnect());
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onItemClick(item: ExploreItem): void {
    this.itemClick.emit(item);
  }

  protected async onRetry(): Promise<void> {
    await this.haptics.impact('medium');
    this.retry.emit();
  }

  // ============================================
  // PRIVATE — IntersectionObserver
  // ============================================

  private setupIntersectionObserver(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        const sentinel = entries[0];
        if (sentinel?.isIntersecting && this.hasMore() && !this.isLoadingMore()) {
          this.loadMore.emit();
        }
      },
      { rootMargin: '200px' }
    );

    // Observe the sentinel element if it exists
    const sentinel = this.scrollSentinel();
    if (sentinel?.nativeElement) {
      this.intersectionObserver.observe(sentinel.nativeElement);
    }
  }
}
