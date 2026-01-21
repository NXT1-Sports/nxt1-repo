/**
 * @fileoverview OnboardingSportStepComponent - Sport-Centric Onboarding (v3.0)
 * @module @nxt1/ui/onboarding
 * @version 3.0.0
 *
 * Consolidated sport step component that handles:
 * - Sport selection
 * - Team info (name, type, logo, colors)
 * - Position selection
 *
 * All bundled together per sport using expandable cards.
 *
 * Architecture:
 * ```
 * OnboardingSportStepComponent (container)
 *   ├── Add Sport Button (opens sport picker modal)
 *   ├── OnboardingSportEntryComponent (for each sport)
 *   │   ├── Team Info Section
 *   │   └── Positions Section
 *   └── Validation Summary
 * ```
 *
 * Features:
 * - Multi-sport support (1-3 sports)
 * - First sport = primary sport
 * - Expandable cards for each sport
 * - Add/remove sports dynamically
 * - Real-time validation per sport
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
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addCircleOutline } from 'ionicons/icons';
import type { SportFormData, SportEntry } from '@nxt1/core/api';
import { createEmptySportEntry } from '@nxt1/core/api';
import { DEFAULT_SPORTS, formatSportDisplayName, type SportCell } from '@nxt1/core/constants';
import type { ILogger } from '@nxt1/core/logging';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';
import { NxtPickerService } from '../../shared/picker';
import { NxtValidationSummaryComponent } from '../../shared/validation-summary';
import { OnboardingSportEntryComponent } from '../onboarding-sport-entry/onboarding-sport-entry.component';

// ============================================
// CONSTANTS
// ============================================

/** Default maximum sports allowed */
const DEFAULT_MAX_SPORTS = 3;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-sport-step',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonIcon,
    HapticButtonDirective,
    NxtValidationSummaryComponent,
    OnboardingSportEntryComponent,
  ],
  template: `
    <div class="nxt1-sport-step" data-testid="onboarding-sport-step">
      <!-- Header with Add Sport Button -->
      <div class="nxt1-step-header">
        <p class="nxt1-step-description">
          Add your sports, team info, and positions.
          @if (maxSports() > 1) {
            <span class="nxt1-max-hint">Up to {{ maxSports() }} sports allowed.</span>
          }
        </p>
      </div>

      <!-- Sport Entries -->
      <div class="nxt1-entries-container">
        @for (entry of sportEntries(); track entry.sport; let i = $index) {
          <nxt1-onboarding-sport-entry
            [entry]="entry"
            [expanded]="expandedIndex() === i"
            [disabled]="disabled()"
            (entryChange)="onEntryChange(i, $event)"
            (delete)="onDeleteSport(i)"
            (expandedChange)="onExpandedChange(i, $event)"
            (logoFileSelected)="onLogoFile($event, entry.sport)"
          />
        } @empty {
          <div class="nxt1-empty-state" data-testid="onboarding-sport-empty">
            <p class="nxt1-empty-text">
              No sports added yet. Click the button below to add your first sport.
            </p>
          </div>
        }
      </div>

      <!-- Add Sport Button -->
      @if (canAddMore()) {
        <button
          type="button"
          class="nxt1-add-sport-btn"
          (click)="openSportPicker()"
          [disabled]="disabled()"
          nxtHaptic="light"
          data-testid="onboarding-add-sport-btn"
        >
          <ion-icon name="add-circle-outline" aria-hidden="true" />
          Add {{ sportEntries().length === 0 ? 'Sport' : 'Another Sport' }}
        </button>
      }

      <!-- Validation Summary -->
      @if (sportEntries().length > 0) {
        @if (isAllValid()) {
          <nxt1-validation-summary testId="onboarding-sport-validation" variant="success">
            {{ sportEntries().length }}
            {{ sportEntries().length === 1 ? 'sport' : 'sports' }} configured
          </nxt1-validation-summary>
        } @else {
          <nxt1-validation-summary testId="onboarding-sport-validation" variant="warning">
            Complete all required fields for each sport
          </nxt1-validation-summary>
        }
      } @else {
        <nxt1-validation-summary testId="onboarding-sport-hint" variant="info">
          Add at least one sport to continue
        </nxt1-validation-summary>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         STEP CONTAINER
         ============================================ */
      .nxt1-sport-step {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        width: 100%;
      }

      /* ============================================
         HEADER
         ============================================ */
      .nxt1-step-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .nxt1-step-description {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: 1.5;
      }

      .nxt1-max-hint {
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         ENTRIES CONTAINER
         ============================================ */
      .nxt1-entries-container {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      /* ============================================
         EMPTY STATE
         ============================================ */
      .nxt1-empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
        background: var(--nxt1-color-state-hover);
        border: 1px dashed var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-xl);
      }

      .nxt1-empty-text {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        color: var(--nxt1-color-text-tertiary);
        text-align: center;
        margin: 0;
      }

      /* ============================================
         ADD SPORT BUTTON
         ============================================ */
      .nxt1-add-sport-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        width: 100%;
        padding: var(--nxt1-spacing-4);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 600;
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary5);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-xl);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast) ease;
      }

      .nxt1-add-sport-btn:hover:not(:disabled) {
        background: var(--nxt1-color-alpha-primary10);
        border-color: var(--nxt1-color-primary);
      }

      .nxt1-add-sport-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-add-sport-btn ion-icon {
        font-size: var(--nxt1-fontSize-2xl);
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
  private readonly picker = inject(NxtPickerService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('OnboardingSportStep');

  // ============================================
  // SIGNAL INPUTS
  // ============================================

  /** Current sport data from parent (v3.0 SportEntry[] format) */
  readonly sportData = input<SportFormData | null>(null);

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  /** Available sports list (optional - defaults to DEFAULT_SPORTS) */
  readonly sports = input<SportCell[]>(DEFAULT_SPORTS as SportCell[]);

  /** Maximum number of sports allowed */
  readonly maxSports = input<number>(DEFAULT_MAX_SPORTS);

  // ============================================
  // SIGNAL OUTPUTS
  // ============================================

  /** Emits when sport data changes */
  readonly sportChange = output<SportFormData>();

  /** Emits when a logo file is selected for a specific sport */
  readonly logoFileSelected = output<{ sport: string; file: File }>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Array of sport entries (local state synced from input) */
  readonly sportEntries = signal<SportEntry[]>([]);

  /** Index of currently expanded entry (-1 = none) */
  readonly expandedIndex = signal<number>(0);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Check if we can add more sports */
  readonly canAddMore = computed((): boolean => {
    return this.sportEntries().length < this.maxSports();
  });

  /** Check if all entries are valid */
  readonly isAllValid = computed((): boolean => {
    const entries = this.sportEntries();
    if (entries.length === 0) return false;
    return entries.every((e) => this.isEntryValid(e));
  });

  /** Get list of sports already added */
  readonly addedSportNames = computed((): string[] => {
    return this.sportEntries().map((e) => e.sport);
  });

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Register Ionicons
    addIcons({ addCircleOutline });

    // Sync internal state when sportData input changes
    effect(
      () => {
        const data = this.sportData();
        if (!data || !data.sports) {
          this.sportEntries.set([]);
          return;
        }
        this.sportEntries.set([...data.sports]);
        // Auto-expand first incomplete entry, or first entry if all complete
        const incompleteIdx = data.sports.findIndex((e) => !this.isEntryValid(e));
        this.expandedIndex.set(incompleteIdx >= 0 ? incompleteIdx : 0);
      },
      { allowSignalWrites: true }
    );
  }

  // ============================================
  // SPORT PICKER (via unified service)
  // ============================================

  /** Open the sport picker modal via unified picker service */
  async openSportPicker(): Promise<void> {
    const result = await this.picker.openSportPicker({
      selectedSports: this.addedSportNames(),
      availableSports: this.sports(),
      maxSports: this.maxSports(),
    });

    if (result.confirmed && result.sport) {
      this.addSport(result.sport);
    }
  }

  /** Add a sport to the entries list */
  private addSport(sportName: string): void {
    const entries = this.sportEntries();
    const isPrimary = entries.length === 0;
    const newEntry = createEmptySportEntry(sportName, isPrimary);

    const updatedEntries = [...entries, newEntry];
    this.sportEntries.set(updatedEntries);
    this.expandedIndex.set(updatedEntries.length - 1); // Expand newly added

    this.logger.debug('Sport added', { sport: sportName, isPrimary, total: updatedEntries.length });
    this.emitChange(updatedEntries);
  }

  // ============================================
  // ENTRY HANDLERS
  // ============================================

  /** Handle entry data change */
  onEntryChange(index: number, updatedEntry: SportEntry): void {
    const entries = [...this.sportEntries()];
    entries[index] = updatedEntry;
    this.sportEntries.set(entries);
    this.emitChange(entries);
  }

  /** Handle delete sport */
  onDeleteSport(index: number): void {
    const entries = [...this.sportEntries()];
    const removed = entries.splice(index, 1)[0];

    // If we removed the primary, make the first remaining one primary
    if (removed?.isPrimary && entries.length > 0) {
      entries[0] = { ...entries[0], isPrimary: true };
    }

    this.sportEntries.set(entries);
    this.expandedIndex.set(Math.min(index, entries.length - 1));

    this.logger.debug('Sport removed', { sport: removed?.sport, remaining: entries.length });
    this.emitChange(entries);
  }

  /** Handle expanded state change */
  onExpandedChange(index: number, expanded: boolean): void {
    if (expanded) {
      this.expandedIndex.set(index);
    } else if (this.expandedIndex() === index) {
      // Collapse - don't auto-expand another
      this.expandedIndex.set(-1);
    }
  }

  /** Handle logo file selected */
  onLogoFile(file: File, sport: string): void {
    this.logoFileSelected.emit({ sport, file });
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /** Check if entry is valid */
  isEntryValid(entry: SportEntry): boolean {
    return !!(entry.sport && entry.team?.name?.trim() && entry.positions?.length > 0);
  }

  /** Check if icon is a URL */
  isIconUrl(icon: string | undefined | null): boolean {
    if (!icon || typeof icon !== 'string') return false;
    return icon.startsWith('http://') || icon.startsWith('https://');
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
  private emitChange(entries: SportEntry[]): void {
    const data: SportFormData = {
      sports: entries,
    };
    this.sportChange.emit(data);
  }
}
