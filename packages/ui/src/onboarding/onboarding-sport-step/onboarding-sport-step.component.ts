/**
 * @fileoverview OnboardingSportStepComponent - Cross-Platform Multi-Sport Selection
 * @module @nxt1/ui/onboarding
 * @version 3.1.0
 *
 * Reusable sport step component for onboarding Step 4.
 * Supports multi-sport selection with professional UX.
 *
 * Features:
 * - Multi-sport selection (configurable max)
 * - Selected sports shown as removable chips
 * - Platform-adaptive with Ionic components
 * - Search/filter functionality for easy sport discovery
 * - Grid layout with sport icons/emojis
 * - Real-time search filtering
 * - Accessible with ARIA labels
 * - Haptic feedback on selection/deselection
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-onboarding-sport-step
 *   [sportData]="sportFormData()"
 *   [disabled]="isLoading()"
 *   [maxSelections]="5"
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
import { FormsModule } from '@angular/forms';
import { IonInput, IonIcon, IonChip, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline, closeCircle, close } from 'ionicons/icons';
import type { SportFormData } from '@nxt1/core/api';
import { DEFAULT_SPORTS, formatSportDisplayName, type SportCell } from '@nxt1/core/constants';
import type { ILogger } from '@nxt1/core/logging';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';
import { NxtValidationSummaryComponent } from '../../shared/validation-summary';

// ============================================
// CONSTANTS
// ============================================

/** Minimum characters before filtering is applied */
const MIN_SEARCH_LENGTH = 0;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-sport-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonInput,
    IonIcon,
    IonChip,
    IonLabel,
    HapticButtonDirective,
    NxtValidationSummaryComponent,
  ],
  template: `
    <div class="nxt1-sport-form" data-testid="onboarding-sport-step">
      <!-- Selected Sports Chips (shown when sports are selected) -->
      @if (selectedSports().length > 0) {
        <div class="nxt1-selected-sports" data-testid="onboarding-selected-sports">
          <div class="nxt1-selected-header">
            <span class="nxt1-selected-label">Your Sports</span>
            <span class="nxt1-selected-count"
              >{{ selectedSports().length
              }}{{ maxSelections() ? ' / ' + maxSelections() : '' }}</span
            >
          </div>
          <div class="nxt1-chips-container">
            @for (sport of selectedSports(); track sport; let i = $index) {
              <ion-chip
                class="nxt1-sport-chip"
                [disabled]="disabled()"
                (click)="onChipRemove(sport)"
                [attr.data-testid]="'onboarding-sport-chip-' + sanitizeTestId(sport)"
              >
                <ion-label>{{ formatDisplayName(sport) }}</ion-label>
                <ion-icon name="close" class="nxt1-remove-icon" aria-label="Remove" />
              </ion-chip>
            }
          </div>
        </div>
      }

      <!-- Search Input -->
      <div class="nxt1-search-container">
        <ion-icon name="search-outline" class="nxt1-search-icon" aria-hidden="true" />
        <ion-input
          type="text"
          class="nxt1-search-input"
          fill="outline"
          placeholder="Search sports..."
          aria-label="Search for a sport"
          [value]="searchQuery()"
          (ionInput)="onSearchInput($event)"
          [disabled]="disabled()"
          enterkeyhint="search"
          inputmode="search"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          data-testid="onboarding-sport-search"
        />
        @if (searchQuery()) {
          <button
            type="button"
            class="nxt1-search-clear"
            (click)="clearSearch()"
            aria-label="Clear search"
            nxtHaptic="selection"
          >
            <ion-icon name="close-circle" aria-hidden="true" />
          </button>
        }
      </div>

      <!-- Sport Selection Grid -->
      <div
        class="nxt1-sport-grid"
        role="listbox"
        [attr.aria-label]="
          'Select your sports' +
          (maxSelections() ? '. Maximum ' + maxSelections() + ' selections.' : '')
        "
        [attr.aria-multiselectable]="true"
        data-testid="onboarding-sport-grid"
      >
        @for (sport of filteredSports(); track sport.name) {
          <button
            type="button"
            class="nxt1-sport-card"
            [class.selected]="isSelected(sport.name)"
            [disabled]="disabled() || (isAtMaxSelections() && !isSelected(sport.name))"
            (click)="onSportSelect(sport.name)"
            [attr.aria-selected]="isSelected(sport.name)"
            [attr.aria-disabled]="isAtMaxSelections() && !isSelected(sport.name)"
            [attr.data-testid]="'onboarding-sport-' + sanitizeTestId(sport.name)"
            role="option"
            nxtHaptic="selection"
          >
            <span class="nxt1-sport-icon" aria-hidden="true">
              @if (isIconUrl(sport.icon)) {
                <img
                  [src]="sport.icon"
                  [alt]="formatDisplayName(sport.name)"
                  class="nxt1-sport-img"
                />
              } @else {
                {{ sport.icon }}
              }
            </span>
            <span class="nxt1-sport-name">{{ formatDisplayName(sport.name) }}</span>
            @if (isSelected(sport.name)) {
              <span class="nxt1-sport-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </span>
            }
            @if (getSelectionOrder(sport.name); as order) {
              <span class="nxt1-selection-order" aria-label="Selection order {{ order }}">
                {{ order }}
              </span>
            }
          </button>
        } @empty {
          <div class="nxt1-sport-empty" data-testid="onboarding-sport-empty">
            <p class="nxt1-empty-message">No sports found matching "{{ searchQuery() }}"</p>
            <button
              type="button"
              class="nxt1-clear-link"
              (click)="clearSearch()"
              nxtHaptic="selection"
            >
              Clear search
            </button>
          </div>
        }
      </div>

      <!-- Validation Summary -->
      @if (selectedSports().length > 0) {
        <nxt1-validation-summary testId="onboarding-sport-validation" variant="success">
          {{ selectedSports().length }}
          {{ selectedSports().length === 1 ? 'sport' : 'sports' }} selected
        </nxt1-validation-summary>
      } @else {
        <nxt1-validation-summary testId="onboarding-sport-hint" variant="info">
          Select at least one sport to continue
        </nxt1-validation-summary>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       SPORT FORM CONTAINER
       ============================================ */
      .nxt1-sport-form {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
        width: 100%;
      }

      /* ============================================
       SELECTED SPORTS SECTION
       ============================================ */
      .nxt1-selected-sports {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-alpha-primary5);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        border-radius: var(--nxt1-borderRadius-lg, 12px);
      }

      .nxt1-selected-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .nxt1-selected-label {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .nxt1-selected-count {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
      }

      .nxt1-chips-container {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
      }

      .nxt1-sport-chip {
        --background: var(--nxt1-color-surface-elevated);
        --color: var(--nxt1-color-text-primary);
        --padding-start: 12px;
        --padding-end: 8px;
        margin: 0;
        height: 36px;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--nxt1-transition-fast, 150ms) ease;
      }

      .nxt1-sport-chip:hover {
        --background: var(--nxt1-color-state-hover);
      }

      .nxt1-remove-icon {
        font-size: 18px;
        margin-left: 4px;
        opacity: 0.7;
        transition: opacity var(--nxt1-transition-fast, 150ms) ease;
      }

      .nxt1-sport-chip:hover .nxt1-remove-icon {
        opacity: 1;
      }

      /* ============================================
       SEARCH CONTAINER
       ============================================ */
      .nxt1-search-container {
        position: relative;
        display: flex;
        align-items: center;
      }

      .nxt1-search-icon {
        position: absolute;
        left: 14px;
        z-index: 1;
        font-size: 20px;
        color: var(--nxt1-color-text-tertiary);
        pointer-events: none;
      }

      .nxt1-search-input {
        --background: var(--nxt1-color-state-hover);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: var(--nxt1-borderRadius-lg, 12px);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary);
        --placeholder-color: var(--nxt1-color-text-tertiary);
        --placeholder-opacity: 1;
        --padding-start: 44px;
        --padding-end: 44px;
        --padding-top: 12px;
        --padding-bottom: 12px;
        --highlight-color-focused: var(--nxt1-color-border-strong);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 15px;
        min-height: 48px;
        width: 100%;
      }

      .nxt1-search-input:hover {
        --border-color: var(--nxt1-color-border-strong);
      }

      .nxt1-search-clear {
        position: absolute;
        right: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-tertiary);
        cursor: pointer;
        transition: color var(--nxt1-transition-fast, 150ms) ease;
      }

      .nxt1-search-clear:hover {
        color: var(--nxt1-color-text-secondary);
      }

      .nxt1-search-clear ion-icon {
        font-size: 20px;
      }

      /* ============================================
       SPORT GRID
       ============================================ */
      .nxt1-sport-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-1);
        margin: calc(-1 * var(--nxt1-spacing-1));
        /* No max-height/overflow - parent container handles scrolling */
      }

      /* ============================================
       SPORT CARD
       ============================================ */
      .nxt1-sport-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-3);
        min-height: 100px;
        background: var(--nxt1-color-state-hover);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        cursor: pointer;
        transition: all var(--nxt1-transition-fast, 150ms) ease;
      }

      .nxt1-sport-card:hover:not(:disabled):not(.selected) {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-alpha-primary5);
        transform: translateY(-1px);
      }

      .nxt1-sport-card:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .nxt1-sport-card.selected {
        background: var(--nxt1-color-alpha-primary10);
        border-color: var(--nxt1-color-primary);
        box-shadow: 0 0 0 1px var(--nxt1-color-primary);
      }

      .nxt1-sport-card:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-sport-card:disabled:not(.selected) {
        opacity: 0.35;
      }

      /* Sport icon */
      .nxt1-sport-icon {
        font-size: 32px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .nxt1-sport-img {
        width: 32px;
        height: 32px;
        object-fit: contain;
      }

      /* Sport name */
      .nxt1-sport-name {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        text-align: center;
        line-height: 1.2;
        word-break: break-word;
      }

      .nxt1-sport-card.selected .nxt1-sport-name {
        color: var(--nxt1-color-primary);
        font-weight: 600;
      }

      /* Selection checkmark */
      .nxt1-sport-check {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-onPrimary);
      }

      /* Selection order badge */
      .nxt1-selection-order {
        position: absolute;
        bottom: 6px;
        right: 6px;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        border-radius: 9px;
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* ============================================
       EMPTY STATE
       ============================================ */
      .nxt1-sport-empty {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        text-align: center;
      }

      .nxt1-empty-message {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
        color: var(--nxt1-color-text-tertiary);
        margin: 0 0 var(--nxt1-spacing-3);
      }

      .nxt1-clear-link {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
        font-weight: 500;
        color: var(--nxt1-color-primary);
        background: transparent;
        border: none;
        cursor: pointer;
        text-decoration: underline;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
      }

      .nxt1-clear-link:hover {
        text-decoration: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingSportStepComponent {
  private readonly loggingService = inject(NxtLoggingService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('OnboardingSportStep');

  // ============================================
  // SIGNAL INPUTS (Angular 19+ pattern)
  // ============================================

  /** Current sport data from parent */
  readonly sportData = input<SportFormData | null>(null);

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  /** Custom sports list (optional - defaults to DEFAULT_SPORTS from @nxt1/core) */
  readonly sports = input<SportCell[]>(DEFAULT_SPORTS as SportCell[]);

  /** Maximum number of sports that can be selected (0 = unlimited) */
  readonly maxSelections = input<number>(0);

  // ============================================
  // SIGNAL OUTPUTS (Angular 19+ pattern)
  // ============================================

  /** Emits when sport data changes */
  readonly sportChange = output<SportFormData>();

  // ============================================
  // INTERNAL STATE (signals for reactivity)
  // ============================================

  /** Search query */
  readonly searchQuery = signal('');

  /** Array of selected sport names (order is preserved) */
  readonly selectedSports = signal<string[]>([]);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /**
   * Filtered sports based on search query.
   * Memoized via Angular's computed() - only recalculates when dependencies change.
   */
  readonly filteredSports = computed((): readonly SportCell[] => {
    const query = this.searchQuery().toLowerCase().trim();
    const sportsList = this.sports();

    // Return full list if no search query
    if (query.length <= MIN_SEARCH_LENGTH) {
      return sportsList;
    }

    // Filter sports by name match (case-insensitive)
    return sportsList.filter((sport) => sport.name.toLowerCase().includes(query));
  });

  /** Count of filtered results for screen readers */
  readonly filteredCount = computed(() => this.filteredSports().length);

  /** Check if at maximum selections */
  readonly isAtMaxSelections = computed(() => {
    const max = this.maxSelections();
    return max > 0 && this.selectedSports().length >= max;
  });

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Register Ionicons
    addIcons({ searchOutline, closeCircle, close });

    // Sync internal state when sportData input changes
    effect(
      () => {
        const data = this.sportData();
        if (!data) {
          // Reset state when data is null/undefined
          this.selectedSports.set([]);
          return;
        }

        // Use selectedSports array
        if (data.selectedSports && data.selectedSports.length > 0) {
          this.selectedSports.set([...data.selectedSports]);
        } else {
          this.selectedSports.set([]);
        }
      },
      { allowSignalWrites: true }
    );
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle search input
   */
  onSearchInput(event: CustomEvent): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value || '');
  }

  /**
   * Clear search query
   */
  clearSearch(): void {
    this.searchQuery.set('');
  }

  /**
   * Handle sport selection (toggle on/off for multi-select).
   */
  onSportSelect(sportName: string): void {
    const current = this.selectedSports();
    const index = current.indexOf(sportName);

    if (index >= 0) {
      // Already selected - remove it
      this.selectedSports.update((sports) => sports.filter((s) => s !== sportName));
      this.logger.debug('Sport deselected', {
        sport: sportName,
        remaining: this.selectedSports().length,
      });
    } else {
      // Not selected - add if under max
      const max = this.maxSelections();
      if (max === 0 || current.length < max) {
        this.selectedSports.update((sports) => [...sports, sportName]);
        this.logger.debug('Sport selected', {
          sport: sportName,
          total: this.selectedSports().length,
        });
      }
    }
    this.emitSportChange();
  }

  /**
   * Handle chip removal (click on chip removes sport)
   */
  onChipRemove(sportName: string): void {
    this.selectedSports.update((sports) => sports.filter((s) => s !== sportName));
    this.logger.debug('Sport removed via chip', {
      sport: sportName,
      remaining: this.selectedSports().length,
    });
    this.emitSportChange();
  }

  /**
   * Check if sport is selected
   */
  isSelected(sportName: string): boolean {
    return this.selectedSports().includes(sportName);
  }

  /**
   * Get the selection order (1-based) for a sport, or null if not selected
   */
  getSelectionOrder(sportName: string): number | null {
    const index = this.selectedSports().indexOf(sportName);
    return index >= 0 ? index + 1 : null;
  }

  /**
   * Check if icon is a URL (for img tag) vs emoji (for text).
   * URLs are used for custom sport icons from Firebase Storage.
   */
  isIconUrl(icon: string | undefined | null): boolean {
    if (!icon || typeof icon !== 'string') return false;
    return icon.startsWith('http://') || icon.startsWith('https://');
  }

  /**
   * Format sport name for display using @nxt1/core formatter.
   * Converts 'basketball mens' → "Men's Basketball"
   */
  formatDisplayName(sportName: string): string {
    return formatSportDisplayName(sportName);
  }

  /**
   * Sanitize sport name for test ID
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
   * Emit sport change event with current data
   */
  private emitSportChange(): void {
    const data: SportFormData = {
      selectedSports: [...this.selectedSports()],
    };
    this.sportChange.emit(data);
  }
}
