/**
 * @fileoverview Search Results Dropdown — Web (Zero Ionic)
 * @module @nxt1/ui/components/search-results-dropdown
 * @version 1.0.0
 *
 * Professional Google/Twitter/LinkedIn-style search results dropdown
 * for the top navigation search bar. Shows instant results as the user
 * types, with type-specific icons and routing.
 *
 * Features:
 * - Type-categorized results (Athletes, Teams, Colleges, Videos)
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Loading skeleton state
 * - Recent & trending searches (when empty query)
 * - "See all results" footer link to /explore
 * - Click-outside-to-dismiss behavior
 * - Full SSR safety (no browser globals)
 * - Accessibility (ARIA roles, labels, live region)
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-safe ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  afterNextRender,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import type { ExploreItem } from '@nxt1/core';
import { NxtAvatarComponent } from '../avatar';

// ── SVG icon paths (inline, no Ionic dependency) ──
const ICON_PATHS = {
  search:
    'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  time: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  trending: 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z',
  location:
    'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  verified:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  arrowRight: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  person:
    'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  group:
    'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  school: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
  play: 'M8 5v14l11-7z',
  close:
    'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
} as const;

/** Result category label map */
const TYPE_LABELS: Record<string, string> = {
  athletes: 'Athletes',
  teams: 'Teams',
  colleges: 'Colleges',
  videos: 'Videos',
};

/** Result category icon map */
const TYPE_ICONS: Record<string, string> = {
  athletes: 'person',
  teams: 'group',
  colleges: 'school',
  videos: 'play',
};

/** Maximum results per category in the dropdown */
const MAX_PER_CATEGORY = 3;

/**
 * Represents a search result item in the dropdown.
 * Adapts ExploreItem for dropdown display.
 */
export interface SearchDropdownResult {
  /** Unique identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Subtitle text */
  readonly subtitle: string;
  /** Image URL */
  readonly imageUrl?: string;
  /** Result type */
  readonly type: string;
  /** Navigation route */
  readonly route: string;
  /** Whether the item is verified */
  readonly isVerified?: boolean;
}

