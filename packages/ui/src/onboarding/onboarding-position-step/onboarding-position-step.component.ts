/**
 * @fileoverview OnboardingPositionStepComponent - Cross-Platform Position Selection
 * @module @nxt1/ui/onboarding
 * @version 2.0.0
 *
 * Reusable position step component for onboarding Step 5.
 * Collects user's positions based on selected sport with multi-select support.
 *
 * Features:
 * - Platform-adaptive with Ionic components
 * - Multi-select position chips grouped by category
 * - Dynamic positions based on selected sport
 * - Position abbreviations display (e.g., QB, RB)
 * - Accessible with ARIA labels
 * - Haptic feedback ready
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-position-step
 *   [positionData]="positionFormData()"
 *   [selectedSport]="selectedSport()"
 *   [disabled]="isLoading()"
 *   (positionChange)="onPositionChange($event)"
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
import type { PositionsFormData } from '@nxt1/core/api';
import {
  type PositionGroup,
  getPositionGroupsForSport,
  getPositionAbbreviation,
  formatPositionDisplay,
} from '@nxt1/core/constants';
import type { ILogger } from '@nxt1/core/logging';
import { NxtLoggingService } from '../../services/logging';
import { NxtChipComponent } from '../../shared/chip';

// ============================================
// CONSTANTS
// ============================================

/** Maximum number of positions a user can select */
const MAX_POSITIONS = 10;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-position-step',
  standalone: true,
  imports: [CommonModule, NxtChipComponent],
  template: `
    <div class="nxt1-position-form" data-testid="onboarding-position-step">
      <!-- Position Groups -->
      @for (group of positionGroups(); track group.category) {
        <div class="nxt1-position-group">
          @if (positionGroups().length > 1) {
            <label class="nxt1-group-label">{{ group.category }}</label>
          }
          <div
            class="nxt1-position-chips"
            role="group"
            [attr.aria-label]="'Select ' + group.category + ' positions'"
          >
            @for (position of group.positions; track position) {
              <nxt1-chip
                [selected]="isSelected(position)"
                [disabled]="disabled() || (isMaxSelected() && !isSelected(position))"
                [showCheck]="true"
                [testId]="'onboarding-position-' + sanitizeTestId(position)"
                ariaRole="toggle"
                (chipClick)="togglePosition(position)"
              >
                {{ formatPosition(position) }}
              </nxt1-chip>
            }
          </div>
        </div>
      } @empty {
        <div class="nxt1-position-empty" data-testid="onboarding-position-empty">
          <div class="nxt1-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
              />
            </svg>
          </div>
          <p class="nxt1-empty-message">No positions available for this sport</p>
          <p class="nxt1-empty-hint">You can continue to the next step</p>
        </div>
      }

      <!-- Selection Summary -->
      @if (selectedPositions().length > 0) {
        <div
          class="nxt1-selection-summary"
          role="status"
          aria-live="polite"
          data-testid="onboarding-position-summary"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" class="nxt1-summary-icon" aria-hidden="true">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
            />
          </svg>
          <span class="nxt1-summary-title">
            {{ selectedPositions().length }} position{{
              selectedPositions().length !== 1 ? 's' : ''
            }}
            selected
          </span>
        </div>
      }

      <!-- Hint Text -->
      <p class="nxt1-hint-text" aria-live="polite">
        @if (isMaxSelected()) {
          Maximum positions selected
        } @else {
          Select all positions that apply to you
        }
      </p>
    </div>
  `,
  styles: [
    `
      /* ============================================
       POSITION FORM CONTAINER
       ============================================ */
      .nxt1-position-form {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        width: 100%;
      }

      /* ============================================
       POSITION GROUP
       ============================================ */
      .nxt1-position-group {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      .nxt1-group-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      /* ============================================
       POSITION CHIPS - Container layout only
       Chip styles handled by NxtChipComponent
       ============================================ */
      .nxt1-position-chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
      }

      /* ============================================
       EMPTY STATE
       ============================================ */
      .nxt1-position-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        text-align: center;
      }

      .nxt1-empty-icon {
        color: var(--nxt1-color-text-tertiary);
        margin-bottom: var(--nxt1-spacing-3);
        opacity: 0.5;
      }

      .nxt1-empty-message {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-1);
      }

      .nxt1-empty-hint {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
      }

      /* ============================================
       SELECTION SUMMARY
       ============================================ */
      .nxt1-selection-summary {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-alpha-success10, rgba(34, 197, 94, 0.1));
        border: 1px solid var(--nxt1-color-success, #22c55e);
        border-radius: var(--nxt1-borderRadius-lg);
      }

      .nxt1-summary-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-success, #22c55e);
      }

      .nxt1-summary-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 500;
        color: var(--nxt1-color-success, #22c55e);
      }

      /* ============================================
       HINT TEXT
       ============================================ */
      .nxt1-hint-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        text-align: center;
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingPositionStepComponent {
  private readonly loggingService = inject(NxtLoggingService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('OnboardingPositionStep');

  // ============================================
  // SIGNAL INPUTS (Angular 19+ pattern)
  // ============================================

  /** Current position data from parent */
  readonly positionData = input<PositionsFormData | null>(null);

  /** Selected sport to determine available positions */
  readonly selectedSport = input<string>('');

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  // ============================================
  // SIGNAL OUTPUTS (Angular 19+ pattern)
  // ============================================

  /** Emits when position data changes */
  readonly positionChange = output<PositionsFormData>();

  // ============================================
  // INTERNAL STATE (signals for reactivity)
  // ============================================

  /** Selected positions array */
  readonly selectedPositions = signal<string[]>([]);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /**
   * Position groups for the selected sport.
   * Returns categorized positions (e.g., Offense, Defense for football).
   */
  readonly positionGroups = computed((): readonly PositionGroup[] => {
    const sport = this.selectedSport();
    if (!sport?.trim()) return [];
    return getPositionGroupsForSport(sport);
  });

  /** Whether max positions have been selected */
  readonly isMaxSelected = computed(() => this.selectedPositions().length >= MAX_POSITIONS);

  /** Total available positions count */
  readonly totalPositionsCount = computed(() =>
    this.positionGroups().reduce((sum, group) => sum + group.positions.length, 0)
  );

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Sync internal state when positionData input changes
    effect(
      () => {
        const data = this.positionData();
        if (data?.positions) {
          this.selectedPositions.set([...data.positions]);
        }
      },
      { allowSignalWrites: true }
    );
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Toggle position selection.
   * Enforces maximum position limit to prevent over-selection.
   */
  togglePosition(position: string): void {
    const current = this.selectedPositions();
    const index = current.indexOf(position);

    if (index >= 0) {
      // Remove position
      const updated = current.filter((_, i) => i !== index);
      this.selectedPositions.set(updated);
      this.logger.debug('Position deselected', { position, count: updated.length });
    } else {
      // Check max limit before adding
      if (current.length >= MAX_POSITIONS) {
        this.logger.warn('Max positions reached', { max: MAX_POSITIONS });
        return;
      }
      // Add position
      const updated = [...current, position];
      this.selectedPositions.set(updated);
      this.logger.debug('Position selected', { position, count: updated.length });
    }

    this.emitPositionChange();
  }

  /**
   * Check if position is selected
   */
  isSelected(position: string): boolean {
    return this.selectedPositions().includes(position);
  }

  /**
   * Format position for display with title case
   */
  formatPosition(position: string): string {
    return formatPositionDisplay(position, this.selectedSport(), {
      showAbbreviation: false,
      titleCase: true,
    });
  }

  /**
   * Get position abbreviation (e.g., "quarterback" → "QB")
   */
  getAbbreviation(position: string): string {
    const sport = this.selectedSport();
    const abbr = getPositionAbbreviation(position, sport);
    // Only return if it's different from the original (i.e., an actual abbreviation)
    return abbr !== position ? abbr : '';
  }

  /**
   * Sanitize position name for test ID
   */
  sanitizeTestId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Emit position change event with current data
   */
  private emitPositionChange(): void {
    const data: PositionsFormData = {
      positions: this.selectedPositions(),
    };
    this.positionChange.emit(data);
  }
}
