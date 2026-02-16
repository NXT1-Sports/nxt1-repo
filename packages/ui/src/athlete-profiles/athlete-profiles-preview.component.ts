/**
 * @fileoverview Athlete Profiles Dashboard Preview Component
 * @module @nxt1/ui/athlete-profiles
 * @version 1.0.0
 *
 * Interactive mockup of the athlete profile browsing experience for
 * use on the `/athlete-profiles` landing page. Shows a realistic
 * preview of profile cards with athlete photos, stats, sports,
 * positions, and school info inside a browser-chrome window frame.
 *
 * Athlete-profiles-specific — not a generic shared component.
 * Uses mock values for visual accuracy on the marketing page.
 *
 * 100% design-token styling where applicable. Micro-scale preview
 * elements use pixel values where token granularity is insufficient.
 * SSR-safe, responsive, purely presentational (aria-hidden).
 *
 * @example
 * ```html
 * <nxt1-athlete-profiles-preview />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NxtIconComponent } from '../components/icon';

// ============================================
// PREVIEW MOCK DATA
// ============================================

/** Mock athlete cards for the preview grid. */
const PREVIEW_ATHLETES = [
  {
    id: 'a1',
    name: 'Marcus Johnson',
    position: 'QB',
    sport: 'Football',
    classYear: '2026',
    school: 'Riverside High',
    location: 'Austin, TX',
    gpa: '3.8',
    height: '6\'2"',
    weight: '195',
    verified: true,
    avatar: '/assets/shared/images/athlete-1.png',
  },
  {
    id: 'a2',
    name: 'Aaliyah Thompson',
    position: 'PG',
    sport: 'Basketball',
    classYear: '2027',
    school: 'Central Academy',
    location: 'Chicago, IL',
    gpa: '3.9',
    height: '5\'8"',
    weight: '145',
    verified: true,
    avatar: '/assets/shared/images/athlete-2.png',
  },
  {
    id: 'a3',
    name: 'DeAndre Williams',
    position: 'CF',
    sport: 'Baseball',
    classYear: '2026',
    school: 'Westfield Prep',
    location: 'Miami, FL',
    gpa: '3.5',
    height: '6\'0"',
    weight: '180',
    verified: false,
    avatar: '/assets/shared/images/athlete-3.png',
  },
] as const;

/** Mock sport filter tabs. */
const PREVIEW_SPORTS = [
  { id: 'all', label: 'All Sports', active: true },
  { id: 'football', label: 'Football', active: false },
  { id: 'basketball', label: 'Basketball', active: false },
  { id: 'baseball', label: 'Baseball', active: false },
  { id: 'soccer', label: 'Soccer', active: false },
] as const;

/** Mock search stats. */
const PREVIEW_STATS = {
  totalAthletes: '42,850',
  sports: '19',
  states: '50',
} as const;

