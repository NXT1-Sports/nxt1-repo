/**
 * @fileoverview Agent X Moneyball Section — "Unfair Information Advantage"
 * @module @nxt1/ui/components/agent-x-moneyball-section
 * @version 1.0.0
 *
 * Shared marketing section for scouts/recruiters across web and mobile Agent X pages.
 * Shows instant athlete comparison, biometrics, and progression curves.
 *
 * Standards:
 * - 100% design-token driven styling
 * - SSR-safe deterministic IDs
 * - Semantic HTML for SEO (section/article/header/figure)
 * - Mobile-first responsive layout
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

export interface MoneyballAthleteProfile {
  readonly id: string;
  readonly name: string;
  readonly classYear: string;
  readonly position: string;
  readonly fitScore: number;
  readonly fortyYard: string;
  readonly vertical: string;
  readonly acceleration: string;
}

export interface MoneyballProgressPoint {
  readonly x: number;
  readonly y: number;
}

const DEFAULT_LEFT_ATHLETE: MoneyballAthleteProfile = {
  id: 'left-athlete',
  name: 'Athlete A',
  classYear: '2027',
  position: 'WR',
  fitScore: 94,
  fortyYard: '4.47s',
  vertical: '38 in',
  acceleration: 'Top 8%',
};

const DEFAULT_RIGHT_ATHLETE: MoneyballAthleteProfile = {
  id: 'right-athlete',
  name: 'Athlete B',
  classYear: '2027',
  position: 'WR',
  fitScore: 87,
  fortyYard: '4.58s',
  vertical: '35 in',
  acceleration: 'Top 21%',
};

const DEFAULT_LEFT_PROGRESSION: readonly number[] = [46, 53, 61, 70, 82, 92] as const;
const DEFAULT_RIGHT_PROGRESSION: readonly number[] = [44, 49, 55, 63, 71, 78] as const;

let moneyballSectionInstanceCounter = 0;

function toPolylinePoints(values: readonly number[]): string {
  const width = 100;
  const height = 100;
  const steps = Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const x = (index / steps) * width;
      const y = height - Math.min(Math.max(value, 0), 100);
      return `${x},${y}`;
    })
    .join(' ');
}

@Component({
  selector: 'nxt1-agent-x-moneyball-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="moneyball" [attr.aria-labelledby]="titleId()">
      <div class="moneyball__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Moneyball on Auto-Pilot"
          [headingLevel]="2"
          variant="hero"
          align="center"
          title="Unfair Information Advantage."
          subtitle="Agent X scans thousands of profiles to find the hidden gems that fit your specific program needs."
        />

        <div
          class="moneyball__visual"
          role="group"
          aria-label="Agent X athlete comparison visualization"
        >
          <article class="moneyball__compare-panel" [attr.aria-labelledby]="compareTitleId()">
            <header class="moneyball__panel-header">
              <p class="moneyball__panel-eyebrow">Data Visualization</p>
              <h3 class="moneyball__panel-title" [id]="compareTitleId()">
                Instant profile comparison
              </h3>
            </header>

            <div
              class="moneyball__athlete-grid"
              role="list"
              aria-label="Athlete biometrics comparison"
            >
              <article
                class="moneyball__athlete-card"
                role="listitem"
                [attr.aria-labelledby]="leftAthleteId()"
              >
                <header class="moneyball__athlete-header">
                  <h4 class="moneyball__athlete-name" [id]="leftAthleteId()">
                    {{ leftAthlete().name }}
                  </h4>
                  <p class="moneyball__athlete-meta">
                    {{ leftAthlete().position }} • Class {{ leftAthlete().classYear }}
                  </p>
                </header>

                <dl class="moneyball__metrics">
                  <div class="moneyball__metric-row">
                    <dt>40-Yard</dt>
                    <dd>{{ leftAthlete().fortyYard }}</dd>
                  </div>
                  <div class="moneyball__metric-row">
                    <dt>Vertical</dt>
                    <dd>{{ leftAthlete().vertical }}</dd>
                  </div>
                  <div class="moneyball__metric-row">
                    <dt>Acceleration</dt>
                    <dd>{{ leftAthlete().acceleration }}</dd>
                  </div>
                </dl>

                <p class="moneyball__fit-score">
                  Program fit <span>{{ leftAthlete().fitScore }}%</span>
                </p>
              </article>

              <article
                class="moneyball__athlete-card"
                role="listitem"
                [attr.aria-labelledby]="rightAthleteId()"
              >
                <header class="moneyball__athlete-header">
                  <h4 class="moneyball__athlete-name" [id]="rightAthleteId()">
                    {{ rightAthlete().name }}
                  </h4>
                  <p class="moneyball__athlete-meta">
                    {{ rightAthlete().position }} • Class {{ rightAthlete().classYear }}
                  </p>
                </header>

                <dl class="moneyball__metrics">
                  <div class="moneyball__metric-row">
                    <dt>40-Yard</dt>
                    <dd>{{ rightAthlete().fortyYard }}</dd>
                  </div>
                  <div class="moneyball__metric-row">
                    <dt>Vertical</dt>
                    <dd>{{ rightAthlete().vertical }}</dd>
                  </div>
                  <div class="moneyball__metric-row">
                    <dt>Acceleration</dt>
                    <dd>{{ rightAthlete().acceleration }}</dd>
                  </div>
                </dl>

                <p class="moneyball__fit-score">
                  Program fit <span>{{ rightAthlete().fitScore }}%</span>
                </p>
              </article>
            </div>
          </article>

          <article class="moneyball__curve-panel" [attr.aria-labelledby]="curveTitleId()">
            <header class="moneyball__panel-header">
              <p class="moneyball__panel-eyebrow">Progression Curves</p>
              <h3 class="moneyball__panel-title" [id]="curveTitleId()">Trajectory intelligence</h3>
            </header>

            <figure
              class="moneyball__chart"
              role="img"
              aria-label="Progression curves for compared athletes"
            >
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <polyline
                  class="moneyball__line moneyball__line--left"
                  [attr.points]="leftProgressionPoints()"
                />
                <polyline
                  class="moneyball__line moneyball__line--right"
                  [attr.points]="rightProgressionPoints()"
                />
              </svg>
              <figcaption class="moneyball__legend">
                <span class="moneyball__legend-item">
                  <i
                    class="moneyball__legend-dot moneyball__legend-dot--left"
                    aria-hidden="true"
                  ></i>
                  {{ leftAthlete().name }}
                </span>
                <span class="moneyball__legend-item">
                  <i
                    class="moneyball__legend-dot moneyball__legend-dot--right"
                    aria-hidden="true"
                  ></i>
                  {{ rightAthlete().name }}
                </span>
              </figcaption>
            </figure>

            <aside class="moneyball__verdict" aria-label="Agent X recommendation">
              <p class="moneyball__verdict-label">Agent X Recommendation</p>
              <p class="moneyball__verdict-text">
                Prioritize {{ leftAthlete().name }} for early outreach based on superior growth
                curve and current fit.
              </p>
            </aside>
          </article>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .moneyball {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .moneyball__shell {
        display: grid;
        gap: var(--nxt1-spacing-7);
      }

      .moneyball__visual {
        display: grid;
        gap: var(--nxt1-spacing-5);
      }

      .moneyball__compare-panel,
      .moneyball__curve-panel {
        display: grid;
        gap: var(--nxt1-spacing-4);
        align-content: start;
        padding: var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .moneyball__panel-header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .moneyball__panel-eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .moneyball__panel-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .moneyball__athlete-grid {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .moneyball__athlete-card {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .moneyball__athlete-header {
        display: grid;
        gap: var(--nxt1-spacing-1);
      }

      .moneyball__athlete-name {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .moneyball__athlete-meta {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .moneyball__metrics {
        margin: 0;
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .moneyball__metric-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .moneyball__metric-row dt,
      .moneyball__metric-row dd {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .moneyball__metric-row dt {
        color: var(--nxt1-color-text-tertiary);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .moneyball__metric-row dd {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .moneyball__fit-score {
        margin: 0;
        display: inline-flex;
        align-items: baseline;
        gap: var(--nxt1-spacing-2);
        width: fit-content;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-pill);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary4);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .moneyball__fit-score span {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .moneyball__chart {
        margin: 0;
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .moneyball__chart svg {
        width: 100%;
        height: 220px;
      }

      .moneyball__line {
        fill: none;
        stroke-width: 2.25;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .moneyball__line--left {
        stroke: var(--nxt1-color-primary);
      }

      .moneyball__line--right {
        stroke: var(--nxt1-color-text-tertiary);
      }

      .moneyball__legend {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-3);
      }

      .moneyball__legend-item {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .moneyball__legend-dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
      }

      .moneyball__legend-dot--left {
        background: var(--nxt1-color-primary);
      }

      .moneyball__legend-dot--right {
        background: var(--nxt1-color-text-tertiary);
      }

      .moneyball__verdict {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary4);
      }

      .moneyball__verdict-label {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .moneyball__verdict-text {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      @media (min-width: 992px) {
        .moneyball__visual {
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
          align-items: stretch;
        }
      }

      @media (max-width: 767px) {
        .moneyball__compare-panel,
        .moneyball__curve-panel {
          padding: var(--nxt1-spacing-5);
        }

        .moneyball__panel-title {
          font-size: var(--nxt1-fontSize-lg);
        }

        .moneyball__chart svg {
          height: 180px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXMoneyballSectionComponent {
  private readonly instanceId = ++moneyballSectionInstanceCounter;

  readonly titleId = computed(() => `agent-x-moneyball-title-${this.instanceId}`);
  readonly compareTitleId = computed(() => `agent-x-moneyball-compare-title-${this.instanceId}`);
  readonly curveTitleId = computed(() => `agent-x-moneyball-curve-title-${this.instanceId}`);
  readonly leftAthleteId = computed(() => `agent-x-moneyball-left-athlete-${this.instanceId}`);
  readonly rightAthleteId = computed(() => `agent-x-moneyball-right-athlete-${this.instanceId}`);

  readonly leftAthlete = input<MoneyballAthleteProfile>(DEFAULT_LEFT_ATHLETE);
  readonly rightAthlete = input<MoneyballAthleteProfile>(DEFAULT_RIGHT_ATHLETE);
  readonly leftProgression = input<readonly number[]>(DEFAULT_LEFT_PROGRESSION);
  readonly rightProgression = input<readonly number[]>(DEFAULT_RIGHT_PROGRESSION);

  readonly leftProgressionPoints = computed(() => toPolylinePoints(this.leftProgression()));
  readonly rightProgressionPoints = computed(() => toPolylinePoints(this.rightProgression()));
}
