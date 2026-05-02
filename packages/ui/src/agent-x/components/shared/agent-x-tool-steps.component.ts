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
import {
  getToolStepContextLabel,
  getToolStepsSummaryLabel,
  normalizeToolStepIcon,
} from '../../types/agent-x-agent-presentation';

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
          } @else if (allFailed()) {
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
          } @else if (hasMixedOutcome()) {
            <svg
              class="tool-steps__summary-icon tool-steps__summary-warning"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M8 2.5L14 13H2L8 2.5Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
              <path d="M8 6V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <circle cx="8" cy="11.25" r="0.75" fill="currentColor" />
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

        <div class="tool-steps__list" [class.tool-steps__list--scrollable]="hasOverflow()">
          @for (step of orderedSteps(); track step.id) {
            <div
              class="tool-step"
              [class.tool-step--active]="step.status === 'active'"
              [class.tool-step--success]="step.status === 'success'"
              [class.tool-step--error]="step.status === 'error'"
              [class.tool-step--pending]="step.status === 'pending'"
            >
              <div class="tool-step__icon">
                @switch (resolvedIcon(step)) {
                  @case ('delete') {
                    <svg class="tool-step__glyph" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3.5 4.5H12.5M6.25 2.75H9.75M5 4.5V12.25C5 12.6642 5.33579 13 5.75 13H10.25C10.6642 13 11 12.6642 11 12.25V4.5"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  }
                  @case ('upload') {
                    <svg class="tool-step__glyph" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M8 11.75V3.75M8 3.75L5 6.75M8 3.75L11 6.75M3.5 12.25H12.5"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  }
                  @case ('download') {
                    <svg class="tool-step__glyph" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M8 4.25V12.25M8 12.25L5 9.25M8 12.25L11 9.25M3.5 3.75H12.5"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  }
                  @case ('search') {
                    <svg class="tool-step__glyph" viewBox="0 0 16 16" fill="none">
                      <circle cx="7" cy="7" r="3.75" stroke="currentColor" stroke-width="1.5" />
                      <path
                        d="M10 10L13 13"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                      />
                    </svg>
                  }
                  @case ('processing') {
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
                  @case ('document') {
                    <svg class="tool-step__glyph" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M5.25 2.75H8.75L11.25 5.25V12.25C11.25 12.6642 10.9142 13 10.5 13H5.5C5.08579 13 4.75 12.6642 4.75 12.25V3.25C4.75 2.83579 5.08579 2.5 5.5 2.5"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linejoin="round"
                      />
                      <path d="M8.75 2.75V5.25H11.25" stroke="currentColor" stroke-width="1.5" />
                    </svg>
                  }
                  @case ('media') {
                    <svg class="tool-step__glyph" viewBox="0 0 16 16" fill="none">
                      <rect
                        x="2.75"
                        y="3.25"
                        width="10.5"
                        height="9.5"
                        rx="2"
                        stroke="currentColor"
                        stroke-width="1.5"
                      />
                      <path
                        d="M5 10L7 8L9 9.5L11 7.5"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  }
                  @case ('database') {
                    <svg class="tool-step__glyph" viewBox="0 0 16 16" fill="none">
                      <ellipse
                        cx="8"
                        cy="4.5"
                        rx="4.25"
                        ry="1.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                      />
                      <path
                        d="M3.75 4.5V11.25C3.75 12.2165 5.65279 13 8 13C10.3472 13 12.25 12.2165 12.25 11.25V4.5"
                        stroke="currentColor"
                        stroke-width="1.5"
                      />
                      <path
                        d="M3.75 7.75C3.75 8.7165 5.65279 9.5 8 9.5C10.3472 9.5 12.25 8.7165 12.25 7.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                      />
                    </svg>
                  }
                  @case ('email') {
                    <svg class="tool-step__glyph" viewBox="0 0 16 16" fill="none">
                      <rect
                        x="2.5"
                        y="3.5"
                        width="11"
                        height="9"
                        rx="2"
                        stroke="currentColor"
                        stroke-width="1.5"
                      />
                      <path
                        d="M3.5 5L8 8.5L12.5 5"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  }
                  @case ('approval') {
                    <svg class="tool-step__glyph" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M8 2.75L11.75 4.25V7.75C11.75 9.75 10.5 11.5 8 13.25C5.5 11.5 4.25 9.75 4.25 7.75V4.25L8 2.75Z"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linejoin="round"
                      />
                      <path
                        d="M6.5 8L7.5 9L9.75 6.75"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  }
                  @default {
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
                  }
                }
              </div>
              <div class="tool-step__content">
                <span class="tool-step__label">{{ displayLabel(step) }}</span>
                @if (contextLabel(step)) {
                  <span class="tool-step__context">{{ contextLabel(step) }}</span>
                }
              </div>
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

      .tool-steps__summary-warning {
        color: var(--nxt1-color-warning, #f59e0b);
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

      .tool-steps__list--scrollable {
        max-height: 220px;
        overflow-y: auto;
        padding-right: 6px;
        -webkit-mask-image: linear-gradient(
          to bottom,
          transparent 0,
          #000 16px,
          #000 calc(100% - 16px),
          transparent 100%
        );
        mask-image: linear-gradient(
          to bottom,
          transparent 0,
          #000 16px,
          #000 calc(100% - 16px),
          transparent 100%
        );
        -webkit-mask-size: 100% 100%;
        mask-size: 100% 100%;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.22) transparent;
      }

      .tool-steps__list--scrollable::-webkit-scrollbar {
        width: 6px;
      }

      .tool-steps__list--scrollable::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 999px;
      }

      .tool-steps__list--scrollable::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
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

      .tool-step__glyph {
        width: 16px;
        height: 16px;
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

      .tool-step__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .tool-step__label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .tool-step__context {
        font-size: 0.6875rem;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
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

  /** Render newest tool calls first for easier recency scanning. */
  protected readonly orderedSteps = computed(() => [...this.steps()].reverse());

  /** Switch to overflow scroll when history grows long. */
  protected readonly hasOverflow = computed(() => this.steps().length > 8);

  /** Whether any step is currently active (running). */
  protected readonly hasActive = computed(() => this.steps().some((s) => s.status === 'active'));

  /** Whether any step errored. */
  protected readonly hasError = computed(() => this.steps().some((s) => s.status === 'error'));

  /** Whether there is at least one successful step. */
  protected readonly hasSuccess = computed(() => this.steps().some((s) => s.status === 'success'));

  /** True when all terminal steps failed and none succeeded. */
  protected readonly allFailed = computed(
    () => this.hasError() && !this.hasSuccess() && !this.hasActive()
  );

  /** True when the run completed with a mix of success + failure steps. */
  protected readonly hasMixedOutcome = computed(
    () => this.hasError() && this.hasSuccess() && !this.hasActive()
  );

  /** Accordion summary label. */
  protected readonly summaryLabel = computed(() => getToolStepsSummaryLabel(this.steps()));

  protected contextLabel(step: AgentXToolStep): string | null {
    return getToolStepContextLabel(step);
  }

  protected displayLabel(step: AgentXToolStep): string {
    return step.label;
  }

  protected resolvedIcon(step: AgentXToolStep): string {
    const icon = normalizeToolStepIcon(step.icon);
    // Keep the processing spinner only while the step is actively running.
    if (icon === 'processing' && step.status !== 'active') return 'default';
    return icon ?? 'default';
  }
}
