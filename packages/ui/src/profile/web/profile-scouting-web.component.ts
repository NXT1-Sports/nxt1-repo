/**
 * @fileoverview Profile Scouting Reports Web Component
 * @module @nxt1/ui/profile/web
 * @version 2.0.0
 *
 * Displays scout reports for the current athlete profile.
 * Lives under the Recruit tab as the "Scouting" side-tab.
 *
 * Uses the shared NxtContentCardWebComponent for consistent
 * glass-morphism card design across profile tabs (News, Scouting, etc.).
 * Scouting-specific content (tier badge, rating bars, highlights, concerns)
 * is projected into the shared card via <ng-content>.
 *
 * Uses mock data for development. SSR-safe: renders content immediately
 * on the server for SEO crawlers; shimmer skeleton is browser-only on
 * first mount. Design-token CSS only (no Tailwind, no Ionic).
 *
 * Features:
 * - Shared glass card shell matching News tab design
 * - Rating breakdown bars (physical, technical, mental, potential)
 * - Tier badge with color coding (Elite → Developing)
 * - Key highlights and concerns sections
 * - Premium badge (projected into card badge slot)
 * - Shimmer skeleton loader (glass-themed, browser-only)
 * - Empty state for athletes with no reports
 * - Full keyboard navigation
 * - Reduced motion support
 *
 * ⭐ WEB ONLY — SSR-optimized, zero Ionic ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  inject,
  signal,
  computed,
  OnInit,
  output,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import {
  type ScoutReport,
  type ScoutRating,
  getRatingTier,
  getRatingColor,
  formatRating,
  RATING_TIER_LABELS,
} from '@nxt1/core';
import { MOCK_SCOUT_REPORTS } from '../../scout-reports/scout-reports.mock-data';
import { NxtContentCardWebComponent } from '../../components/content-card';

/** Number of skeleton placeholder cards. */
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
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Truncate text to maxLen characters, append ellipsis. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

