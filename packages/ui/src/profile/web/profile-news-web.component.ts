/**
 * @fileoverview Profile News Web Component
 * @module @nxt1/ui/profile/web
 * @version 3.0.0
 *
 * Profile-contextual news section for the athlete profile page.
 * Displays news articles in a responsive 2-column grid using the shared
 * NxtContentCardWebComponent for consistent glass-morphism card design.
 *
 * Uses mock data for development. SSR-safe: renders content immediately
 * on the server for SEO crawlers; shimmer skeleton is browser-only on
 * first mount. Design-token CSS only (no Tailwind, no Ionic).
 *
 * Features:
 * - Responsive article card grid (1 → 2 columns)
 * - Shared glass card shell (hero image, title, excerpt, source pill, meta)
 * - Shimmer skeleton loader (design-system consistent, browser-only)
 * - Section-aware filtering (All News, Announcements, Media Mentions)
 * - Accessible empty states per section
 * - Full keyboard navigation (Enter / Space activation)
 * - Reduced motion support
 *
 * ⭐ WEB ONLY — SSR-optimized, zero Ionic ⭐
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
import { NxtIconComponent } from '../../components/icon';
import { type NewsArticle } from '@nxt1/core';
import { NewsApiService } from '../../news/news-api.service';
import { NxtContentCardWebComponent } from '../../components/content-card';

type ProfileNewsSectionId = 'all-news' | 'announcements' | 'media-mentions';

/** Number of skeleton placeholder cards (2×2 grid). */
const SKELETON_SLOTS = [1, 2, 3, 4] as const;

// ============================================
// HELPERS (pure, zero dependencies)
// ============================================

/** Relative time label: "3m ago", "2h ago", "1d ago" */
function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Module-level flag — browser-only.
 * Ensures the shimmer skeleton only shows on the very first mount across all instances.
 * Fetch still happens on every mount; this only suppresses the skeleton on re-visits.
 */
let _skeletonShownOnce = false;

