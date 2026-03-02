/**
 * @fileoverview News Board Component — Shared News Section
 * @module @nxt1/ui/components/news-board
 * @version 2.0.0
 *
 * Unified news section shared between athlete profile and team profile.
 * Displays `NewsArticle[]` in a responsive 2-column grid using the
 * shared `NewsArticleCardComponent`.
 *
 * Fully input-driven — no service injection. Shells pass their
 * `NewsArticle[]` directly as an input.
 *
 * Features:
 * - Responsive article card grid (1 → 2 columns at 640 px)
 * - Shimmer skeleton loader (design-system consistent, browser-only)
 * - Accessible empty states per section
 * - Full keyboard navigation (Enter / Space activation)
 * - Reduced motion support
 *
 * ⭐ WEB + MOBILE — SSR-optimised, zero Ionic ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
  input,
  signal,
  computed,
  OnInit,
  output,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NxtIconComponent } from '../icon';
import { NewsArticleCardComponent } from '../../news/news-article-card.component';
import type { NewsArticle } from '@nxt1/core';

// ============================================
// CONSTANTS
// ============================================

type BoardSectionId = 'all-news' | 'announcements' | 'media-mentions';

/** Number of skeleton placeholder cards (2 × 2 grid). */
const SKELETON_SLOTS = [1, 2, 3, 4] as const;

// ============================================
// HELPERS (pure, zero dependencies)
// ============================================

/** Relative time label: "Just now", "3m ago", "2h ago", "1d ago", "Jan 15". */
function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Keep timeAgo available for potential future use in skeleton or empty states
void timeAgo;

/**
 * Module-level flag — browser-only.
 * Ensures the shimmer skeleton only shows on the very first mount.
 */
