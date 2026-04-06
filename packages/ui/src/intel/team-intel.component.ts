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

        <div class="intel-brief-card" [attr.data-testid]="testIds.SEASON_OUTLOOK_CARD">
          <h3 class="intel-card-title">Season Outlook</h3>
          <p class="intel-brief-text">{{ report()!.seasonOutlook }}</p>
        </div>

        <div class="intel-brief-card" [attr.data-testid]="testIds.TEAM_IDENTITY_CARD">
          <h3 class="intel-card-title">Team Identity</h3>
          <p class="intel-brief-text">{{ report()!.teamIdentity }}</p>
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
        height: 64px;
        border-radius: 12px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
      }
      .intel-skeleton-brief {
        height: 100px;
        border-radius: 12px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
      }
      .intel-skeleton-cards {
        height: 200px;
        border-radius: 12px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
      }
      .intel-skeleton-ratings {
        height: 160px;
        border-radius: 12px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
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

      /* ─── Empty State (Madden pattern — matches team-timeline / team-roster) ─── */
      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
      }
      .madden-empty h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--m-text);
        margin: 16px 0 8px;
      }
      .madden-empty__icon {
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
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0;
        max-width: 280px;
      }
      .madden-cta-btn {
        margin-top: 12px;
        padding: 10px 24px;
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: 9999px;
        color: #000;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }
      .madden-cta-btn:active {
        filter: brightness(0.95);
      }
      .madden-cta-btn:disabled {
        opacity: 0.6;
        pointer-events: none;
      }

      /* ─── CTA / Spinner ─── */
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
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
        color: var(--m-text, #ffffff);
        transition:
          background 0.15s ease,
          transform 0.1s ease;
      }
      .intel-cta-btn:hover {
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
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
      .intel-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid var(--m-text-3, rgba(255, 255, 255, 0.3));
        border-top-color: var(--m-text, #ffffff);
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
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
      }
      .intel-header-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .intel-team-name {
        font-size: 18px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        margin: 0;
      }
      .intel-sport-label {
        font-size: 13px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
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
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
        transition: background 0.15s ease;
      }
      .intel-regen-btn:hover {
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
        color: var(--m-text, #ffffff);
      }
      .intel-regen-btn:disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      /* ─── Card shared ─── */
      .intel-brief-card,
      .intel-list-card,
      .intel-data-card,
      .intel-missing-data,
      .intel-citations,
      .intel-quick-commands {
        padding: 16px;
        border-radius: 12px;
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
      }
      .intel-card-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
        margin: 0 0 12px;
      }
      .intel-brief-text {
        font-size: 14px;
        line-height: 1.6;
        color: var(--m-text, #ffffff);
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
        color: var(--m-text, #ffffff);
      }
      .intel-list-card--strengths .intel-card-title {
        color: var(--nxt1-color-success, #22c55e);
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
        padding: 10px;
        border-radius: 8px;
        cursor: pointer;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        transition: background 0.15s ease;
      }
      .intel-prospect-row:hover {
        background: var(--m-surface-2, rgba(255, 255, 255, 0.06));
      }
      .intel-prospect-score {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
        background: color-mix(
          in srgb,
          var(--tier-color, #6366f1) 30%,
          var(--m-surface, rgba(255, 255, 255, 0.04))
        );
        border: 2px solid var(--tier-color, #6366f1);
      }
      .intel-prospect-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .intel-prospect-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--m-text, #ffffff);
      }
      .intel-prospect-meta {
        font-size: 12px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
      }
      .intel-prospect-tier {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      /* ─── Class Breakdown ─── */
      .intel-class-breakdown {
        display: flex;
        gap: 20px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
      }
      .intel-class-item {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .intel-class-val {
        font-size: 18px;
        font-weight: 800;
        color: var(--m-text, #ffffff);
      }
      .intel-class-label {
        font-size: 11px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
        text-transform: uppercase;
      }

      /* ─── Season History ─── */
      .intel-season-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .intel-season-item {
        padding: 10px;
        border-radius: 8px;
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
      }
      .intel-season-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
      }
      .intel-season-year {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text, #ffffff);
      }
      .intel-season-record {
        font-size: 13px;
        font-weight: 600;
        color: var(--m-accent, #d4ff00);
      }
      .intel-season-conf {
        font-size: 12px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
      }
      .intel-season-highlights {
        margin: 0;
        padding: 0 0 0 18px;
        font-size: 12px;
        line-height: 1.6;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
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
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
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
        color: var(--m-text, #ffffff);
      }
      .intel-missing-desc {
        font-size: 12px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
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
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
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
        border: 1px solid var(--m-border, rgba(255, 255, 255, 0.08));
        background: transparent;
        color: var(--m-text, #ffffff);
        cursor: pointer;
        text-align: left;
        transition: background 0.15s ease;
      }
      .intel-command-btn:hover {
        background: var(--m-surface, rgba(255, 255, 255, 0.04));
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
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
      }

      /* ─── Footer ─── */
      .intel-footer {
        text-align: center;
        padding: 8px 0;
      }
      .intel-footer-text {
        font-size: 11px;
        color: var(--m-text-3, rgba(255, 255, 255, 0.45));
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
