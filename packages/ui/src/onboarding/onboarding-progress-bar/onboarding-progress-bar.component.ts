/**
 * @fileoverview OnboardingProgressBarComponent - Cross-Platform Progress Indicator
 * @module @nxt1/ui/onboarding
 *
 * Reusable step progress indicator for onboarding wizard.
 * Displays step numbers with completion states and connectors.
 *
 * Features:
 * - Platform-adaptive styling
 * - Accessible with ARIA attributes
 * - Click navigation to completed steps
 * - Animated transitions
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

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
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
        @for (step of steps; track step.id; let i = $index) {
          <button
            type="button"
            class="nxt1-step-indicator"
            [class.active]="i === currentStepIndex"
            [class.completed]="isStepCompleted(step.id) && i !== currentStepIndex"
            [class.clickable]="canNavigateToStep(i)"
            [disabled]="!canNavigateToStep(i)"
            (click)="onStepClick(i)"
            [attr.data-testid]="'onboarding-step-' + (i + 1)"
            [attr.aria-label]="step.title + (isStepCompleted(step.id) ? ' (completed)' : '')"
            [attr.aria-current]="i === currentStepIndex ? 'step' : null"
          >
            <span class="nxt1-step-number">
              @if (isStepCompleted(step.id) && i !== currentStepIndex) {
                <nxt1-icon name="checkmark" [size]="16" />
              } @else {
                {{ i + 1 }}
              }
            </span>
          </button>

          <!-- Connector line between steps -->
          @if (i < steps.length - 1) {
            <div class="nxt1-step-connector" [class.completed]="isStepCompleted(step.id)"></div>
          }
        }
      </div>

      <!-- Step count text -->
      <div class="nxt1-step-count">
        <span>Step {{ currentStepIndex + 1 }} of {{ steps.length }}</span>
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
        gap: 12px;
        width: 100%;
        margin-bottom: 24px;
      }

      /* ============================================
       STEP INDICATORS ROW
       ============================================ */
      .nxt1-step-indicators {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
      }

      /* ============================================
       STEP INDICATOR (Circle)
       ============================================ */
      .nxt1-step-indicator {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 2px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: default;
        transition: all 0.2s ease-out;
        flex-shrink: 0;
      }

      .nxt1-step-indicator .nxt1-step-number {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .nxt1-step-indicator.clickable {
        cursor: pointer;
      }

      .nxt1-step-indicator.clickable:hover:not(.active) {
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
      }

      .nxt1-step-indicator.active {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .nxt1-step-indicator.active .nxt1-step-number {
        color: var(--nxt1-color-primary, #ccff00);
      }

      .nxt1-step-indicator.completed:not(.active) {
        border-color: var(--nxt1-color-success, #22c55e);
        background: var(--nxt1-color-successBg, rgba(34, 197, 94, 0.1));
      }

      .nxt1-step-indicator.completed:not(.active) .nxt1-step-number {
        color: var(--nxt1-color-success, #22c55e);
      }
        color: var(--nxt1-color-feedback-success, #22c55e);
      }

      /* ============================================
       STEP CONNECTOR (Line between circles)
       ============================================ */
      .nxt1-step-connector {
        width: 32px;
        height: 2px;
        background: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        transition: background 0.3s ease-out;
      }

      .nxt1-step-connector.completed {
        background: var(--nxt1-color-success, #22c55e);
      }

      /* ============================================
       STEP COUNT TEXT
       ============================================ */
      .nxt1-step-count {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 12px;
        font-weight: 500;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingProgressBarComponent {
  /** Array of onboarding steps */
  @Input({ required: true }) steps: OnboardingStep[] = [];

  /** Current step index (0-based) */
  @Input() currentStepIndex = 0;

  /** Set of completed step IDs */
  @Input() completedStepIds: Set<OnboardingStepId> = new Set();

  /** Emits when a step is clicked */
  @Output() stepClick = new EventEmitter<number>();

  /**
   * Check if step is completed
   */
  isStepCompleted(stepId: OnboardingStepId): boolean {
    return this.completedStepIds.has(stepId);
  }

  /**
   * Check if can navigate to a specific step
   */
  canNavigateToStep(index: number): boolean {
    if (index < 0 || index >= this.steps.length) return false;
    if (index === this.currentStepIndex) return true;

    const targetStep = this.steps[index];
    if (!targetStep) return false;

    // Can always go back to completed steps
    if (this.isStepCompleted(targetStep.id)) return true;

    // Can go to next step if current is valid
    if (index === this.currentStepIndex + 1) {
      const currentStep = this.steps[this.currentStepIndex];
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
