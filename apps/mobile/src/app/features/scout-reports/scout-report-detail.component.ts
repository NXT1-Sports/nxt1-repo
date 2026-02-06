/**
 * @fileoverview Scout Report Detail Page Component (Mobile)
 * @module apps/mobile/features/scout-reports
 * @version 1.0.0
 *
 * Detail view for a single scout report on mobile.
 * Uses Ionic components for native iOS/Android feel.
 *
 * Features:
 * - Full athlete profile display
 * - Rating breakdown by category
 * - Native share sheet
 * - Haptic feedback
 * - Smooth page transitions
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
import { ActivatedRoute } from '@angular/router';
import { NavController } from '@ionic/angular/standalone';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonBackButton,
  IonIcon,
  IonChip,
  IonLabel,
} from '@ionic/angular/standalone';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  bookmarkOutline,
  bookmark,
  shareOutline,
  locationOutline,
  schoolOutline,
  calendarOutline,
  trophyOutline,
  personOutline,
  eyeOutline,
} from 'ionicons/icons';
import {
  ScoutReportsService,
  ScoutReportRatingDisplayComponent,
  ScoutReportQuickStatsComponent,
  ScoutReportBookmarkButtonComponent,
  ScoutReportPremiumBadgeComponent,
  ScoutReportDetailSkeletonComponent,
  type QuickStatItem,
} from '@nxt1/ui';
import { formatViewCount, formatGradYear, getRatingTier } from '@nxt1/core';

// Register icons
addIcons({
  arrowBackOutline,
  bookmarkOutline,
  bookmark,
  shareOutline,
  locationOutline,
  schoolOutline,
  calendarOutline,
  trophyOutline,
  personOutline,
  eyeOutline,
});

@Component({
  selector: 'app-scout-report-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonBackButton,
    IonIcon,
    IonChip,
    IonLabel,
    ScoutReportDetailSkeletonComponent,
    ScoutReportRatingDisplayComponent,
    ScoutReportQuickStatsComponent,
    ScoutReportBookmarkButtonComponent,
    ScoutReportPremiumBadgeComponent,
  ],
  template: `
    <!-- Header -->
    <ion-header [translucent]="true">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/scout-reports"></ion-back-button>
        </ion-buttons>
        <ion-title>Scout Report</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="onShare()">
            <ion-icon name="share-outline" slot="icon-only"></ion-icon>
          </ion-button>
          @if (report()) {
            <nxt1-scout-report-bookmark-button
              [isBookmarked]="report()!.isBookmarked"
              (toggle)="onBookmark()"
            />
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true" class="detail-content">
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
                <ion-icon name="person-outline"></ion-icon>
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
              <ion-icon name="location-outline"></ion-icon>
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
                <ion-chip>
                  <ion-label>{{ tag }}</ion-label>
                </ion-chip>
              }
            </div>
          </div>
        }
      } @else {
        <!-- Not Found -->
        <div class="detail-not-found">
          <ion-icon name="document-text-outline"></ion-icon>
          <h2>Report Not Found</h2>
          <p>This scout report may have been removed or is no longer available.</p>
          <ion-button (click)="navigateBack()"> Browse All Reports </ion-button>
        </div>
      }
    </ion-content>
  `,
  styles: [
    `
      /* Same styles as web version - shared design tokens */

      .detail-content {
        --background: var(--nxt1-color-background, #0f0f0f);
      }

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

        ion-icon {
          font-size: 80px;
          color: var(--nxt1-color-text-tertiary);
        }
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

        ion-icon {
          font-size: 16px;
        }
      }

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

      .detail-summary {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        color: var(--nxt1-color-text-secondary);
      }

      .detail-tags {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .detail-not-found {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8, 32px);
        text-align: center;
        min-height: 400px;

        ion-icon {
          font-size: 64px;
          color: var(--nxt1-color-text-tertiary);
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly navController = inject(NavController);
  private readonly service = inject(ScoutReportsService);

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
      this.navigateBack();
    }
  }

  /**
   * Load report by ID.
   */
  private async loadReport(id: string): Promise<void> {
    this.isLoading.set(true);

    try {
      await this.service.loadReport(id);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Navigate back.
   */
  protected navigateBack(): void {
    this.navController.navigateBack('/scout-reports');
  }

  /**
   * Toggle bookmark with haptic feedback.
   */
  protected async onBookmark(): Promise<void> {
    const r = this.report();
    if (r) {
      await Haptics.impact({ style: ImpactStyle.Light });
      this.service.toggleBookmark(r.id);
    }
  }

  /**
   * Share report using native share sheet.
   */
  protected async onShare(): Promise<void> {
    const r = this.report();
    if (!r) return;

    await Haptics.impact({ style: ImpactStyle.Light });

    try {
      await Share.share({
        title: `${r.athlete.name} Scout Report`,
        text: `Check out this scout report on NXT1!`,
        url: `https://nxt1.com/scout-reports/${r.id}`,
        dialogTitle: 'Share Scout Report',
      });
    } catch {
      // User cancelled
    }
  }
}
