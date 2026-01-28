/**
 * @fileoverview OnboardingSportEntryComponent - Single Sport Entry Card
 * @module @nxt1/ui/onboarding
 * @version 1.0.0
 *
 * Expandable card component for a single sport entry in onboarding.
 * Handles sport selection, team info, and position selection as a unified unit.
 *
 * Features:
 * - Expandable/collapsible card design
 * - Sport icon with name header
 * - Team name and type inputs
 * - Team logo picker
 * - Team colors picker
 * - Position selection chips
 * - Delete button (for non-primary sports)
 * - Validation state indicators
 * - Platform-adaptive with Ionic components
 * - Haptic feedback
 * - ARIA accessibility
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-sport-entry
 *   [entry]="sportEntry"
 *   [expanded]="isExpanded"
 *   [disabled]="isLoading()"
 *   (entryChange)="onEntryChange($event)"
 *   (delete)="onDelete()"
 *   (expandedChange)="onExpandedChange($event)"
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
import { IonInput, IonSelect, IonSelectOption, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronDown,
  chevronUp,
  trashOutline,
  checkmarkCircle,
  alertCircle,
  add,
  close,
} from 'ionicons/icons';
import type { SportEntry, OnboardingTeamType } from '@nxt1/core/api';
import {
  type PositionGroup,
  getPositionGroupsForSport,
  formatPositionDisplay,
  formatSportDisplayName,
} from '@nxt1/core/constants';
import type { ILogger } from '@nxt1/core/logging';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';
import { NxtTeamLogoPickerComponent } from '../../components/team-logo-picker';
import { NxtColorPickerComponent } from '../../components/color-picker';
import { NxtPickerService } from '../../components/picker';

// ============================================
// CONSTANTS
// ============================================

/** Minimum team name length for validation */
// const MIN_TEAM_NAME_LENGTH = 2; // TODO: Use for validation

/** Maximum team colors allowed */
const MAX_TEAM_COLORS = 4;