/** Format view count: 2453 → "2.5K" */
function formatViewCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${count}`;
}

/** Module-level flag so skeleton only shows once per session. */
let _hasLoadedOnce = false;

@Component({
  selector: 'nxt1-profile-scouting-web',
  standalone: true,
  imports: [NxtIconComponent, NxtContentCardWebComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="profile-scouting" aria-labelledby="scouting-heading">
      <h2 id="scouting-heading" class="sr-only">Scouting Reports</h2>

      <!-- ═══ Skeleton Loading State ═══ -->
      @if (isLoading()) {
        <div class="profile-scouting__grid" aria-busy="true" aria-label="Loading scouting reports">
          @for (slot of skeletonSlots; track slot) {
            <div class="scout-skel" role="presentation">
              <div class="scout-skel__header">
                <div class="scout-skel__avatar skeleton-animate"></div>
                <div class="scout-skel__meta">
                  <div class="scout-skel__line scout-skel__line--name skeleton-animate"></div>
                  <div class="scout-skel__line scout-skel__line--sub skeleton-animate"></div>
                </div>
                <div class="scout-skel__tier skeleton-animate"></div>
              </div>
              <div class="scout-skel__ratings skeleton-animate"></div>
              <div class="scout-skel__body">
                <div class="scout-skel__line scout-skel__line--full skeleton-animate"></div>
                <div class="scout-skel__line scout-skel__line--full skeleton-animate"></div>
                <div class="scout-skel__line scout-skel__line--half skeleton-animate"></div>
              </div>
              <div class="scout-skel__footer">
                <div class="scout-skel__footer-avatar skeleton-animate"></div>
                <div class="scout-skel__line scout-skel__line--med skeleton-animate"></div>
              </div>
            </div>
          }
        </div>
      }

      <!-- ═══ Empty State ═══ -->
      @else if (filteredReports().length === 0) {
        <div class="profile-scouting__empty" role="status">
          <div class="profile-scouting__empty-icon" aria-hidden="true">
            <nxt1-icon name="clipboard" [size]="48" />
          </div>
          <h3 class="profile-scouting__empty-title">No Scouting Reports</h3>
          <p class="profile-scouting__empty-msg">
            Scouting reports from coaches, scouts, and verified evaluators will appear here.
          </p>
        </div>
      }

      <!-- ═══ Report Cards ═══ -->
      @else {
        <div class="profile-scouting__grid">
          @for (report of filteredReports(); track report.id) {
            <nxt1-content-card
              [title]="getCardTitle(report)"
              [excerpt]="truncateSummary(report.summary)"
              [sourceName]="report.scout.organization || report.scout.name"
              [sourceAvatarUrl]="getOrgLogoUrl(report.scout.organization)"
              [metaLeft]="getTimeAgo(report.publishedAt)"
              [metaRight]="getViewCount(report.viewCount)"
              [ctaLabel]="'Read Full Report'"
              [ariaLabel]="
                'Scout report for ' +
                report.athlete.name +
                ', rated ' +
                formatRating(report.rating.overall) +
                ' out of 5'
              "
              (cardClick)="onReportClick(report)"
            >
              <!-- Projected Body: Rating Bars -->
              <div class="scouting-body">
                <!-- Rating Breakdown -->
                <div class="scouting-ratings">
                  @for (metric of getRatingMetrics(report.rating); track metric.key) {
                    <div class="scouting-metric">
                      <span class="scouting-metric__label">{{ metric.label }}</span>
                      <div class="scouting-metric__bar">
                        <div
                          class="scouting-metric__fill"
                          [style.width.%]="(metric.value / 5) * 100"
                          [style.background]="getRatingColor(metric.value)"
                        ></div>
                      </div>
                      <span class="scouting-metric__value">{{ formatRating(metric.value) }}</span>
                    </div>
                  }
                </div>
              </div>
            </nxt1-content-card>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════════════
       PROFILE SCOUTING — Web (Pure CSS / Design Tokens)
       Grid layout + skeleton + empty state + projected body content.
       Card chrome delegated to shared NxtContentCardWebComponent.
       Glass-morphism dark theme consistent with News tab.
       ═══════════════════════════════════════════════════════════ */

      :host {
        display: block;
      }

      .profile-scouting {
        display: flex;
        flex-direction: column;
      }

      /* ── Report Grid (1 col → 2 col) ── */

      .profile-scouting__grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-4, 16px);
      }

      @media (min-width: 640px) {
        .profile-scouting__grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* ── Empty State ── */

      .profile-scouting__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-12, 48px) var(--nxt1-spacing-6, 24px);
        text-align: center;
      }

      .profile-scouting__empty-icon {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
        margin-bottom: var(--nxt1-spacing-1, 4px);
      }

      .profile-scouting__empty-title {
        font-size: var(--nxt1-font-size-lg, 18px);
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0;
      }

      .profile-scouting__empty-msg {
        font-size: var(--nxt1-font-size-sm, 14px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        max-width: 360px;
        margin: 0;
        line-height: 1.5;
      }

      /* ═══════════════════════════════════════════════
       BADGE SLOT — Tier + Premium (top-right of card)
       ═══════════════════════════════════════════════ */

      /* ═══════════════════════════════════════════════
       PROJECTED BODY — Rating Bars
       ═══════════════════════════════════════════════ */

      .scouting-body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      /* ── Rating Breakdown ── */

      .scouting-ratings {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-4, 16px);
        padding: var(--nxt1-spacing-2-5, 10px) var(--nxt1-spacing-3, 12px);
        background: rgba(255, 255, 255, 0.04);
        border-radius: var(--nxt1-radius-md, 8px);
        border: 1px solid rgba(255, 255, 255, 0.04);
      }

      .scouting-metric {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .scouting-metric__label {
        font-size: 10px;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        width: 52px;
        flex-shrink: 0;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .scouting-metric__bar {
        flex: 1;
        height: 3px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 2px;
        overflow: hidden;
      }

      .scouting-metric__fill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .scouting-metric__value {
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #fff);
        width: 24px;
        text-align: right;
      }

      /* ═══════════════════════════════════════════════
       SKELETON — Glass-themed shimmer
       ═══════════════════════════════════════════════ */

      .skeleton-animate {
        background: var(
          --nxt1-skeleton-gradient,
          linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.08) 25%,
            rgba(255, 255, 255, 0.15) 50%,
            rgba(255, 255, 255, 0.08) 75%
          )
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s ease-in-out infinite;
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
          background: rgba(255, 255, 255, 0.08);
        }
      }

      .scout-skel {
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--nxt1-glass-bg, rgba(20, 20, 20, 0.88));
        -webkit-backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        backdrop-filter: var(--nxt1-glass-backdrop, saturate(180%) blur(20px));
        border: 1px solid var(--nxt1-glass-border, rgba(255, 255, 255, 0.12));
        box-shadow: var(--nxt1-glass-shadowInner, inset 0 1px 0 rgba(255, 255, 255, 0.06));
        overflow: hidden;
        padding: var(--nxt1-spacing-4, 16px);
      }

      .scout-skel__header {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3, 12px);
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .scout-skel__avatar {
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
      }

      .scout-skel__meta {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 2px;
      }

      .scout-skel__tier {
        width: 48px;
        height: 42px;
        border-radius: var(--nxt1-radius-md, 8px);
        flex-shrink: 0;
      }

      .scout-skel__ratings {
        height: 56px;
        border-radius: var(--nxt1-radius-md, 8px);
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .scout-skel__body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      .scout-skel__footer {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding-top: var(--nxt1-spacing-2, 8px);
        border-top: 1px solid rgba(255, 255, 255, 0.04);
      }

      .scout-skel__footer-avatar {
        width: 20px;
        height: 20px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
      }

      .scout-skel__line {
        height: 12px;
        border-radius: 6px;
      }

      .scout-skel__line--name {
        width: 55%;
      }
      .scout-skel__line--sub {
        width: 40%;
      }
      .scout-skel__line--full {
        width: 100%;
      }
      .scout-skel__line--half {
        width: 60%;
      }
      .scout-skel__line--med {
        width: 80px;
      }

      /* ── Motion ── */

      @media (prefers-reduced-motion: reduce) {
        .scouting-metric__fill {
          transition: none;
        }
      }
    `,
  ],
})
export class ProfileScoutingWebComponent implements OnInit {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when a report card is clicked. */
  readonly reportClick = output<ScoutReport>();

