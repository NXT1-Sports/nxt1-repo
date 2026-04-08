/**
 * @fileoverview Athlete Intel Component
 * @module @nxt1/ui/intel
 *
 * Renders the AI-generated Intel report for athlete profiles.
 * Shows scout ratings, tier classification, brief, strengths,
 * measurable highlights, stat highlights, recruiting summary,
 * data citations, missing data prompts, and quick commands.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  effect,
} from '@angular/core';
import { NxtIconComponent } from '../components/icon';
import { NxtStateViewComponent } from '../components/state-view';
import { ANALYTICS_ADAPTER } from '../services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TEST_IDS } from '@nxt1/core/testing';
import { IntelService } from './intel.service';
import type { IntelMissingDataPrompt, IntelQuickCommand, IntelDataSource } from '@nxt1/core';

// ── Constants ──

const SOURCE_LABELS: Readonly<Record<IntelDataSource, string>> = {
  'self-reported': 'Self',
  'coach-verified': 'Coach',
  maxpreps: 'MaxPreps',
  hudl: 'Hudl',
  '247sports': '247Sports',
  rivals: 'Rivals',
  on3: 'On3',
  'perfect-game': 'PG',
  'prep-baseball': 'PBR',
  ncsa: 'NCSA',
  'usa-football': 'USA FB',
  'agent-x': 'Agent X',
};

const TIER_COLORS: Readonly<Record<string, string>> = {
  Elite: '#FFD700',
  Premium: '#C0C0C0',
  Rising: '#22C55E',
  Developing: '#60A5FA',
  'On Radar': '#94A3B8',
};

@Component({
  selector: 'nxt1-athlete-intel',
  standalone: true,
  imports: [NxtIconComponent, NxtStateViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="intel-section"
      [attr.data-testid]="testIds.ATHLETE_SECTION"
      aria-labelledby="intel-heading"
    >
      <h2 id="intel-heading" class="sr-only">Athlete Intelligence Report</h2>

      @if (intel.isLoading()) {
        <!-- Skeleton loading state -->
        <div class="intel-skeleton" [attr.data-testid]="testIds.LOADING_SKELETON">
          <div class="intel-skeleton-header animate-pulse"></div>
          <div class="intel-skeleton-ratings animate-pulse"></div>
          <div class="intel-skeleton-brief animate-pulse"></div>
          <div class="intel-skeleton-cards animate-pulse"></div>
        </div>
      } @else if (intel.error() && !report()) {
        <nxt1-state-view
          [attr.data-testid]="testIds.ERROR_STATE"
          variant="error"
          title="Unable to Load Intel"
          [message]="intel.error()"
          [actionLabel]="isOwnProfile() ? 'Try Again' : null"
          actionIcon="refresh"
          (action)="onGenerate()"
        />
      } @else if (!report()) {
        <div class="intel-empty-state" [attr.data-testid]="testIds.EMPTY_STATE">
          <div class="intel-empty-icon-wrap">
            <svg
              viewBox="0 0 612 792"
              width="96"
              height="96"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="8"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
              />
              <polygon
                points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
              />
            </svg>
          </div>
          <h3 class="intel-empty-title">No Intel Report Yet</h3>
          <p class="intel-empty-desc">
            @if (isOwnProfile()) {
              Tap below to generate an AI-powered scouting report based on your profile data.
            } @else {
              No Intel report has been generated for this athlete yet.
            }
          </p>
          @if (isOwnProfile()) {
            <button
              class="intel-generate-btn"
              [disabled]="intel.isGenerating()"
              (click)="onGenerate()"
            >
              <svg
                viewBox="0 0 612 792"
                width="18"
                height="18"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="8"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
                />
                <polygon
                  points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
                />
              </svg>
              <span>{{ intel.isGenerating() ? 'Generating Intel…' : 'Generate Intel' }}</span>
            </button>
          }
        </div>
      } @else {
        <!-- ═══ INTEL REPORT ═══ -->

        <div class="intel-header" [attr.data-testid]="testIds.REPORT_CONTAINER">
          <div
            class="intel-score-ring"
            [attr.data-testid]="testIds.SCORE_RING"
            [style.--tier-color]="tierColor()"
          >
            <span class="intel-score-value">{{ report()!.overallScore }}</span>
          </div>
          <div class="intel-header-info">
            <div
              class="intel-tier-badge"
              [attr.data-testid]="testIds.TIER_BADGE"
              [style.--tier-color]="tierColor()"
            >
              {{ report()!.tierClassification }}
            </div>
            <span class="intel-sport-label">
              {{ report()!.sportName }} · {{ report()!.primaryPosition }}
            </span>
          </div>
          @if (isOwnProfile()) {
            <button
              class="intel-regen-btn"
              [attr.data-testid]="testIds.REGENERATE_BUTTON"
              [disabled]="intel.isGenerating()"
              (click)="onGenerate()"
              title="Regenerate Intel"
            >
              @if (intel.isGenerating()) {
                <span class="intel-spinner intel-spinner--sm"></span>
              } @else {
                <nxt1-icon name="refresh" [size]="16" />
              }
            </button>
          }
        </div>

        <div class="intel-ratings-card" [attr.data-testid]="testIds.RATINGS_CARD">
          <h3 class="intel-card-title">Scout Ratings</h3>
          <div class="intel-ratings-grid">
            @for (rating of ratingItems(); track rating.label) {
              <div class="intel-rating-item">
                <div class="intel-rating-bar-bg">
                  <div
                    class="intel-rating-bar-fill"
                    [style.width.%]="rating.value"
                    [style.--tier-color]="tierColor()"
                  ></div>
                </div>
                <div class="intel-rating-meta">
                  <span class="intel-rating-label">{{ rating.label }}</span>
                  <span class="intel-rating-value">{{ rating.value }}</span>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Percentile Rankings -->
        @if (report()!.percentileRankings) {
          <div class="intel-percentile-card" [attr.data-testid]="testIds.PERCENTILE_CARD">
            <h3 class="intel-card-title">Percentile Rankings</h3>
            <div class="intel-percentile-grid">
              <div class="intel-percentile-item">
                <span class="intel-percentile-val">{{ report()!.percentileRankings.overall }}</span>
                <span class="intel-percentile-label">Overall</span>
              </div>
              <div class="intel-percentile-item">
                <span class="intel-percentile-val">{{
                  report()!.percentileRankings.position
                }}</span>
                <span class="intel-percentile-label">Position</span>
              </div>
              <div class="intel-percentile-item">
                <span class="intel-percentile-val">{{ report()!.percentileRankings.state }}</span>
                <span class="intel-percentile-label">State</span>
              </div>
              <div class="intel-percentile-item">
                <span class="intel-percentile-val">{{
                  report()!.percentileRankings.measurableFit
                }}</span>
                <span class="intel-percentile-label">Measurable Fit</span>
              </div>
            </div>
          </div>
        }

        <div class="intel-brief-card" [attr.data-testid]="testIds.BRIEF_CARD">
          <h3 class="intel-card-title">Agent X Brief</h3>
          <p class="intel-brief-text">{{ report()!.aiBrief }}</p>
        </div>

        <!-- Strengths & Areas for Improvement -->
        <div class="intel-two-col">
          <div
            class="intel-list-card intel-list-card--strengths"
            [attr.data-testid]="testIds.STRENGTHS_CARD"
          >
            <h3 class="intel-card-title">
              <nxt1-icon name="trendingUp" [size]="16" />
              Strengths
            </h3>
            <ul class="intel-bullet-list">
              @for (s of report()!.strengths; track s) {
                <li>{{ s }}</li>
              }
            </ul>
          </div>
          <div
            class="intel-list-card intel-list-card--improve"
            [attr.data-testid]="testIds.IMPROVEMENTS_CARD"
          >
            <h3 class="intel-card-title">
              <nxt1-icon name="fitness" [size]="16" />
              Areas for Improvement
            </h3>
            <ul class="intel-bullet-list">
              @for (a of report()!.areasForImprovement; track a) {
                <li>{{ a }}</li>
              }
            </ul>
          </div>
        </div>

        <!-- Level Projections -->
        @if (report()!.levelProjections) {
          <div class="intel-projections-card" [attr.data-testid]="testIds.PROJECTIONS_CARD">
            <h3 class="intel-card-title">Level Projections</h3>
            <div class="intel-projections-grid">
              @for (p of projectionItems(); track p.label) {
                <div class="intel-projection-item">
                  <span class="intel-projection-label">{{ p.label }}</span>
                  <div class="intel-projection-bar-bg">
                    <div
                      class="intel-projection-bar-fill"
                      [style.width.%]="p.value"
                      [style.--tier-color]="tierColor()"
                    ></div>
                  </div>
                  <span class="intel-projection-val">{{ p.value }}%</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- Measurable Highlights -->
        @if (report()!.measurableHighlights.length > 0) {
          <div class="intel-data-card" [attr.data-testid]="testIds.MEASURABLES_CARD">
            <div class="intel-measurables-grid">
              @for (m of report()!.measurableHighlights; track m.label) {
                <div class="intel-measurable-item">
                  <span class="intel-measurable-val">
                    {{ m.value }}{{ m.unit ? ' ' + m.unit : '' }}
                    @if (m.trend === 'up') {
                      <nxt1-icon name="arrowUp" [size]="12" class="intel-trend-up" />
                    } @else if (m.trend === 'down') {
                      <nxt1-icon name="arrowDown" [size]="12" class="intel-trend-down" />
                    }
                  </span>
                  <span class="intel-measurable-label">{{ m.label }}</span>
                  @if (m.percentile) {
                    <span class="intel-measurable-pct">{{ m.percentile }}th pctl</span>
                  }
                  <span class="intel-source-badge">{{ sourceLabel(m.source) }}</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- Stat Highlights -->
        @if (report()!.statHighlights.length > 0) {
          <div class="intel-data-card" [attr.data-testid]="testIds.STATS_CARD">
            <h3 class="intel-card-title">Stat Highlights</h3>
            <div class="intel-stats-grid">
              @for (stat of report()!.statHighlights; track stat.label + stat.season) {
                <div class="intel-stat-item">
                  <span class="intel-stat-val">{{ stat.value }}</span>
                  <span class="intel-stat-label">{{ stat.label }}</span>
                  <span class="intel-stat-season">{{ stat.season }}</span>
                  <span class="intel-source-badge">{{ sourceLabel(stat.source) }}</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- Recruiting Summary -->
        @if (report()!.recruitingSummary) {
          <div class="intel-recruiting-card" [attr.data-testid]="testIds.RECRUITING_CARD">
            <h3 class="intel-card-title">
              <nxt1-icon name="school" [size]="16" />
              Recruiting Summary
            </h3>
            <p class="intel-recruiting-narrative">{{ report()!.recruitingSummary!.narrative }}</p>
            <div class="intel-recruiting-stats">
              <div class="intel-recruiting-stat">
                <span class="intel-recruiting-val">{{
                  report()!.recruitingSummary!.totalOffers
                }}</span>
                <span class="intel-recruiting-label">Offers</span>
              </div>
              <div class="intel-recruiting-stat">
                <span class="intel-recruiting-val">{{
                  report()!.recruitingSummary!.totalVisits
                }}</span>
                <span class="intel-recruiting-label">Visits</span>
              </div>
              <div class="intel-recruiting-stat">
                <span class="intel-recruiting-val">{{
                  report()!.recruitingSummary!.totalCamps
                }}</span>
                <span class="intel-recruiting-label">Camps</span>
              </div>
            </div>
            @if (report()!.recruitingSummary!.topPrograms.length > 0) {
              <div class="intel-recruiting-programs">
                <span class="intel-recruiting-programs-label">Top Programs:</span>
                {{ report()!.recruitingSummary!.topPrograms.join(', ') }}
              </div>
            }
          </div>
        }

        <!-- Missing Data Prompts -->
        @if (isOwnProfile() && report()!.missingDataPrompts.length > 0) {
          <div class="intel-missing-data" [attr.data-testid]="testIds.MISSING_DATA_SECTION">
            <h3 class="intel-card-title">
              <nxt1-icon name="informationCircle" [size]="16" />
              Strengthen Your Report
            </h3>
            <div class="intel-missing-grid">
              @for (prompt of report()!.missingDataPrompts; track prompt.category) {
                <div class="intel-missing-item">
                  <nxt1-icon [name]="prompt.icon" [size]="20" />
                  <div class="intel-missing-info">
                    <span class="intel-missing-title">{{ prompt.title }}</span>
                    <span class="intel-missing-desc">{{ prompt.description }}</span>
                  </div>
                  <button
                    class="intel-missing-cta"
                    [attr.data-testid]="testIds.MISSING_DATA_CTA"
                    (click)="onMissingDataClick(prompt)"
                  >
                    {{ prompt.actionLabel }}
                  </button>
                </div>
              }
            </div>
          </div>
        }

        <!-- Data Citations -->
        @if (report()!.citations.length > 0) {
          <div class="intel-citations" [attr.data-testid]="testIds.CITATIONS_SECTION">
            <h3 class="intel-card-title">Data Sources</h3>
            <div class="intel-citations-list">
              @for (c of report()!.citations; track c.platform + c.label) {
                <span class="intel-citation-badge">
                  {{ sourceLabel(c.platform) }}: {{ c.label }}
                </span>
              }
            </div>
          </div>
        }

        <!-- Quick Commands -->
        @if (report()!.quickCommands.length > 0) {
          <div class="intel-quick-commands" [attr.data-testid]="testIds.QUICK_COMMANDS_SECTION">
            <h3 class="intel-card-title">
              <nxt1-icon name="sparkles" [size]="16" />
              Agent X Quick Commands
            </h3>
            <div class="intel-commands-grid">
              @for (cmd of report()!.quickCommands; track cmd.id) {
                <button
                  class="intel-command-btn"
                  [attr.data-testid]="testIds.QUICK_COMMAND_BUTTON"
                  (click)="onQuickCommandClick(cmd)"
                >
                  <nxt1-icon [name]="cmd.icon" [size]="18" />
                  <div class="intel-command-text">
                    <span class="intel-command-label">{{ cmd.label }}</span>
                    <span class="intel-command-desc">{{ cmd.description }}</span>
                  </div>
                </button>
              }
            </div>
          </div>
        }

        <div class="intel-footer" [attr.data-testid]="testIds.REPORT_FOOTER">
          <span class="intel-footer-text"> Generated by Agent X · {{ intel.reportDate() }} </span>
        </div>
      }
    </section>
  `,
  styles: [
    `
      /* ─── Layout ─── */
      .intel-section {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 0 0 24px;
      }

      /* ─── Skeleton ─── */
      .intel-skeleton {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .intel-skeleton-header {
        height: 80px;
        border-radius: 12px;
        background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08));
      }
      .intel-skeleton-ratings {
        height: 140px;
        border-radius: 12px;
        background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08));
      }
      .intel-skeleton-brief {
        height: 100px;
        border-radius: 12px;
        background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08));
      }
      .intel-skeleton-cards {
        height: 200px;
        border-radius: 12px;
        background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08));
      }
      .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }

      /* ─── Empty State ─── */
      .intel-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 48px 24px;
        text-align: center;
      }
      .intel-empty-icon-wrap {
        color: var(--nxt1-color-primary, #ccff00);
      }
      .intel-empty-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0;
      }
      .intel-empty-desc {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0;
        max-width: 360px;
        line-height: 1.5;
      }
      .intel-generate-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 24px;
        border-radius: 20px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #000000);
        transition:
          background 0.15s ease,
          transform 0.1s ease;
      }
      .intel-generate-btn:hover {
        background: var(--nxt1-color-primaryDark, #a3cc00);
      }
      .intel-generate-btn:active {
        transform: scale(0.97);
      }
      .intel-generate-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* ─── CTA Button ─── */
      .intel-cta-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        color: var(--nxt1-color-text-primary, #ffffff);
        transition:
          background 0.15s ease,
          transform 0.1s ease;
      }
      .intel-cta-btn:hover {
        background: var(--nxt1-color-surface-300, #222222);
      }
      .intel-cta-btn:active {
        transform: scale(0.97);
      }
      .intel-cta-btn--generate {
        background: var(--nxt1-color-primary, #ccff00);
        color: #000;
      }
      .intel-cta-btn--generate:hover {
        filter: brightness(1.1);
      }
      .intel-cta-btn:disabled {
        opacity: 0.6;
        pointer-events: none;
      }

      /* ─── Spinner ─── */
      .intel-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid var(--nxt1-color-text-disabled, rgba(255, 255, 255, 0.3));
        border-top-color: var(--nxt1-color-text-primary, #ffffff);
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      .intel-spinner--sm {
        width: 14px;
        height: 14px;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* ─── Header ─── */
      .intel-header {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px;
        border-radius: 12px;
        background: var(--nxt1-color-surface-200, #1a1a1a);
      }
      .intel-score-ring {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: conic-gradient(
          var(--tier-color, #6366f1) calc(var(--score, 0) * 3.6deg),
          transparent 0
        );
        position: relative;
      }
      .intel-score-ring::before {
        content: '';
        position: absolute;
        inset: 4px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-200, #1a1a1a);
      }
      .intel-score-value {
        position: relative;
        z-index: 1;
        font-size: 20px;
        font-weight: 800;
        color: var(--nxt1-color-text-primary, #ffffff);
      }
      .intel-header-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .intel-tier-badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        background: color-mix(in srgb, var(--tier-color, #6366f1) 20%, transparent);
        color: var(--tier-color, #6366f1);
        width: fit-content;
      }
      .intel-sport-label {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }
      .intel-regen-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        background: var(--nxt1-color-surface-300, #222222);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        transition: background 0.15s ease;
      }
      .intel-regen-btn:hover {
        background: var(--nxt1-color-surface-400, #2a2a2a);
        color: var(--nxt1-color-text-primary, #ffffff);
      }
      .intel-regen-btn:disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      /* ─── Card Shared ─── */
      .intel-ratings-card,
      .intel-percentile-card,
      .intel-brief-card,
      .intel-list-card,
      .intel-projections-card,
      .intel-data-card,
      .intel-recruiting-card,
      .intel-missing-data,
      .intel-citations,
      .intel-quick-commands {
        padding: 16px;
        border-radius: 12px;
        background: var(--nxt1-color-surface-200, #1a1a1a);
      }
      .intel-card-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0 0 12px;
      }

      /* ─── Ratings ─── */
      .intel-ratings-grid {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .intel-rating-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .intel-rating-bar-bg {
        height: 8px;
        border-radius: 4px;
        background: var(--nxt1-color-surface-300, #222222);
        overflow: hidden;
      }
      .intel-rating-bar-fill {
        height: 100%;
        border-radius: 4px;
        background: var(--tier-color, #6366f1);
        transition: width 0.6s ease;
      }
      .intel-rating-meta {
        display: flex;
        justify-content: space-between;
      }
      .intel-rating-label {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }
      .intel-rating-value {
        font-size: 12px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      /* ─── Percentile ─── */
      .intel-percentile-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        text-align: center;
      }
      .intel-percentile-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .intel-percentile-val {
        font-size: 22px;
        font-weight: 800;
        color: var(--nxt1-color-text-primary, #ffffff);
      }
      .intel-percentile-label {
        font-size: 11px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      /* ─── Brief ─── */
      .intel-brief-text {
        font-size: 14px;
        line-height: 1.6;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0;
      }

      /* ─── Two-Column ─── */
      .intel-two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      @media (max-width: 640px) {
        .intel-two-col {
          grid-template-columns: 1fr;
        }
      }
      .intel-bullet-list {
        margin: 0;
        padding: 0 0 0 18px;
        font-size: 13px;
        line-height: 1.7;
        color: var(--nxt1-color-text-primary, #ffffff);
      }
      .intel-list-card--strengths .intel-card-title {
        color: var(--nxt1-color-success, #22c55e);
      }
      .intel-list-card--improve .intel-card-title {
        color: var(--nxt1-color-warning, #f59e0b);
      }

      /* ─── Projections ─── */
      .intel-projections-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .intel-projection-item {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .intel-projection-label {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        width: 40px;
        flex-shrink: 0;
      }
      .intel-projection-bar-bg {
        flex: 1;
        height: 8px;
        border-radius: 4px;
        background: var(--nxt1-color-surface-300, #222222);
        overflow: hidden;
      }
      .intel-projection-bar-fill {
        height: 100%;
        border-radius: 4px;
        background: var(--tier-color, #6366f1);
        transition: width 0.6s ease;
      }
      .intel-projection-val {
        font-size: 12px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        width: 36px;
        text-align: right;
        flex-shrink: 0;
      }

      /* ─── Measurables ─── */
      .intel-measurables-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 12px;
      }
      .intel-measurable-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 12px;
        border-radius: 8px;
        background: var(--nxt1-color-surface-300, #222222);
      }
      .intel-measurable-val {
        font-size: 18px;
        font-weight: 800;
        color: var(--nxt1-color-text-primary, #ffffff);
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .intel-measurable-label {
        font-size: 11px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .intel-measurable-pct {
        font-size: 11px;
        color: var(--nxt1-color-primary, #ccff00);
        font-weight: 600;
      }
      .intel-trend-up {
        color: var(--nxt1-color-success, #22c55e);
      }
      .intel-trend-down {
        color: var(--nxt1-color-error, #ef4444);
      }

      /* ─── Source Badge ─── */
      .intel-source-badge {
        font-size: 10px;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      /* ─── Stats ─── */
      .intel-stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 12px;
      }
      .intel-stat-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 12px;
        border-radius: 8px;
        background: var(--nxt1-color-surface-300, #222222);
      }
      .intel-stat-val {
        font-size: 18px;
        font-weight: 800;
        color: var(--nxt1-color-text-primary, #ffffff);
      }
      .intel-stat-label {
        font-size: 11px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-transform: uppercase;
      }
      .intel-stat-season {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ─── Recruiting ─── */
      .intel-recruiting-narrative {
        font-size: 14px;
        line-height: 1.6;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 12px;
      }
      .intel-recruiting-stats {
        display: flex;
        gap: 24px;
        margin-bottom: 8px;
      }
      .intel-recruiting-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .intel-recruiting-val {
        font-size: 20px;
        font-weight: 800;
        color: var(--nxt1-color-text-primary, #ffffff);
      }
      .intel-recruiting-label {
        font-size: 11px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-transform: uppercase;
      }
      .intel-recruiting-programs {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin-top: 8px;
      }
      .intel-recruiting-programs-label {
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      /* ─── Missing Data ─── */
      .intel-missing-grid {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .intel-missing-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        background: var(--nxt1-color-surface-300, #222222);
      }
      .intel-missing-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .intel-missing-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }
      .intel-missing-desc {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }
      .intel-missing-cta {
        padding: 6px 14px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        background: var(--nxt1-color-primary, #ccff00);
        color: #000;
        transition: filter 0.15s ease;
      }
      .intel-missing-cta:hover {
        filter: brightness(1.15);
      }

      /* ─── Citations ─── */
      .intel-citations-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .intel-citation-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        background: var(--nxt1-color-surface-300, #222222);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* ─── Quick Commands ─── */
      .intel-commands-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .intel-command-btn {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: 10px;
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        background: transparent;
        color: var(--nxt1-color-text-primary, #ffffff);
        cursor: pointer;
        text-align: left;
        transition: background 0.15s ease;
      }
      .intel-command-btn:hover {
        background: var(--nxt1-color-surface-300, #222222);
      }
      .intel-command-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .intel-command-label {
        font-size: 13px;
        font-weight: 600;
      }
      .intel-command-desc {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* ─── Footer ─── */
      .intel-footer {
        text-align: center;
        padding: 8px 0;
      }
      .intel-footer-text {
        font-size: 11px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }
    `,
  ],
})
export class AthleteIntelComponent {
  protected readonly intel = inject(IntelService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  /** TEST_IDS for template data-testid bindings. */
  protected readonly testIds = TEST_IDS.INTEL;

  /** User ID to load Intel for. */
  readonly userId = input.required<string>();

  /** Whether the viewer owns this profile. */
  readonly isOwnProfile = input(false);

  /** Emitted when user clicks a missing data CTA. */
  readonly missingDataAction = output<IntelMissingDataPrompt>();

  /** Emitted when user clicks a quick command. */
  readonly quickCommandClick = output<IntelQuickCommand>();

  protected readonly report = this.intel.athleteReport;

  protected readonly tierColor = computed(() => {
    const tier = this.report()?.tierClassification;
    return tier ? (TIER_COLORS[tier] ?? '#6366F1') : '#6366F1';
  });

  protected readonly ratingItems = computed(() => {
    const r = this.report()?.ratings;
    if (!r) return [];
    return [
      { label: 'Physical', value: r.physical },
      { label: 'Technical', value: r.technical },
      { label: 'Mental', value: r.mental },
      { label: 'Potential', value: r.potential },
    ];
  });

  protected readonly projectionItems = computed(() => {
    const p = this.report()?.levelProjections;
    if (!p) return [];
    return [
      { label: 'D1', value: p.d1 },
      { label: 'D2', value: p.d2 },
      { label: 'D3', value: p.d3 },
      { label: 'NAIA', value: p.naia },
      { label: 'JUCO', value: p.juco },
    ];
  });

  /** Load Intel reactively when userId becomes available / changes. */
  constructor() {
    effect(() => {
      const id = this.userId();
      if (id) this.intel.loadAthleteIntel(id);
    });
  }

  protected onGenerate(): void {
    this.intel.generateAthleteIntel(this.userId());
  }

  protected onMissingDataClick(prompt: IntelMissingDataPrompt): void {
    this.analytics?.trackEvent(APP_EVENTS.INTEL_MISSING_DATA_CTA, {
      dataCategory: prompt.category,
      userId: this.userId(),
    });
    this.missingDataAction.emit(prompt);
  }

  protected onQuickCommandClick(cmd: IntelQuickCommand): void {
    this.analytics?.trackEvent(APP_EVENTS.INTEL_QUICK_COMMAND, {
      commandId: cmd.id,
      label: cmd.label,
      userId: this.userId(),
    });
    this.quickCommandClick.emit(cmd);
  }

  protected sourceLabel(source: IntelDataSource): string {
    return SOURCE_LABELS[source] ?? source;
  }
}
