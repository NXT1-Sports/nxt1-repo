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

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import type { AgentXToolStep } from '@nxt1/core/ai';

@Component({
  selector: 'nxt1-agent-x-tool-steps',
  standalone: true,
  template: `
    @if (steps().length > 0) {
      <div class="tool-steps">
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
    }
  `,
  styles: [
    `
      .tool-steps {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 0 4px;
      }

      .tool-step {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8125rem;
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

      /* ── Icons ── */

      .tool-step__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .tool-step__spinner,
      .tool-step__check,
      .tool-step__error-icon {
        width: 16px;
        height: 16px;
      }

      .tool-step__spinner {
        animation: stepSpin 1s linear infinite;
      }

      .tool-step__dot {
        width: 6px;
        height: 6px;
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
        font-size: 0.75rem;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
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

      @media (prefers-reduced-motion: reduce) {
        .tool-step__spinner {
          animation: none;
        }

        .tool-step__check {
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
}
