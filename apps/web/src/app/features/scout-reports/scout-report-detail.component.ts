/**
 * @fileoverview Scout Report Detail Page Component (Web)
 * @module apps/web/features/scout-reports
 * @version 1.0.0
 *
 * Detail view for a single scout report.
 * SSR-enabled for SEO benefits on individual athlete pages.
 *
 * Features:
 * - Full athlete profile display
 * - Rating breakdown by category
 * - Video highlights (placeholder)
 * - Share/Bookmark actions
 * - Related athletes
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import {
  ScoutReportsService,
  ScoutReportRatingDisplayComponent,
  ScoutReportQuickStatsComponent,
  ScoutReportBookmarkButtonComponent,
  ScoutReportPremiumBadgeComponent,
  ScoutReportDetailSkeletonComponent,
  type QuickStatItem,
} from '@nxt1/ui/scout-reports';
import { formatViewCount, formatGradYear, getRatingTier } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AnalyticsService } from '../../core/services';

@Component({
  selector: 'app-scout-report-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ScoutReportDetailSkeletonComponent,
    ScoutReportRatingDisplayComponent,
    ScoutReportQuickStatsComponent,
    ScoutReportBookmarkButtonComponent,
    ScoutReportPremiumBadgeComponent,
  ],
  template: `
    <!-- Header -->
    <header class="detail-header">
      <div class="detail-toolbar">
        <a
          routerLink="/scout-reports"
          class="detail-toolbar__back-btn"
          aria-label="Back to scout reports"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </a>
        <span class="detail-toolbar__title">Scout Report</span>
        <div class="detail-toolbar__end">
          <button
            type="button"
            class="detail-toolbar__icon-btn"
            (click)="onShare()"
            aria-label="Share"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
              <path
                d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
              />
            </svg>
          </button>
          @if (report()) {
            <nxt1-scout-report-bookmark-button
              [isBookmarked]="report()!.isBookmarked"
              (toggle)="onBookmark()"
            />
          }
        </div>
      </div>
    </header>

    <main class="detail-content">
      @if (isLoading()) {
        <!-- Loading Skeleton (shared from @nxt1/ui) -->
        <nxt1-scout-report-detail-skeleton />
      } @else if (report()) {
        <!-- Hero Section -->
        <div class="detail-hero">
          <div class="detail-hero__image-container">
            @if (report()!.athlete.photoUrl) {
              <img
                [src]="report()!.athlete.photoUrl"
                [alt]="report()!.athlete.name"
                class="detail-hero__image"
              />
            } @else {
              <div class="detail-hero__placeholder">
                <svg
                  viewBox="0 0 24 24"
                  width="80"
                  height="80"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  />
                </svg>
              </div>
            }
            <div class="detail-hero__overlay"></div>

            <!-- Premium Badge -->
            @if (report()!.isPremium) {
              <nxt1-scout-report-premium-badge
                class="detail-hero__premium"
                [variant]="'gold'"
                [showLabel]="true"
              />
            }
          </div>

          <!-- Athlete Info -->
          <div class="detail-hero__info">
            <h1 class="detail-hero__name">
              {{ report()!.athlete.name }}
            </h1>
            <div class="detail-hero__meta">
              <span class="detail-hero__position">{{ report()!.athlete.position }}</span>
              <span class="detail-hero__divider">•</span>
              <span class="detail-hero__school">{{
                report()!.athlete.school ?? 'Unknown School'
              }}</span>
            </div>
            <div class="detail-hero__location">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                />
              </svg>
              {{ report()!.athlete.location ?? 'Unknown' }},
              {{ report()!.athlete.state ?? 'Unknown' }}
            </div>
          </div>
        </div>

        <!-- Rating Section -->
        <div class="detail-section detail-rating">
          <div class="detail-rating__main">
            <nxt1-scout-report-rating-display
              [rating]="report()!.rating.overall"
              [showStars]="true"
              [showTier]="true"
              [size]="'large'"
            />
          </div>
          <div class="detail-rating__tier">
            <span class="tier-label">{{ ratingTier() }}</span>
            <span class="tier-desc">Prospect</span>
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="detail-section">
          <h2 class="detail-section__title">Quick Stats</h2>
          <nxt1-scout-report-quick-stats [stats]="quickStats()" />
        </div>

        <!-- Rating Breakdown -->
        <div class="detail-section">
          <h2 class="detail-section__title">Rating Breakdown</h2>
          <div class="rating-breakdown">
            @for (category of ratingCategories(); track category.label) {
              <div class="rating-breakdown__item">
                <span class="rating-breakdown__label">{{ category.label }}</span>
                <div class="rating-breakdown__bar">
                  <div
                    class="rating-breakdown__fill"
                    [style.width.%]="category.value"
                    [style.background]="category.color"
                  ></div>
                </div>
                <span class="rating-breakdown__value">{{ category.value }}</span>
              </div>
            }
          </div>
        </div>

        <!-- Summary -->
        @if (report()!.summary) {
          <div class="detail-section">
            <h2 class="detail-section__title">Scout Summary</h2>
            <p class="detail-summary">{{ report()!.summary }}</p>
          </div>
        }

        <!-- Tags -->
        @if (report()!.tags && report()!.tags!.length > 0) {
          <div class="detail-section">
            <h2 class="detail-section__title">Tags</h2>
            <div class="detail-tags">
              @for (tag of report()!.tags; track tag) {
                <span class="detail-chip">{{ tag }}</span>
              }
            </div>
          </div>
        }
      } @else {
        <!-- Not Found -->
        <div class="detail-not-found">
          <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor" aria-hidden="true">
            <path
              d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
            />
          </svg>
          <h2>Report Not Found</h2>
          <p>This scout report may have been removed or is no longer available.</p>
          <a routerLink="/scout-reports" class="detail-browse-btn">Browse All Reports</a>
        </div>
      }
    </main>
  `,
  styles: [
    `
      /* ============================================
         HEADER & TOOLBAR
         ============================================ */

      .detail-header {
        position: sticky;
        top: 0;
        z-index: 10;
        background: var(--nxt1-color-background, #0f0f0f);
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
      }

      .detail-toolbar {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-4, 16px);
        min-height: 56px;
      }

      .detail-toolbar__back-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-full, 50%);
        color: var(--nxt1-color-text-primary);
        text-decoration: none;
        transition: background var(--nxt1-duration-fast, 150ms) ease;
      }

      .detail-toolbar__back-btn:hover {
        background: var(--nxt1-color-state-hover);
      }

      .detail-toolbar__title {
        flex: 1;
        font-size: 17px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .detail-toolbar__end {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .detail-toolbar__icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border: none;
        border-radius: var(--nxt1-radius-full, 50%);
        background: transparent;
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        transition: background var(--nxt1-duration-fast, 150ms) ease;
      }

      .detail-toolbar__icon-btn:hover {
        background: var(--nxt1-color-state-hover);
      }

      /* ============================================
         CONTENT
         ============================================ */

      .detail-content {
        background-color: var(--nxt1-color-background, #0f0f0f);
      }

      /* ============================================
         HERO SECTION
         ============================================ */

      .detail-hero {
        position: relative;
      }

      .detail-hero__image-container {
        position: relative;
        height: 300px;
        overflow: hidden;
      }

      .detail-hero__image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .detail-hero__placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface, #1a1a1a);
        color: var(--nxt1-color-text-tertiary);
      }

      .detail-hero__overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 150px;
        background: linear-gradient(to top, var(--nxt1-color-background), transparent);
      }

      .detail-hero__premium {
        position: absolute;
        top: 16px;
        right: 16px;
      }

      .detail-hero__info {
        padding: var(--nxt1-spacing-4, 16px);
        margin-top: -60px;
        position: relative;
        z-index: 1;
      }

      .detail-hero__name {
        margin: 0;
        font-size: 28px;
        font-weight: 800;
        color: var(--nxt1-color-text-primary);
        letter-spacing: -0.02em;
      }

      .detail-hero__meta {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        margin-top: var(--nxt1-spacing-1, 4px);
        font-size: 16px;
        color: var(--nxt1-color-text-secondary);
      }

      .detail-hero__position {
        font-weight: 600;
        color: var(--nxt1-color-primary);
      }

      .detail-hero__divider {
        color: var(--nxt1-color-text-tertiary);
      }

      .detail-hero__location {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        margin-top: var(--nxt1-spacing-2, 8px);
        font-size: 14px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         SECTIONS
         ============================================ */

      .detail-section {
        padding: var(--nxt1-spacing-4, 16px);
        border-top: 1px solid var(--nxt1-color-border);
      }

      .detail-section__title {
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        font-size: 16px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* ============================================
         RATING SECTION
         ============================================ */

      .detail-rating {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--nxt1-color-surface);
        border-radius: var(--nxt1-radius-lg);
      }

      .detail-rating__tier {
        text-align: right;
      }

      .tier-label {
        display: block;
        font-size: 18px;
        font-weight: 700;
        color: var(--nxt1-color-primary);
      }

      .tier-desc {
        display: block;
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* ============================================
         RATING BREAKDOWN
         ============================================ */

      .rating-breakdown {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .rating-breakdown__item {
        display: grid;
        grid-template-columns: 100px 1fr 40px;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .rating-breakdown__label {
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
      }

      .rating-breakdown__bar {
        height: 8px;
        background: var(--nxt1-color-surface-elevated);
        border-radius: var(--nxt1-radius-full);
        overflow: hidden;
      }

      .rating-breakdown__fill {
        height: 100%;
        border-radius: inherit;
        transition: width 0.5s ease-out;
      }

      .rating-breakdown__value {
        font-size: 14px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        text-align: right;
      }

      /* ============================================
         SUMMARY
         ============================================ */

      .detail-summary {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        color: var(--nxt1-color-text-secondary);
      }

      /* ============================================
         TAGS
         ============================================ */

      .detail-tags {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .detail-chip {
        display: inline-flex;
        align-items: center;
        padding: var(--nxt1-spacing-1, 4px) var(--nxt1-spacing-3, 12px);
        background: var(--nxt1-color-surface-elevated, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
      }

      /* ============================================
         NOT FOUND
         ============================================ */

      .detail-not-found {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8, 32px);
        text-align: center;
        min-height: 400px;
        color: var(--nxt1-color-text-tertiary);

        svg {
          margin-bottom: var(--nxt1-spacing-4, 16px);
        }

        h2 {
          margin: 0 0 var(--nxt1-spacing-2, 8px);
          color: var(--nxt1-color-text-primary);
        }

        p {
          margin: 0 0 var(--nxt1-spacing-4, 16px);
          color: var(--nxt1-color-text-secondary);
        }
      }

      .detail-browse-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        border-radius: var(--nxt1-radius-md, 8px);
        font-family: var(--nxt1-fontFamily-brand);
        font-weight: 600;
        text-decoration: none;
        transition: background var(--nxt1-duration-fast, 150ms) ease;
      }

      .detail-browse-btn:hover {
        background: var(--nxt1-color-primaryDark);
        color: var(--nxt1-color-text-onPrimary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ScoutReportsService);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly analytics = inject(AnalyticsService);

  /** Current report */
  protected readonly report = this.service.selectedReport;

  /** Loading state */
  protected readonly isLoading = signal(true);

  /** Rating tier label */
  protected readonly ratingTier = computed(() => {
    const r = this.report();
    if (!r) return '';
    return getRatingTier(r.rating.overall);
  });

  /** Quick stats array */
  protected readonly quickStats = computed<QuickStatItem[]>(() => {
    const r = this.report();
    if (!r) return [];

    return [
      { icon: 'calendar-outline', label: 'Class', value: formatGradYear(r.athlete.gradYear) },
      { icon: 'eye-outline', label: 'Views', value: formatViewCount(r.viewCount) },
      { icon: 'trophy-outline', label: 'Rating', value: r.rating.overall.toFixed(1) },
      { icon: 'school-outline', label: 'Sport', value: r.athlete.sport },
    ];
  });

  /** Rating categories for breakdown - scale 1-5 to 0-100 for display */
  protected readonly ratingCategories = computed(() => {
    const r = this.report();
    if (!r) return [];

    const scaleRating = (value: number): number => Math.round((value / 5) * 100);
    const getRatingColor = (value: number): string => {
      if (value >= 90) return 'var(--nxt1-color-success)';
      if (value >= 80) return 'var(--nxt1-color-primary)';
      if (value >= 70) return 'var(--nxt1-color-warning)';
      return 'var(--nxt1-color-error)';
    };

    return [
      {
        label: 'Physical',
        value: scaleRating(r.rating.physical),
        color: getRatingColor(scaleRating(r.rating.physical)),
      },
      {
        label: 'Technical',
        value: scaleRating(r.rating.technical),
        color: getRatingColor(scaleRating(r.rating.technical)),
      },
      {
        label: 'Mental',
        value: scaleRating(r.rating.mental),
        color: getRatingColor(scaleRating(r.rating.mental)),
      },
      {
        label: 'Potential',
        value: scaleRating(r.rating.potential),
        color: getRatingColor(scaleRating(r.rating.potential)),
      },
    ];
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadReport(id);
    } else {
      this.router.navigate(['/scout-reports']);
    }
  }

  /**
   * Load report by ID.
   */
  private async loadReport(id: string): Promise<void> {
    this.isLoading.set(true);

    try {
      await this.service.loadReport(id);

      const r = this.report();
      if (r) {
        // Update page title and meta
        this.title.setTitle(`${r.athlete.name} Scout Report | NXT1`);
        this.meta.updateTag({
          name: 'description',
          content: `Scout report for ${r.athlete.name}, ${r.athlete.position} from ${r.athlete.school ?? 'Unknown School'}. Overall rating: ${r.rating.overall}.`,
        });
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Toggle bookmark.
   */
  protected onBookmark(): void {
    const r = this.report();
    if (r) {
      this.service.toggleBookmark(r.id);
    }
  }

  /**
   * Share report.
   */
  protected async onShare(): Promise<void> {
    const r = this.report();
    if (!r) return;

    const shareData = {
      title: `${r.athlete.name} Scout Report`,
      text: `Check out this scout report on NXT1!`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        this.analytics.trackShare('scout_report', r.id, 'native_share', {
          athlete_name: r.athlete.name,
        });
      } catch {
        // User cancelled or error
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(window.location.href);
      this.analytics.trackShare('scout_report', r.id, 'clipboard', {
        athlete_name: r.athlete.name,
      });
    }
  }
}