let _hasLoadedOnce = false;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-news-board',
  standalone: true,
  imports: [NxtIconComponent, NewsArticleCardComponent],
  template: `
    <section class="news-board" aria-labelledby="news-board-heading">
      <h2 id="news-board-heading" class="sr-only">News</h2>

      <!-- ═══ Skeleton Loading State ═══ -->
      @if (isLoading()) {
        <div class="news-board__grid" aria-busy="true" aria-label="Loading news articles">
          @for (i of skeletonSlots; track i) {
            <div class="news-skel" role="presentation">
              <div class="news-skel__image skeleton-animate"></div>
              <div class="news-skel__body">
                <div class="news-skel__chip skeleton-animate"></div>
                <div class="news-skel__title skeleton-animate"></div>
                <div class="news-skel__title news-skel__title--short skeleton-animate"></div>
                <div class="news-skel__excerpt skeleton-animate"></div>
                <div class="news-skel__excerpt news-skel__excerpt--short skeleton-animate"></div>
                <div class="news-skel__meta">
                  <div class="news-skel__avatar skeleton-animate"></div>
                  <div class="news-skel__meta-text skeleton-animate"></div>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- ═══ Empty State ═══ -->
      @else if (filteredItems().length === 0) {
        <div class="news-board__empty" role="status">
          <div class="news-board__empty-icon" aria-hidden="true">
            <nxt1-icon name="newspaper-outline" [size]="40" />
          </div>
          <h3 class="news-board__empty-title">{{ emptyTitle() }}</h3>
          <p class="news-board__empty-msg">{{ emptyMsg() }}</p>
        </div>
      }

      <!-- ═══ Article Grid ═══ -->
      @else {
        <div class="news-board__grid">
          @for (item of filteredItems(); track item.id) {
            <nxt1-news-article-card [article]="item" (articleClick)="onItemClick(item)" />
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════════════
         NEWS BOARD — Shared News Section
         Responsive 2-col grid + glass card skeleton + empty states.
         Card rendering delegated to NewsArticleCardComponent.
         Design-token CSS only. SSR-safe.
         ═══════════════════════════════════════════════════════════ */

      :host {
        display: block;
      }

      .news-board {
        display: flex;
        flex-direction: column;
      }

      /* ── Article Grid (1 col → 2 col) ── */

      .news-board__grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-4, 16px);
      }

      @media (min-width: 640px) {
        .news-board__grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* ── Empty State ── */

      .news-board__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-12, 48px) var(--nxt1-spacing-6, 24px);
        text-align: center;
      }

      .news-board__empty-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.4));
      }

      .news-board__empty-title {
        font-size: var(--nxt1-font-size-lg, 18px);
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0;
      }

      .news-board__empty-msg {
        font-size: var(--nxt1-font-size-sm, 14px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        max-width: 360px;
        margin: 0;
        line-height: 1.5;
      }

      /* ═══════════════════════════════════════════════════════════
         SKELETON — Canonical Shimmer Gradient
         Uses @nxt1/design-tokens skeleton tokens.
         ═══════════════════════════════════════════════════════════ */

      .skeleton-animate {
        background: var(
          --nxt1-skeleton-gradient,
          linear-gradient(
            90deg,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 25%,
            var(--nxt1-color-loading-skeletonShimmer, rgba(255, 255, 255, 0.15)) 50%,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 75%
          )
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer var(--nxt1-skeleton-animation-duration, 1.5s)
          var(--nxt1-skeleton-animation-timing, ease-in-out) infinite;
      }

      @keyframes skeleton-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .skeleton-animate {
          animation: none;
          background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08));
        }
      }

      /* ── Skeleton Card ── */

      .news-skel {
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--nxt1-glass-bg, rgba(20, 20, 20, 0.88));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        border: 1px solid var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        box-shadow: var(--nxt1-glass-shadowInner, inset 0 1px 0 rgba(255, 255, 255, 0.06));
        overflow: hidden;
      }

      .news-skel__image {
        aspect-ratio: 16 / 9;
        border-radius: 0;
      }

      .news-skel__body {
        padding: var(--nxt1-spacing-3, 12px);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .news-skel__chip {
        width: 64px;
        height: var(--nxt1-skeleton-height-sm, 16px);
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .news-skel__title {
        width: 92%;
        height: var(--nxt1-skeleton-height-sm, 16px);
        border-radius: var(--nxt1-skeleton-radius-sm, var(--nxt1-radius-sm, 4px));
      }

      .news-skel__title--short {
        width: 58%;
      }

      .news-skel__excerpt {
        width: 100%;
        height: var(--nxt1-skeleton-height-xs, 12px);
        border-radius: var(--nxt1-skeleton-radius-sm, var(--nxt1-radius-sm, 4px));
      }

      .news-skel__excerpt--short {
        width: 72%;
      }

      .news-skel__meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        margin-top: var(--nxt1-spacing-1, 4px);
        padding-top: var(--nxt1-spacing-2, 8px);
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.04));
      }

      .news-skel__avatar {
        width: 20px;
        height: 20px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
      }

      .news-skel__meta-text {
        width: 80px;
        height: var(--nxt1-skeleton-height-xs, 12px);
        border-radius: var(--nxt1-skeleton-radius-sm, var(--nxt1-radius-sm, 4px));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsBoardComponent implements OnInit {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  // ============================================
  // INPUTS
  // ============================================

  /** All news items (pre-mapped by the shell). */
  readonly items = input<readonly NewsArticle[]>([]);

  /** Active side-tab section from profile / team shell. */
  readonly activeSection = input<string>('all-news');

  /**
   * Contextual entity name used in empty-state messaging.
   * E.g. "Marcus", "Team", "St. Thomas Aquinas".
   */
  readonly entityName = input<string>('');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when a news card is clicked / activated via keyboard. */
  readonly itemClick = output<NewsArticle>();

  // ============================================
  // STATE
  // ============================================

  /**
   * Loading flag — `false` on server (SSR renders content for crawlers).
   * In the browser it is `true` only on the very first mount.
   */
  readonly isLoading = signal(!_hasLoadedOnce && isPlatformBrowser(this.platformId));

  /** Skeleton placeholder slot count. */
  readonly skeletonSlots = SKELETON_SLOTS;

  // ============================================
  // COMPUTED
  // ============================================

  private readonly normalizedSection = computed((): BoardSectionId => {
    const s = this.activeSection();
    if (s === 'announcements' || s === 'media-mentions') return s;
    return 'all-news';
  });

  /** Section-aware filtered item list. */
  readonly filteredItems = computed((): readonly NewsArticle[] => {
    const section = this.normalizedSection();
    const all = this.items();

    if (section === 'announcements') {
      return all.filter((i) => (i.category as string) === 'announcement');
    }
    if (section === 'media-mentions') {
      return all.filter((i) => (i.category as string) === 'media-mention');
    }
    return all;
  });

  readonly emptyTitle = computed((): string => {
    const section = this.normalizedSection();
    if (section === 'announcements') return 'No announcements yet';
    if (section === 'media-mentions') return 'No media mentions yet';
    return 'No news yet';
  });

  readonly emptyMsg = computed((): string => {
    const entity = this.entityName();
    const section = this.normalizedSection();

    if (section === 'announcements') {
      return entity
        ? `Announcements and official updates for ${entity} will appear here.`
        : 'NXT 1 announcements and official updates will appear here.';
    }
    if (section === 'media-mentions') {
      return entity
        ? `Media mentions and press coverage for ${entity} will appear here.`
        : 'Media mentions from outlets like ESPN, Rivals, and other external brands will appear here.';
    }
    return entity
      ? `News updates, announcements, and media mentions for ${entity} will appear here.`
      : 'News updates, announcements, and media mentions will appear here.';
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    if (_hasLoadedOnce || !isPlatformBrowser(this.platformId)) return;

    const timer = setTimeout(() => {
      _hasLoadedOnce = true;
      this.isLoading.set(false);
    }, 400);

    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onItemClick(item: NewsArticle): void {
    this.itemClick.emit(item);
  }
}
