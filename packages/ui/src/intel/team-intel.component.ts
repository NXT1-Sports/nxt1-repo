/**
 * @fileoverview Team Intel Component
 * @module @nxt1/ui/intel
 *
 * Renders the AI-generated Agent X Intel report for team profiles.
 * Narrative-first sections-based layout — Agent X tells the program's story.
 * One section card per active side-tab; sourced items shown with favicon badges.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, output } from '@angular/core';
import { NxtIconComponent } from '../components/icon';
import { NxtMarkdownComponent } from '../components/markdown';
import { ANALYTICS_ADAPTER } from '../services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TEST_IDS } from '@nxt1/core/testing';
import { IntelService } from './intel.service';
import type { IntelMissingDataPrompt, IntelQuickCommand, IntelDataSource } from '@nxt1/core';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

// ── Source metadata for favicons + labels ──

interface SourceMeta {
  readonly domain: string;
  readonly label: string;
  readonly isVerified: boolean;
}

const SOURCE_META: Readonly<Record<IntelDataSource, SourceMeta>> = {
  'self-reported': { domain: '', label: 'Self', isVerified: false },
  'coach-verified': { domain: '', label: 'Coach', isVerified: false },
  'agent-x': { domain: 'nxt1.com', label: 'Agent X', isVerified: false },
  maxpreps: { domain: 'maxpreps.com', label: 'MaxPreps', isVerified: true },
  hudl: { domain: 'hudl.com', label: 'Hudl', isVerified: true },
  '247sports': { domain: '247sports.com', label: '247Sports', isVerified: true },
  rivals: { domain: 'rivals.com', label: 'Rivals', isVerified: true },
  on3: { domain: 'on3.com', label: 'On3', isVerified: true },
  'perfect-game': { domain: 'perfectgame.org', label: 'PG', isVerified: true },
  'prep-baseball': { domain: 'prepbaseballreport.com', label: 'PBR', isVerified: true },
  ncsa: { domain: 'ncsasports.org', label: 'NCSA', isVerified: true },
  'usa-football': { domain: 'usafootball.com', label: 'USA FB', isVerified: true },
};

@Component({
  selector: 'nxt1-team-intel',
  standalone: true,
  imports: [NxtIconComponent, NxtMarkdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="intel-section"
      [attr.data-testid]="testIds.TEAM_SECTION"
      aria-labelledby="team-intel-heading"
    >
      <h2 id="team-intel-heading" class="sr-only">Team Intelligence Report</h2>

      @if (intel.isGenerating() || intel.isPendingGeneration()) {
        <div class="intel-generating" [attr.data-testid]="testIds.LOADING_SKELETON">
          <div class="intel-generating__rings" aria-hidden="true">
            <div class="intel-generating__ring intel-generating__ring--1"></div>
            <div class="intel-generating__ring intel-generating__ring--2"></div>
            <div class="intel-generating__ring intel-generating__ring--3"></div>
            <svg
              class="intel-generating__logo"
              viewBox="0 0 612 792"
              width="32"
              height="32"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="8"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path [attr.d]="agentXLogoPath" />
              <polygon [attr.points]="agentXLogoPolygon" />
            </svg>
          </div>
          <p class="intel-generating__title">Agent X is compiling your intel...</p>
          <p class="intel-generating__sub">
            Analyzing roster, stats, recruiting activity, and more
          </p>
          <div class="intel-generating__scan" aria-hidden="true"></div>
        </div>
      } @else if (intel.isLoading()) {
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
            <svg
              viewBox="0 0 612 792"
              width="60"
              height="60"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="8"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path [attr.d]="agentXLogoPath" />
              <polygon [attr.points]="agentXLogoPolygon" />
            </svg>
          </div>
          <h3>No Team Intel Yet</h3>
          <p>
            @if (canGenerate()) {
              Tap <strong>Generate Intel</strong> below to create the Agent X Intel report for this
              program.
            } @else {
              No Intel report has been generated for this team yet.
            }
          </p>
        </div>
      } @else {
        <div class="intel-stage" [attr.data-testid]="testIds.REPORT_CONTAINER">
          <!-- ── Active Section Card ── -->
          @for (section of report()!.sections; track section.id) {
            @if (activeSection() === section.id) {
              <section
                class="intel-focus-card intel-focus-card--feature"
                [attr.data-testid]="testIds.ACTIVE_SECTION_CARD"
              >
                <div class="intel-section-topline">
                  <h3 class="intel-card-title">
                    <svg
                      class="intel-agentx-icon"
                      viewBox="0 0 612 792"
                      width="22"
                      height="22"
                      fill="currentColor"
                      stroke="currentColor"
                      stroke-width="8"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path [attr.d]="agentXLogoPath" />
                      <polygon [attr.points]="agentXLogoPolygon" />
                    </svg>
                    {{ section.title }}
                  </h3>
                </div>

                @if (section.content) {
                  <nxt1-markdown class="intel-markdown" [content]="section.content" />
                }

                @if (section.items?.length) {
                  <div class="intel-items-grid">
                    @for (item of section.items!; track item.label) {
                      <div
                        class="intel-item-card"
                        [class.intel-item-card--verified]="item.verified"
                      >
                        <span class="intel-item-value">
                          {{ item.value }}
                          @if (item.unit) {
                            <span class="intel-item-unit">{{ item.unit }}</span>
                          }
                          @if (item.verified) {
                            <nxt1-icon
                              name="checkmarkCircle"
                              [size]="11"
                              class="intel-verified-icon"
                            />
                          }
                        </span>
                        <span class="intel-item-label">{{ item.label }}</span>
                        @if (item.sublabel) {
                          <span class="intel-item-sublabel">{{ item.sublabel }}</span>
                        }
                        @if (item.source) {
                          <span class="intel-source-chip">
                            @if (sourceMeta(item.source).isVerified) {
                              <img
                                class="intel-favicon"
                                [src]="faviconUrl(item.source)"
                                [alt]="sourceMeta(item.source).label"
                                width="12"
                                height="12"
                                loading="lazy"
                              />
                            }
                            {{ sourceMeta(item.source).label }}
                          </span>
                        }
                      </div>
                    }
                  </div>
                }

                @if (section.sources?.length) {
                  <div class="intel-source-chips" [attr.data-testid]="testIds.CITATIONS_SECTION">
                    @for (citation of section.sources!; track citation.platform + citation.label) {
                      @if (citation.url) {
                        <a
                          [href]="citation.url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="intel-citation-badge intel-citation-badge--linked"
                          [class.intel-citation-badge--verified]="citation.verified"
                        >
                          @if (citation.verified && sourceMeta(citation.platform).isVerified) {
                            <img
                              class="intel-favicon"
                              [src]="faviconUrl(citation.platform)"
                              [alt]="sourceMeta(citation.platform).label"
                              width="12"
                              height="12"
                              loading="lazy"
                            />
                          }
                          {{ citation.label || sourceMeta(citation.platform).label }}
                        </a>
                      } @else {
                        <span
                          class="intel-citation-badge"
                          [class.intel-citation-badge--verified]="citation.verified"
                        >
                          @if (citation.verified && sourceMeta(citation.platform).isVerified) {
                            <img
                              class="intel-favicon"
                              [src]="faviconUrl(citation.platform)"
                              [alt]="sourceMeta(citation.platform).label"
                              width="12"
                              height="12"
                              loading="lazy"
                            />
                          }
                          {{ citation.label || sourceMeta(citation.platform).label }}
                        </span>
                      }
                    }
                  </div>
                }
              </section>
            }
          }

          <!-- ── Update Intel Guide (admin only) ── -->
          @if (canGenerate()) {
            <div class="intel-strengthen-guide" [attr.data-testid]="testIds.MISSING_DATA_SECTION">
              <p>
                Tap <strong>Update Intel</strong> below to refresh your report with the latest data.
              </p>
            </div>
          }

          <!-- ── Footer ── -->
          <div class="intel-footer" [attr.data-testid]="testIds.REPORT_FOOTER">
            <span class="intel-footer-text">Generated by Agent X · {{ intel.reportDate() }}</span>
          </div>
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
      .intel-stage {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
        min-width: 0;
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

      /* ─── Empty / Madden State ─── */
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
        color: var(--m-text-2, rgba(255, 255, 255, 0.4));
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
          filter var(--nxt1-ui-transition-fast, 150ms) ease;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.08);
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

      /* ─── Focus / Section Card ─── */
      .intel-focus-card {
        padding: var(--nxt1-spacing-4, 16px);
        border-radius: var(--intel-radius);
        background: var(--intel-surface);
        border: 1px solid color-mix(in srgb, var(--intel-accent) 14%, var(--intel-border));
        box-shadow: var(--intel-shadow);
      }
      .intel-focus-card--feature {
        min-height: 180px;
      }
      .intel-section-topline {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
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
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
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
        flex-shrink: 0;
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

      /* ─── Markdown ─── */
      .intel-markdown {
        display: block;
      }
      .intel-markdown .md > :last-child {
        margin-bottom: 0;
      }

      /* ─── Items Grid ─── */
      .intel-items-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 10px;
        margin-top: 14px;
      }
      .intel-item-card {
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 12px;
        border-radius: var(--intel-radius-sm);
        background: var(--intel-surface-elevated);
        border: 1px solid var(--intel-border);
      }
      .intel-item-card--verified {
        border-color: color-mix(in srgb, var(--intel-accent) 22%, var(--intel-border));
        background: color-mix(in srgb, var(--intel-accent) 6%, var(--intel-surface-elevated));
      }
      .intel-item-value {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: var(--nxt1-fontSize-lg, 1.25rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--intel-text);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        line-height: 1;
      }
      .intel-item-unit {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-normal, 400);
        color: var(--intel-text-secondary);
      }
      .intel-verified-icon {
        color: var(--intel-accent);
        flex-shrink: 0;
      }
      .intel-item-label {
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--intel-text-muted);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }
      .intel-item-sublabel {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--intel-text-secondary);
        line-height: 1.3;
      }

      /* ─── Source Chips ─── */
      .intel-source-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--intel-border);
      }
      .intel-source-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: var(--nxt1-fontSize-2xs, 0.625rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--intel-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
      }
      .intel-citation-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
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
      .intel-citation-badge--verified {
        border-color: color-mix(in srgb, var(--intel-accent) 22%, var(--intel-border));
        background: color-mix(in srgb, var(--intel-accent) 7%, var(--intel-surface-elevated));
      }
      .intel-favicon {
        display: inline-block;
        border-radius: 2px;
        vertical-align: middle;
        flex-shrink: 0;
      }

      /* ─── Missing Data ─── */
      /* (grid replaced with strengthen guide — see .intel-strengthen-guide) */

      /* ─── Citation link badge ─── */
      .intel-citation-badge--linked {
        text-decoration: none;
        cursor: pointer;
      }
      .intel-citation-badge--linked:hover {
        background: rgba(204, 255, 0, 0.12);
        color: #ccff00;
      }

      /* ─── Strengthen guide ─── */
      .intel-strengthen-guide {
        padding: 12px 0 4px;
        font-size: 13px;
        color: var(--nxt1-color-text-muted, rgba(255, 255, 255, 0.45));
        text-align: center;
      }
      .intel-strengthen-guide strong {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-weight: 600;
      }

      /* ─── Agent X Generating Animation ─── */
      .intel-generating {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        gap: 12px;
        position: relative;
        overflow: hidden;
      }
      .intel-generating__rings {
        position: relative;
        width: 100px;
        height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 8px;
      }
      .intel-generating__ring {
        position: absolute;
        border-radius: 50%;
        border: 1.5px solid rgba(204, 255, 0, 0.25);
        animation: intel-orbit linear infinite;
      }
      .intel-generating__ring--1 {
        width: 60px;
        height: 60px;
        border-top-color: rgba(204, 255, 0, 0.8);
        animation-duration: 1.8s;
      }
      .intel-generating__ring--2 {
        width: 80px;
        height: 80px;
        border-right-color: rgba(204, 255, 0, 0.5);
        animation-duration: 2.6s;
        animation-direction: reverse;
      }
      .intel-generating__ring--3 {
        width: 100px;
        height: 100px;
        border-bottom-color: rgba(204, 255, 0, 0.3);
        animation-duration: 3.4s;
      }
      .intel-generating__logo {
        position: relative;
        z-index: 1;
        opacity: 0.9;
        filter: drop-shadow(0 0 8px rgba(204, 255, 0, 0.4));
      }
      .intel-generating__title {
        font-size: 15px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
        margin: 0;
        text-align: center;
      }
      .intel-generating__sub {
        font-size: 12px;
        color: var(--nxt1-color-text-muted, rgba(255, 255, 255, 0.45));
        margin: 0;
        text-align: center;
      }
      .intel-generating__scan {
        position: absolute;
        bottom: 0;
        left: -100%;
        width: 60%;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(204, 255, 0, 0.6), transparent);
        animation: intel-scan 2.4s ease-in-out infinite;
      }
      @keyframes intel-orbit {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      @keyframes intel-scan {
        0% {
          left: -60%;
        }
        100% {
          left: 160%;
        }
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

      /* ─── Focus rings ─── */
      .madden-cta-btn:focus-visible,
      .intel-regen-btn:focus-visible,
      .intel-command-btn:focus-visible {
        outline: none;
        box-shadow:
          0 0 0 2px var(--nxt1-color-focus-ringOffset, rgba(10, 10, 10, 1)),
          0 0 0 4px var(--nxt1-color-focus-ring, rgba(204, 255, 0, 0.5));
      }

      @media (max-width: 640px) {
        .intel-items-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class TeamIntelComponent {
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;
  protected readonly intel = inject(IntelService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  protected readonly testIds = TEST_IDS.INTEL;

  readonly teamId = input.required<string>();
  readonly canGenerate = input(false);
  /** Active Intel section id from the team shell side-nav. */
  readonly activeSection = input<string>('agent_overview');

  readonly generateClick = output<void>();
  readonly missingDataAction = output<IntelMissingDataPrompt>();
  readonly quickCommandClick = output<IntelQuickCommand>();

  protected readonly report = this.intel.teamReport;

  protected sourceMeta(source: IntelDataSource): SourceMeta {
    return SOURCE_META[source] ?? { domain: '', label: source, isVerified: false };
  }

  protected faviconUrl(source: IntelDataSource): string {
    const { domain } = this.sourceMeta(source);
    return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : '';
  }

  protected onGenerate(): void {
    this.generateClick.emit();
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
}
