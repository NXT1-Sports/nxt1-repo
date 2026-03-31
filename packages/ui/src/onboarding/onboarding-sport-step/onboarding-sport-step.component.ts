/**
 * @fileoverview OnboardingSportStepComponent - Sport Selection (v4.0 Simplified)
 * @module @nxt1/ui/onboarding
 * @version 4.0.0
 *
 * Role-aware sport selection step for onboarding.
 * Collects the primary sport plus role-specific details:
 * - Athletes/Parents: sport + position
 * - Coaches: sport + title
 *
 * Team info and positions are collected LATER based on role:
 * - Athletes: Asked for team/positions in athlete-specific flow
 * - Coaches: Asked for team they coach
 * - Fans: No team/positions needed
 *
 * ⭐ 2026 UX BEST PRACTICES:
 * - Progressive disclosure: Only ask what's needed NOW
 * - Single-select chips for quick sport selection
 * - Clean, minimal UI
 *
 * Features:
 * - Single-sport onboarding focus
 * - Visual chips with sport icons/emojis
 * - Stored in the shared array-based data model for future expansion
 * - Platform-adaptive with Ionic components
 * - Haptic feedback
 * - ARIA accessibility
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-sport-step
 *   [sportData]="sportFormData()"
 *   [disabled]="isLoading()"
 *   [maxSports]="1"
 *   (sportChange)="onSportChange($event)"
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
import type { OnboardingUserType, SportFormData, SportEntry } from '@nxt1/core/api';
import { createEmptySportEntry } from '@nxt1/core/api';
import {
  DEFAULT_SPORTS,
  formatSportDisplayName,
  getSportEmoji,
  getPositionGroupsForSport,
  getPositionsForSport,
  formatPositionDisplay,
  type PositionGroup,
  type SportCell,
} from '@nxt1/core/constants';
import { USER_ROLES } from '@nxt1/core';
import type { ILogger } from '@nxt1/core/logging';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';
import { NxtToastService } from '../../services/toast';
import { NxtValidationSummaryComponent } from '../../components/validation-summary';
import { NxtChipComponent } from '../../components/chip';
import { NxtListRowComponent } from '../../components/list-row';
import { NxtListSectionComponent } from '../../components/list-section';
import { NxtModalService } from '../../services/modal';
import { AlertController } from '@ionic/angular/standalone';

// ============================================
// CONSTANTS
// ============================================

/** Default maximum sports allowed during onboarding */
const DEFAULT_MAX_SPORTS = 1;

const COACH_TITLE_OPTIONS = [
  { value: 'head-coach' as const, label: 'Head Coach' },
  { value: 'assistant-coach' as const, label: 'Assistant Coach' },
] as const;

