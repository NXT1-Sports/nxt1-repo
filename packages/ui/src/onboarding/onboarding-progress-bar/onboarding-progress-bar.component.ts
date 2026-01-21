/**
 * @fileoverview OnboardingProgressBarComponent - Cross-Platform Progress Indicator
 * @module @nxt1/ui/onboarding
 * @version 2.0.0
 *
 * Reusable step progress indicator for onboarding wizard.
 * Displays step numbers with completion states and connectors.
 *
 * Features:
 * - Platform-adaptive styling
 * - Accessible with ARIA attributes
 * - Click navigation to completed steps
 * - Animated transitions
 * - Mobile-friendly with horizontal scroll
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-progress-bar
 *   [steps]="steps()"
 *   [currentStepIndex]="currentStepIndex()"
 *   [completedStepIds]="completedStepIds()"
 *   (stepClick)="goToStep($event)"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../shared/icon';
import type { OnboardingStep, OnboardingStepId } from '@nxt1/core/api';

@Component({
  selector: 'nxt1-onboarding-progress-bar',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div class="nxt1-progress-container">
      <!-- Step Indicators -->
      <div class="nxt1-step-indicators" role="navigation" aria-label="Onboarding progress">
        @for (step of steps(); track step.id; let i = $index) {
          <button
            type="button"
            class="nxt1-step-indicator"
            [class.active]="i === currentStepIndex()"
            [class.completed]="isStepCompleted(step.id) && i !== currentStepIndex()"
            [class.clickable]="canNavigateToStep(i)"
            [disabled]="!canNavigateToStep(i)"
            (click)="onStepClick(i)"
            [attr.data-testid]="'onboarding-step-' + (i + 1)"
            [attr.aria-label]="step.title + (isStepCompleted(step.id) ? ' (completed)' : '')"
            [attr.aria-current]="i === currentStepIndex() ? 'step' : null"
          >
            <span class="nxt1-step-number">
              @if (isStepCompleted(step.id) && i !== currentStepIndex()) {
                <nxt1-icon name="checkmark" [size]="16" />
              } @else {
                {{ i + 1 }}
              }
            </span>
          </button>

          <!-- Connector line between steps -->
          @if (i < steps().length - 1) {
            <div class="nxt1-step-connector" [class.completed]="isStepCompleted(step.id)"></div>
          }
        }
      </div>

      <!-- Step count text -->
      <div class="nxt1-step-count">
        <span>Step {{ currentStepIndex() + 1 }} of {{ steps().length }}</span>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       PROGRESS CONTAINER
       ============================================ */
      .nxt1-progress-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        margin-bottom: var(--nxt1-spacing-6);
        overflow: hidden;
      }

      /* ============================================
       STEP INDICATORS ROW
       ============================================ */
      .nxt1-step-indicators {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        max-width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        padding: var(--nxt1-spacing-1);
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .nxt1-step-indicators::-webkit-scrollbar {
        display: none;
      }

      /* ============================================
       STEP INDICATOR (Circle)
       ============================================ */
      .nxt1-step-indicator {
        width: var(--nxt1-spacing-9);
        height: var(--nxt1-spacing-9);
        border-radius: 50%;
        border: 2px solid var(--nxt1-color-border-subtle);
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: default;
        transition: all var(--nxt1-transition-fast) var(--nxt1-easing-default);
        flex-shrink: 0;
      }

      .nxt1-step-indicator .nxt1-step-number {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .nxt1-step-indicator.clickable {
        cursor: pointer;
      }

      .nxt1-step-indicator.clickable:hover:not(.active) {
        border-color: var(--nxt1-color-border-default);
        background: var(--nxt1-color-state-hover);
      }

      .nxt1-step-indicator.active {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10);
      }

      .nxt1-step-indicator.active .nxt1-step-number {
        color: var(--nxt1-color-primary);
      }

      .nxt1-step-indicator.completed:not(.active) {
        border-color: var(--nxt1-color-success);
        background: var(--nxt1-color-successBg);
      }

      .nxt1-step-indicator.completed:not(.active) .nxt1-step-number {
        color: var(--nxt1-color-success);
      }

      /* ============================================
       STEP CONNECTOR (Line between circles)
       ============================================ */
      .nxt1-step-connector {
        width: var(--nxt1-spacing-8);
        height: 2px;
        background: var(--nxt1-color-border-subtle);
        transition: background var(--nxt1-transition-normal) var(--nxt1-easing-default);
      }

      .nxt1-step-connector.completed {
        background: var(--nxt1-color-success);
      }

      /* ============================================
       STEP COUNT TEXT
       ============================================ */
      .nxt1-step-count {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingProgressBarComponent {
  // ============================================
  // SIGNAL INPUTS (Angular 19+ pattern)
  // ============================================

  /** Array of onboarding steps */
  readonly steps = input.required<OnboardingStep[]>();

  /** Current step index (0-based) */
  readonly currentStepIndex = input<number>(0);

  /** Set of completed step IDs */
  readonly completedStepIds = input<Set<OnboardingStepId>>(new Set());

  // ============================================
  // SIGNAL OUTPUTS (Angular 19+ pattern)
  // ============================================

  /** Emits when a step is clicked */
  readonly stepClick = output<number>();

  // ============================================
  // METHODS
  // ============================================

  /**
   * Check if step is completed
   */
  isStepCompleted(stepId: OnboardingStepId): boolean {
    return this.completedStepIds().has(stepId);
  }

  /**
   * Check if can navigate to a specific step
   */
  canNavigateToStep(index: number): boolean {
    const stepsArray = this.steps();
    const currentIdx = this.currentStepIndex();

    if (index < 0 || index >= stepsArray.length) return false;
    if (index === currentIdx) return true;

    const targetStep = stepsArray[index];
    if (!targetStep) return false;

    // Can always go back to completed steps
    if (this.isStepCompleted(targetStep.id)) return true;

    // Can go to next step if current is valid
    if (index === currentIdx + 1) {
      const currentStep = stepsArray[currentIdx];
      return currentStep ? this.isStepCompleted(currentStep.id) : false;
    }

    return false;
  }

  /**
   * Handle step click
   */
  protected onStepClick(index: number): void {
    if (this.canNavigateToStep(index)) {
      this.stepClick.emit(index);
    }
  }
}
