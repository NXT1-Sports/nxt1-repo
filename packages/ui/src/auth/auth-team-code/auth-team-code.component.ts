/**
 * @fileoverview AuthTeamCodeComponent - Cross-Platform Team Code Input
 * @module @nxt1/ui/auth
 *
 * Shared team code input and validation component.
 * Uses Ionic components for consistent styling across platforms.
 *
 * Features:
 * - Team code input with uppercase formatting
 * - Real-time validation feedback
 * - Team preview card when validated
 * - Loading state during validation
 * - Error display
 *
 * Usage:
 * ```html
 * <nxt1-auth-team-code
 *   [state]="teamCodeState()"
 *   [teamCode]="teamCodeInput"
 *   [validatedTeam]="validatedTeam()"
 *   [errorMessage]="teamCodeError()"
 *   (teamCodeChange)="onTeamCodeInputChange($event)"
 *   (validate)="onValidateTeamCode()"
 *   (continue)="onContinueWithTeam()"
 * />
 * ```
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonButton, IonInput, IonSpinner } from '@ionic/angular/standalone';
import type { ValidatedTeamInfo, TeamCodeValidationState } from '@nxt1/core';

// Re-export types for convenience
export type { ValidatedTeamInfo, TeamCodeValidationState } from '@nxt1/core';

@Component({
  selector: 'nxt1-auth-team-code',
  standalone: true,
  imports: [CommonModule, FormsModule, TitleCasePipe, IonButton, IonInput, IonSpinner],
  template: `
    <div class="space-y-4">
      <!-- Team Code Input -->
      <div class="space-y-2">
        <label for="teamCode" class="text-text-secondary text-sm font-medium">
          Enter your team code
        </label>
        <ion-input
          id="teamCode"
          type="text"
          class="team-code-input"
          [class.team-code-input-error]="state === 'error'"
          [class.team-code-input-success]="validatedTeam"
          fill="outline"
          placeholder="e.g., ABC123"
          [ngModel]="teamCode"
          (ngModelChange)="onCodeInput($event)"
          (keyup.enter)="onValidate()"
          [disabled]="state === 'validating'"
          maxlength="10"
          autocomplete="off"
          inputmode="text"
          data-testid="team-code-input"
        >
          @if (state === 'validating') {
            <ion-spinner name="crescent" slot="end"></ion-spinner>
          }
        </ion-input>

        <!-- Error Message -->
        @if (errorMessage) {
          <p class="text-center text-sm text-red-500" data-testid="team-code-error">
            {{ errorMessage }}
          </p>
        }
      </div>

      <!-- Validated Team Preview -->
      @if (validatedTeam) {
        <div
          class="bg-surface-tertiary rounded-xl border border-green-500/30 p-4"
          data-testid="team-preview"
        >
          <div class="flex items-center gap-3">
            <div class="bg-primary/20 flex h-12 w-12 items-center justify-center rounded-full">
              <span class="text-primary text-xl font-bold">{{
                validatedTeam.teamName.charAt(0)
              }}</span>
            </div>
            <div class="flex-1">
              <p class="text-text-primary font-semibold">{{ validatedTeam.teamName }}</p>
              <p class="text-text-secondary text-sm">
                {{ validatedTeam.sport }} • {{ validatedTeam.teamType | titlecase }}
              </p>
            </div>
            <div class="text-green-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          @if (validatedTeam.isFreeTrial && validatedTeam.trialDays) {
            <p class="text-text-secondary mt-2 text-center text-xs">
              Includes {{ validatedTeam.trialDays }}-day free trial
            </p>
          }
        </div>

        <!-- Continue to Signup Button -->
        <ion-button
          expand="block"
          class="team-code-btn"
          (click)="continue.emit()"
          data-testid="continue-with-team"
        >
          Continue to Sign Up
        </ion-button>
      } @else if (state !== 'validating') {
        <!-- Validate Button -->
        <ion-button
          expand="block"
          class="team-code-btn"
          (click)="onValidate()"
          [disabled]="!teamCode || teamCode.length < 4"
          data-testid="validate-team-code"
        >
          Validate Code
        </ion-button>
      }
    </div>
  `,
  styles: [
    `
      /* Team Code Input - matching auth design system */
      .team-code-input {
        --background: var(--nxt1-color-state-hover);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: var(--nxt1-borderRadius-lg);
        --border-width: 1px;
        --padding-start: var(--nxt1-spacing-4);
        --padding-end: var(--nxt1-spacing-4);
        --padding-top: 0;
        --padding-bottom: 0;
        --color: var(--nxt1-color-text-primary);
        --placeholder-color: var(--nxt1-color-text-tertiary);
        --highlight-color-focused: var(--nxt1-color-border-strong);
        --highlight-color-valid: var(--nxt1-color-border-strong);
        --highlight-color-invalid: var(--nxt1-color-error);
        --highlight-height: 1px;
        font-size: var(--nxt1-fontSize-md);
        min-height: 52px;
        text-align: center;
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
        font-family: var(--nxt1-fontFamily-mono);
        transition:
          border-color var(--nxt1-duration-fast) ease-out,
          background var(--nxt1-duration-fast) ease-out;
      }

      .team-code-input::part(native) {
        transition: all var(--nxt1-duration-fast) ease-out;
      }

      .team-code-input:hover {
        --border-color: var(--nxt1-color-border-strong);
      }

      .team-code-input-error {
        --border-color: var(--nxt1-color-error);
        --highlight-color-focused: var(--nxt1-color-error);
      }

      .team-code-input-success {
        --border-color: var(--nxt1-color-success);
        --highlight-color-focused: var(--nxt1-color-success);
      }

      /* Team Code Buttons - matching auth design system */
      .team-code-btn {
        --background: var(--nxt1-color-primary);
        --background-hover: var(--nxt1-color-primaryDark);
        --background-activated: var(--nxt1-color-primaryDark);
        --background-focused: var(--nxt1-color-primary);
        --color: var(--nxt1-color-text-onPrimary);
        --border-radius: var(--nxt1-borderRadius-lg);
        --padding-top: var(--nxt1-spacing-3_5);
        --padding-bottom: var(--nxt1-spacing-3_5);
        --box-shadow: none;
        font-size: var(--nxt1-fontSize-md);
        font-weight: 600;
        text-transform: none;
        letter-spacing: var(--nxt1-letterSpacing-wide);
        margin-top: var(--nxt1-spacing-2);
      }

      .team-code-btn::part(native) {
        min-height: 52px;
        border-radius: var(--nxt1-borderRadius-lg);
      }

      .team-code-btn:disabled {
        opacity: 0.5;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthTeamCodeComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Current validation state */
  @Input() state: TeamCodeValidationState = 'idle';

  /** Current team code value */
  @Input() teamCode = '';

  /** Validated team info (null/undefined if not validated) */
  @Input() validatedTeam: ValidatedTeamInfo | null | undefined = null;

  /** Error message to display */
  @Input() errorMessage: string | null = null;

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when code input changes */
  @Output() teamCodeChange = new EventEmitter<string>();

  /** Emits when user clicks validate or presses enter */
  @Output() validate = new EventEmitter<void>();

  /** Emits when user clicks continue with validated team */
  @Output() continue = new EventEmitter<void>();

  // ============================================
  // METHODS
  // ============================================

  /**
   * Handle code input changes
   */
  onCodeInput(value: string): void {
    const upperValue = value.toUpperCase();
    this.teamCodeChange.emit(upperValue);
  }

  /**
   * Trigger validation
   */
  onValidate(): void {
    const code = this.teamCode.trim();
    if (code && code.length >= 4) {
      this.validate.emit();
    }
  }
}
