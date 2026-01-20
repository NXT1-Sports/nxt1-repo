/**
 * @fileoverview OnboardingTeamStepComponent - Cross-Platform Team Form
 * @module @nxt1/ui/onboarding
 * @version 2.0.0
 *
 * Reusable team step component for onboarding Step 3.
 * Collects user's team name and team type.
 *
 * Features:
 * - Platform-adaptive with Ionic components
 * - Team name input with validation
 * - Team type selector (High School, Middle School, Club, JUCO)
 * - Optional second team support
 * - Real-time validation
 * - Accessible with ARIA labels
 * - Haptic feedback ready
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-team-step
 *   [teamData]="teamFormData()"
 *   [disabled]="isLoading()"
 *   (teamChange)="onTeamChange($event)"
 * />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonInput, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import type { TeamFormData, OnboardingTeamType } from '@nxt1/core/api';
import type { ILogger } from '@nxt1/core/logging';
import { NxtLoggingService } from '../../services/logging';
import { NxtValidationSummaryComponent } from '../../shared/validation-summary';
import { NxtFormFieldComponent } from '../../shared/form-field';

// ============================================
// CONSTANTS
// ============================================

/** Minimum team name length for validation */
const MIN_TEAM_NAME_LENGTH = 2;

/** Team type options with display labels */
export interface TeamTypeOption {
  readonly value: OnboardingTeamType;
  readonly label: string;
}