@Component({
  selector: 'nxt1-search-results-dropdown',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent],
  template: `
    @if (isVisible()) {
      <div
        class="search-dropdown"
        role="listbox"
        aria-label="Search results"
        [attr.aria-busy]="isLoading()"
      >
        <!-- Loading State -->
        @if (isLoading() && results().length === 0) {
          <div class="dropdown-loading" aria-live="polite">
            @for (i of skeletonItems; track i) {
              <div class="skeleton-row">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-text">
                  <div class="skeleton-line skeleton-line--name"></div>
                  <div class="skeleton-line skeleton-line--subtitle"></div>
                </div>
              </div>
            }
          </div>
        }

        <!-- Recent Searches (shown when no query) -->
        @else if (!hasQuery() && recentSearches().length > 0) {
          <div class="dropdown-section">
            <div class="section-header">
              <span class="section-title">Recent Searches</span>
              <button
                class="section-action"
                type="button"
                (click)="clearRecentClick.emit()"
                aria-label="Clear recent searches"
              >
                Clear
              </button>
            </div>
            @for (search of recentSearches(); track search; let i = $index) {
              <button
                class="dropdown-item dropdown-item--suggestion"
                [class.dropdown-item--focused]="focusedIndex() === i"
                type="button"
                role="option"
                [attr.aria-selected]="focusedIndex() === i"
                (click)="onSuggestionClick(search)"
                (mouseenter)="focusedIndex.set(i)"
              >
                <div class="item-icon item-icon--recent">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path [attr.d]="iconPaths.time" />
                  </svg>
                </div>
                <span class="item-text">{{ search }}</span>
                <div class="item-arrow">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path [attr.d]="iconPaths.arrowRight" />
                  </svg>
                </div>
              </button>
            }
          </div>

          <!-- Trending Searches -->
          @if (trendingSearches().length > 0) {
            <div class="dropdown-section">
              <div class="section-header">
                <span class="section-title">Trending</span>
              </div>
              @for (search of trendingSearches(); track search; let i = $index) {
                <button
                  class="dropdown-item dropdown-item--suggestion"
                  [class.dropdown-item--focused]="focusedIndex() === i + recentSearches().length"
                  type="button"
                  role="option"
                  [attr.aria-selected]="focusedIndex() === i + recentSearches().length"
                  (click)="onSuggestionClick(search)"
                  (mouseenter)="focusedIndex.set(i + recentSearches().length)"
                >
                  <div class="item-icon item-icon--trending">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path [attr.d]="iconPaths.trending" />
                    </svg>
                  </div>
                  <span class="item-text">{{ search }}</span>
                  <div class="item-arrow">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path [attr.d]="iconPaths.arrowRight" />
                    </svg>
                  </div>
                </button>
              }
            </div>
          }
        }

        <!-- Search Results (when there's a query) -->
        @else if (hasQuery() && groupedResults().length > 0) {
          @for (group of groupedResults(); track group.type) {
            <div class="dropdown-section">
              <div class="section-header">
                <div class="section-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path [attr.d]="getTypeIconPath(group.type)" />
                  </svg>
                </div>
                <span class="section-title">{{ getTypeLabel(group.type) }}</span>
                <span class="section-count">{{ group.totalCount }}</span>
              </div>
              @for (result of group.items; track result.id; let ri = $index) {
                <button
                  class="dropdown-item dropdown-item--result"
                  [class.dropdown-item--focused]="focusedIndex() === getGlobalIndex(group.type, ri)"
                  type="button"
                  role="option"
                  [attr.aria-selected]="focusedIndex() === getGlobalIndex(group.type, ri)"
                  (click)="onResultClick(result)"
                  (mouseenter)="focusedIndex.set(getGlobalIndex(group.type, ri))"
                >
                  <div class="item-avatar">
                    <nxt1-avatar [src]="result.imageUrl" [name]="result.name" size="sm" />
                  </div>
                  <div class="item-details">
                    <div class="item-name-row">
                      <span class="item-name">{{ result.name }}</span>
                      @if (result.isVerified) {
                        <svg
                          class="verified-badge"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-label="Verified"
                        >
                          <path [attr.d]="iconPaths.verified" />
                        </svg>
                      }
                    </div>
                    <span class="item-subtitle">{{ result.subtitle }}</span>
                  </div>
                  <div class="item-type-badge">
                    {{ getTypeLabel(result.type) }}
                  </div>
                </button>
              }
            </div>
          }

          <!-- See All Results Footer -->
          <div class="dropdown-footer">
            <button class="see-all-btn" type="button" (click)="seeAllClick.emit(query())">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path [attr.d]="iconPaths.search" />
              </svg>
              <span
                >See all results for "<strong>{{ query() }}</strong
                >"</span
              >
              <svg class="see-all-arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path [attr.d]="iconPaths.arrowRight" />
              </svg>
            </button>
          </div>
        }

        <!-- No Results -->
        @else if (hasQuery() && !isLoading() && results().length === 0) {
          <div class="dropdown-empty">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path [attr.d]="iconPaths.search" />
            </svg>
            <p class="empty-text">
              No results for "<strong>{{ query() }}</strong
              >"
            </p>
            <p class="empty-hint">Try different keywords or check spelling</p>
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        z-index: 9999;
        pointer-events: none;
      }

      .search-dropdown {
        pointer-events: auto;
        margin-top: 4px;
        background: var(--nxt1-color-bg-primary, #fff);
        border: 1px solid var(--nxt1-color-border, rgba(0, 0, 0, 0.08));
        border-radius: 12px;
        box-shadow:
          0 4px 24px rgba(0, 0, 0, 0.12),
          0 1px 4px rgba(0, 0, 0, 0.06);
        max-height: 480px;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        animation: dropdownSlideIn 0.15s ease-out;
      }

      @keyframes dropdownSlideIn {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ── Sections ── */
      .dropdown-section {
        padding: 4px 0;
      }

      .dropdown-section + .dropdown-section {
        border-top: 1px solid var(--nxt1-color-border, rgba(0, 0, 0, 0.06));
      }

      .section-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px 4px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary, #8e8e93);
      }

      .section-icon {
        width: 14px;
        height: 14px;
        color: var(--nxt1-color-text-tertiary, #8e8e93);
      }

      .section-icon svg {
        width: 100%;
        height: 100%;
      }

      .section-title {
        flex: 1;
      }

      .section-count {
        font-size: 11px;
        font-weight: 500;
        color: var(--nxt1-color-text-quaternary, #aeaeb2);
        letter-spacing: normal;
        text-transform: none;
      }

      .section-action {
        all: unset;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        color: var(--nxt1-color-primary, #007aff);
        letter-spacing: normal;
        text-transform: none;
        transition: opacity 0.15s;
      }

      .section-action:hover {
        opacity: 0.7;
      }

      /* ── Dropdown Items ── */
      .dropdown-item {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 8px 16px;
        cursor: pointer;
        transition:
          background-color 0.1s,
          color 0.1s;
      }

      .dropdown-item:hover,
      .dropdown-item--focused {
        background: var(--nxt1-color-bg-hover, rgba(0, 0, 0, 0.04));
      }

      .dropdown-item:active {
        background: var(--nxt1-color-bg-active, rgba(0, 0, 0, 0.07));
      }

      /* ── Suggestion Items (Recent/Trending) ── */
      .item-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: var(--nxt1-color-text-tertiary, #8e8e93);
      }

      .item-icon svg {
        width: 100%;
        height: 100%;
      }

      .item-icon--trending {
        color: var(--nxt1-color-primary, #007aff);
      }

      .item-text {
        flex: 1;
        font-size: 14px;
        font-weight: 400;
        color: var(--nxt1-color-text-primary, #1c1c1e);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item-arrow {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        color: var(--nxt1-color-text-quaternary, #c7c7cc);
      }

      .item-arrow svg {
        width: 100%;
        height: 100%;
      }

      /* ── Result Items ── */
      .item-avatar {
        flex-shrink: 0;
      }

      .item-details {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .item-name-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .item-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #1c1c1e);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .verified-badge {
        flex-shrink: 0;
        width: 14px;
        height: 14px;
        color: var(--nxt1-color-primary, #007aff);
      }

      .item-subtitle {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, #636366);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item-type-badge {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary, #8e8e93);
        background: var(--nxt1-color-bg-secondary, rgba(0, 0, 0, 0.04));
        padding: 2px 8px;
        border-radius: 4px;
      }

      /* ── Footer ── */
      .dropdown-footer {
        border-top: 1px solid var(--nxt1-color-border, rgba(0, 0, 0, 0.06));
        padding: 4px;
      }

      .see-all-btn {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-primary, #007aff);
        transition: background-color 0.1s;
      }

      .see-all-btn:hover {
        background: var(--nxt1-color-bg-hover, rgba(0, 0, 0, 0.04));
      }

      .see-all-btn svg {
        flex-shrink: 0;
        width: 18px;
        height: 18px;
      }

      .see-all-btn span {
        flex: 1;
      }

      .see-all-btn strong {
        font-weight: 600;
      }

      .see-all-arrow {
        color: var(--nxt1-color-text-quaternary, #c7c7cc);
      }

      /* ── Empty State ── */
      .dropdown-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 24px 16px;
        text-align: center;
      }

      .empty-icon {
        width: 32px;
        height: 32px;
        color: var(--nxt1-color-text-quaternary, #c7c7cc);
        margin-bottom: 4px;
      }

      .empty-text {
        margin: 0;
        font-size: 14px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #1c1c1e);
      }

      .empty-text strong {
        font-weight: 600;
      }

      .empty-hint {
        margin: 0;
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, #8e8e93);
      }

      /* ── Loading Skeleton ── */
      .dropdown-loading {
        padding: 8px 0;
      }

      .skeleton-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 16px;
      }

      .skeleton-avatar {
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--nxt1-color-bg-skeleton, rgba(0, 0, 0, 0.06));
        animation: shimmer 1.5s ease-in-out infinite;
      }

      .skeleton-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .skeleton-line {
        height: 12px;
        border-radius: 6px;
        background: var(--nxt1-color-bg-skeleton, rgba(0, 0, 0, 0.06));
        animation: shimmer 1.5s ease-in-out infinite;
      }

      .skeleton-line--name {
        width: 60%;
        animation-delay: 0.1s;
      }

      .skeleton-line--subtitle {
        width: 40%;
        animation-delay: 0.2s;
      }

      @keyframes shimmer {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.4;
        }
      }

      /* ── Scrollbar styling ── */
      .search-dropdown::-webkit-scrollbar {
        width: 6px;
      }

      .search-dropdown::-webkit-scrollbar-track {
        background: transparent;
      }

      .search-dropdown::-webkit-scrollbar-thumb {
        background: var(--nxt1-color-text-quaternary, #c7c7cc);
        border-radius: 3px;
      }

      .search-dropdown::-webkit-scrollbar-thumb:hover {
        background: var(--nxt1-color-text-tertiary, #8e8e93);
      }

      /* ── Dark mode ── */
      :host-context([data-theme='dark']) .search-dropdown,
      :host-context(.dark) .search-dropdown {
        background: var(--nxt1-color-bg-primary, #1c1c1e);
        border-color: var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        box-shadow:
          0 4px 24px rgba(0, 0, 0, 0.4),
          0 1px 4px rgba(0, 0, 0, 0.2);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSearchResultsDropdownComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly elementRef = inject(ElementRef);

  // ── Inputs ──
  /** Search results from ExploreService */
  readonly results = input<ExploreItem[]>([]);

  /** Current search query */
  readonly query = input('');

  /** Whether results are currently loading */
  readonly isLoading = input(false);

  /** Whether the dropdown should be visible */
  readonly open = input(false);

  /** Recent search queries */
  readonly recentSearches = input<string[]>([]);

  /** Trending search queries */
  readonly trendingSearches = input<string[]>([]);

  // ── Outputs ──
  /** Emitted when a search result is clicked */
  readonly resultClick = output<SearchDropdownResult>();

  /** Emitted when a suggestion (recent/trending) is clicked */
  readonly suggestionClick = output<string>();

  /** Emitted when "See all results" is clicked */
  readonly seeAllClick = output<string>();

  /** Emitted when dismiss is requested (Escape key or click outside) */
  readonly dismissClick = output<void>();

  /** Emitted when "Clear" recent searches is clicked */
  readonly clearRecentClick = output<void>();

  // ── Internal State ──
  /** Currently focused item index for keyboard nav */
  readonly focusedIndex = signal(-1);

  /** Skeleton items for loading state */
  readonly skeletonItems = [1, 2, 3, 4];

  /** SVG icon path data */
  readonly iconPaths = ICON_PATHS;

  // ── Computed ──

  /** Whether there's an active search query */
  readonly hasQuery = computed(() => this.query().trim().length >= 2);

  /** Whether the dropdown is visible */
  readonly isVisible = computed(() => this.open());

  /** Group results by type for categorized display */
  readonly groupedResults = computed(() => {
    const items = this.results();
    if (!items.length) return [];

    // Group by type
    const groups = new Map<string, { items: SearchDropdownResult[]; totalCount: number }>();

    for (const item of items) {
      const type = item.type;
      if (!groups.has(type)) {
        groups.set(type, { items: [], totalCount: 0 });
      }
      const group = groups.get(type)!;
      group.totalCount++;

      // Limit per category
      if (group.items.length < MAX_PER_CATEGORY) {
        group.items.push(this.toDropdownResult(item));
      }
    }

    // Sort categories: athletes first, then teams, colleges, videos
    const order = ['athletes', 'teams', 'colleges', 'videos'];
    return order
      .filter((type) => groups.has(type))
      .map((type) => ({
        type,
        items: groups.get(type)!.items,
        totalCount: groups.get(type)!.totalCount,
      }));
  });

  /** Total number of navigable items (for keyboard nav) */
  private readonly totalItems = computed(() => {
    if (this.hasQuery()) {
      return this.groupedResults().reduce((sum, g) => sum + g.items.length, 0);
    }
    return this.recentSearches().length + this.trendingSearches().length;
  });

  // ── Click outside handler ──
  private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      this.setupClickOutside();
    });
  }

  ngOnDestroy(): void {
    this.removeClickOutside();
  }

  // ── Public Methods ──

  /**
   * Handle keyboard navigation within the dropdown.
   * Called from parent component's keydown handler.
   */
  handleKeydown(event: KeyboardEvent): boolean {
    if (!this.isVisible()) return false;

    const total = this.totalItems();
    if (total === 0 && event.key !== 'Escape') return false;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusedIndex.update((i) => (i + 1) % total);
        return true;

      case 'ArrowUp':
        event.preventDefault();
        this.focusedIndex.update((i) => (i <= 0 ? total - 1 : i - 1));
        return true;

      case 'Enter':
        event.preventDefault();
        this.selectFocusedItem();
        return true;

      case 'Escape':
        event.preventDefault();
        this.dismissClick.emit();
        return true;

      default:
        return false;
    }
  }

  /**
   * Reset keyboard focus when results change.
   */
  resetFocus(): void {
    this.focusedIndex.set(-1);
  }

  // ── Template Helpers ──

  /** Get the display label for a result type */
  getTypeLabel(type: string): string {
    return TYPE_LABELS[type] ?? type;
  }

  /** Get the SVG icon path for a result type */
  getTypeIconPath(type: string): string {
    const iconKey = TYPE_ICONS[type] ?? 'search';
    return ICON_PATHS[iconKey as keyof typeof ICON_PATHS] ?? ICON_PATHS.search;
  }

  /** Calculate the global index for a result item (for keyboard nav) */
  getGlobalIndex(type: string, localIndex: number): number {
    const groups = this.groupedResults();
    let offset = 0;
    for (const group of groups) {
      if (group.type === type) return offset + localIndex;
      offset += group.items.length;
    }
    return offset + localIndex;
  }

  /** Handle suggestion click */
  onSuggestionClick(query: string): void {
    this.suggestionClick.emit(query);
  }

  /** Handle result click */
  onResultClick(result: SearchDropdownResult): void {
    this.resultClick.emit(result);
  }

  // ── Private Methods ──

  /** Convert an ExploreItem to a SearchDropdownResult */
  private toDropdownResult(item: ExploreItem): SearchDropdownResult {
    return {
      id: item.id,
      name: item.name,
      subtitle: this.getItemSubtitle(item),
      imageUrl: item.imageUrl,
      type: item.type,
      route: item.route,
      isVerified: item.isVerified,
    };
  }

  /** Get a human-readable subtitle for an explore item */
  private getItemSubtitle(item: ExploreItem): string {
    switch (item.type) {
      case 'athletes':
        return [item.sport, item.position, item.location].filter(Boolean).join(' · ');
      case 'teams':
        return [item.sport, item.location].filter(Boolean).join(' · ');
      case 'colleges':
        return [item.division, item.location].filter(Boolean).join(' · ');
      case 'videos':
        return item.subtitle ?? item.name;
    }
  }

  /** Select the currently focused item */
  private selectFocusedItem(): void {
    const idx = this.focusedIndex();
    if (idx < 0) return;

    if (this.hasQuery()) {
      // Navigate grouped results
      const groups = this.groupedResults();
      let offset = 0;
      for (const group of groups) {
        if (idx < offset + group.items.length) {
          this.onResultClick(group.items[idx - offset]);
          return;
        }
        offset += group.items.length;
      }
    } else {
      // Navigate suggestions
      const recent = this.recentSearches();
      if (idx < recent.length) {
        this.onSuggestionClick(recent[idx]);
        return;
      }
      const trendingIdx = idx - recent.length;
      const trending = this.trendingSearches();
      if (trendingIdx < trending.length) {
        this.onSuggestionClick(trending[trendingIdx]);
      }
    }
  }

  /** Set up click-outside handler */
  private setupClickOutside(): void {
    this.clickOutsideHandler = (event: MouseEvent) => {
      if (!this.isVisible()) return;
      const target = event.target as HTMLElement;
      if (!this.elementRef.nativeElement.contains(target)) {
        this.dismissClick.emit();
      }
    };
    document.addEventListener('mousedown', this.clickOutsideHandler);
  }

  /** Remove click-outside handler */
  private removeClickOutside(): void {
    if (this.clickOutsideHandler) {
      document.removeEventListener('mousedown', this.clickOutsideHandler);
      this.clickOutsideHandler = null;
    }
  }
}
