/**
 * @fileoverview Agent X Tool Steps — Inline Execution Log
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders a Copilot-style accordion of tool execution steps inside a chat bubble.
 * Each step shows a status icon (spinner → checkmark → error) and a label.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import type { AgentXToolStep } from '@nxt1/core/ai';

@Component({
  selector: 'nxt1-agent-x-tool-steps',
  standalone: true,
  template: `
    @if (steps().length > 0) {
      <details class="tool-steps" [attr.open]="hasActive() ? '' : null">
        <summary class="tool-steps__summary">
          <!-- Summary status icon -->
          @if (hasActive()) {
            <svg
              class="tool-steps__summary-icon tool-steps__summary-spinner"
              viewBox="0 0 16 16"
              fill="none"
            >
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                stroke-width="2"
                stroke-dasharray="28"
                stroke-dashoffset="8"
                stroke-linecap="round"
              />
            </svg>
          } @else if (hasError()) {
            <svg
              class="tool-steps__summary-icon tool-steps__summary-error"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          } @else {
            <svg
              class="tool-steps__summary-icon tool-steps__summary-check"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M3.5 8.5L6.5 11.5L12.5 4.5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          }
          <span class="tool-steps__summary-label">{{ summaryLabel() }}</span>
          <svg class="tool-steps__chevron" viewBox="0 0 16 16" fill="none">
            <path
              d="M6 4L10 8L6 12"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </summary>

        <div class="tool-steps__list">
          @for (step of steps(); track step.id) {
            <div
              class="tool-step"
              [class.tool-step--active]="step.status === 'active'"
              [class.tool-step--success]="step.status === 'success'"
              [class.tool-step--error]="step.status === 'error'"
              [class.tool-step--pending]="step.status === 'pending'"
            >
              <div class="tool-step__icon">
                @switch (step.status) {
                  @case ('active') {
                    <svg class="tool-step__spinner" viewBox="0 0 16 16" fill="none">
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-dasharray="28"
                        stroke-dashoffset="8"
                        stroke-linecap="round"
                      />
                    </svg>
                  }
                  @case ('success') {
                    <svg class="tool-step__check" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3.5 8.5L6.5 11.5L12.5 4.5"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  }
                  @case ('error') {
                    <svg class="tool-step__error-icon" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </svg>
                  }
                  @default {
                    <div class="tool-step__dot"></div>
                  }
                }
              </div>
              <span class="tool-step__label">{{ step.label }}</span>
              @if (step.detail) {
                <span class="tool-step__detail">{{ step.detail }}</span>
              }
            </div>
          }
        </div>
      </details>
    }
  `,
  styles: [
    `
      /* ── Accordion container ── */

      .tool-steps {
        padding: 4px 0;
      }

      .tool-steps__summary {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        list-style: none;
        font-size: 0.8125rem;
        line-height: 1.4;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        padding: 4px 0;
        user-select: none;
      }

      /* Hide default marker in Safari & Chrome */
      .tool-steps__summary::-webkit-details-marker,
      .tool-steps__summary::marker {
        display: none;
        content: '';
      }

      .tool-steps__summary:hover {
        color: var(--nxt1-color-text, rgba(255, 255, 255, 0.87));
      }

      .tool-steps__summary-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      .tool-steps__summary-spinner {
        color: var(--nxt1-color-primary, #ccff00);
        animation: stepSpin 1s linear infinite;
      }

      .tool-steps__summary-check {
        color: var(--nxt1-color-success, #22c55e);
      }

      .tool-steps__summary-error {
        color: var(--nxt1-color-error, #ef4444);
      }

      .tool-steps__summary-label {
        flex: 1;
        min-width: 0;
      }

      .tool-steps__chevron {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        transition: transform 0.2s ease;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .tool-steps[open] > .tool-steps__summary .tool-steps__chevron {
        transform: rotate(90deg);
      }

      /* ── Step list (inside accordion) ── */

      .tool-steps__list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 0 2px 20px;
        border-left: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        margin-left: 7px;
        animation: stepsReveal 0.2s ease-out;
      }

      .tool-step {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.75rem;
        line-height: 1.4;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        transition: color 0.2s ease;
      }

      .tool-step--active {
        color: var(--nxt1-color-primary, #ccff00);
      }

      .tool-step--success {
        color: var(--nxt1-color-success, #22c55e);
      }

      .tool-step--error {
        color: var(--nxt1-color-error, #ef4444);
      }

      /* ── Step icons ── */

      .tool-step__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      .tool-step__spinner,
      .tool-step__check,
      .tool-step__error-icon {
        width: 14px;
        height: 14px;
      }

      .tool-step__spinner {
        animation: stepSpin 1s linear infinite;
      }

      .tool-step__dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.3));
      }

      .tool-step__check {
        animation: stepCheckIn 0.3s ease-out;
      }

      /* ── Text ── */

      .tool-step__label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tool-step__detail {
        font-size: 0.6875rem;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
        flex-shrink: 0;
      }

      /* ── Animations ── */

      @keyframes stepSpin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes stepCheckIn {
        from {
          opacity: 0;
          transform: scale(0.5);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes stepsReveal {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .tool-step__spinner,
        .tool-steps__summary-spinner {
          animation: none;
        }

        .tool-step__check {
          animation: none;
        }

        .tool-steps__list {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXToolStepsComponent {
  /** The list of tool execution steps to render. */
  readonly steps = input<readonly AgentXToolStep[]>([]);

  /** Whether any step is currently active (running). */
  protected readonly hasActive = computed(() => this.steps().some((s) => s.status === 'active'));

  /** Whether any step errored. */
  protected readonly hasError = computed(() => this.steps().some((s) => s.status === 'error'));

  /** Accordion summary label. */
  protected readonly summaryLabel = computed(() => {
    const all = this.steps();
    const active = all.filter((s) => s.status === 'active');
    if (active.length > 0) {
      return active.length === 1
        ? `Running ${active[0].label}…`
        : `Running ${active.length} tools…`;
    }
    const total = all.length;
    return `Used ${total} tool${total === 1 ? '' : 's'}`;
  });
}