/** Available team types */
export const TEAM_TYPE_OPTIONS: readonly TeamTypeOption[] = [
  { value: 'High School', label: 'High School' },
  { value: 'Middle School', label: 'Middle School' },
  { value: 'Club', label: 'Club' },
  { value: 'JUCO', label: 'JUCO' },
] as const;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-team-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonInput,
    IonSelect,
    IonSelectOption,
    NxtValidationSummaryComponent,
    NxtFormFieldComponent,
  ],
  template: `
    <div class="nxt1-team-form" data-testid="onboarding-team-step">
      <!-- Primary Team Row -->
      <nxt1-form-field
        label="Primary Team"
        [error]="
          teamNameTouched() && teamName() && !isTeamNameValid()
            ? 'Please enter a valid team name (min 2 characters)'
            : null
        "
        testId="onboarding-team-primary-field"
      >
        <div class="nxt1-team-row">
          <!-- Team Name Input -->
          <ion-input
            type="text"
            class="nxt1-input nxt1-team-name-input"
            [class.nxt1-input-error]="teamNameTouched() && teamName() && !isTeamNameValid()"
            fill="outline"
            placeholder="Team name"
            [value]="teamName()"
            (ionInput)="onTeamNameInput($event)"
            (ionBlur)="teamNameTouched.set(true)"
            [disabled]="disabled()"
            autocomplete="organization"
            autocapitalize="words"
            data-testid="onboarding-input-team-name"
          />
          <!-- Team Type Dropdown -->
          <ion-select
            class="nxt1-select nxt1-team-type-select"
            interface="popover"
            [interfaceOptions]="selectPopoverOptions"
            placeholder="Type"
            [value]="teamType()"
            (ionChange)="onTeamTypeChange($event)"
            [disabled]="disabled()"
            data-testid="onboarding-select-team-type"
          >
            @for (option of teamTypeOptions; track option.value) {
              <ion-select-option [value]="option.value">
                {{ option.label }}
              </ion-select-option>
            }
          </ion-select>
        </div>
      </nxt1-form-field>

      <!-- Secondary Team Row (Optional) -->
      <nxt1-form-field
        label="Secondary Team"
        [optional]="true"
        testId="onboarding-team-secondary-field"
      >
        <div class="nxt1-team-row">
          <!-- Second Team Name Input -->
          <ion-input
            type="text"
            class="nxt1-input nxt1-team-name-input"
            fill="outline"
            placeholder="Team name"
            [value]="secondTeamName()"
            (ionInput)="onSecondTeamNameInput($event)"
            [disabled]="disabled()"
            autocomplete="organization"
            autocapitalize="words"
            data-testid="onboarding-input-second-team-name"
          />
          <!-- Second Team Type Dropdown -->
          <ion-select
            class="nxt1-select nxt1-team-type-select"
            interface="popover"
            [interfaceOptions]="selectPopoverOptions"
            placeholder="Type"
            [value]="secondTeamType()"
            (ionChange)="onSecondTeamTypeChange($event)"
            [disabled]="disabled() || !hasSecondTeam()"
            data-testid="onboarding-select-second-team-type"
          >
            @for (option of teamTypeOptions; track option.value) {
              <ion-select-option [value]="option.value">
                {{ option.label }}
              </ion-select-option>
            }
          </ion-select>
        </div>
      </nxt1-form-field>

      <!-- Validation Summary -->
      @if (showValidationSummary()) {
        <nxt1-validation-summary testId="onboarding-team-validation">
          Team info looks good!
        </nxt1-validation-summary>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       TEAM FORM CONTAINER
       ============================================ */
      .nxt1-team-form {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-6);
        width: 100%;
      }

      /* ============================================
       TEAM ROW - Name + Type side by side
       Field/label/error styles handled by NxtFormFieldComponent
       ============================================ */
      .nxt1-team-row {
        display: flex;
        gap: var(--nxt1-spacing-3);
        width: 100%;
      }

      .nxt1-team-name-input {
        flex: 1;
        min-width: 0;
      }

      .nxt1-team-type-select {
        flex-shrink: 0;
        width: 130px;
      }

      /* ============================================
       INPUT STYLING - Matches auth-email-form design tokens
       ============================================ */
      .nxt1-input {
        --background: var(--nxt1-color-state-hover);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: var(--nxt1-borderRadius-lg, 12px);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary);
        --placeholder-color: var(--nxt1-color-text-tertiary);
        --placeholder-opacity: 1;
        --padding-start: 16px;
        --padding-end: 16px;
        --padding-top: 14px;
        --padding-bottom: 14px;
        --highlight-color-focused: var(--nxt1-color-border-strong);
        --highlight-color-valid: var(--nxt1-color-border-strong);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 15px;
        min-height: 52px;
      }

      .nxt1-input:hover:not(.nxt1-input-error) {
        --border-color: var(--nxt1-color-border-strong);
      }

      .nxt1-input-error {
        --border-color: var(--nxt1-color-error);
        --highlight-color-focused: var(--nxt1-color-error);
      }

      /* ============================================
       SELECT STYLING - Matches input design
       ============================================ */
      .nxt1-select {
        --background: var(--nxt1-color-state-hover);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: var(--nxt1-borderRadius-lg, 12px);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary);
        --placeholder-color: var(--nxt1-color-text-tertiary);
        --placeholder-opacity: 1;
        --padding-start: 12px;
        --padding-end: 12px;
        --highlight-color-focused: var(--nxt1-color-border-strong);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 15px;
        min-height: 52px;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        background: var(--nxt1-color-state-hover);
      }

      .nxt1-select:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-strong);
      }

      .nxt1-select::part(icon) {
        color: var(--nxt1-color-text-tertiary);
      }

      .nxt1-select:disabled {
        opacity: 0.5;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingTeamStepComponent {
  private readonly loggingService = inject(NxtLoggingService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('OnboardingTeamStep');

  // ============================================
  // SIGNAL INPUTS (Angular 19+ pattern)
  // ============================================

  /** Current team data from parent */
  readonly teamData = input<TeamFormData | null>(null);

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  // ============================================
  // SIGNAL OUTPUTS (Angular 19+ pattern)
  // ============================================

  /** Emits when team data changes */
  readonly teamChange = output<TeamFormData>();

  // ============================================
  // CONFIGURATION (readonly for immutability)
  // ============================================

  /** Team type options */
  readonly teamTypeOptions = TEAM_TYPE_OPTIONS;

  /**
   * Popover options for ion-select
   * - cssClass: Applies NXT1 styling via global CSS
   * - showBackdrop: Keep true for click-outside dismiss (CSS makes it invisible)
   * - dismissOnSelect: Auto-close when option is selected
   */
  readonly selectPopoverOptions = {
    cssClass: 'nxt1-select-popover',
    showBackdrop: true,
    dismissOnSelect: true,
  };

  // ============================================
  // INTERNAL STATE (signals for reactivity)
  // ============================================

  /** Team name value */
  readonly teamName = signal('');

  /** Selected team type */
  readonly teamType = signal<OnboardingTeamType | null>(null);

  /** Second team name value */
  readonly secondTeamName = signal('');

  /** Selected second team type */
  readonly secondTeamType = signal<OnboardingTeamType | null>(null);

  /** Team name field touched */
  readonly teamNameTouched = signal(false);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Check if team name meets minimum length */
  readonly isTeamNameValid = computed(() => this.teamName().trim().length >= MIN_TEAM_NAME_LENGTH);

  /** Check if second team name has content (for conditional UI) */
  readonly hasSecondTeam = computed(() => this.secondTeamName().trim().length > 0);

  /** Check if form is complete and valid */
  readonly showValidationSummary = computed(() => this.isTeamNameValid());

  // ============================================
  // CONSTRUCTOR - Effect for syncing input
  // ============================================

  constructor() {
    // Sync internal state when teamData input changes
    effect(
      () => {
        const data = this.teamData();
        if (data) {
          this.teamName.set(data.teamName || '');
          this.teamType.set(data.teamType ?? null);
          this.secondTeamName.set(data.secondTeamName || '');
          this.secondTeamType.set(data.secondTeamType ?? null);
        }
      },
      { allowSignalWrites: true }
    );
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle team name input
   */
  onTeamNameInput(event: CustomEvent): void {
    const input = event.target as HTMLInputElement;
    this.teamName.set(input.value || '');
    this.emitTeamChange();
  }

  /**
   * Handle team type dropdown change
   */
  onTeamTypeChange(event: CustomEvent): void {
    const type = event.detail.value as OnboardingTeamType;
    this.teamType.set(type);
    this.logger.debug('Team type selected', { teamType: type });
    this.emitTeamChange();
  }

  /**
   * Handle second team name input
   */
  onSecondTeamNameInput(event: CustomEvent): void {
    const input = event.target as HTMLInputElement;
    this.secondTeamName.set(input.value || '');
    this.emitTeamChange();
  }

  /**
   * Handle second team type dropdown change
   */
  onSecondTeamTypeChange(event: CustomEvent): void {
    const type = event.detail.value as OnboardingTeamType;
    this.secondTeamType.set(type);
    this.logger.debug('Second team type selected', { secondTeamType: type });
    this.emitTeamChange();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Emit team change event with current data
   */
  private emitTeamChange(): void {
    const data: TeamFormData = {
      teamName: this.teamName(),
      teamType: this.teamType() ?? undefined,
      secondTeamName: this.secondTeamName() || undefined,
      secondTeamType: this.secondTeamType() ?? undefined,
    };
    this.teamChange.emit(data);
  }
}
