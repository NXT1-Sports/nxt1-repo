/**
 * @fileoverview Agent X Execution Layer Section — "Buying Back Time"
 * @module @nxt1/ui/components/agent-x-execution-layer-section
 * @version 1.0.0
 *
 * Shared marketing section for Agent X landing surfaces.
 * Demonstrates the "Stop Chatting. Start Delegating." value proposition
 * with a split-screen auto-pilot dashboard and animated work queue.
 *
 * Standards:
 * - 100% design-token driven (colors, typography, spacing, radius)
 * - SSR-safe deterministic IDs
 * - Semantic HTML for SEO (section/article/header/ol)
 * - Mobile-first responsive layout
 * - CSS-only motion with prefers-reduced-motion support
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

export interface ExecutionLayerTask {
  /** Stable unique id for list tracking. */
  readonly id: string;
  /** Completed task copy shown in queue. */
  readonly label: string;
  /** Task category shown as support metadata. */
  readonly category: string;
}

const DEFAULT_EXECUTION_LAYER_TASKS: readonly ExecutionLayerTask[] = [
  {
    id: 'box-score',
    label: "Scraped last night's box score.",
    category: 'Data Entry',
  },
  {
    id: 'highlight-graphics',
    label: 'Generated 3 highlight graphics.',
    category: 'Design',
  },
  {
    id: 'email-outreach',
    label: 'Drafted and sent email to XYZ University.',
    category: 'Outreach',
  },
  {
    id: 'profile-sync',
    label: 'Updated NCSA/MaxPreps profile.',
    category: 'Admin',
  },
  {
    id: 'social-scheduling',
    label: 'Scheduled Instagram Story for 6 PM.',
    category: 'Marketing',
  },
] as const;

let executionLayerInstanceCounter = 0;

