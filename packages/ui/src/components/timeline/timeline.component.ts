/**
 * @fileoverview Shared Timeline Layout Component
 * @module @nxt1/ui/components/timeline
 * @version 1.0.0
 *
 * A fully reusable vertical-timeline display.
 * Renders a rail, entry dots, date labels, cards, loading skeletons,
 * empty state, and end marker.
 *
 * Consumers provide `TimelineItem[]` — the component handles everything else.
 *
 * Used by: Profile Offers, Events, Activity feeds, etc.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  TimelineItem,
  TimelineEmptyConfig,
  TimelineDotConfig,
  TimelineCardLayout,
  TimelineVariant,
} from '@nxt1/core';
import { TIMELINE_DOT_DEFAULTS, getTimelineVariantClass } from '@nxt1/core';
import { NxtIconComponent } from '../icon';
import { NxtTimelineCardComponent } from '../timeline-card';

/** Default empty state config. */
const DEFAULT_EMPTY: TimelineEmptyConfig = {
  icon: 'school',
  title: 'No Activity',
  description: 'Nothing to show here yet.',
  ownProfileDescription: 'Activity will appear here as a timeline.',
};

@Component({
  selector: 'nxt1-timeline',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtTimelineCardComponent],
  template: `
    <div class="tl-layout">
      <!-- Loading State -->
      @if (isLoading()) {
        <div class="tl-loading">
          @for (i of [1, 2, 3]; track i) {
            <div class="tl-skeleton-card">
              <div class="tl-skeleton-graphic"></div>
              <div class="tl-skeleton-lines">
                <div class="tl-skeleton-line tl-skeleton-line--title"></div>
                <div class="tl-skeleton-line tl-skeleton-line--sub"></div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Empty State -->
      @else if (items().length === 0) {
        <div class="tl-empty">
          <div class="tl-empty__icon">
            <nxt1-icon [name]="emptyConfig().icon" [size]="40" />
          </div>
          <h3 class="tl-empty__title">{{ emptyConfig().title }}</h3>
          <p class="tl-empty__desc">
            @if (isOwnProfile() && emptyConfig().ownProfileDescription) {
              {{ emptyConfig().ownProfileDescription }}
            } @else {
              {{ emptyConfig().description }}
            }
          </p>
          @if (isOwnProfile() && emptyCta()) {
            <button class="tl-empty__cta" (click)="emptyCtaClick.emit()">
              {{ emptyCta() }}
            </button>
          }
        </div>
      }

      <!-- ═══ TIMELINE CONTENT ═══ -->
      @else {
        <!-- Vertical timeline rail -->
        <div class="tl-rail" aria-hidden="true"></div>

        @for (item of items(); track item.id) {
          <article
            class="tl-entry"
            [class]="'tl-entry tl-entry--' + getVariantCss(item.variant)"
            (click)="itemClick.emit(item)"
          >
            <!-- Timeline dot -->
            <div class="tl-dot" [class]="'tl-dot tl-dot--' + getVariantCss(item.variant)">
              <nxt1-icon
                [name]="getDotConfig(item.variant).icon"
                [size]="getDotConfig(item.variant).size"
              />
            </div>

            <!-- Year/Date label on rail -->
            <div class="tl-date-label">
              <span class="tl-date-year">{{ formatYear(item.date) }}</span>
              <span class="tl-date-detail">{{ formatShortDate(item.date) }}</span>
            </div>

            <!-- Card -->
            <nxt1-timeline-card
              [variant]="item.variant"
              [layout]="cardLayout()"
              [title]="item.title"
              [logoUrl]="item.logoUrl"
              [graphicUrl]="item.graphicUrl"
              [tags]="item.tags"
              [subtitle]="item.subtitle"
              [footerLeft]="item.footerLeft"
              [footerRight]="item.footerRight"
              [badge]="item.badge"
              [badgePosition]="item.badgePosition ?? 'left'"
              [fallbackIcon]="fallbackIcon()"
            />
          </article>
        }

        <!-- Timeline end marker -->
        <div class="tl-end" aria-hidden="true">
          <div class="tl-end__diamond"></div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         TIMELINE LAYOUT — 2026 Shared Design
         Vertical rail, dots, date labels, entry
         wrappers, loading skeletons, empty state.
         ============================================ */

      :host {
        display: block;

        /* Palette (design tokens) */
        --tl-bg: var(--nxt1-color-bg-primary);
        --tl-surface: var(--nxt1-color-surface-100);
        --tl-border: var(--nxt1-color-border-default);
        --tl-border-subtle: var(--nxt1-color-border-subtle);
        --tl-text-1: var(--nxt1-color-text-primary);
        --tl-text-2: var(--nxt1-color-text-secondary);
        --tl-text-3: var(--nxt1-color-text-tertiary);
        --tl-accent: var(--nxt1-color-primary);
        --tl-success: var(--nxt1-color-successLight);

        /* Alpha variants */
        --tl-accent-alpha-15: var(--nxt1-color-alpha-primary15);
        --tl-skeleton-base: var(--nxt1-color-loading-skeleton);
        --tl-skeleton-shimmer: var(--nxt1-color-loading-skeletonShimmer);

        /* Layout constants */
        --tl-rail-color: var(--nxt1-color-alpha-primary6);
        --tl-rail-left: 16px;
        --tl-card-radius: 14px;
      }

      /* ═══ LAYOUT ═══ */

      .tl-layout {
        position: relative;
        padding: 0 0 8px 48px;
        display: flex;
        flex-direction: column;
        gap: 0;

        @media (max-width: 768px) {
          padding: 0 0 4px 44px;
        }
      }

      /* Remove rail padding when only empty state is shown */
      .tl-layout:has(> .tl-empty) {
        padding-left: 0;
      }

      /* ═══ VERTICAL RAIL ═══ */

      .tl-rail {
        position: absolute;
        top: 0;
        bottom: 0;
        left: var(--tl-rail-left);
        width: 2px;
        background: linear-gradient(
          180deg,
          transparent 0%,
          var(--tl-rail-color) 4%,
          var(--tl-rail-color) 96%,
          transparent 100%
        );

        @media (max-width: 768px) {
          left: 14px;
        }
      }

      /* ═══ TIMELINE ENTRY ═══ */

      .tl-entry {
        position: relative;
        padding: 12px 0;
        cursor: pointer;

        &:first-of-type {
          padding-top: 4px;
        }

        &:hover nxt1-timeline-card {
          --hover-active: 1;
        }
      }

      /* Hover card effects — propagated via CSS to the card child */
      :host .tl-entry:hover ::ng-deep .tl-card {
        border-color: var(--nxt1-color-border-default);
        box-shadow:
          0 8px 32px var(--nxt1-color-alpha-black30),
          0 0 0 1px var(--nxt1-color-border-subtle);
      }

      :host .tl-entry:hover ::ng-deep .tl-card__graphic-bg {
        transform: scale(1.03);
      }

      /* ═══ DOT ON RAIL ═══ */

      .tl-dot {
        position: absolute;
        top: 28px;
        left: calc(-1 * (48px - var(--tl-rail-left)));
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
        border: 2px solid var(--tl-bg);
        transform: translateX(-50%);

        @media (max-width: 768px) {
          left: calc(-1 * (44px - 14px));
          width: 24px;
          height: 24px;
        }
      }

      .tl-dot--committed {
        background: var(--tl-success);
        color: var(--nxt1-color-text-onPrimary);
        box-shadow:
          0 0 0 3px color-mix(in srgb, var(--tl-success) 20%, transparent),
          0 0 12px color-mix(in srgb, var(--tl-success) 30%, transparent);
      }

      .tl-dot--offer {
        background: var(--tl-accent);
        color: var(--nxt1-color-text-onPrimary);
        box-shadow: 0 0 0 3px var(--tl-accent-alpha-15);
      }

      .tl-dot--interest {
        background: var(--tl-surface);
        color: var(--tl-text-2);
        border-color: var(--tl-border);
        box-shadow: none;
      }

      /* ═══ DATE LABEL (left of card, on rail) ═══ */

      .tl-date-label {
        position: absolute;
        top: 58px;
        left: calc(-1 * (48px - var(--tl-rail-left)));
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        z-index: 1;

        @media (max-width: 768px) {
          left: calc(-1 * (44px - 14px));
          top: 52px;
        }
      }

      .tl-date-year {
        font-size: 11px;
        font-weight: 700;
        color: var(--tl-text-2);
        letter-spacing: 0.04em;
        line-height: 1;
      }

      .tl-date-detail {
        font-size: 9px;
        font-weight: 500;
        color: var(--tl-text-3);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        line-height: 1.3;
      }

      /* ═══ SECTION EMPTY ═══ */

      .tl-section-empty {
        position: relative;
        padding: 20px 0;
      }

      .tl-section-empty__text {
        font-size: 13px;
        color: var(--tl-text-3);
        margin: 0;
        font-style: italic;
      }

      /* ═══ TIMELINE END MARKER ═══ */

      .tl-end {
        display: flex;
        justify-content: flex-start;
        padding: 8px 0;
        position: relative;
      }

      .tl-end__diamond {
        position: absolute;
        left: calc(-1 * (48px - var(--tl-rail-left)));
        top: 8px;
        width: 10px;
        height: 10px;
        background: var(--tl-rail-color);
        transform: translateX(-50%) rotate(45deg);
        border-radius: 2px;

        @media (max-width: 768px) {
          left: calc(-1 * (44px - 14px));
        }
      }

      /* ═══ GLOBAL EMPTY STATE ═══ */

      .tl-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
      }

      .tl-empty__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--tl-surface);
        border: 1px solid var(--tl-border);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;

        nxt1-icon {
          color: var(--tl-text-3);
        }
      }

      .tl-empty__title {
        font-size: 16px;
        font-weight: 700;
        color: var(--tl-text-1);
        margin: 16px 0 8px;
      }

      .tl-empty__desc {
        font-size: 14px;
        line-height: 1.5;
        color: var(--tl-text-2);
        margin: 0;
        max-width: 280px;
      }

      .tl-empty__cta {
        margin-top: 12px;
        padding: 10px 24px;
        background: var(--timeline-primary, var(--nxt1-color-primary));
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: #000;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          filter: brightness(1.1);
        }

        &:active {
          filter: brightness(0.95);
        }
      }

      /* ═══ LOADING SKELETONS ═══ */

      .tl-loading {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 16px 0;
      }

      .tl-skeleton-card {
        border-radius: var(--tl-card-radius);
        overflow: hidden;
        border: 1px solid var(--tl-border);
        background: var(--tl-surface);
      }

      .tl-skeleton-graphic {
        width: 100%;
        height: 180px;
        background: linear-gradient(
          90deg,
          var(--tl-skeleton-base) 25%,
          var(--tl-skeleton-shimmer) 50%,
          var(--tl-skeleton-base) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.8s ease-in-out infinite;
      }

      .tl-skeleton-lines {
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .tl-skeleton-line {
        height: 12px;
        border-radius: 6px;
        background: linear-gradient(
          90deg,
          var(--tl-skeleton-base) 25%,
          var(--tl-skeleton-shimmer) 50%,
          var(--tl-skeleton-base) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.8s ease-in-out infinite;
      }

      .tl-skeleton-line--title {
        width: 60%;
        height: 16px;
      }

      .tl-skeleton-line--sub {
        width: 40%;
      }

      @keyframes shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtTimelineComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Timeline items to render. */
  readonly items = input<readonly TimelineItem[]>([]);

  /** Show loading skeletons. */
  readonly isLoading = input(false);

  /** Whether the viewer is the profile owner (affects empty-state copy). */
  readonly isOwnProfile = input(false);

  /** Custom empty state configuration. */
  readonly emptyState = input<Partial<TimelineEmptyConfig> | undefined>(undefined);

  /** Fallback icon name when no logo URL on a card (defaults to 'school'). */
  readonly fallbackIcon = input<string>('school');

  /** Card layout orientation: vertical (default) or horizontal (desktop). */
  readonly cardLayout = input<TimelineCardLayout>('vertical');

  /** Custom dot configs keyed by variant (merges with defaults). */
  readonly dotOverrides = input<Partial<Record<string, TimelineDotConfig>> | undefined>(undefined);

  /** CTA button label to show in empty state (when itemsIsEmpty && isOwnProfile). */
  readonly emptyCta = input<string | null>(null);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when a timeline item card is clicked. */
  readonly itemClick = output<TimelineItem>();

  /** Emits when the CTA button in empty state is clicked. */
  readonly emptyCtaClick = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Merged empty config. */
  protected readonly emptyConfig = computed<TimelineEmptyConfig>(() => ({
    ...DEFAULT_EMPTY,
    ...(this.emptyState() ?? {}),
  }));

  // ============================================
  // HELPERS
  // ============================================

  protected getVariantCss(variant: TimelineVariant): string {
    return getTimelineVariantClass(variant);
  }

  protected getDotConfig(variant: string): TimelineDotConfig {
    const overrides = this.dotOverrides();
    if (overrides?.[variant]) return overrides[variant]!;
    return (
      TIMELINE_DOT_DEFAULTS[variant as keyof typeof TIMELINE_DOT_DEFAULTS] ??
      TIMELINE_DOT_DEFAULTS.primary
    );
  }

  protected formatYear(isoDate: string): string {
    try {
      return new Date(isoDate).getFullYear().toString();
    } catch {
      return '';
    }
  }

  protected formatShortDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }
}
