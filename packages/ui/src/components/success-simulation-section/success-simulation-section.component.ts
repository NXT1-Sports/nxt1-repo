/**
 * @fileoverview Success Simulation Section (Future)
 * @module @nxt1/ui/components/success-simulation-section
 * @version 1.0.0
 *
 * Shared marketing section for AI Athletes surfaces.
 * Visualizes projected offer outcomes from specific athlete improvements.
 *
 * Standards:
 * - 100% design-token driven styling
 * - SSR-safe deterministic heading IDs
 * - Semantic HTML for SEO and accessibility
 * - Mobile-first responsive layout for web + mobile
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

export interface SuccessSimulationScenario {
  readonly id: string;
  readonly label: string;
  readonly offer: string;
  readonly probability: number;
  readonly summary: string;
  readonly projected: boolean;
}

interface NormalizedSuccessSimulationScenario extends SuccessSimulationScenario {
  readonly normalizedProbability: number;
}

const DEFAULT_SCENARIOS: readonly SuccessSimulationScenario[] = [
  {
    id: 'success-simulation-current-trajectory',
    label: 'Current Trajectory',
    offer: 'NAIA Offer',
    probability: 70,
    summary: 'Baseline projection from your current profile data.',
    projected: false,
  },
  {
    id: 'success-simulation-improved-trajectory',
    label: 'With +0.2 GPA & +5lbs Muscle',
    offer: 'D2 Offer',
    probability: 85,
    summary: 'Small measurable improvements create a major offer jump.',
    projected: true,
  },
] as const;

let successSimulationInstanceCounter = 0;

function normalizeProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

@Component({
  selector: 'nxt1-success-simulation-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="success-simulation" [attr.aria-labelledby]="titleId()">
      <div class="success-simulation__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="Success Simulation (Future)"
          [headingLevel]="2"
          variant="hero"
          layout="split"
          contentPosition="end"
          title="Predict Your Offers."
          subtitle="AI shows you the specific small wins that lead to the big offer."
          support="Future projection modeling maps measurable improvements to stronger offer outcomes."
        >
          <article class="simulation-panel" [attr.aria-labelledby]="panelTitleId()">
            <header class="simulation-panel__header">
              <p class="simulation-panel__eyebrow">Trajectory Modeling</p>
              <h3 class="simulation-panel__title" [id]="panelTitleId()">Offer Progression Bar</h3>
            </header>

            <div
              class="simulation-panel__list"
              role="list"
              aria-label="Offer probability simulations"
            >
              @for (scenario of normalizedScenarios(); track scenario.id) {
                <article
                  class="simulation-item"
                  role="listitem"
                  [class.simulation-item--projected]="scenario.projected"
                >
                  <header class="simulation-item__header">
                    <h4 class="simulation-item__label">{{ scenario.label }}</h4>
                    <p class="simulation-item__offer">{{ scenario.offer }}</p>
                  </header>

                  <div class="simulation-item__probability-row">
                    <p class="simulation-item__probability-value">
                      {{ scenario.normalizedProbability }}% probability
                    </p>
                  </div>

                  <div
                    class="simulation-item__track"
                    role="progressbar"
                    [attr.aria-label]="scenario.label + ' probability'"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    [attr.aria-valuenow]="scenario.normalizedProbability"
                  >
                    <span
                      class="simulation-item__fill"
                      [style.width.%]="scenario.normalizedProbability"
                    ></span>
                  </div>

                  <p class="simulation-item__summary">{{ scenario.summary }}</p>
                </article>
              }
            </div>

            <aside
              class="simulation-panel__actionable"
              [attr.aria-labelledby]="actionableTitleId()"
            >
              <h4 class="simulation-panel__actionable-title" [id]="actionableTitleId()">
                Actionable
              </h4>
              <p class="simulation-panel__actionable-copy">
                AI shows you the specific small wins that lead to the big offer.
              </p>
            </aside>
          </article>
        </nxt1-section-header>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .success-simulation {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .success-simulation__shell {
        display: grid;
      }

      .simulation-panel {
        display: grid;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-surface-100);
        box-shadow:
          var(--nxt1-shadow-md),
          0 0 0 1px var(--nxt1-color-alpha-primary8);
      }

      .simulation-panel__header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .simulation-panel__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .simulation-panel__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .simulation-panel__list {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .simulation-item {
        display: grid;
        gap: var(--nxt1-spacing-2_5);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-200);
      }

      .simulation-item--projected {
        background: var(--nxt1-color-alpha-primary4);
      }

      .simulation-item__header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-3);
      }

      .simulation-item__label {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .simulation-item__offer {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .simulation-item__probability-row {
        display: flex;
        align-items: center;
        justify-content: flex-start;
      }

      .simulation-item__probability-value {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .simulation-item__track {
        position: relative;
        overflow: hidden;
        height: var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary12);
      }

      .simulation-item__fill {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--nxt1-color-primary);
      }

      .simulation-item__summary {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .simulation-panel__actionable {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .simulation-panel__actionable-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .simulation-panel__actionable-copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSuccessSimulationSectionComponent {
  private readonly instanceId = ++successSimulationInstanceCounter;

  readonly titleId = computed(() => `success-simulation-title-${this.instanceId}`);
  readonly panelTitleId = computed(() => `success-simulation-panel-title-${this.instanceId}`);
  readonly actionableTitleId = computed(
    () => `success-simulation-actionable-title-${this.instanceId}`
  );

  readonly scenarios = input<readonly SuccessSimulationScenario[]>(DEFAULT_SCENARIOS);

  readonly normalizedScenarios = computed<readonly NormalizedSuccessSimulationScenario[]>(() =>
    this.scenarios().map((scenario) => ({
      ...scenario,
      normalizedProbability: normalizeProbability(scenario.probability),
    }))
  );
}