@Component({
  selector: 'nxt1-athlete-profiles-preview',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <div class="profiles-preview" aria-hidden="true">
      <!-- Subtle glow behind dashboard -->
      <div class="preview-glow"></div>

      <!-- Dashboard window -->
      <div class="preview-window">
        <!-- Browser Chrome -->
        <div class="preview-chrome">
          <div class="chrome-dots">
            <span class="dot dot--close"></span>
            <span class="dot dot--min"></span>
            <span class="dot dot--max"></span>
          </div>
          <div class="chrome-title">Athlete Profiles</div>
        </div>

        <!-- Dashboard Body -->
        <div class="preview-body">
          <!-- Search Bar -->
          <div class="search-bar">
            <nxt1-icon name="search-outline" size="14" />
            <span class="search-placeholder"
              >Search athletes by name, sport, position, or location…</span
            >
          </div>

          <!-- Sport Filter Tabs -->
          <div class="sport-tabs">
            @for (sport of sportTabs; track sport.id) {
              <span class="sport-tab" [class.sport-tab--active]="sport.active">
                {{ sport.label }}
              </span>
            }
          </div>

          <!-- Results Header -->
          <div class="results-header">
            <span class="results-count"
              >{{ resultStats.totalAthletes }} athletes &middot; {{ resultStats.sports }} sports
              &middot; {{ resultStats.states }} states</span
            >
            <div class="results-sort">
              <nxt1-icon name="funnel-outline" size="12" />
              <span>Filters</span>
            </div>
          </div>

          <!-- Athlete Cards Grid -->
          <div class="athlete-grid">
            @for (athlete of athletes; track athlete.id) {
              <div class="athlete-card">
                <!-- Card Header with avatar -->
                <div class="card-header">
                  <div class="card-avatar">
                    <img [src]="athlete.avatar" [alt]="athlete.name" loading="lazy" />
                  </div>
                  <div class="card-identity">
                    <div class="card-name-row">
                      <span class="card-name">{{ athlete.name }}</span>
                      @if (athlete.verified) {
                        <nxt1-icon name="checkmark-circle" size="12" />
                      }
                    </div>
                    <span class="card-school">{{ athlete.school }}</span>
                  </div>
                  <span class="card-class">{{ athlete.classYear }}</span>
                </div>

                <!-- Sport & Position -->
                <div class="card-sport">
                  <span class="card-sport-badge">{{ athlete.sport }}</span>
                  <span class="card-position-badge">{{ athlete.position }}</span>
                </div>

                <!-- Physical Info -->
                <div class="card-details">
                  <div class="card-detail">
                    <span class="card-detail__label">HT</span>
                    <span class="card-detail__value">{{ athlete.height }}</span>
                  </div>
                  <div class="card-detail">
                    <span class="card-detail__label">WT</span>
                    <span class="card-detail__value">{{ athlete.weight }}</span>
                  </div>
                  <div class="card-detail">
                    <span class="card-detail__label">GPA</span>
                    <span class="card-detail__value">{{ athlete.gpa }}</span>
                  </div>
                  <div class="card-detail">
                    <span class="card-detail__label">LOC</span>
                    <span class="card-detail__value">{{ athlete.location }}</span>
                  </div>
                </div>

                <!-- View button -->
                <div class="card-action">
                  <span class="card-view-btn">View Profile</span>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
     * ATHLETE PROFILES PREVIEW
     * 100% design-token styling — zero hardcoded values
     * ============================================ */

      :host {
        display: block;
        width: 100%;
      }

      .profiles-preview {
        position: relative;
        width: 100%;
        max-width: 620px;
        margin: 0 auto;
      }

      /* ---- Glow ---- */
      .preview-glow {
        position: absolute;
        inset: 10% 5%;
        background: var(--nxt1-color-alpha-primary10);
        filter: blur(48px);
        border-radius: var(--nxt1-borderRadius-3xl);
        z-index: 0;
        pointer-events: none;
      }

      /* ---- Window ---- */
      .preview-window {
        position: relative;
        z-index: 1;
        border-radius: var(--nxt1-borderRadius-xl);
        overflow: hidden;
        background: var(--nxt1-color-bg-primary);
        border: 1px solid var(--nxt1-color-border-primary);
        box-shadow:
          0 4px 24px var(--nxt1-color-alpha-primary6),
          0 1px 4px var(--nxt1-color-alpha-primary4);
      }

      /* ---- Browser Chrome ---- */
      .preview-chrome {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        background: var(--nxt1-color-bg-secondary);
        border-bottom: 1px solid var(--nxt1-color-border-primary);
      }

      .chrome-dots {
        display: flex;
        gap: var(--nxt1-spacing-1_5);
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: var(--nxt1-borderRadius-full);
      }

      .dot--close {
        background: var(--nxt1-color-error);
      }
      .dot--min {
        background: var(--nxt1-color-warning);
      }
      .dot--max {
        background: var(--nxt1-color-success);
      }

      .chrome-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        letter-spacing: 0.02em;
      }

      /* ---- Body ---- */
      .preview-body {
        padding: var(--nxt1-spacing-4);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      /* ---- Search Bar ---- */
      .search-bar {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border: 1px solid var(--nxt1-color-border-primary);
        border-radius: var(--nxt1-borderRadius-lg);
        color: var(--nxt1-color-text-tertiary);
      }

      .search-placeholder {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ---- Sport Tabs ---- */
      .sport-tabs {
        display: flex;
        gap: var(--nxt1-spacing-1_5);
        overflow-x: auto;
      }

      .sport-tab {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        white-space: nowrap;
        background: var(--nxt1-color-bg-secondary);
        color: var(--nxt1-color-text-secondary);
        border: 1px solid var(--nxt1-color-border-primary);
      }

      .sport-tab--active {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        border-color: var(--nxt1-color-primary);
      }

      /* ---- Results Header ---- */
      .results-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .results-count {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .results-sort {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        color: var(--nxt1-color-primary);
        cursor: default;
      }

      /* ---- Athlete Grid ---- */
      .athlete-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      /* ---- Athlete Card ---- */
      .athlete-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
        background: var(--nxt1-color-bg-secondary);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-primary);
        transition: box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      /* ---- Card Header ---- */
      .card-header {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .card-avatar {
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-borderRadius-full);
        overflow: hidden;
        flex-shrink: 0;
        background: var(--nxt1-color-alpha-primary10);
      }

      .card-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .card-identity {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .card-name-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        color: var(--nxt1-color-primary);
      }

      .card-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card-school {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card-class {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 700;
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-bg-primary);
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-sm);
        flex-shrink: 0;
      }

      /* ---- Sport & Position ---- */
      .card-sport {
        display: flex;
        gap: var(--nxt1-spacing-1_5);
      }

      .card-sport-badge {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
      }

      .card-position-badge {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-successBg);
        color: var(--nxt1-color-success);
      }

      /* ---- Physical Details ---- */
      .card-details {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--nxt1-spacing-1);
      }

      .card-detail {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-0_5);
      }

      .card-detail__label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 8px;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .card-detail__value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      /* ---- View Button ---- */
      .card-action {
        display: flex;
      }

      .card-view-btn {
        width: 100%;
        text-align: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 700;
        color: var(--nxt1-color-primary);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-md);
        border: 1px solid var(--nxt1-color-primary);
        background: transparent;
        cursor: default;
      }

      /* ---- Responsive ---- */
      @media (max-width: 640px) {
        .athlete-grid {
          grid-template-columns: 1fr;
        }

        .sport-tabs {
          gap: var(--nxt1-spacing-1);
        }
      }

      @media (max-width: 480px) {
        .preview-body {
          padding: var(--nxt1-spacing-3);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAthleteProfilesPreviewComponent {
  protected readonly athletes = PREVIEW_ATHLETES;
  protected readonly sportTabs = PREVIEW_SPORTS;
  protected readonly resultStats = PREVIEW_STATS;
}
