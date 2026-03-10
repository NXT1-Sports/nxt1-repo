/**
 * @fileoverview OnboardingSportStepComponent - Sport Selection (v4.0 Simplified)
 * @module @nxt1/ui/onboarding
 * @version 4.0.0
 *
 * Simplified sport selection step for onboarding.
 * Only asks: "What sports do you follow/play?"
 *
 * Team info and positions are collected LATER based on role:
 * - Athletes: Asked for team/positions in athlete-specific flow
 * - Coaches: Asked for team they coach
 * - Fans: No team/positions needed
 *
 * ⭐ 2026 UX BEST PRACTICES:
 * - Progressive disclosure: Only ask what's needed NOW
 * - Multi-select chips for quick sport selection
 * - First selected = primary sport
 * - Clean, minimal UI
 *
 * Features:
 * - Multi-sport support (1-3 sports)
 * - Visual chips with sport icons/emojis
 * - First sport = primary sport
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
 *   [maxSports]="3"
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
  type SportCell,
} from '@nxt1/core/constants';
import type { ILogger } from '@nxt1/core/logging';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';
import { NxtToastService } from '../../services/toast';
import { NxtValidationSummaryComponent } from '../../components/validation-summary';
import { NxtListRowComponent } from '../../components/list-row';
import { NxtListSectionComponent } from '../../components/list-section';
import { NxtModalService } from '../../services/modal';
import { AlertController } from '@ionic/angular/standalone';

// ============================================
// CONSTANTS
// ============================================

/** Default maximum sports allowed */
const DEFAULT_MAX_SPORTS = 3;

