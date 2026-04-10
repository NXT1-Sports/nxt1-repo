/**
 * @fileoverview Scout Report Card Component - Professional Athlete Card
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Premium athlete card displaying scout report information.
 * Professional design following Twitter/Instagram card patterns.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Athlete photo with aspect ratio preservation
 * - Rating display with tier color coding
 * - Position and graduation year chips
 * - Quick stats row
 * - Bookmark animation
 * - Premium badge indicator
 * - Verified badge
 * - XP reward indicator
 * - Hover/press effects
 * - Skeleton loading variant
 *
 * @example
 * ```html
 * <nxt1-scout-report-card
 *   [report]="report"
 *   [viewMode]="'grid'"
 *   (cardClick)="onCardClick(report)"
 *   (bookmark)="onBookmark(report.id)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  star,
  starOutline,
  starHalf,
  bookmark,
  bookmarkOutline,
  checkmarkCircle,
  diamond,
  diamondOutline,
  eye,
  flash,
  locationOutline,
  schoolOutline,
  trendingUp,
} from 'ionicons/icons';
import {
  type ScoutReport,
  type ScoutReportViewMode,
  getRatingColor,
  formatRating,
  calculateStars,
  formatGradYear,
  formatViewCount,
  formatRelativeTime,
  truncateSummary,
  SCOUT_REPORT_MAX_CARD_HIGHLIGHTS,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtImageComponent } from '../components/image';
import { NxtChipComponent } from '../components/chip';

// Register icons
@Component({
  selector: 'nxt1-scout-report-card',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, NxtImageComponent, NxtChipComponent],
  template: `
    <article
      class="scout-card"
      [class.scout-card--grid]="viewMode() === 'grid'"
      [class.scout-card--list]="viewMode() === 'list'"
      [class.scout-card--compact]="viewMode() === 'compact'"
      [class.scout-card--bookmarked]="report().isBookmarked"
      (click)="handleCardClick($event)"
      role="article"
      [attr.aria-label]="ariaLabel()"
    >
      <ion-ripple-effect></ion-ripple-effect>

      <!-- Card Image Section -->
      <div class="scout-card__image-container">
        <!-- Athlete Photo -->
        <nxt1-image
          [src]="report().athlete.photoUrl ?? ''"
          [alt]="report().athlete.name"
          variant="card"
          fit="cover"
          class="scout-card__image"
          [style.aspect-ratio]="'3/4'"
        />

        <!-- Badges Overlay -->
        <div class="scout-card__badges">
          @if (report().isVerified) {
            <div
              class="scout-card__badge scout-card__badge--verified"
              title="Verified Scout Report"
            >
              <ion-icon name="checkmark-circle"></ion-icon>
            </div>
          }
        </div>

        <!-- Bookmark Button -->
        <button
          type="button"
          class="scout-card__bookmark"
          [class.scout-card__bookmark--active]="report().isBookmarked"
          (click)="handleBookmark($event)"
          [attr.aria-label]="report().isBookmarked ? 'Remove from saved' : 'Save report'"
        >
          <ion-icon [name]="report().isBookmarked ? 'bookmark' : 'bookmark-outline'"></ion-icon>
        </button>

        <!-- Rating Badge -->
        <div class="scout-card__rating" [style.--rating-color]="ratingColor()">
          <span class="scout-card__rating-value">{{ formattedRating() }}</span>
          <div class="scout-card__rating-stars">
            @for (star of starStates(); track $index) {
              <ion-icon
                [name]="star === 'full' ? 'star' : star === 'half' ? 'star-half' : 'star-outline'"
                class="scout-card__star"
                [class.scout-card__star--filled]="star !== 'empty'"
              ></ion-icon>
            }
          </div>
        </div>

        <!-- XP Reward Indicator -->
        @if (!report().hasViewed && report().xpReward > 0) {
          <div class="scout-card__xp" title="Earn XP by viewing">
            <ion-icon name="flash"></ion-icon>
            <span>+{{ report().xpReward }} XP</span>
          </div>
        }
      </div>

      <!-- Card Content Section -->
      <div class="scout-card__content">
        <!-- Athlete Name -->
        <h3 class="scout-card__name">{{ report().athlete.name }}</h3>

        <!-- Position & Grad Year Chips -->
        <div class="scout-card__chips">
          <nxt1-chip size="sm">{{ report().athlete.position }}</nxt1-chip>
          <nxt1-chip size="sm">{{ shortGradYear() }}</nxt1-chip>
          @if (report().athlete.secondaryPosition) {
            <nxt1-chip size="sm">{{ report().athlete.secondaryPosition }}</nxt1-chip>
          }
        </div>

        <!-- School & Location -->
        @if (viewMode() !== 'compact') {
          <div class="scout-card__meta">
            @if (report().athlete.school) {
              <div class="scout-card__meta-item">
                <ion-icon name="school-outline"></ion-icon>
                <span>{{ report().athlete.school }}</span>
              </div>
            }
            @if (report().athlete.location) {
              <div class="scout-card__meta-item">
                <ion-icon name="location-outline"></ion-icon>
                <span>{{ report().athlete.location }}</span>
              </div>
            }
          </div>
        }

        <!-- Quick Stats -->
        @if (showQuickStats() && viewMode() !== 'compact') {
          <div class="scout-card__stats">
            @if (report().athlete.stats?.height) {
              <div class="scout-card__stat">
                <span class="scout-card__stat-value">{{ report().athlete.stats?.height }}</span>
                <span class="scout-card__stat-label">Height</span>
              </div>
            }
            @if (report().athlete.stats?.weight) {
              <div class="scout-card__stat">
                <span class="scout-card__stat-value">{{ report().athlete.stats?.weight }}</span>
                <span class="scout-card__stat-label">Weight</span>
              </div>
            }
            @if (report().athlete.stats?.fortyYard) {
              <div class="scout-card__stat">
                <span class="scout-card__stat-value">{{ report().athlete.stats?.fortyYard }}</span>
                <span class="scout-card__stat-label">40yd</span>
              </div>
            }
            @if (report().athlete.stats?.gpa) {
              <div class="scout-card__stat">
                <span class="scout-card__stat-value">{{ report().athlete.stats?.gpa }}</span>
                <span class="scout-card__stat-label">GPA</span>
              </div>
            }
          </div>
        }

        <!-- Summary Preview -->
        @if (viewMode() === 'list') {
          <p class="scout-card__summary">{{ truncatedSummary() }}</p>
        }

        <!-- Highlights Preview -->
        @if (viewMode() !== 'compact' && report().highlights.length > 0) {
          <div class="scout-card__highlights">
            @for (highlight of limitedHighlights(); track $index) {
              <div class="scout-card__highlight">
                <ion-icon name="trending-up"></ion-icon>
                <span>{{ highlight }}</span>
              </div>
            }
          </div>
        }

        <!-- Footer -->
        <div class="scout-card__footer">
          <div class="scout-card__views">
            <ion-icon name="eye"></ion-icon>
            <span>{{ formattedViewCount() }}</span>
          </div>
          <span class="scout-card__time">{{ relativeTime() }}</span>
        </div>
      </div>
    </article>
  `,
  styles: [
    `
      /* ============================================
         SCOUT REPORT CARD - Design System Tokens
         100% Theme Aware (Light + Dark Mode)
         ============================================ */

      :host {
        display: block;
      }

      .scout-card {
        position: relative;
        display: flex;
        flex-direction: column;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
        border: 1px solid var(--nxt1-color-border-secondary, rgba(255, 255, 255, 0.06));
        border-radius: var(--nxt1-radius-xl, 16px);
        overflow: hidden;
        cursor: pointer;
        transition: all 0.2s ease-out;
      }

      .scout-card:hover,
      .scout-card:focus-within {
        transform: translateY(-2px);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.05));
        border-color: var(--nxt1-color-border-primary, rgba(255, 255, 255, 0.1));
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }

      .scout-card:active {
        transform: scale(0.98);
      }

      /* Bookmarked state */
      .scout-card--bookmarked {
        border-color: var(--nxt1-color-primary, #3b82f6);
      }

      /* ============================================
         LIST VIEW LAYOUT
         ============================================ */

      .scout-card--list {
        flex-direction: row;
        height: auto;
        min-height: 180px;
      }

      .scout-card--list .scout-card__image-container {
        width: 140px;
        min-width: 140px;
        height: 100%;
      }

      .scout-card--list .scout-card__content {
        flex: 1;
        padding: var(--nxt1-spacing-4, 16px);
      }

      /* ============================================
         COMPACT VIEW LAYOUT
         ============================================ */

      .scout-card--compact {
        flex-direction: row;
        padding: var(--nxt1-spacing-3, 12px);
      }

      .scout-card--compact .scout-card__image-container {
        width: 60px;
        min-width: 60px;
        height: 80px;
        border-radius: var(--nxt1-radius-md, 8px);
      }

      .scout-card--compact .scout-card__content {
        padding: 0 0 0 var(--nxt1-spacing-3, 12px);
        justify-content: center;
      }

      .scout-card--compact .scout-card__rating {
        top: auto;
        bottom: var(--nxt1-spacing-1, 4px);
        left: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px);
      }

      .scout-card--compact .scout-card__rating-stars {
        display: none;
      }

      /* ============================================
         IMAGE CONTAINER
         ============================================ */

      .scout-card__image-container {
        position: relative;
        width: 100%;
        overflow: hidden;
      }

      .scout-card__image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      /* ============================================
         BADGES OVERLAY
         ============================================ */

      .scout-card__badges {
        position: absolute;
        top: var(--nxt1-spacing-2, 8px);
        left: var(--nxt1-spacing-2, 8px);
        display: flex;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .scout-card__badge {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      .scout-card__badge ion-icon {
        font-size: 14px;
      }

      .scout-card__badge--verified {
        background: rgba(59, 130, 246, 0.9);
        color: white;
      }

      /* ============================================
         BOOKMARK BUTTON
         ============================================ */

      .scout-card__bookmark {
        position: absolute;
        top: var(--nxt1-spacing-2, 8px);
        right: var(--nxt1-spacing-2, 8px);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: none;
        border-radius: 50%;
        color: white;
        cursor: pointer;
        transition: all 0.2s ease-out;
      }

      .scout-card__bookmark:hover {
        background: rgba(0, 0, 0, 0.7);
        transform: scale(1.1);
      }

      .scout-card__bookmark--active {
        background: var(--nxt1-color-primary, #3b82f6);
        animation: bookmark-pop 0.3s ease-out;
      }

      .scout-card__bookmark ion-icon {
        font-size: 18px;
      }

      @keyframes bookmark-pop {
        0% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.3);
        }
        100% {
          transform: scale(1);
        }
      }

      /* ============================================
         RATING BADGE
         ============================================ */

      .scout-card__rating {
        position: absolute;
        bottom: var(--nxt1-spacing-2, 8px);
        left: var(--nxt1-spacing-2, 8px);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--nxt1-spacing-2, 8px);
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .scout-card__rating-value {
        font-size: 18px;
        font-weight: 700;
        color: var(--rating-color, #fbbf24);
        line-height: 1;
      }

      .scout-card__rating-stars {
        display: flex;
        gap: 1px;
        margin-top: var(--nxt1-spacing-1, 4px);
      }

      .scout-card__star {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
      }

      .scout-card__star--filled {
        color: var(--rating-color, #fbbf24);
      }

      /* ============================================
         XP REWARD INDICATOR
         ============================================ */

      .scout-card__xp {
        position: absolute;
        bottom: var(--nxt1-spacing-2, 8px);
        right: var(--nxt1-spacing-2, 8px);
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px) var(--nxt1-spacing-2, 8px);
        background: linear-gradient(135deg, #8b5cf6, #6366f1);
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 11px;
        font-weight: 600;
        color: white;
      }

      .scout-card__xp ion-icon {
        font-size: 12px;
      }

      /* ============================================
         CONTENT SECTION
         ============================================ */

      .scout-card__content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-3, 12px);
      }

      .scout-card__name {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.3;
      }

      /* ============================================
         CHIPS
         ============================================ */

      .scout-card__chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-1, 4px);
      }

      /* ============================================
         META INFO
         ============================================ */

      .scout-card__meta {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .scout-card__meta-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .scout-card__meta-item ion-icon {
        font-size: 14px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
         QUICK STATS
         ============================================ */

      .scout-card__stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px);
        background: var(--nxt1-color-surface-50, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-radius-md, 8px);
      }

      .scout-card__stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .scout-card__stat-value {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .scout-card__stat-label {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-transform: uppercase;
      }

      /* ============================================
         SUMMARY
         ============================================ */

      .scout-card__summary {
        margin: 0;
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* ============================================
         HIGHLIGHTS
         ============================================ */

      .scout-card__highlights {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .scout-card__highlight {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .scout-card__highlight ion-icon {
        font-size: 12px;
        color: var(--nxt1-color-success, #10b981);
      }

      /* ============================================
         FOOTER
         ============================================ */

      .scout-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: var(--nxt1-spacing-2, 8px);
        border-top: 1px solid var(--nxt1-color-border-secondary, rgba(255, 255, 255, 0.06));
        margin-top: auto;
      }

      .scout-card__views {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .scout-card__views ion-icon {
        font-size: 14px;
      }

      .scout-card__time {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportCardComponent {
  constructor() {
    addIcons({
      star,
      starOutline,
      starHalf,
      bookmark,
      bookmarkOutline,
      checkmarkCircle,
      diamond,
      diamondOutline,
      eye,
      flash,
      locationOutline,
      schoolOutline,
      trendingUp,
    });
  }

  private readonly haptics = inject(HapticsService);

  // ============================================
  // INPUTS
  // ============================================

  /** Scout report data */
  readonly report = input.required<ScoutReport>();

  /** View mode */
  readonly viewMode = input<ScoutReportViewMode>('grid');

  /** Whether to show quick stats */
  readonly showQuickStats = input<boolean>(true);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when card is clicked */
  readonly cardClick = output<ScoutReport>();

  /** Emitted when bookmark is toggled */
  readonly bookmark = output<string>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /** Aria label for accessibility */
  protected readonly ariaLabel = computed(() => {
    const r = this.report();
    return `Scout report for ${r.athlete.name}, ${r.athlete.position}, rated ${r.rating.overall} out of 5`;
  });

  /** Rating color based on tier */
  protected readonly ratingColor = computed(() => getRatingColor(this.report().rating.overall));

  /** Formatted rating string */
  protected readonly formattedRating = computed(() => formatRating(this.report().rating.overall));

  /** Star states for rating display */
  protected readonly starStates = computed(() => calculateStars(this.report().rating.overall));

  /** Short graduation year */
  protected readonly shortGradYear = computed(() =>
    formatGradYear(this.report().athlete.gradYear, true)
  );

  /** Truncated summary for preview */
  protected readonly truncatedSummary = computed(() => truncateSummary(this.report().summary));

  /** Limited highlights for card display */
  protected readonly limitedHighlights = computed(() =>
    this.report().highlights.slice(0, SCOUT_REPORT_MAX_CARD_HIGHLIGHTS)
  );

  /** Formatted view count */
  protected readonly formattedViewCount = computed(() => formatViewCount(this.report().viewCount));

  /** Relative time since published */
  protected readonly relativeTime = computed(() => formatRelativeTime(this.report().publishedAt));

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle card click.
   */
  protected async handleCardClick(event: Event): Promise<void> {
    // Don't trigger if bookmark was clicked
    if ((event.target as HTMLElement).closest('.scout-card__bookmark')) {
      return;
    }

    await this.haptics.impact('light');
    this.cardClick.emit(this.report());
  }

  /**
   * Handle bookmark toggle.
   */
  protected async handleBookmark(event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.impact('medium');
    this.bookmark.emit(this.report().id);
  }
}