/** Maximum positions allowed per sport */
const MAX_POSITIONS = 5;

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
  selector: 'nxt1-onboarding-sport-entry',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonIcon,
    HapticButtonDirective,
    NxtTeamLogoPickerComponent,
    NxtColorPickerComponent,
  ],
  template: `
    <div
      class="nxt1-sport-entry"
      [class.expanded]="expanded()"
      [class.collapsed]="!expanded()"
      [attr.data-testid]="'sport-entry-' + sanitizeTestId(entry()?.sport || '')"
    >
      <!-- Compact Header (Collapsed State) -->
      @if (!expanded()) {
        <button
          type="button"
          class="nxt1-collapsed-header"
          (click)="toggleExpanded()"
          [attr.aria-expanded]="false"
          nxtHaptic="light"
        >
          <div class="nxt1-collapsed-left">
            <span class="nxt1-sport-emoji" aria-hidden="true">{{ getSportIcon() }}</span>
            <span class="nxt1-sport-label">{{ formatSportName(entry()?.sport) }}</span>
            @if (entry()?.isPrimary) {
              <span class="nxt1-badge-primary">Primary</span>
            }
          </div>
          <div class="nxt1-collapsed-right">
            @if (isValid()) {
              <ion-icon name="checkmark-circle" class="nxt1-icon-valid" aria-label="Complete" />
            } @else if (hasAnyData()) {
              <ion-icon name="alert-circle" class="nxt1-icon-warning" aria-label="Incomplete" />
            }
            <ion-icon name="chevron-down" class="nxt1-icon-chevron" aria-hidden="true" />
          </div>
        </button>
      }

      <!-- Expanded Form Content -->
      @if (expanded()) {
        <div class="nxt1-expanded-content">
          <!-- Sport Title Bar -->
          <div class="nxt1-title-bar">
            <div class="nxt1-title-left">
              <span class="nxt1-sport-emoji-lg" aria-hidden="true">{{ getSportIcon() }}</span>
              <div class="nxt1-title-info">
                <span class="nxt1-title-name">{{ formatSportName(entry()?.sport) }}</span>
                @if (entry()?.isPrimary) {
                  <span class="nxt1-badge-primary">Primary Sport</span>
                }
              </div>
            </div>
            <button
              type="button"
              class="nxt1-collapse-btn"
              (click)="toggleExpanded()"
              aria-label="Collapse"
              nxtHaptic="light"
            >
              <ion-icon name="chevron-up" aria-hidden="true" />
            </button>
          </div>

          <!-- Team Row: Logo + Name + Type -->
          <div class="nxt1-team-row">
            <!-- Team Logo -->
            <div class="nxt1-team-logo-col">
              <nxt1-team-logo-picker
                [logoUrl]="entry()?.team?.logo ?? null"
                [disabled]="disabled()"
                size="md"
                (logoChange)="onLogoChange($event)"
                (fileSelected)="onLogoFileSelected($event)"
                [testId]="'sport-entry-logo-' + sanitizeTestId(entry()?.sport || '')"
              />
            </div>

            <!-- Team Name -->
            <div class="nxt1-team-name-col">
              <ion-input
                type="text"
                class="nxt1-input"
                fill="outline"
                placeholder="Team name"
                [value]="entry()?.team?.name || ''"
                (ionInput)="onTeamNameChange($event)"
                (ionBlur)="onTeamNameBlur()"
                [disabled]="disabled()"
                autocomplete="organization"
                autocapitalize="words"
                enterkeyhint="next"
                [attr.data-testid]="'sport-entry-team-name-' + sanitizeTestId(entry()?.sport || '')"
              />
            </div>

            <!-- Team Type -->
            <div class="nxt1-team-type-col">
              <ion-select
                class="nxt1-select"
                interface="popover"
                [interfaceOptions]="selectPopoverOptions"
                placeholder="Type"
                [value]="entry()?.team?.type || null"
                (ionChange)="onTeamTypeChange($event)"
                [disabled]="disabled()"
                [attr.data-testid]="'sport-entry-team-type-' + sanitizeTestId(entry()?.sport || '')"
              >
                @for (option of teamTypeOptions; track option.value) {
                  <ion-select-option [value]="option.value">
                    {{ option.label }}
                  </ion-select-option>
                }
              </ion-select>
            </div>
          </div>

          <!-- Team Colors -->
          <div class="nxt1-colors-section">
            <label class="nxt1-label"
              >Team Colors <span class="nxt1-label-hint">(optional)</span></label
            >
            <nxt1-color-picker
              [colors]="entry()?.team?.colors || []"
              [disabled]="disabled()"
              [maxColors]="maxTeamColors"
              (colorsChange)="onColorsChange($event)"
              [testId]="'sport-entry-colors-' + sanitizeTestId(entry()?.sport || '')"
            />
          </div>

          <!-- Positions -->
          <div class="nxt1-positions-section">
            <label class="nxt1-label">
              Positions
              <span class="nxt1-label-hint">(Select at least 1)</span>
            </label>

            @if (allPositions().length > 0) {
              <!-- Selected Positions Pills -->
              @if (selectedPositions().length > 0) {
                <div class="nxt1-selected-pills">
                  @for (position of selectedPositions(); track position) {
                    <button
                      type="button"
                      class="nxt1-position-pill"
                      (click)="removePosition(position)"
                      [disabled]="disabled()"
                      [attr.aria-label]="'Remove ' + formatPosition(position)"
                      nxtHaptic="selection"
                    >
                      {{ formatPosition(position) }}
                      <ion-icon name="close" aria-hidden="true" />
                    </button>
                  }
                </div>
              }

              <!-- Add Position Trigger (opens shared modal via service) -->
              <button
                type="button"
                class="nxt1-add-position-btn"
                (click)="openPositionsPicker()"
                [disabled]="disabled()"
                nxtHaptic="selection"
                [attr.data-testid]="
                  'sport-entry-positions-trigger-' + sanitizeTestId(entry()?.sport || '')
                "
              >
                <ion-icon name="add" aria-hidden="true" />
                {{ selectedPositions().length === 0 ? 'Add positions' : 'Add more' }}
              </button>
            } @else {
              <p class="nxt1-no-positions">No positions available for this sport.</p>
            }
          </div>

          <!-- Remove Sport Button -->
          <button
            type="button"
            class="nxt1-remove-btn"
            (click)="onDeleteClick()"
            [disabled]="disabled()"
            nxtHaptic="warning"
            [attr.data-testid]="'sport-entry-delete-' + sanitizeTestId(entry()?.sport || '')"
          >
            <ion-icon name="trash-outline" aria-hidden="true" />
            Remove {{ formatSportName(entry()?.sport) }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         SPORT ENTRY - Container
         ============================================ */
      :host {
        display: block;
        width: 100%;
      }

      .nxt1-sport-entry {
        width: 100%;
      }

      /* ============================================
         COLLAPSED STATE - Compact Header
         ============================================ */
      .nxt1-collapsed-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--nxt1-spacing-4, 16px);
        background: var(--nxt1-color-surface-elevated, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-xl, 16px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-collapsed-header:hover {
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
        transform: translateY(-1px);
      }

      .nxt1-collapsed-header:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .nxt1-collapsed-left {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .nxt1-sport-emoji {
        font-size: var(--nxt1-fontSize-xl);
        line-height: 1;
      }

      .nxt1-sport-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .nxt1-collapsed-right {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .nxt1-icon-valid {
        font-size: var(--nxt1-fontSize-xl);
        color: var(--nxt1-color-success);
      }

      .nxt1-icon-warning {
        font-size: var(--nxt1-fontSize-xl);
        color: var(--nxt1-color-warning);
      }

      .nxt1-icon-chevron {
        font-size: var(--nxt1-fontSize-xl);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         PRIMARY BADGE
         ============================================ */
      .nxt1-badge-primary {
        display: inline-flex;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
        color: var(--nxt1-color-text-onPrimary);
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-borderRadius-full);
      }

      /* ============================================
         EXPANDED STATE - Full Form
         ============================================ */
      .nxt1-expanded-content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        width: 100%;
      }

      /* ============================================
         TITLE BAR (Expanded)
         ============================================ */
      .nxt1-title-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: var(--nxt1-spacing-4);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .nxt1-title-left {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .nxt1-sport-emoji-lg {
        font-size: var(--nxt1-fontSize-2xl);
        line-height: 1;
      }

      .nxt1-title-info {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .nxt1-title-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .nxt1-collapse-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-collapse-btn:hover {
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .nxt1-collapse-btn ion-icon {
        font-size: var(--nxt1-fontSize-lg);
      }

      /* ============================================
         TEAM ROW (Logo + Name + Type)
         ============================================ */
      .nxt1-team-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
      }

      .nxt1-team-logo-col {
        flex-shrink: 0;
      }

      .nxt1-team-name-col {
        flex: 1;
        min-width: 0;
      }

      .nxt1-team-type-col {
        flex-shrink: 0;
        width: 130px;
      }

      @media (max-width: 480px) {
        .nxt1-team-row {
          flex-wrap: wrap;
        }

        .nxt1-team-name-col {
          flex: 1 1 calc(100% - 64px);
        }

        .nxt1-team-type-col {
          width: 100%;
          margin-top: var(--nxt1-spacing-2);
        }
      }

      /* ============================================
         FORM INPUTS
         ============================================ */
      .nxt1-input {
        --background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
        --border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        --border-radius: var(--nxt1-borderRadius-lg, 12px);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --placeholder-opacity: 1;
        --padding-start: var(--nxt1-spacing-4, 16px);
        --padding-end: var(--nxt1-spacing-4, 16px);
        --padding-top: 14px;
        --padding-bottom: 14px;
        --highlight-color-focused: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        min-height: 48px;
      }

      .nxt1-input:hover:not(.has-focus) {
        --border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
      }

      /* ============================================
         SELECT STYLING - Matches contact step popover
         ============================================ */
      .nxt1-select {
        --background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
        --border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        --border-radius: var(--nxt1-borderRadius-lg, 12px);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --placeholder-opacity: 1;
        --padding-start: 12px;
        --padding-end: 12px;
        --highlight-color-focused: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        min-height: 48px;
        width: 100%;
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
      }

      .nxt1-select:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
      }

      .nxt1-select::part(icon) {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .nxt1-select:disabled {
        opacity: 0.4;
      }

      /* ============================================
         COLORS SECTION
         ============================================ */
      .nxt1-colors-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .nxt1-label-hint {
        font-weight: 400;
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         POSITIONS SECTION
         ============================================ */
      .nxt1-positions-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .nxt1-selected-pills {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
      }

      .nxt1-position-pill {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #ffffff);
        background: var(--nxt1-color-primary, #ccff00);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-primary, #ccff00) 0%,
          var(--nxt1-color-primary-dark, #b8e600) 100%
        );
        color: var(--nxt1-color-text-onPrimary, #1a1a2e);
        border: none;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-position-pill:hover:not(:disabled) {
        opacity: 0.9;
        transform: scale(0.98);
      }

      .nxt1-position-pill:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .nxt1-position-pill ion-icon {
        font-size: var(--nxt1-fontSize-sm);
      }

      .nxt1-add-position-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-4, 16px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-primary, #ccff00);
        background: transparent;
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        -webkit-tap-highlight-color: transparent;
        align-self: flex-start;
      }

      .nxt1-add-position-btn:hover:not(:disabled) {
        border-color: var(--nxt1-color-primary, #ccff00);
        background: var(--nxt1-color-alpha-primary5, rgba(204, 255, 0, 0.05));
      }

      .nxt1-add-position-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .nxt1-add-position-btn ion-icon {
        font-size: var(--nxt1-fontSize-base);
      }

      .nxt1-no-positions {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        font-style: italic;
        margin: 0;
      }

      /* ============================================
         REMOVE BUTTON
         ============================================ */
      .nxt1-remove-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        width: 100%;
        padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-4, 16px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-danger, #ef4444);
        background: transparent;
        border: 1px solid var(--nxt1-color-danger, #ef4444);
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        -webkit-tap-highlight-color: transparent;
        margin-top: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-remove-btn:hover:not(:disabled) {
        background: var(--nxt1-color-alpha-danger10, rgba(239, 68, 68, 0.1));
      }

      .nxt1-remove-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .nxt1-remove-btn ion-icon {
        font-size: var(--nxt1-fontSize-base);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingSportEntryComponent {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly loggingService = inject(NxtLoggingService);
  private readonly picker = inject(NxtPickerService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('OnboardingSportEntry');

  // ============================================
  // CONSTANTS
  // ============================================

  /** Team type options exposed for template */
  readonly teamTypeOptions = TEAM_TYPE_OPTIONS;

  /** Maximum team colors */
  readonly maxTeamColors = MAX_TEAM_COLORS;

  /** Popover options for ion-select - matches contact step styling */
  readonly selectPopoverOptions = {
    cssClass: 'nxt1-select-popover',
    showBackdrop: true,
  };

  /** Popover options for positions multi-select */
  readonly positionsPopoverOptions = {
    cssClass: 'nxt1-select-popover',
    showBackdrop: true,
  };

  // ============================================
  // SIGNAL INPUTS
  // ============================================

  /** The sport entry data */
  readonly entry = input<SportEntry | null>(null);

  /** Whether the card is expanded */
  readonly expanded = input<boolean>(false);

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  // ============================================
  // SIGNAL OUTPUTS
  // ============================================

  /** Emits when entry data changes */
  readonly entryChange = output<SportEntry>();

  /** Emits when user wants to delete this entry */
  readonly delete = output<void>();

  /** Emits when expanded state changes */
  readonly expandedChange = output<boolean>();

  /** Emits when a logo file is selected (needs upload) */
  readonly logoFileSelected = output<File>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Track if team name has been touched (for validation) */
  readonly teamNameTouched = signal(false);

  /** Currently selected positions (local state synced from entry) */
  readonly selectedPositions = signal<string[]>([]);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Position groups for the current sport */
  readonly positionGroups = computed((): PositionGroup[] => {
    const sport = this.entry()?.sport;
    if (!sport) return [];
    return getPositionGroupsForSport(sport);
  });

  /** Flat list of all positions for dropdown */
  readonly allPositions = computed((): string[] => {
    const groups = this.positionGroups();
    return groups.flatMap((g) => g.positions);
  });

  /** Check if entry is valid (has team name and at least one position) */
  readonly isValid = computed((): boolean => {
    const e = this.entry();
    if (!e) return false;
    return !!(e.team?.name?.trim() && e.positions?.length > 0);
  });

  /** Check if entry has any data filled in */
  readonly hasAnyData = computed((): boolean => {
    const e = this.entry();
    if (!e) return false;
    return !!(
      e.team?.name?.trim() ||
      e.team?.type ||
      e.team?.logo ||
      (e.team?.colors && e.team.colors.length > 0) ||
      (e.positions && e.positions.length > 0)
    );
  });

  /** Check if at max positions */
  readonly isMaxPositions = computed((): boolean => {
    return this.selectedPositions().length >= MAX_POSITIONS;
  });

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Register Ionicons
    addIcons({ chevronDown, chevronUp, trashOutline, checkmarkCircle, alertCircle, add, close });

    // Sync positions from entry input
    effect(() => {
      const e = this.entry();
      if (e?.positions) {
        this.selectedPositions.set([...e.positions]);
      } else {
        this.selectedPositions.set([]);
      }
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Toggle expanded state */
  toggleExpanded(): void {
    this.expandedChange.emit(!this.expanded());
  }

  /** Handle team name input */
  onTeamNameChange(event: CustomEvent): void {
    const input = event.target as HTMLInputElement;
    const name = input.value || '';
    this.emitUpdate({ team: { ...this.getTeam(), name } });
  }

  /** Mark team name as touched on blur */
  onTeamNameBlur(): void {
    this.teamNameTouched.set(true);
  }

  /** Handle team type change */
  onTeamTypeChange(event: CustomEvent): void {
    const type = event.detail.value as OnboardingTeamType;
    this.emitUpdate({ team: { ...this.getTeam(), type } });
  }

  /** Handle logo change (URL or null) */
  onLogoChange(logoUrl: string | null): void {
    this.emitUpdate({ team: { ...this.getTeam(), logo: logoUrl } });
  }

  /** Handle logo file selection (file needs upload) */
  onLogoFileSelected(file: File): void {
    this.logoFileSelected.emit(file);
  }

  /** Handle colors change */
  onColorsChange(colors: string[]): void {
    this.emitUpdate({ team: { ...this.getTeam(), colors } });
  }

  /** Open positions picker modal via unified picker service */
  async openPositionsPicker(): Promise<void> {
    const sport = this.entry()?.sport || '';
    const result = await this.picker.openPositionPicker({
      sport,
      selectedPositions: this.selectedPositions(),
      positionGroups: this.positionGroups(),
      maxPositions: MAX_POSITIONS,
      title: `Select Positions`,
    });

    if (result.confirmed && result.positions) {
      this.selectedPositions.set(result.positions);
      this.emitUpdate({ positions: result.positions });
      this.logger.debug('Positions updated via picker', { sport, total: result.positions.length });
    }
  }

  /** Remove a position from selected list */
  removePosition(position: string): void {
    const newPositions = this.selectedPositions().filter((p) => p !== position);
    this.selectedPositions.set(newPositions);
    this.emitUpdate({ positions: newPositions });
    this.logger.debug('Position removed', { position, remaining: newPositions.length });
  }

  /** Handle positions change from multi-select dropdown (kept for backward compatibility) */
  onPositionsChange(event: CustomEvent): void {
    const newPositions = event.detail.value as string[];
    this.selectedPositions.set(newPositions);
    this.emitUpdate({ positions: newPositions });
    this.logger.debug('Positions changed', { total: newPositions.length });
  }

  /** Toggle position selection (kept for backward compatibility) */
  togglePosition(position: string): void {
    const current = this.selectedPositions();
    let newPositions: string[];

    if (current.includes(position)) {
      // Remove position
      newPositions = current.filter((p) => p !== position);
    } else if (current.length < MAX_POSITIONS) {
      // Add position
      newPositions = [...current, position];
    } else {
      return; // Max reached
    }

    this.selectedPositions.set(newPositions);
    this.emitUpdate({ positions: newPositions });
    this.logger.debug('Position toggled', { position, total: newPositions.length });
  }

  /** Handle delete click */
  onDeleteClick(): void {
    this.delete.emit();
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /** Check if position is selected */
  isPositionSelected(position: string): boolean {
    return this.selectedPositions().includes(position);
  }

  /** Format position for display */
  formatPosition(position: string): string {
    return formatPositionDisplay(position);
  }

  /** Format sport name for display */
  formatSportName(sport: string | undefined): string {
    return sport ? formatSportDisplayName(sport) : '';
  }

  /** Get sport icon/emoji */
  getSportIcon(): string {
    // TODO: Get icon from DEFAULT_SPORTS constant
    const sport = this.entry()?.sport?.toLowerCase() || '';
    const iconMap: Record<string, string> = {
      football: '🏈',
      basketball: '🏀',
      soccer: '⚽',
      baseball: '⚾',
      softball: '🥎',
      volleyball: '🏐',
      tennis: '🎾',
      golf: '⛳',
      swimming: '🏊',
      track: '🏃',
      wrestling: '🤼',
      lacrosse: '🥍',
      hockey: '🏒',
      gymnastics: '🤸',
      cheerleading: '📣',
    };
    return iconMap[sport] || '🏆';
  }

  /** Sanitize string for test ID */
  sanitizeTestId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /** Get current team data or empty object */
  private getTeam() {
    return this.entry()?.team || { name: '', type: undefined, logo: null, colors: [] };
  }

  /** Emit entry update with partial data */
  private emitUpdate(partial: Partial<SportEntry>): void {
    const current = this.entry();
    if (!current) return;

    const updated: SportEntry = {
      ...current,
      ...partial,
      team: partial.team ? { ...current.team, ...partial.team } : current.team,
    };

    this.entryChange.emit(updated);
  }
}