/** Director-only synthetic option */
const ALL_SPORTS_OPTION = 'All Sports';

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
        </nxt1-list-section>
      </div>
    } @else {
      <div class="nxt1-sport-step" data-testid="onboarding-sport-step">
        <!-- Description -->
        <p class="nxt1-step-description">
          {{ stepPrompt() }}
          @if (maxSports() > 1) {
            <span class="nxt1-max-hint">Choose up to {{ maxSports() }}.</span>
          }
        </p>

        <!-- Sport Chips Grid -->
        <div class="nxt1-sport-grid" role="group" aria-label="Select sports">
          @for (sport of availableSports(); track sport.name) {
            <button
              type="button"
              class="nxt1-sport-chip"
              [class.nxt1-sport-chip--selected]="isSelected(sport.name)"
              [class.nxt1-sport-chip--primary]="isPrimary(sport.name)"
              [disabled]="disabled() || (!isSelected(sport.name) && isMaxReached())"
              (click)="toggleSport(sport.name)"
              nxtHaptic="selection"
              [attr.aria-pressed]="isSelected(sport.name)"
              [attr.data-testid]="'sport-chip-' + sanitizeTestId(sport.name)"
            >
              <span class="nxt1-sport-emoji" aria-hidden="true">{{ getEmoji(sport.name) }}</span>
              <span class="nxt1-sport-name">{{ formatDisplayName(sport.name) }}</span>
              @if (isPrimary(sport.name)) {
                <span class="nxt1-primary-badge">Primary</span>
              }
            </button>
          }
        </div>

        <!-- Selection Summary -->
        @if (selectedSports().length > 0) {
          <nxt1-validation-summary testId="onboarding-sport-validation" variant="success">
            {{ selectedSports().length }}
            {{ selectedSports().length === 1 ? 'sport' : 'sports' }} selected
            @if (selectedSports().length > 1) {
              · {{ formatDisplayName(selectedSports()[0]) }} is primary
            }
          </nxt1-validation-summary>
        } @else {
          <nxt1-validation-summary testId="onboarding-sport-hint" variant="info">
            Select at least one sport to continue
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

      /* Primary badge display */
      .nxt1-sport-chip--primary .nxt1-primary-badge {
        display: inline-block;
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

      .nxt1-primary-badge {
        display: none;
        position: absolute;
        top: var(--nxt1-spacing-1, 4px);
        right: var(--nxt1-spacing-1, 4px);
        padding: 2px 6px;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 600;
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        background: var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2));
        border-radius: var(--nxt1-borderRadius-full, 9999px);
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

  /** Array of selected sport names (order matters - first is primary) */
  readonly selectedSports = signal<string[]>([]);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Available sports filtered/sorted for display */
  readonly availableSports = computed((): SportCell[] => {
    const baseSports = this.sports();
    if (this.role() === 'director') {
      return [{ name: ALL_SPORTS_OPTION, icon: '🏟️' }, ...baseSports];
    }
    return baseSports;
  });

  /** Role-aware prompt text */
  readonly stepPrompt = computed((): string => {
    const currentRole = this.role();
    if (currentRole === 'director') {
      return 'What sports do you oversee?';
    }
    if (currentRole === 'recruiter') {
      return 'What sports do you evaluate?';
    }
    return 'Select your sport(s).';
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
    });
  }

  // ============================================
  // SPORT SELECTION
  // ============================================

  /** Toggle sport selection */
  toggleSport(sportName: string): void {
    const current = this.selectedSports();
    const isCurrentlySelected = current.includes(sportName);
    const isAllSports = sportName === ALL_SPORTS_OPTION;
    const hasAllSportsSelected = current.includes(ALL_SPORTS_OPTION);

    let updated: string[];
    if (isCurrentlySelected) {
      // Deselect
      updated = current.filter((s) => s !== sportName);
      this.logger.debug('Sport deselected', { sport: sportName, remaining: updated.length });
    } else {
      if (isAllSports) {
        updated = [ALL_SPORTS_OPTION];
        this.logger.debug('All Sports selected for director', { total: updated.length });
        this.selectedSports.set(updated);
        this.emitChange(updated);
        return;
      }

      if (hasAllSportsSelected) {
        // Replace "All Sports" with a specific sport selection
        updated = [sportName];
        this.logger.debug('Replaced All Sports with specific sport', {
          sport: sportName,
          total: updated.length,
        });
        this.selectedSports.set(updated);
        this.emitChange(updated);
        return;
      }

      // Select (if not at max)
      if (current.length >= this.maxSports()) {
        return; // Max reached
      }
      updated = [...current, sportName];
      this.logger.debug('Sport selected', {
        sport: sportName,
        total: updated.length,
        isPrimary: updated.length === 1,
      });
    }

    this.selectedSports.set(updated);
    this.emitChange(updated);
  }

  /** Check if sport is selected */
  isSelected(sportName: string): boolean {
    return this.selectedSports().includes(sportName);
  }

  /** Check if sport is primary (first selected) */
  isPrimary(sportName: string): boolean {
    const selected = this.selectedSports();
    return selected.length > 0 && selected[0] === sportName;
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
    // Convert to SportEntry[] format (minimal - just sport name, no team/positions)
    const entries: SportEntry[] = sportNames.map((sport, index) =>
      createEmptySportEntry(sport, index === 0)
    );

    const data: SportFormData = {
      sports: entries,
    };
    this.sportChange.emit(data);
  }

  // ============================================
  // LIST-ROW VARIANT METHODS
  // ============================================

  /**
   * Open checkbox alert for sport selection (same pattern as edit profile position picker)
   */
  async openSportPicker(): Promise<void> {
    const selected = this.selectedSports();
    const sports = this.availableSports();

    const alert = await this.alertCtrl.create({
      header: 'Select Sports',
      subHeader: 'Choose up to 3',
      cssClass: 'nxt-modal-prompt',
      inputs: sports.map((sport) => ({
        name: sport.name,
        type: 'checkbox' as const,
        label: `${sport.icon} ${formatSportDisplayName(sport.name)}`,
        value: sport.name,
        checked: selected.includes(sport.name),
      })),
      buttons: [
        { text: 'Cancel', role: 'cancel', cssClass: 'nxt-modal-cancel-btn' },
        {
          text: 'Done',
          cssClass: 'nxt-modal-confirm-btn',
          handler: (values: string[]): boolean => {
            if (values.length > 3) {
              this.toast.warning('You can select up to 3 sports');
              return false;
            }
            this.selectedSports.set(values);
            this.emitChange(values);
            this.logger.debug('Sports selected via picker', { sports: values });
            return true;
          },
        },
      ],
    });
    this.nxtModal.applyModalTheme(alert);
    await alert.present();
  }
}