@Component({
  selector: 'nxt1-agent-x-execution-layer-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="execution-layer" [attr.aria-labelledby]="titleId()">
      <div class="execution-layer__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="The Execution Layer"
          [headingLevel]="2"
          variant="hero"
          align="center"
          title="Stop Chatting. Start Delegating."
          subtitle="Agent X doesn't just give advice. It performs actual labor, saving you 20+ hours a week."
          support="The Auto-Pilot Dashboard shows real work completing while you focus on practice, coaching, and recovery."
        />

        <div class="execution-layer__dashboard" role="group" aria-label="Auto-Pilot Dashboard">
          <article class="execution-layer__left-panel" [attr.aria-labelledby]="leftPanelTitleId()">
            <header class="execution-layer__panel-header">
              <p class="execution-layer__panel-eyebrow">The Auto-Pilot Dashboard</p>
              <h3 class="execution-layer__panel-title" [id]="leftPanelTitleId()">
                One action from you. Hours of execution from Agent X.
              </h3>
            </header>

            <p class="execution-layer__panel-copy">
              Coach or athlete clicks once. Agent X handles the complex queue automatically.
            </p>

            <div
              class="execution-layer__control-surface"
              aria-label="Delegation control center preview"
            >
              <p class="execution-layer__control-label">Execution command</p>

              <div
                class="execution-layer__launch-button"
                role="img"
                aria-label="Delegate to Agent X button preview"
              >
                <span class="execution-layer__launch-dot" aria-hidden="true"></span>
                <span aria-hidden="true">Delegate to Agent X</span>
              </div>

              <div class="execution-layer__stat-grid" role="list" aria-label="Execution summary">
                <article class="execution-layer__stat-card" role="listitem">
                  <p class="execution-layer__stat-value">20+ hrs</p>
                  <p class="execution-layer__stat-label">Saved weekly</p>
                </article>
                <article class="execution-layer__stat-card" role="listitem">
                  <p class="execution-layer__stat-value">5 workflows</p>
                  <p class="execution-layer__stat-label">Running now</p>
                </article>
              </div>
            </div>

            <div class="execution-layer__copy-stack">
              <p class="execution-layer__key-copy">
                While you're at practice, Agent X is building your brand.
              </p>
              <p class="execution-layer__key-copy">
                While you're sleeping, Agent X is finding recruits.
              </p>
            </div>
          </article>

          <article
            class="execution-layer__right-panel"
            [attr.aria-labelledby]="rightPanelTitleId()"
          >
            <header class="execution-layer__panel-header">
              <p class="execution-layer__panel-eyebrow">Fast-Forward Work Showcase</p>
              <h3 class="execution-layer__panel-title" [id]="rightPanelTitleId()">
                Automated checklist
              </h3>
            </header>

            <ol class="execution-layer__task-list" aria-label="Completed automated tasks">
              @for (task of tasks(); track task.id; let i = $index) {
                <li class="execution-layer__task" [style.animation-delay]="i * 180 + 'ms'">
                  <p class="execution-layer__task-main">
                    <span class="execution-layer__task-check" aria-hidden="true">✅</span>
                    <span>{{ task.label }}</span>
                  </p>
                  <p class="execution-layer__task-meta">({{ task.category }})</p>
                </li>
              }
            </ol>
          </article>
        </div>

        <aside class="execution-layer__trust-panel" aria-label="Agent X trust signal">
          <p class="execution-layer__trust-eyebrow">Trust Signal</p>
          <p class="execution-layer__trust-signal">
            The only AI authorized to push buttons for you.
          </p>
        </aside>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .execution-layer {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .execution-layer__shell {
        display: grid;
        gap: var(--nxt1-spacing-7);
      }

      .execution-layer__dashboard {
        display: grid;
        gap: var(--nxt1-spacing-5);
      }

      .execution-layer__left-panel,
      .execution-layer__right-panel {
        display: grid;
        align-content: start;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .execution-layer__panel-header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .execution-layer__panel-eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .execution-layer__panel-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .execution-layer__panel-copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .execution-layer__launch-button {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        justify-content: center;
        width: fit-content;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        border: 1px solid var(--nxt1-color-alpha-primary40);
        border-radius: var(--nxt1-borderRadius-pill);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        user-select: none;
      }

      .execution-layer__launch-dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
      }

      .execution-layer__control-surface {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        background: var(--nxt1-color-alpha-primary4);
      }

      .execution-layer__control-label {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .execution-layer__stat-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--nxt1-spacing-2);
      }

      .execution-layer__stat-card {
        margin: 0;
        display: grid;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .execution-layer__stat-value {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .execution-layer__stat-label {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .execution-layer__copy-stack {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
      }

      .execution-layer__key-copy {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .execution-layer__task-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .execution-layer__task {
        display: grid;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        opacity: var(--nxt1-opacity-90, 0.9);
        animation: nxt1-execution-task-pulse var(--nxt1-motion-duration-slower, 2400ms)
          var(--nxt1-motion-easing-default, ease) infinite;
      }

      .execution-layer__task-main {
        margin: 0;
        display: inline-flex;
        align-items: start;
        gap: var(--nxt1-spacing-2);
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .execution-layer__task-check {
        flex-shrink: 0;
      }

      .execution-layer__task-meta {
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .execution-layer__trust-panel {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary4);
        text-align: center;
      }

      .execution-layer__trust-eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .execution-layer__trust-signal {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      @media (min-width: 992px) {
        .execution-layer__dashboard {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: stretch;
        }

        .execution-layer__left-panel,
        .execution-layer__right-panel {
          padding: var(--nxt1-spacing-7);
        }
      }

      @media (max-width: 767px) {
        .execution-layer__left-panel,
        .execution-layer__right-panel {
          padding: var(--nxt1-spacing-5);
        }

        .execution-layer__panel-title {
          font-size: var(--nxt1-fontSize-lg);
        }

        .execution-layer__trust-signal {
          font-size: var(--nxt1-fontSize-base);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .execution-layer__task {
          animation: none;
        }
      }

      @keyframes nxt1-execution-task-pulse {
        0%,
        100% {
          border-color: var(--nxt1-color-border-subtle);
          background: var(--nxt1-color-surface-200);
          opacity: var(--nxt1-opacity-90, 0.9);
        }

        45% {
          border-color: var(--nxt1-color-alpha-primary30);
          background: var(--nxt1-color-alpha-primary4);
          opacity: var(--nxt1-opacity-100, 1);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAgentXExecutionLayerSectionComponent {
  private readonly instanceId = ++executionLayerInstanceCounter;

  readonly titleId = computed(() => `agent-x-execution-layer-title-${this.instanceId}`);
  readonly leftPanelTitleId = computed(
    () => `agent-x-execution-layer-left-title-${this.instanceId}`
  );
  readonly rightPanelTitleId = computed(
    () => `agent-x-execution-layer-right-title-${this.instanceId}`
  );

  readonly tasks = input<readonly ExecutionLayerTask[]>(DEFAULT_EXECUTION_LAYER_TASKS);
}
