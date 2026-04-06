/**
 * @fileoverview Team Intel Component
 * @module @nxt1/ui/intel
 *
 * Renders the AI-generated Intel report for team profiles.
 * Shows season outlook, team identity, roster intelligence,
 * historical performance, recruiting pipeline, and quick commands.
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
import { ANALYTICS_ADAPTER } from '../services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TEST_IDS } from '@nxt1/core/testing';
import { IntelService } from './intel.service';
import type {
  IntelMissingDataPrompt,
  IntelQuickCommand,
  IntelRosterProspect,
  IntelDataSource,
} from '@nxt1/core';

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
  selector: 'nxt1-team-intel',
  standalone: true,
  imports: [NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="intel-section"
      [attr.data-testid]="testIds.TEAM_SECTION"
      aria-labelledby="team-intel-heading"
    >
      <h2 id="team-intel-heading" class="sr-only">Team Intelligence Report</h2>

      @if (intel.isLoading()) {
        <div class="intel-skeleton" [attr.data-testid]="testIds.LOADING_SKELETON">
          <div class="intel-skeleton-header animate-pulse"></div>
          <div class="intel-skeleton-brief animate-pulse"></div>
          <div class="intel-skeleton-cards animate-pulse"></div>
          <div class="intel-skeleton-ratings animate-pulse"></div>
        </div>
      } @else if (intel.error() && !report()) {
        <div class="madden-empty" [attr.data-testid]="testIds.ERROR_STATE">
          <div class="madden-empty__icon" aria-hidden="true">
            <nxt1-icon name="alert-circle-outline" [size]="40" />
          </div>
          <h3>Unable to load Intel</h3>
          <p>{{ intel.error() }}</p>
          @if (canGenerate()) {
            <button
              type="button"
              class="madden-cta-btn"
              [attr.data-testid]="testIds.GENERATE_BUTTON"
              (click)="onGenerate()"
            >
              Try Again
            </button>
          }
        </div>
      } @else if (!report()) {
        <div class="madden-empty" [attr.data-testid]="testIds.EMPTY_STATE">
          <div class="madden-empty__icon" aria-hidden="true">
            <nxt1-icon name="sparkles" [size]="40" />
          </div>
          <h3>No Team Intel Yet</h3>
          <p>
            @if (canGenerate()) {
              Generate an AI-powered scouting report for this team.
            } @else {
              No Intel report has been generated for this team yet.
            }
          </p>
          @if (canGenerate()) {
            <button
              type="button"
              class="madden-cta-btn"
              [attr.data-testid]="testIds.GENERATE_BUTTON"
              [disabled]="intel.isGenerating()"
              (click)="onGenerate()"
            >
              @if (intel.isGenerating()) {
                Generating Intel…
              } @else {
                Generate Team Intel
              }
            </button>
          }
        </div>
      } @else {
        <!-- ═══ TEAM INTEL REPORT ═══ -->

        <div class="intel-header" [attr.data-testid]="testIds.REPORT_CONTAINER">
          <div class="intel-header-info">
            <h3 class="intel-team-name">{{ report()!.teamName }}</h3>
            <span class="intel-sport-label"
              >{{ report()!.sport }} · {{ report()!.overallRecord }}</span
            >
          </div>
          @if (canGenerate()) {
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

        <div class="intel-grid intel-grid--intro">
          <div class="intel-brief-card" [attr.data-testid]="testIds.SEASON_OUTLOOK_CARD">
            <h3 class="intel-card-title">Season Outlook</h3>
            <p class="intel-brief-text">{{ report()!.seasonOutlook }}</p>
          </div>

          <div class="intel-brief-card" [attr.data-testid]="testIds.TEAM_IDENTITY_CARD">
            <h3 class="intel-card-title">Team Identity</h3>
            <p class="intel-brief-text">{{ report()!.teamIdentity }}</p>
          </div>
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

        @if (report()!.topProspects.length > 0 || report()!.seasonHistory.length > 0) {
          <div class="intel-grid intel-grid--analysis">
            <!-- Top Prospects -->
            @if (report()!.topProspects.length > 0) {
              <div class="intel-data-card" [attr.data-testid]="testIds.TOP_PROSPECTS_SECTION">
                <h3 class="intel-card-title">
                  <nxt1-icon name="star" [size]="16" />
                  Top Prospects
                </h3>
                <div class="intel-prospects-list">
                  @for (prospect of report()!.topProspects; track prospect.userId) {
                    <div
                      class="intel-prospect-row"
                      [attr.data-testid]="testIds.PROSPECT_ROW"
                      role="button"
                      tabindex="0"
                      (click)="prospectClick.emit(prospect)"
                      (keydown.enter)="prospectClick.emit(prospect)"
                    >
                      <div
                        class="intel-prospect-score"
                        [style.--tier-color]="prospectTierColor(prospect)"
                      >
                        {{ prospect.overallScore }}
                      </div>
                      <div class="intel-prospect-info">
                        <span class="intel-prospect-name">{{ prospect.name }}</span>
                        <span class="intel-prospect-meta">
                          {{ prospect.position }} · {{ prospect.classYear }}
                        </span>
                      </div>
                      <span class="intel-prospect-tier" [style.color]="prospectTierColor(prospect)">
                        {{ prospect.tierClassification }}
                      </span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Season History -->
            @if (report()!.seasonHistory.length > 0) {
              <div class="intel-data-card" [attr.data-testid]="testIds.SEASON_HISTORY_CARD">
                <h3 class="intel-card-title">Season History</h3>
                <div class="intel-season-list">
                  @for (season of report()!.seasonHistory; track season.season) {
                    <div class="intel-season-item">
                      <div class="intel-season-header">
                        <span class="intel-season-year">{{ season.season }}</span>
                        <span class="intel-season-record">{{ season.record }}</span>
                        @if (season.conference) {
                          <span class="intel-season-conf">{{ season.conference }}</span>
                        }
                      </div>
                      @if (season.highlights.length > 0) {
                        <ul class="intel-season-highlights">
                          @for (h of season.highlights; track h) {
                            <li>{{ h }}</li>
                          }
                        </ul>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }

        @if (
          report()!.rosterDepthSummary ||
          report()!.historicalNarrative ||
          report()!.recruitingPipeline ||
          report()!.competitiveAnalysis
        ) {
          <div class="intel-grid intel-grid--support">
            <!-- Roster Depth Summary -->
            @if (report()!.rosterDepthSummary) {
              <div class="intel-brief-card" [attr.data-testid]="testIds.ROSTER_DEPTH_CARD">
                <h3 class="intel-card-title">Roster Depth</h3>
                <p class="intel-brief-text">{{ report()!.rosterDepthSummary }}</p>
                @if (classBreakdownEntries().length > 0) {
                  <div class="intel-class-breakdown">
                    @for (entry of classBreakdownEntries(); track entry.label) {
                      <div class="intel-class-item">
                        <span class="intel-class-val">{{ entry.count }}</span>
                        <span class="intel-class-label">{{ entry.label }}</span>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- Historical Narrative -->
            @if (report()!.historicalNarrative) {
              <div class="intel-brief-card">
                <h3 class="intel-card-title">Historical Narrative</h3>
                <p class="intel-brief-text">{{ report()!.historicalNarrative }}</p>
              </div>
            }

            <!-- Recruiting Pipeline -->
            @if (report()!.recruitingPipeline) {
              <div class="intel-brief-card" [attr.data-testid]="testIds.RECRUITING_PIPELINE_CARD">
                <h3 class="intel-card-title">
                  <nxt1-icon name="school" [size]="16" />
                  Recruiting Pipeline
                </h3>
                <p class="intel-brief-text">{{ report()!.recruitingPipeline }}</p>
              </div>
            }

            <!-- Competitive Analysis -->
            @if (report()!.competitiveAnalysis) {
              <div class="intel-brief-card">
                <h3 class="intel-card-title">Competitive Analysis</h3>
                <p class="intel-brief-text">{{ report()!.competitiveAnalysis }}</p>
              </div>
            }
          </div>
        }

        <!-- Missing Data Prompts -->
        @if (canGenerate() && report()!.missingDataPrompts.length > 0) {
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

        <!-- Citations -->
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
      :host {
        display: block;
        --intel-surface: var(--nxt1-ui-bg-card, var(--m-surface, rgba(255, 255, 255, 0.04)));
        --intel-surface-elevated: var(
          --nxt1-color-surface-200,
          var(--m-surface-2, rgba(255, 255, 255, 0.06))
        );
        --intel-border: var(--nxt1-ui-border-subtle, var(--m-border, rgba(255, 255, 255, 0.08)));
        --intel-border-strong: var(--nxt1-ui-border-default, rgba(255, 255, 255, 0.12));
        --intel-text: var(--nxt1-ui-text-primary, var(--m-text, #ffffff));
        --intel-text-secondary: var(
          --nxt1-ui-text-secondary,
          var(--m-text-2, rgba(255, 255, 255, 0.7))
        );
        --intel-text-muted: var(--nxt1-ui-text-muted, var(--m-text-3, rgba(255, 255, 255, 0.45)));
        --intel-accent: var(--nxt1-ui-primary, var(--m-accent, #d4ff00));
        --intel-radius: var(--nxt1-ui-radius-lg, 14px);
        --intel-radius-sm: var(--nxt1-ui-radius-default, 12px);
        --intel-shadow: var(--nxt1-ui-shadow-sm, 0 10px 28px rgba(0, 0, 0, 0.14));
      }

      /* ─── Layout ─── */
      .intel-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5, 20px);
        padding: var(--nxt1-spacing-1, 4px) 0 var(--nxt1-spacing-6, 24px);
      }
      .intel-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--nxt1-spacing-4, 16px);
        align-items: start;
      }
      .intel-grid > * {
        min-width: 0;
      }
      .intel-grid > :only-child {
        grid-column: 1 / -1;
      }
      .intel-grid--support {
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      /* ─── Skeleton ─── */
      .intel-skeleton {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
      }
      .intel-skeleton-header,
      .intel-skeleton-brief,
      .intel-skeleton-cards,
      .intel-skeleton-ratings {
        border-radius: var(--intel-radius-sm);
        background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08));
      }
      .intel-skeleton-header {
        height: 64px;
      }
      .intel-skeleton-brief {
        height: 100px;
      }
      .intel-skeleton-cards {
        height: 200px;
      }
      .intel-skeleton-ratings {
        height: 160px;
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
      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        color: var(--intel-text-secondary);
      }
      .madden-empty h3 {
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--intel-text);
        margin: 16px 0 8px;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.02em;
      }
      .madden-empty__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--intel-surface-elevated);
        border: 1px solid var(--intel-border);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
        color: var(--intel-text-muted);
      }
      .madden-empty p {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--intel-text-secondary);
        margin: 0;
        max-width: 280px;
        line-height: var(--nxt1-lineHeight-relaxed, 1.625);
      }
      .madden-cta-btn {
        margin-top: 12px;
        padding: 10px 24px;
        background: var(--intel-accent);
        border: none;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        color: var(--nxt1-color-text-onPrimary, #000000);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.02em;
        cursor: pointer;
        transition:
          transform var(--nxt1-ui-transition-fast, 150ms) ease,
          filter var(--nxt1-ui-transition-fast, 150ms) ease,
          box-shadow var(--nxt1-ui-transition-fast, 150ms) ease;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.08);
        box-shadow: var(--nxt1-glow-sm, 0 0 0 1px rgba(204, 255, 0, 0.12));
      }
      .madden-cta-btn:active {
        filter: brightness(0.95);
        transform: translateY(1px);
      }
      .madden-cta-btn:disabled {
        opacity: 0.6;
        pointer-events: none;
      }

      /* ─── Spinner ─── */
      .intel-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid var(--intel-text-muted);
        border-top-color: var(--intel-text);
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
        padding: var(--nxt1-spacing-4, 16px);
        border-radius: var(--intel-radius);
        border: 1px solid color-mix(in srgb, var(--intel-accent) 16%, var(--intel-border-strong));
        background:
          linear-gradient(
            160deg,
            color-mix(in srgb, var(--intel-accent) 10%, transparent),
            transparent 42%
          ),
          var(--intel-surface);
        box-shadow: var(--intel-shadow);
      }
      .intel-header-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .intel-team-name {
        font-size: var(--nxt1-fontSize-xl, 1.5rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--intel-text);
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.01em;
      }
      .intel-sport-label {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--intel-text-secondary);
      }
      .intel-regen-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: var(--intel-radius-sm);
        border: 1px solid var(--intel-border);
        cursor: pointer;
        background: var(--intel-surface-elevated);
        color: var(--intel-text-secondary);
        transition:
          background var(--nxt1-ui-transition-fast, 150ms) ease,
          color var(--nxt1-ui-transition-fast, 150ms) ease,
          border-color var(--nxt1-ui-transition-fast, 150ms) ease;
      }
      .intel-regen-btn:hover {
        background: color-mix(in srgb, var(--intel-accent) 10%, var(--intel-surface-elevated));
        color: var(--intel-text);
        border-color: color-mix(in srgb, var(--intel-accent) 30%, var(--intel-border));
      }
      .intel-regen-btn:disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      /* ─── Shared Surfaces ─── */
      .intel-brief-card,
      .intel-list-card,
      .intel-data-card,
      .intel-missing-data,
      .intel-citations,
      .intel-quick-commands {
        padding: var(--nxt1-spacing-4, 16px);
        border-radius: var(--intel-radius);
        background: var(--intel-surface);
        border: 1px solid var(--intel-border);
        box-shadow: var(--intel-shadow);
      }
      .intel-card-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wider, 0.05em);
        color: var(--intel-text-muted);
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }
      .intel-brief-text {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        line-height: var(--nxt1-lineHeight-relaxed, 1.625);
        color: var(--intel-text-secondary);
        margin: 0;
      }

      /* ─── Two-Column ─── */
      .intel-two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .intel-bullet-list {
        margin: 0;
        padding: 0 0 0 18px;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        line-height: var(--nxt1-lineHeight-relaxed, 1.625);
        color: var(--intel-text-secondary);
      }
      .intel-list-card--strengths {
        border-color: color-mix(
          in srgb,
          var(--nxt1-color-success, #22c55e) 22%,
          var(--intel-border)
        );
      }
      .intel-list-card--strengths .intel-card-title {
        color: var(--nxt1-color-success, #22c55e);
      }
      .intel-list-card--improve {
        border-color: color-mix(
          in srgb,
          var(--nxt1-color-warning, #f59e0b) 22%,
          var(--intel-border)
        );
      }
      .intel-list-card--improve .intel-card-title {
        color: var(--nxt1-color-warning, #f59e0b);
      }

      /* ─── Prospects ─── */
      .intel-prospects-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .intel-prospect-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: var(--intel-radius-sm);
        cursor: pointer;
        background: var(--intel-surface-elevated);
        border: 1px solid var(--intel-border);
        transition:
          background var(--nxt1-ui-transition-fast, 150ms) ease,
          border-color var(--nxt1-ui-transition-fast, 150ms) ease,
          transform var(--nxt1-ui-transition-fast, 150ms) ease;
      }
      .intel-prospect-row:hover {
        background: color-mix(in srgb, var(--intel-accent) 7%, var(--intel-surface-elevated));
        border-color: color-mix(in srgb, var(--intel-accent) 24%, var(--intel-border));
        transform: translateY(-1px);
      }
      .intel-prospect-score {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--intel-text);
        background: color-mix(
          in srgb,
          var(--tier-color, #6366f1) 30%,
          var(--intel-surface-elevated)
        );
        border: 2px solid var(--tier-color, #6366f1);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }
      .intel-prospect-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .intel-prospect-name {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--intel-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .intel-prospect-meta {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--intel-text-secondary);
      }
      .intel-prospect-tier {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide, 0.025em);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        flex-shrink: 0;
      }

      /* ─── Class Breakdown ─── */
      .intel-class-breakdown {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--intel-border);
      }
      .intel-class-item {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .intel-class-val {
        font-size: var(--nxt1-fontSize-lg, 1.25rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--intel-text);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }
      .intel-class-label {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        color: var(--intel-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide, 0.025em);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }

      /* ─── Season History ─── */
      .intel-season-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .intel-season-item {
        padding: 10px 12px;
        border-radius: var(--intel-radius-sm);
        background: var(--intel-surface-elevated);
        border: 1px solid var(--intel-border);
      }
      .intel-season-header {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 6px;
      }
      .intel-season-year {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--intel-text);
      }
      .intel-season-record {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--intel-accent);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }
      .intel-season-conf {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--intel-text-secondary);
      }
      .intel-season-highlights {
        margin: 0;
        padding: 0 0 0 18px;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        line-height: var(--nxt1-lineHeight-relaxed, 1.625);
        color: var(--intel-text-secondary);
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
        border-radius: var(--intel-radius-sm);
        background: var(--intel-surface-elevated);
        border: 1px solid var(--intel-border);
      }
      .intel-missing-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .intel-missing-title {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--intel-text);
      }
      .intel-missing-desc {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--intel-text-secondary);
        line-height: var(--nxt1-lineHeight-normal, 1.5);
      }
      .intel-missing-cta {
        padding: 7px 14px;
        border-radius: var(--intel-radius-sm);
        border: none;
        cursor: pointer;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        white-space: nowrap;
        background: var(--intel-accent);
        color: var(--nxt1-color-text-onPrimary, #000000);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.02em;
        transition:
          filter var(--nxt1-ui-transition-fast, 150ms) ease,
          transform var(--nxt1-ui-transition-fast, 150ms) ease;
      }
      .intel-missing-cta:hover {
        filter: brightness(1.08);
        transform: translateY(-1px);
      }

      /* ─── Citations ─── */
      .intel-citations-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .intel-citation-badge {
        display: inline-block;
        padding: 5px 10px;
        border-radius: 999px;
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        background: var(--intel-surface-elevated);
        color: var(--intel-text-secondary);
        border: 1px solid var(--intel-border);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.03em;
        text-transform: uppercase;
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
        border-radius: var(--intel-radius-sm);
        border: 1px solid var(--intel-border);
        background: var(--intel-surface-elevated);
        color: var(--intel-text);
        cursor: pointer;
        text-align: left;
        transition:
          background var(--nxt1-ui-transition-fast, 150ms) ease,
          border-color var(--nxt1-ui-transition-fast, 150ms) ease,
          transform var(--nxt1-ui-transition-fast, 150ms) ease;
      }
      .intel-command-btn:hover {
        background: color-mix(in srgb, var(--intel-accent) 8%, var(--intel-surface-elevated));
        border-color: color-mix(in srgb, var(--intel-accent) 28%, var(--intel-border));
        transform: translateY(-1px);
      }
      .intel-command-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .intel-command-label {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.01em;
      }
      .intel-command-desc {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--intel-text-secondary);
        line-height: var(--nxt1-lineHeight-normal, 1.5);
      }

      /* ─── Shared Focus ─── */
      .madden-cta-btn:focus-visible,
      .intel-regen-btn:focus-visible,
      .intel-command-btn:focus-visible,
      .intel-missing-cta:focus-visible,
      .intel-prospect-row:focus-visible {
        outline: none;
        box-shadow:
          0 0 0 2px var(--nxt1-color-focus-ringOffset, rgba(10, 10, 10, 1)),
          0 0 0 4px var(--nxt1-color-focus-ring, rgba(204, 255, 0, 0.5));
      }

      /* ─── Footer ─── */
      .intel-footer {
        text-align: center;
        padding: 4px 0 0;
      }
      .intel-footer-text {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        color: var(--intel-text-muted);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: var(--nxt1-letterSpacing-wide, 0.025em);
        text-transform: uppercase;
      }

      @media (max-width: 900px) {
        .intel-grid,
        .intel-two-col {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 640px) {
        .intel-header,
        .intel-prospect-row,
        .intel-missing-item,
        .intel-command-btn {
          align-items: flex-start;
        }
        .intel-header {
          flex-wrap: wrap;
        }
        .intel-missing-item {
          flex-wrap: wrap;
        }
        .intel-missing-cta {
          width: 100%;
        }
        .intel-prospect-tier {
          margin-left: 50px;
        }
      }
    `,
  ],
})
export class TeamIntelComponent {
  protected readonly intel = inject(IntelService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  /** TEST_IDS for template data-testid bindings. */
  protected readonly testIds = TEST_IDS.INTEL;

  /** Team ID to load Intel for. */
  readonly teamId = input.required<string>();

  /** Whether the viewer is an admin/coach of this team. */
  readonly canGenerate = input(false);

  /** Emitted when user clicks a missing data CTA. */
  readonly missingDataAction = output<IntelMissingDataPrompt>();

  /** Emitted when user clicks a quick command. */
  readonly quickCommandClick = output<IntelQuickCommand>();

  /** Emitted when user clicks a prospect row. */
  readonly prospectClick = output<IntelRosterProspect>();

  protected readonly report = this.intel.teamReport;

  protected readonly classBreakdownEntries = computed(() => {
    const breakdown = this.report()?.classBreakdown;
    if (!breakdown) return [];
    return Object.entries(breakdown).map(([label, count]) => ({ label, count }));
  });

  /** Load Intel reactively when teamId becomes available / changes. */
  constructor() {
    effect(() => {
      const id = this.teamId();
      if (id) this.intel.loadTeamIntel(id);
    });
  }

  protected onGenerate(): void {
    this.intel.generateTeamIntel(this.teamId());
  }

  protected onMissingDataClick(prompt: IntelMissingDataPrompt): void {
    this.analytics?.trackEvent(APP_EVENTS.INTEL_MISSING_DATA_CTA, {
      teamId: this.teamId(),
      dataCategory: prompt.category,
    });
    this.missingDataAction.emit(prompt);
  }

  protected onQuickCommandClick(cmd: IntelQuickCommand): void {
    this.analytics?.trackEvent(APP_EVENTS.INTEL_QUICK_COMMAND, {
      teamId: this.teamId(),
      command: cmd.label,
    });
    this.quickCommandClick.emit(cmd);
  }

  protected prospectTierColor(prospect: IntelRosterProspect): string {
    return TIER_COLORS[prospect.tierClassification] ?? '#6366F1';
  }

  protected sourceLabel(source: IntelDataSource): string {
    return SOURCE_LABELS[source] ?? source;
  }
}
