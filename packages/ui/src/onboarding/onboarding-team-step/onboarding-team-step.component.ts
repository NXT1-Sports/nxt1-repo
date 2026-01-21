/**
 * @fileoverview OnboardingTeamStepComponent - Cross-Platform Team Form
 * @module @nxt1/ui/onboarding
 * @version 3.0.0
 *
 * Reusable team step component for onboarding Step 3.
 * Collects user's team name, team type, team logo, and team colors.
 *
 * Features:
 * - Platform-adaptive with Ionic components
 * - Team name input with validation
 * - Team type selector (High School, Middle School, Club, JUCO)
 * - Team logo picker with preview
 * - Multiple team colors support
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
 *   (logoFileSelected)="onLogoFileSelected($event)"
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
import { NxtTeamLogoPickerComponent } from '../../shared/team-logo-picker';
import { NxtColorPickerComponent } from '../../shared/color-picker';

// ============================================
// CONSTANTS
// ============================================

/** Minimum team name length for validation */
const MIN_TEAM_NAME_LENGTH = 2;

/** Maximum team colors allowed */
const MAX_TEAM_COLORS = 4;

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
    NxtTeamLogoPickerComponent,
    NxtColorPickerComponent,
  ],
  template: `
    <div class="nxt1-team-form" data-testid="onboarding-team-step">
      <!-- Primary Team Section -->
      <div class="nxt1-team-section">
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
            <!-- Team Logo Picker -->
            <nxt1-team-logo-picker
              [logoUrl]="teamLogo()"
              [disabled]="disabled()"
              testId="onboarding-team-logo"
              (logoChange)="onTeamLogoChange($event)"
              (fileSelected)="onTeamLogoFileSelected($event)"
              (pickerClick)="logoPickerClick.emit()"
            />

            <!-- Team Name & Type -->
            <div class="nxt1-team-inputs">
              <ion-input
                type="text"
                class="nxt1-input"
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
              <ion-select
                class="nxt1-select"
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
          </div>
        </nxt1-form-field>

        <!-- Team Colors -->
        <nxt1-color-picker
          label="Team Colors"
          [colors]="teamColors()"
          [maxColors]="maxTeamColors"
          [disabled]="disabled()"
          testId="onboarding-team-colors"
          (colorsChange)="onTeamColorsChange($event)"
        />
      </div>

      <!-- Secondary Team Section (Optional) -->
      <div class="nxt1-team-section nxt1-team-section--secondary">
        <nxt1-form-field
          label="Secondary Team"
          [optional]="true"
          testId="onboarding-team-secondary-field"
        >
          <div class="nxt1-team-row">
            <!-- Second Team Logo Picker -->
            <nxt1-team-logo-picker
              [logoUrl]="secondTeamLogo()"
              [disabled]="disabled()"
              testId="onboarding-second-team-logo"
              (logoChange)="onSecondTeamLogoChange($event)"
              (fileSelected)="onSecondTeamLogoFileSelected($event)"
              (pickerClick)="secondLogoPickerClick.emit()"
            />

            <!-- Second Team Name & Type -->
            <div class="nxt1-team-inputs">
              <ion-input
                type="text"
                class="nxt1-input"
                fill="outline"
                placeholder="Team name"
                [value]="secondTeamName()"
                (ionInput)="onSecondTeamNameInput($event)"
                [disabled]="disabled()"
                autocomplete="organization"
                autocapitalize="words"
                data-testid="onboarding-input-second-team-name"
              />
              <ion-select
                class="nxt1-select"
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
          </div>
        </nxt1-form-field>

        <!-- Second Team Colors (only show if second team has name) -->
        @if (hasSecondTeam()) {
          <nxt1-color-picker
            label="Secondary Team Colors"
            [colors]="secondTeamColors()"
            [maxColors]="maxTeamColors"
            [disabled]="disabled()"
            testId="onboarding-second-team-colors"
            (colorsChange)="onSecondTeamColorsChange($event)"
          />
        }
      </div>

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
        gap: var(--nxt1-spacing-8);
        width: 100%;
      }

      /* ============================================
       TEAM SECTION - Groups logo, name, type, colors
       ============================================ */
      .nxt1-team-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      .nxt1-team-section--secondary {
        padding-top: var(--nxt1-spacing-4);
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      /* ============================================
       TEAM ROW - Logo + Name/Type side by side
       ============================================ */
      .nxt1-team-row {
        display: flex;
        gap: var(--nxt1-spacing-4);
        width: 100%;
        align-items: flex-start;
      }

      /* ============================================
       TEAM INPUTS - Name and Type stacked vertically
       ============================================ */
      .nxt1-team-inputs {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        min-width: 0;
      }

      @media (min-width: 480px) {
        .nxt1-team-inputs {
          flex-direction: row;
        }

        .nxt1-team-inputs .nxt1-input {
          flex: 1;
        }

        .nxt1-team-inputs .nxt1-select {
          width: 130px;
          flex-shrink: 0;
        }
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
        min-height: 48px;
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
        min-height: 48px;
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

  /** Emits when a logo file is selected for primary team */
  readonly logoFileSelected = output<File>();

  /** Emits when a logo file is selected for secondary team */
  readonly secondLogoFileSelected = output<File>();

  /** Emits when logo picker is clicked (for native photo picker) */
  readonly logoPickerClick = output<void>();

  /** Emits when second logo picker is clicked (for native photo picker) */
  readonly secondLogoPickerClick = output<void>();

  // ============================================
  // CONFIGURATION (readonly for immutability)
  // ============================================

  /** Team type options */
  readonly teamTypeOptions = TEAM_TYPE_OPTIONS;

  /** Maximum team colors */
  readonly maxTeamColors = MAX_TEAM_COLORS;

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

  /** Team logo URL */
  readonly teamLogo = signal<string | null>(null);

  /** Team colors array */
  readonly teamColors = signal<string[]>([]);

  /** Second team name value */
  readonly secondTeamName = signal('');

  /** Selected second team type */
  readonly secondTeamType = signal<OnboardingTeamType | null>(null);

  /** Second team logo URL */
  readonly secondTeamLogo = signal<string | null>(null);

  /** Second team colors array */
  readonly secondTeamColors = signal<string[]>([]);

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
          this.teamLogo.set(data.teamLogo ?? null);
          this.teamColors.set(data.teamColors ?? []);
          this.secondTeamName.set(data.secondTeamName || '');
          this.secondTeamType.set(data.secondTeamType ?? null);
          this.secondTeamLogo.set(data.secondTeamLogo ?? null);
          this.secondTeamColors.set(data.secondTeamColors ?? []);
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
   * Handle team logo change
   */
  onTeamLogoChange(logoUrl: string | null): void {
    this.teamLogo.set(logoUrl);
    this.logger.debug('Team logo changed', { hasLogo: !!logoUrl });
    this.emitTeamChange();
  }

  /**
   * Handle team logo file selection
   */
  onTeamLogoFileSelected(file: File): void {
    this.logoFileSelected.emit(file);
    this.logger.debug('Team logo file selected', { fileName: file.name });
  }

  /**
   * Handle team colors change
   */
  onTeamColorsChange(colors: string[]): void {
    this.teamColors.set(colors);
    this.logger.debug('Team colors changed', { colors });
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

  /**
   * Handle second team logo change
   */
  onSecondTeamLogoChange(logoUrl: string | null): void {
    this.secondTeamLogo.set(logoUrl);
    this.logger.debug('Second team logo changed', { hasLogo: !!logoUrl });
    this.emitTeamChange();
  }

  /**
   * Handle second team logo file selection
   */
  onSecondTeamLogoFileSelected(file: File): void {
    this.secondLogoFileSelected.emit(file);
    this.logger.debug('Second team logo file selected', { fileName: file.name });
  }

  /**
   * Handle second team colors change
   */
  onSecondTeamColorsChange(colors: string[]): void {
    this.secondTeamColors.set(colors);
    this.logger.debug('Second team colors changed', { colors });
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
      teamLogo: this.teamLogo() ?? undefined,
      teamColors: this.teamColors().length > 0 ? this.teamColors() : undefined,
      secondTeamName: this.secondTeamName() || undefined,
      secondTeamType: this.secondTeamType() ?? undefined,
      secondTeamLogo: this.secondTeamLogo() ?? undefined,
      secondTeamColors: this.secondTeamColors().length > 0 ? this.secondTeamColors() : undefined,
    };
    this.teamChange.emit(data);
  }
}