@Component({
  selector: 'nxt1-profile-news-web',
  standalone: true,
  imports: [NxtIconComponent, NxtContentCardWebComponent],
  template: `
    <section class="profile-news" aria-labelledby="news-heading">
      <h2 id="news-heading" class="sr-only">News</h2>

      <!-- ═══ Skeleton Loading State ═══ -->
      @if (isLoading()) {
        <div class="profile-news__grid" aria-busy="true" aria-label="Loading news articles">
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
      @else if (filteredArticles().length === 0) {
        <div class="profile-news__empty" role="status">
          <div class="profile-news__empty-icon" aria-hidden="true">
            <nxt1-icon name="newspaper" [size]="48" />
          </div>
          <h3 class="profile-news__empty-title">{{ emptyTitle() }}</h3>
          <p class="profile-news__empty-msg">{{ emptyMessage() }}</p>
        </div>
      }

      <!-- ═══ Article Grid ═══ -->
      @else {
        <div class="profile-news__grid">
          @for (article of filteredArticles(); track article.id) {
            <nxt1-content-card
              [imageUrl]="article.thumbnailUrl || article.heroImageUrl"
              [imageAlt]="article.title"
              [title]="article.title"
              [excerpt]="article.excerpt"
              [sourceAvatarUrl]="article.source.avatarUrl || ''"
              [sourceName]="article.source.name"
              [metaLeft]="getTimeAgo(article.publishedAt)"
              [metaRight]="article.readingTimeMinutes + 'm read'"
              [ctaLabel]="'Read Article'"
              [ariaLabel]="article.title"
              (cardClick)="onArticleClick(article)"
            />
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      /* ============================================
       PROFILE NEWS — Web (Pure CSS / Design Tokens)
       Grid layout + skeleton + empty state.
       Card rendering delegated to shared NxtContentCardWebComponent.
       ============================================ */

      :host {
        display: block;
      }

      .profile-news {
        display: flex;
        flex-direction: column;
      }

      /* ── Article Grid (1 col → 2 col) ── */

      .profile-news__grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-4, 16px);
      }

      @media (min-width: 640px) {
        .profile-news__grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* ── Empty State ── */

      .profile-news__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-12, 48px) var(--nxt1-spacing-6, 24px);
        text-align: center;
      }

      .profile-news__empty-icon {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
        margin-bottom: var(--nxt1-spacing-1, 4px);
      }

      .profile-news__empty-title {
        font-size: var(--nxt1-font-size-lg, 18px);
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0;
      }

      .profile-news__empty-msg {
        font-size: var(--nxt1-font-size-sm, 14px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        max-width: 360px;
        margin: 0;
        line-height: 1.5;
      }

      /* ============================================
       SKELETON — Canonical Shimmer Gradient
       Uses @nxt1/design-tokens skeleton tokens.
       ============================================ */

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
export class ProfileNewsWebComponent implements OnInit {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  // ============================================
  // INPUTS
  // ============================================

  /** Active side section from profile shell (all-news | announcements | media-mentions) */
  readonly activeSection = input<string>('all-news');

  /** User ID whose news sub-collection to load. When null, falls back to global feed. */
  readonly userId = input<string | null>(null);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when an article card is clicked. */
  readonly articleClick = output<NewsArticle>();

  // ============================================
  // STATE
  // ============================================

  /**
   * Loading state — false on server (SSR renders content for SEO crawlers).
   * True on the very first browser mount only (skeleton suppressed on re-visits).
   */
  readonly isLoading = signal(!_skeletonShownOnce && isPlatformBrowser(this.platformId));

  /** Skeleton placeholder slot count. */
  readonly skeletonSlots = SKELETON_SLOTS;

  // ============================================
  // COMPUTED
  // ============================================

  private readonly newsApi = inject(NewsApiService);

  /** Populated after the first API fetch. */
  private readonly allArticles = signal<readonly NewsArticle[]>([]);

  private readonly normalizedSection = computed((): ProfileNewsSectionId => {
    const section = this.activeSection();
    if (section === 'announcements' || section === 'media-mentions') return section;
    return 'all-news';
  });

  /** Section-aware filtered article list. */
  readonly filteredArticles = computed((): readonly NewsArticle[] => {
    const section = this.normalizedSection();
    const articles = this.allArticles();

    if (section === 'announcements') {
      return articles.filter((a) => a.source.type === 'editorial' || a.source.type === 'ai-agent');
    }

    if (section === 'media-mentions') {
      return articles.filter((a) => a.source.type === 'syndicated');
    }

    return articles;
  });

  readonly emptyTitle = computed((): string => {
    const section = this.normalizedSection();
    if (section === 'announcements') return 'No announcements yet';
    if (section === 'media-mentions') return 'No media mentions yet';
    return 'No news yet';
  });

  readonly emptyMessage = computed((): string => {
    const section = this.normalizedSection();
    if (section === 'announcements') {
      return 'NXT 1 announcements and official updates will appear here.';
    }
    if (section === 'media-mentions') {
      return 'Media mentions from outlets like ESPN, Rivals, and other external brands will appear here.';
    }
    return 'News updates, announcements, and media mentions will appear here.';
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const uid = this.userId();
    const timer = setTimeout(() => {
      const fetch = uid ? this.newsApi.getUserNews(uid) : this.newsApi.getFeed();

      fetch
        .then((response) => {
          if (response.success && response.data) {
            this.allArticles.set(response.data);
          }
        })
        .catch(() => {
          // leave empty — show empty state instead of crashing
        })
        .finally(() => {
          _skeletonShownOnce = true;
          this.isLoading.set(false);
        });
    }, 300);

    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onArticleClick(article: NewsArticle): void {
    this.articleClick.emit(article);
  }

  // ============================================
  // TEMPLATE HELPERS
  // ============================================

  getTimeAgo(isoDate: string): string {
    return timeAgo(isoDate);
  }
}
