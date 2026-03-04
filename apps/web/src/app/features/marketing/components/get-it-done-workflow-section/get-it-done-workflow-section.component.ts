/**
 * @fileoverview Get It Done Workflow Automation Section
 * @module apps/web/features/marketing/components/get-it-done-workflow-section
 * @version 1.0.0
 *
 * Shared AI Athletes marketing section for workflow automation.
 * Presents a request -> action -> result loop with deterministic SSR markup.
 *
 * Standards:
 * - 100% design-token driven styling
 * - Semantic HTML for SEO (section/article/ol/li)
 * - SSR-safe deterministic heading and panel IDs
 * - Mobile-first responsive behavior for web and mobile
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

export interface GetItDoneWorkflowStep {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly tone: 'request' | 'action' | 'result';
}

export interface GetItDoneWorkflow {
  readonly id: string;
  readonly steps: readonly GetItDoneWorkflowStep[];
}

const DEFAULT_GET_IT_DONE_WORKFLOWS: readonly GetItDoneWorkflow[] = [
  {
    id: 'get-it-done-workflow-recruiting-outreach',
    steps: [
      {
        id: 'get-it-done-step-request-1',
        label: 'Input Command',
        value: '"Send my new stats to every D2 coach in Ohio."',
        tone: 'request',
      },
      {
        id: 'get-it-done-step-action-1',
        label: 'AI Action',
        value: '[Processing...]',
        tone: 'action',
      },
      {
        id: 'get-it-done-step-result-1',
        label: 'Result',
        value: '"24 Emails Sent. 3 Replies Waiting."',
        tone: 'result',
      },
    ],
  },
  {
    id: 'get-it-done-workflow-graphic',
    steps: [
      {
        id: 'get-it-done-step-request-2',
        label: 'Input Command',
        value: '"Design a commit graphic for State University."',
        tone: 'request',
      },
      {
        id: 'get-it-done-step-action-2',
        label: 'AI Action',
        value: '[Design Generated]',
        tone: 'action',
      },
      {
        id: 'get-it-done-step-result-2',
        label: 'Result',
        value: '"Graphic post ready for Instagram. Schedule for 6pm?"',
        tone: 'result',
      },
    ],
  },
] as const;

let getItDoneWorkflowInstanceCounter = 0;

@Component({
  selector: 'nxt1-get-it-done-workflow-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="get-it-done" [attr.aria-labelledby]="titleId()">
      <div class="get-it-done__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="The 'Get It Done' Button"
          [headingLevel]="2"
          variant="hero"
          layout="split"
          contentPosition="start"
          title="Get things Done"
          subtitle="You focus on playing. AI handles the rest."
          support="It doesn't just give advice. It does the work. From emails to edits, tasks vanish instantly."
        >
          <article class="workflow-panel" [attr.aria-labelledby]="panelTitleId()">
            <header class="workflow-panel__header">
              <p class="workflow-panel__eyebrow">Workflow Automation</p>
              <h3 class="workflow-panel__title" [id]="panelTitleId()">Request -> Result Loop</h3>
            </header>

            <div
              class="workflow-panel__stack"
              role="list"
              aria-label="AI automation workflow examples"
            >
              @for (workflow of workflows(); track workflow.id; let index = $index) {
                <article
                  class="workflow-card"
                  role="listitem"
                  [attr.aria-label]="'Workflow example ' + (index + 1)"
                >
                  <ol class="workflow-card__timeline">
                    @for (step of workflow.steps; track step.id; let stepIndex = $index) {
                      <li
                        class="workflow-step"
                        [class.workflow-step--request]="step.tone === 'request'"
                        [class.workflow-step--action]="step.tone === 'action'"
                        [class.workflow-step--result]="step.tone === 'result'"
                        [style.animation-delay]="index * 900 + stepIndex * 300 + 'ms'"
                      >
                        <p class="workflow-step__label">{{ step.label }}</p>
                        <p class="workflow-step__value">{{ step.value }}</p>
                      </li>
                    }
                  </ol>
                </article>
              }
            </div>

            <aside class="workflow-panel__why" [attr.aria-labelledby]="whyTitleId()">
              <h4 class="workflow-panel__why-title" [id]="whyTitleId()">Why this is inevitable</h4>
              <p class="workflow-panel__why-copy">
                Most platforms are passive. You update your profile and wait. NXT1 is active. It
                works for you, and sells back your most limited asset: time.
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

      .get-it-done {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .get-it-done__shell {
        display: grid;
      }

      .workflow-panel {
        display: grid;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-md);
      }

      .workflow-panel__header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .workflow-panel__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .workflow-panel__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .workflow-panel__stack {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .workflow-card {
        padding: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .workflow-card__timeline {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--nxt1-spacing-2_5);
      }

      .workflow-step {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        animation: workflow-step-loop 3.2s var(--nxt1-motion-easing-inOut, ease-in-out) infinite;
      }

      .workflow-step__label {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .workflow-step__value {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .workflow-step--request {
        border-color: var(--nxt1-color-alpha-primary20);
      }

      .workflow-step--action {
        border-style: dashed;
      }

      .workflow-step--result {
        background: var(--nxt1-color-alpha-primary6);
        border-color: var(--nxt1-color-alpha-primary30);
      }

      .workflow-step--result .workflow-step__label,
      .workflow-step--result .workflow-step__value {
        color: var(--nxt1-color-text-primary);
      }

      .workflow-panel__why {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .workflow-panel__why-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .workflow-panel__why-copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      @keyframes workflow-step-loop {
        0%,
        65%,
        100% {
          border-color: var(--nxt1-color-border-subtle);
          background: var(--nxt1-color-surface-100);
          box-shadow: none;
          transform: translateY(0);
        }

        30% {
          border-color: var(--nxt1-color-alpha-primary30);
          background: var(--nxt1-color-alpha-primary6);
          box-shadow: 0 0 0 1px var(--nxt1-color-alpha-primary12);
          transform: translateY(calc(var(--nxt1-spacing-0_5, 0.125rem) * -1));
        }
      }

      @media (min-width: 992px) {
        .workflow-panel {
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
          column-gap: var(--nxt1-spacing-5);
          align-items: start;
        }

        .workflow-panel__header,
        .workflow-panel__stack {
          grid-column: 1;
        }

        .workflow-panel__why {
          grid-column: 2;
          grid-row: 1 / span 2;
          position: sticky;
          top: var(--nxt1-spacing-6);
        }
      }

      @media (max-width: 767px) {
        .workflow-panel {
          padding: var(--nxt1-spacing-5);
        }

        .workflow-panel__title {
          font-size: var(--nxt1-fontSize-lg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .workflow-step {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtGetItDoneWorkflowSectionComponent {
  private readonly instanceId = ++getItDoneWorkflowInstanceCounter;

  readonly titleId = computed(() => `get-it-done-title-${this.instanceId}`);
  readonly panelTitleId = computed(() => `get-it-done-panel-title-${this.instanceId}`);
  readonly whyTitleId = computed(() => `get-it-done-why-title-${this.instanceId}`);

  readonly workflows = input<readonly GetItDoneWorkflow[]>(DEFAULT_GET_IT_DONE_WORKFLOWS);
}