type CoachTitleOption = (typeof COACH_TITLE_OPTIONS)[number]['value'];

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-sport-step',
  standalone: true,
  imports: [
    CommonModule,
    HapticButtonDirective,
    NxtValidationSummaryComponent,
    NxtChipComponent,
    NxtListRowComponent,
    NxtListSectionComponent,
  ],
  template: `
    @if (variant() === 'list-row') {
      <div class="nxt1-sport-step" data-testid="onboarding-sport-step">
        <nxt1-list-section>
          <nxt1-list-row label="Sport" (tap)="openSportPicker()">
            <span
              class="nxt1-list-value"
              [class.nxt1-list-placeholder]="selectedSports().length === 0"
            >
              {{ sportDisplayValue() || 'Select sport' }}
            </span>
          </nxt1-list-row>
          @if (showPositionSelection() && selectedSport()) {
            <nxt1-list-row label="Position" (tap)="openPositionPicker()">
              <span
                class="nxt1-list-value"
                [class.nxt1-list-placeholder]="selectedPositions().length === 0"
              >
                {{ positionDisplayValue() || 'Select position' }}
              </span>
            </nxt1-list-row>
          }
          @if (showCoachTitleSelection() && selectedSport()) {
            <nxt1-list-row label="Title" (tap)="openCoachTitlePicker()">
              <span class="nxt1-list-value" [class.nxt1-list-placeholder]="!coachTitle()">
                {{ coachTitleDisplayValue() || 'Select title' }}
              </span>
            </nxt1-list-row>
          }
        </nxt1-list-section>
      </div>
    } @else {
      <div class="nxt1-sport-step" data-testid="onboarding-sport-step">
        <!-- Description -->
        <p class="nxt1-step-description">
          {{ promptOverride() ?? stepPrompt() }}
          @if (showMaxHint()) {
            <span class="nxt1-max-hint">Choose up to {{ maxSports() }}.</span>
          }
        </p>

        <!-- Sport Chips Grid -->
        <div class="nxt1-sport-grid" role="group" aria-label="Select sport">
          @for (sport of availableSports(); track sport.name) {
            <button
              type="button"
              class="nxt1-sport-chip"
              [class.nxt1-sport-chip--selected]="isSelected(sport.name)"
              [disabled]="
                disabled() || (!isSelected(sport.name) && isMaxReached() && maxSports() > 1)
              "
              (click)="toggleSport(sport.name)"
              nxtHaptic="selection"
              [attr.aria-pressed]="isSelected(sport.name)"
              [attr.data-testid]="'sport-chip-' + sanitizeTestId(sport.name)"
            >
              <span class="nxt1-sport-emoji" aria-hidden="true">{{ getEmoji(sport.name) }}</span>
              <span class="nxt1-sport-name">{{ formatDisplayName(sport.name) }}</span>
            </button>
          }
        </div>

        @if (showPositionSelection() && selectedSport()) {
          @if (positionGroups().length > 0 && totalPositionCount() > 0) {
            <div class="nxt1-detail-section" data-testid="onboarding-sport-positions">
              <p class="nxt1-detail-heading">Position</p>
              @for (group of positionGroups(); track group.category) {
                <div class="nxt1-position-group">
                  @if (positionGroups().length > 1) {
                    <label class="nxt1-position-label">{{ group.category }}</label>
                  }
                  <div class="nxt1-position-chips" role="group">
                    @for (position of group.positions; track position) {
                      <nxt1-chip
                        [selected]="isPositionSelected(position)"
                        [disabled]="disabled()"
                        [showCheck]="true"
                        [testId]="'onboarding-sport-position-' + sanitizeTestId(position)"
                        ariaRole="toggle"
                        (chipClick)="togglePosition(position)"
                      >
                        {{ formatPosition(position) }}
                      </nxt1-chip>
                    }
                  </div>
                </div>
              }
            </div>
          } @else {
            <nxt1-validation-summary testId="onboarding-sport-position-none" variant="info">
              No position selection is needed for this sport
            </nxt1-validation-summary>
          }
        }

        @if (showCoachTitleSelection() && selectedSport()) {
          <div class="nxt1-detail-section" data-testid="onboarding-sport-coach-title">
            <p class="nxt1-detail-heading">Title</p>
            <div class="nxt1-position-chips" role="radiogroup" aria-label="Select coach title">
              @for (option of coachTitleOptions; track option.value) {
                <nxt1-chip
                  [selected]="coachTitle() === option.value"
                  [disabled]="disabled()"
                  [testId]="'onboarding-sport-title-' + option.value"
                  ariaRole="radio"
                  (chipClick)="selectCoachTitle(option.value)"
                >
                  {{ option.label }}
                </nxt1-chip>
              }
            </div>
          </div>
        }

        <!-- Selection Summary -->
        @if (selectedSports().length > 0 && hasCompletedRoleDetail()) {
          <nxt1-validation-summary testId="onboarding-sport-validation" variant="success">
            {{ detailSummary() }}
          </nxt1-validation-summary>
        } @else {
          <nxt1-validation-summary testId="onboarding-sport-hint" variant="info">
            {{ selectionHint() }}
          </nxt1-validation-summary>
        }
      </div>
    }
  `,
  styles: [
    `
      /* ============================================
         STEP CONTAINER
         ============================================ */
      .nxt1-sport-step {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
        width: 100%;
      }

      /* ============================================
         DESCRIPTION
         ============================================ */
      .nxt1-step-description {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0;
        line-height: 1.5;
        text-align: center;
      }

      .nxt1-max-hint {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
         SPORT CHIPS GRID
         ============================================ */
      .nxt1-sport-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: var(--nxt1-spacing-3, 12px);
        width: 100%;
      }

      /* ============================================
         SPORT CHIP - Base State (White with gray hover)
         Matches footer/input pattern
         ============================================ */
      .nxt1-sport-chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-3, 12px);
        min-height: 90px;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        position: relative;
        -webkit-tap-highlight-color: transparent;
      }

      /* Hover State - Lighter surface background */
      .nxt1-sport-chip:hover:not(:disabled) {
        background: var(--nxt1-color-surface-200);
        border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        transform: translateY(-2px);
      }

      /* Focus State */
      .nxt1-sport-chip:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      /* Disabled State */
      .nxt1-sport-chip:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }

      /* Selected State - Fill with primary for clear selection */
      .nxt1-sport-chip--selected {
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        background: var(--nxt1-color-primary, #ccff00);
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      /* Selected + Hover State - No transform, subtle darkening only */
      .nxt1-sport-chip--selected:hover:not(:disabled) {
        background: var(--nxt1-color-primary, #ccff00);
        border-color: var(--nxt1-color-primary, #ccff00);
        transform: none;
      }

      /* ============================================
         CHIP CONTENT
         ============================================ */
      .nxt1-sport-emoji {
        font-size: var(--nxt1-fontSize-2xl, 1.5rem);
        line-height: 1;
      }

      .nxt1-sport-name {
        text-align: center;
        line-height: 1.2;
      }

      .nxt1-detail-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .nxt1-detail-heading {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide, 0.05em);
      }

      .nxt1-position-group {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-position-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-transform: uppercase;
      }

      .nxt1-position-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2, 8px);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */
      @media (max-width: 400px) {
        .nxt1-sport-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* List-row variant styles */
      .nxt1-list-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
      }

      .nxt1-list-placeholder {
        color: var(--nxt1-color-text-tertiary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingSportStepComponent {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly loggingService = inject(NxtLoggingService);
  private readonly toast = inject(NxtToastService);
  private readonly alertCtrl = inject(AlertController);
  private readonly nxtModal = inject(NxtModalService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('OnboardingSportStep');

  // ============================================
  // SIGNAL INPUTS
  // ============================================

  /** Current sport data from parent */
  readonly sportData = input<SportFormData | null>(null);

  /** Display variant: 'chips' for desktop grid, 'list-row' for mobile */
  readonly variant = input<'chips' | 'list-row'>('chips');

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  /** Available sports list (optional - defaults to DEFAULT_SPORTS) */
  readonly sports = input<SportCell[]>(DEFAULT_SPORTS as SportCell[]);

  /** Current selected onboarding role (used for role-specific prompt/copy) */
  readonly role = input<OnboardingUserType | null>(null);

  /** Override the auto-generated step prompt text (e.g. for post-onboarding add-sport context) */
  readonly promptOverride = input<string | null>(null);

  /** Maximum number of sports allowed */
  readonly maxSports = input<number>(DEFAULT_MAX_SPORTS);

  // ============================================
  // SIGNAL OUTPUTS
  // ============================================

  /** Emits when sport selection changes */
  readonly sportChange = output<SportFormData>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Array of selected sport names */
  readonly selectedSports = signal<string[]>([]);

  /** Athlete/parent position selections for the primary sport */
  readonly selectedPositions = signal<string[]>([]);

  /** Coach title selection for the sport step */
  readonly coachTitle = signal<CoachTitleOption | null>(null);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Available sports filtered/sorted for display */
  readonly availableSports = computed((): SportCell[] => {
    return this.sports();
  });

  readonly coachTitleOptions = COACH_TITLE_OPTIONS;

  readonly selectedSport = computed(() => this.selectedSports()[0] ?? '');

  readonly showPositionSelection = computed(() => {
    const currentRole = this.role();
    return currentRole === USER_ROLES.ATHLETE || currentRole === USER_ROLES.PARENT;
  });

  readonly showCoachTitleSelection = computed(() => this.role() === USER_ROLES.COACH);

  readonly positionGroups = computed((): readonly PositionGroup[] => {
    if (!this.showPositionSelection() || !this.selectedSport()) return [];
    // Only show positions for sports with defined position data (matches validator)
    if (getPositionsForSport(this.selectedSport()).length === 0) return [];
    return getPositionGroupsForSport(this.selectedSport());
  });

  readonly totalPositionCount = computed(() =>
    this.positionGroups().reduce((sum, group) => sum + group.positions.length, 0)
  );

  readonly positionDisplayValue = computed(() => {
    if (this.selectedPositions().length === 0) return '';
    return this.selectedPositions()
      .map((position) =>
        formatPositionDisplay(position, this.selectedSport(), { showAbbreviation: true })
      )
      .join(', ');
  });

  readonly coachTitleDisplayValue = computed(() => {
    const currentTitle = this.coachTitle();
    if (!currentTitle) return '';
    return COACH_TITLE_OPTIONS.find((option) => option.value === currentTitle)?.label ?? '';
  });

  readonly hasCompletedRoleDetail = computed(() => {
    if (this.selectedSports().length === 0) return false;
    if (this.showCoachTitleSelection()) return !!this.coachTitle();
    if (this.showPositionSelection()) {
      return this.totalPositionCount() === 0 || this.selectedPositions().length > 0;
    }
    return true;
  });

  readonly detailSummary = computed(() => {
    const sport = this.selectedSport();
    if (!sport) return '';
    if (this.showCoachTitleSelection() && this.coachTitleDisplayValue()) {
      return `${this.formatDisplayName(sport)} · ${this.coachTitleDisplayValue()}`;
    }
    if (this.showPositionSelection() && this.positionDisplayValue()) {
      return `${this.formatDisplayName(sport)} · ${this.positionDisplayValue()}`;
    }
    return `${this.formatDisplayName(sport)} selected`;
  });

  readonly selectionHint = computed(() => {
    if (this.showCoachTitleSelection()) {
      return this.selectedSport()
        ? 'Select your coaching title to continue'
        : 'Select your sport to continue';
    }
    if (this.showPositionSelection()) {
      if (!this.selectedSport()) return 'Select your sport to continue';
      return this.totalPositionCount() > 0
        ? 'Select at least one position to continue'
        : 'No position selection is needed for this sport';
    }
    return 'Select at least one sport to continue';
  });

  /** Role-aware prompt text */
  readonly stepPrompt = computed((): string => {
    const currentRole = this.role();
    if (currentRole === USER_ROLES.COACH) {
      return 'Choose the sport you coach and your title.';
    }
    if (currentRole === USER_ROLES.DIRECTOR) {
      return 'Choose one sport for now. You can add more later.';
    }
    if (currentRole === USER_ROLES.RECRUITER) {
      return 'Choose one sport for now. You can add more later.';
    }
    if (currentRole === USER_ROLES.PARENT) {
      return "Choose your athlete's sport and position.";
    }
    if (currentRole === USER_ROLES.ATHLETE) {
      return 'Choose your sport and position.';
    }
    return 'Choose one sport for now. You can add more later.';
  });

  /** Whether to show the "Choose up to X" hint (athletes only) */
  readonly showMaxHint = computed((): boolean => {
    const currentRole = this.role();
    const isAthlete =
      !currentRole || currentRole === USER_ROLES.ATHLETE || currentRole === USER_ROLES.PARENT;
    return isAthlete && this.maxSports() > 1;
  });

  /** Check if max sports reached */
  readonly isMaxReached = computed((): boolean => {
    return this.selectedSports().length >= this.maxSports();
  });

  /** Display value for list-row variant */
  readonly sportDisplayValue = computed((): string => {
    const selected = this.selectedSports();
    if (selected.length === 0) return '';
    return selected.map((s) => formatSportDisplayName(s)).join(', ');
  });

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Sync internal state when sportData input changes
    effect(() => {
      const data = this.sportData();
      if (!data?.sports?.length) {
        this.selectedSports.set([]);
        return;
      }
      // Extract sport names, preserving order (first = primary)
      const names = data.sports.map((e) => e.sport);
      this.selectedSports.set(names);
      this.selectedPositions.set([...(data.sports[0]?.positions ?? [])]);
      this.coachTitle.set((data.coachTitle as CoachTitleOption) ?? null);
    });
  }

  // ============================================
  // SPORT SELECTION
  // ============================================

  /** Toggle sport selection */
  toggleSport(sportName: string): void {
    const current = this.selectedSports();
    const isCurrentlySelected = current.includes(sportName);
    const previousPrimary = current[0] ?? null;

    let updated: string[];
    if (isCurrentlySelected) {
      // Deselect
      updated = current.filter((s) => s !== sportName);
      this.logger.debug('Sport deselected', { sport: sportName, remaining: updated.length });
    } else {
      if (this.maxSports() === 1) {
        updated = [sportName];
        this.logger.debug('Sport replaced', {
          sport: sportName,
          previous: previousPrimary,
        });
      } else {
        // Select (if not at max)
        if (current.length >= this.maxSports()) {
          return;
        }
        updated = [...current, sportName];
        this.logger.debug('Sport selected', {
          sport: sportName,
          total: updated.length,
          isPrimary: updated.length === 1,
        });
      }
    }

    this.selectedSports.set(updated);
    if (!updated[0]) {
      this.selectedPositions.set([]);
      this.coachTitle.set(null);
    } else if (updated[0] !== previousPrimary) {
      this.selectedPositions.set([]);
      if (!this.showCoachTitleSelection()) {
        this.coachTitle.set(null);
      }
    }
    this.emitChange(updated);
  }

  togglePosition(position: string): void {
    const current = this.selectedPositions();
    const index = current.indexOf(position);

    if (index >= 0) {
      this.selectedPositions.set(current.filter((_, idx) => idx !== index));
    } else {
      this.selectedPositions.set([...current, position]);
    }

    this.emitChange(this.selectedSports());
  }

  isPositionSelected(position: string): boolean {
    return this.selectedPositions().includes(position);
  }

  formatPosition(position: string): string {
    return formatPositionDisplay(position, this.selectedSport(), {
      showAbbreviation: false,
      titleCase: true,
    });
  }

  selectCoachTitle(title: CoachTitleOption): void {
    this.coachTitle.set(title);
    this.logger.debug('Coach title selected in sport step', { coachTitle: title });
    this.emitChange(this.selectedSports());
  }

  /** Check if sport is selected */
  isSelected(sportName: string): boolean {
    return this.selectedSports().includes(sportName);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /** Get emoji for sport */
  getEmoji(sportName: string): string {
    return getSportEmoji(sportName);
  }

  /** Format sport name for display */
  formatDisplayName(sportName: string): string {
    return formatSportDisplayName(sportName);
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

  /** Emit sport change with current data */
  private emitChange(sportNames: string[]): void {
    const primaryPositions = this.showPositionSelection() ? this.selectedPositions() : [];
    const entries: SportEntry[] = sportNames.map((sport, index) => {
      const entry = createEmptySportEntry(sport, index === 0);
      if (index === 0) {
        entry.positions = [...primaryPositions];
      }
      return entry;
    });

    const data: SportFormData = {
      sports: entries,
      coachTitle: this.showCoachTitleSelection() ? this.coachTitle() : null,
    };
    this.sportChange.emit(data);
  }

  // ============================================
  // LIST-ROW VARIANT METHODS
  // ============================================

  /**
   * Open platform-adaptive alert for sport selection.
   */
  async openSportPicker(): Promise<void> {
    const selected = this.selectedSports();
    const sports = this.availableSports();

    const max = this.maxSports();
    const isSingleSelect = max === 1;
    const alert = await this.alertCtrl.create({
      header: isSingleSelect ? 'Select Sport' : 'Select Sports',
      subHeader: this.showMaxHint() ? `Choose up to ${max}` : undefined,
      cssClass: 'nxt-modal-prompt',
      inputs: sports.map((sport) => ({
        name: sport.name,
        type: isSingleSelect ? ('radio' as const) : ('checkbox' as const),
        label: `${sport.icon} ${formatSportDisplayName(sport.name)}`,
        value: sport.name,
        checked: selected.includes(sport.name),
      })),
      buttons: [
        { text: 'Cancel', role: 'cancel', cssClass: 'nxt-modal-cancel-btn' },
        {
          text: 'Done',
          cssClass: 'nxt-modal-confirm-btn',
          handler: (values: string[] | string | undefined): boolean => {
            const normalizedValues = Array.isArray(values)
              ? values
              : typeof values === 'string' && values.length > 0
                ? [values]
                : [];
            const finalValues = isSingleSelect ? normalizedValues.slice(0, 1) : normalizedValues;

            if (finalValues.length > max) {
              this.toast.warning(`You can select up to ${max} sports`);
              return false;
            }
            const previousPrimary = this.selectedSport();
            this.selectedSports.set(finalValues);
            if (finalValues[0] !== previousPrimary) {
              this.selectedPositions.set([]);
            }
            if (finalValues.length === 0) {
              this.coachTitle.set(null);
            }
            this.emitChange(finalValues);
            this.logger.debug('Sports selected via picker', { sports: finalValues });
            return true;
          },
        },
      ],
    });
    this.nxtModal.applyModalTheme(alert);
    await alert.present();
  }

  async openPositionPicker(): Promise<void> {
    const sport = this.selectedSport();
    const groups = this.positionGroups();
    if (!sport || groups.length === 0 || this.totalPositionCount() === 0) return;

    const inputs = groups.flatMap((group) =>
      group.positions.map((position) => ({
        name: position,
        type: 'checkbox' as const,
        label:
          groups.length > 1
            ? `${group.category}: ${formatPositionDisplay(position, sport, { showAbbreviation: false })}`
            : formatPositionDisplay(position, sport, { showAbbreviation: false }),
        value: position,
        checked: this.selectedPositions().includes(position),
      }))
    );

    const alert = await this.alertCtrl.create({
      header: 'Select Position',
      subHeader: formatSportDisplayName(sport),
      cssClass: 'nxt-modal-prompt',
      inputs,
      buttons: [
        { text: 'Cancel', role: 'cancel', cssClass: 'nxt-modal-cancel-btn' },
        {
          text: 'Done',
          cssClass: 'nxt-modal-confirm-btn',
          handler: (values: string[] | undefined): boolean => {
            this.selectedPositions.set(Array.isArray(values) ? values : []);
            this.emitChange(this.selectedSports());
            return true;
          },
        },
      ],
    });

    this.nxtModal.applyModalTheme(alert);
    await alert.present();
  }

  async openCoachTitlePicker(): Promise<void> {
    const result = await this.nxtModal.actionSheet({
      title: 'Select Title',
      actions: COACH_TITLE_OPTIONS.map((option) => ({
        text: option.label,
        data: option.value,
      })),
      preferNative: 'native',
    });

    if (result?.selected && result.data) {
      this.selectCoachTitle(result.data as CoachTitleOption);
    }
  }
}