  // ============================================
  // STATE
  // ============================================

  /**
   * Loading state — false on server (SSR renders content for SEO crawlers).
   * On the browser, true only on the very first mount.
   */
  protected readonly isLoading = signal(!_hasLoadedOnce && isPlatformBrowser(this.platformId));

  /** Skeleton placeholder slots. */
  protected readonly skeletonSlots = SKELETON_SLOTS;

  /** All available reports (mock data for now). */
  private readonly allReports = signal<readonly ScoutReport[]>(MOCK_SCOUT_REPORTS);

  /** Filtered + sorted reports (newest first). */
  protected readonly filteredReports = computed(() => {
    const reports = [...this.allReports()];
    return reports.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
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

  onReportClick(report: ScoutReport): void {
    this.reportClick.emit(report);
  }

  // ============================================
  // TEMPLATE HELPERS
  // ============================================

  /** Build card title from athlete name + position info. */
  getCardTitle(report: ScoutReport): string {
    const pos = report.athlete.secondaryPosition
      ? `${report.athlete.position} / ${report.athlete.secondaryPosition}`
      : report.athlete.position;
    return `${report.athlete.name} — ${pos} · Class of ${report.athlete.gradYear}`;
  }

  getTierLabel(overall: number): string {
    return RATING_TIER_LABELS[getRatingTier(overall)];
  }

  getRatingColor(value: number): string {
    return getRatingColor(value);
  }

  formatRating(value: number): string {
    return formatRating(value);
  }

  getRatingMetrics(rating: ScoutRating): { key: string; label: string; value: number }[] {
    return [
      { key: 'physical', label: 'Physical', value: rating.physical },
      { key: 'technical', label: 'Technical', value: rating.technical },
      { key: 'mental', label: 'Mental', value: rating.mental },
      { key: 'potential', label: 'Potential', value: rating.potential },
    ];
  }

  truncateSummary(text: string): string {
    return truncate(text, 180);
  }

  getViewCount(count: number): string {
    return formatViewCount(count) + ' views';
  }

  /** Generate org-branded logo URL (DiceBear initials, like news sources). */
  getOrgLogoUrl(org: string | undefined): string {
    if (!org) return '';
    const seed = org
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase();
    const colors = ['0066cc', 'ff6600', '00b386', 'cc0000', '6b21a8', '1e3a5f'];
    const colorIdx =
      Math.abs([...org].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % colors.length;
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${colors[colorIdx]}`;
  }

  getTimeAgo(isoDate: string): string {
    return timeAgo(isoDate);
  }
}
