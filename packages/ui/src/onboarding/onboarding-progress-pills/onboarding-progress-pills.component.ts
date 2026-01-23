/**
 * @fileoverview OnboardingProgressPillsComponent - Compact Native Progress Indicator
 * @module @nxt1/ui/onboarding
 * @version 1.0.0
 *
 * Modern, compact step progress indicator inspired by MaxPreps and other native apps.
 * Displays small dots with an extended pill for the active step.
 *
 * Design:
 * ●●●━━━━●●  ← Dots for steps, longer pill for active step
 *
 * Features:
 * - Minimal footprint - perfect for mobile footers
 * - Active step shown as elongated pill
 * - Completed steps shown as filled dots
 * - Future steps shown as subtle dots
 * - Smooth animations on step transitions
 * - Accessible with ARIA attributes
 * - Platform-adaptive - works on web and mobile
 * - Uses design tokens - no hardcoded colors
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-progress-pills
 *   [totalSteps]="4"
 *   [currentStepIndex]="1"
 *   [completedStepIndices]="[0]"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-onboarding-progress-pills',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav
      class="nxt1-progress-pills"
      role="navigation"
      [attr.aria-label]="'Step ' + (currentStepIndex() + 1) + ' of ' + totalSteps()"
    >
      @for (step of stepsArray(); track step.index; let i = $index) {
        <span
          class="nxt1-progress-pill"
          [class.active]="step.isActive"
          [class.completed]="step.isCompleted"
          [class.future]="step.isFuture"
          role="presentation"
          [attr.aria-hidden]="true"
        ></span>
      }
      <span class="nxt1-sr-only"> Step {{ currentStepIndex() + 1 }} of {{ totalSteps() }} </span>
    </nav>
  `,
  styles: [
    `
      /* ============================================
       PILLS CONTAINER
       ============================================ */
      .nxt1-progress-pills {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1-5, 6px);
        padding: var(--nxt1-spacing-2, 8px) 0;
      }

      /* ============================================
       INDIVIDUAL PILL/DOT
       ============================================ */
      .nxt1-progress-pill {
        height: var(--nxt1-spacing-2, 8px);
        border-radius: var(--nxt1-borderRadius-full, 100px);
        transition: all var(--nxt1-duration-normal, 200ms) var(--nxt1-easing-inOut, ease-in-out);
      }

      /* Future step (not reached yet) - subtle dot */
      .nxt1-progress-pill.future {
        width: var(--nxt1-spacing-2, 8px);
        background: var(--nxt1-color-border-subtle, rgba(128, 128, 128, 0.25));
      }

      /* Completed step - filled primary dot */
      .nxt1-progress-pill.completed {
        width: var(--nxt1-spacing-2, 8px);
        background: var(--nxt1-color-primary, #ccff00);
      }

      /* Active step - elongated pill */
      .nxt1-progress-pill.active {
        width: var(--nxt1-spacing-8, 32px);
        background: var(--nxt1-color-primary, #ccff00);
        box-shadow: 0 0 8px var(--nxt1-color-primaryAlpha, rgba(204, 255, 0, 0.35));
      }

      /* ============================================
       SCREEN READER ONLY
       ============================================ */
      .nxt1-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingProgressPillsComponent {
  // ============================================
  // SIGNAL INPUTS (Angular 19+ pattern)
  // ============================================

  /** Total number of steps */
  readonly totalSteps = input.required<number>();

  /** Current step index (0-based) */
  readonly currentStepIndex = input<number>(0);

  /** Array of completed step indices (0-based) */
  readonly completedStepIndices = input<number[]>([]);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /**
   * Generate array of step objects for template rendering.
   * Each step has flags for active, completed, and future states.
   */
  readonly stepsArray = computed(() => {
    const total = this.totalSteps();
    const current = this.currentStepIndex();
    const completed = new Set(this.completedStepIndices());

    return Array.from({ length: total }, (_, index) => ({
      index,
      isActive: index === current,
      isCompleted: completed.has(index) && index !== current,
      isFuture: index > current && !completed.has(index),
    }));
  });
}
