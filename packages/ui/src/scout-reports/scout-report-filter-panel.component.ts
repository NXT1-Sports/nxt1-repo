/**
 * @fileoverview Scout Report Filter Panel Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Bottom sheet / sidebar filter panel for advanced filtering.
 * Premium design with grouped filter sections.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Sport filter chips
 * - Position multi-select
 * - Rating range slider
 * - Graduation year range
 * - State/Region selector
 * - Reset all / Apply buttons
 * - Active filter count badge
 *
 * @example
 * ```html
 * <nxt1-scout-report-filter-panel
 *   [filter]="currentFilter()"
 *   [isOpen]="isFilterOpen()"
 *   (filterChange)="onFilterChange($event)"
 *   (close)="closeFilters()"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonFooter,
  IonButton,
  IonButtons,
  IonIcon,
  IonChip,
  IonLabel,
  IonRange,
  IonModal,
  IonSearchbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  refreshOutline,
  checkmarkOutline,
  footballOutline,
  basketballOutline,
  baseballOutline,
  locationOutline,
  calendarOutline,
  starOutline,
} from 'ionicons/icons';
import type { ScoutReportFilter, AthleteSport } from '@nxt1/core';
import { POSITIONS_BY_SPORT, SPORT_LABELS, SPORT_ICONS } from '@nxt1/core';

// Register icons
/**
 * Graduation year options.
 */
const GRAD_YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i);

/**
 * US States for location filter.
 */
const US_STATES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
];

@Component({
  selector: 'nxt1-scout-report-filter-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonFooter,
    IonButton,
    IonButtons,
    IonIcon,
    IonChip,
    IonLabel,
    IonRange,
    IonModal,
    IonSearchbar,
  ],
  template: `
    <ion-modal
      [isOpen]="isOpen()"
      (didDismiss)="onClose()"
      [initialBreakpoint]="0.75"
      [breakpoints]="[0, 0.5, 0.75, 1]"
      handleBehavior="cycle"
    >
      <!-- Header -->
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button fill="clear" (click)="onClose()">
              <ion-icon name="close-outline" slot="icon-only"></ion-icon>
            </ion-button>
          </ion-buttons>
          <ion-title>
            Filters
            @if (activeFilterCount() > 0) {
              <span class="filter-count">{{ activeFilterCount() }}</span>
            }
          </ion-title>
          <ion-buttons slot="end">
            <ion-button
              fill="clear"
              (click)="resetFilters()"
              [disabled]="activeFilterCount() === 0"
            >
              <ion-icon name="refresh-outline" slot="start"></ion-icon>
              Reset
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <!-- Content -->
      <ion-content class="filter-content">
        <!-- Sport Section -->
        <div class="filter-section">
          <h3 class="filter-section__title">
            <ion-icon name="football-outline"></ion-icon>
            Sport
          </h3>
          <div class="filter-chips">
            @for (sport of sports; track sport.id) {
              <ion-chip
                [class.chip--active]="isSportSelected(sport.id)"
                (click)="toggleSport(sport.id)"
              >
                <ion-icon [name]="sport.icon"></ion-icon>
                <ion-label>{{ sport.label }}</ion-label>
              </ion-chip>
            }
          </div>
        </div>

        <!-- Position Section (shown when sport selected) -->
        @if (selectedSport() && positions().length > 0) {
          <div class="filter-section">
            <h3 class="filter-section__title">
              Position
              @if ((internalFilter().positions?.length ?? 0) > 0) {
                <span class="filter-section__badge">{{ internalFilter().positions?.length }}</span>
              }
            </h3>
            <div class="filter-chips filter-chips--wrap">
              @for (position of positions(); track position) {
                <ion-chip
                  [class.chip--active]="isPositionSelected(position)"
                  (click)="togglePosition(position)"
                >
                  <ion-label>{{ position }}</ion-label>
                </ion-chip>
              }
            </div>
          </div>
        }

        <!-- Rating Range -->
        <div class="filter-section">
          <h3 class="filter-section__title">
            <ion-icon name="star-outline"></ion-icon>
            Minimum Rating
          </h3>
          <div class="range-display">
            <span class="range-value">{{ internalFilter().minRating ?? 1 }}</span>
            <span class="range-separator">+</span>
            <span class="range-label">stars</span>
          </div>
          <ion-range
            [min]="1"
            [max]="5"
            [step]="0.5"
            [value]="internalFilter().minRating ?? 1"
            (ionChange)="onRatingChange($event)"
            [pin]="true"
            [ticks]="true"
            [snaps]="true"
          >
            <ion-label slot="start">1</ion-label>
            <ion-label slot="end">5</ion-label>
          </ion-range>
        </div>

        <!-- Graduation Year -->
        <div class="filter-section">
          <h3 class="filter-section__title">
            <ion-icon name="calendar-outline"></ion-icon>
            Class Year
            @if ((internalFilter().gradYears?.length ?? 0) > 0) {
              <span class="filter-section__badge">{{ internalFilter().gradYears?.length }}</span>
            }
          </h3>
          <div class="filter-chips">
            @for (year of gradYears; track year) {
              <ion-chip
                [class.chip--active]="isGradYearSelected(year)"
                (click)="toggleGradYear(year)"
              >
                <ion-label>{{ year }}</ion-label>
              </ion-chip>
            }
          </div>
        </div>

        <!-- State/Location -->
        <div class="filter-section">
          <h3 class="filter-section__title">
            <ion-icon name="location-outline"></ion-icon>
            State
            @if ((internalFilter().states?.length ?? 0) > 0) {
              <span class="filter-section__badge">{{ internalFilter().states?.length }}</span>
            }
          </h3>
          <ion-searchbar
            placeholder="Search states..."
            [value]="stateSearch()"
            (ionInput)="onStateSearch($event)"
            [debounce]="200"
          />
          <div class="filter-chips filter-chips--wrap filter-chips--scrollable">
            @for (state of filteredStates(); track state) {
              <ion-chip [class.chip--active]="isStateSelected(state)" (click)="toggleState(state)">
                <ion-label>{{ state }}</ion-label>
              </ion-chip>
            }
          </div>
        </div>
      </ion-content>

      <!-- Footer -->
      <ion-footer>
        <ion-toolbar>
          <ion-button expand="block" class="apply-btn" (click)="applyFilters()">
            <ion-icon name="checkmark-outline" slot="start"></ion-icon>
            Apply Filters
            @if (activeFilterCount() > 0) {
              <span class="apply-btn__count">({{ activeFilterCount() }})</span>
            }
          </ion-button>
        </ion-toolbar>
      </ion-footer>
    </ion-modal>
  `,
  styles: [
    `
      /* ============================================
         MODAL OVERRIDES
         ============================================ */

      ion-modal {
        --background: var(--nxt1-color-surface, #1a1a1a);
        --border-radius: var(--nxt1-radius-xl, 24px) var(--nxt1-radius-xl, 24px) 0 0;
      }

      ion-header ion-toolbar {
        --background: var(--nxt1-color-surface, #1a1a1a);
        --border-color: var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
      }

      ion-title {
        font-weight: 700;
        font-size: 18px;
      }

      .filter-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        margin-left: var(--nxt1-spacing-2, 8px);
        font-size: 12px;
        font-weight: 700;
        color: var(--nxt1-color-text-inverse, #0f0f0f);
        background: var(--nxt1-color-primary, #3b82f6);
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* ============================================
         FILTER CONTENT
         ============================================ */

      .filter-content {
        --background: var(--nxt1-color-surface, #1a1a1a);
        --padding-start: 0;
        --padding-end: 0;
      }

      /* ============================================
         FILTER SECTION
         ============================================ */

      .filter-section {
        padding: var(--nxt1-spacing-4, 16px);
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
      }

      .filter-section:last-child {
        border-bottom: none;
      }

      .filter-section__title {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .filter-section__title ion-icon {
        font-size: 18px;
        color: var(--nxt1-color-primary, #3b82f6);
      }

      .filter-section__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        margin-left: auto;
        font-size: 11px;
        font-weight: 700;
        color: var(--nxt1-color-text-inverse, #0f0f0f);
        background: var(--nxt1-color-primary, #3b82f6);
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* ============================================
         FILTER CHIPS
         ============================================ */

      .filter-chips {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        overflow-x: auto;
        padding-bottom: var(--nxt1-spacing-1, 4px);
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .filter-chips::-webkit-scrollbar {
        display: none;
      }

      .filter-chips--wrap {
        flex-wrap: wrap;
        overflow-x: visible;
      }

      .filter-chips--scrollable {
        max-height: 150px;
        overflow-y: auto;
      }

      ion-chip {
        --background: var(--nxt1-color-surface-elevated, #252525);
        --color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        margin: 0;
        flex-shrink: 0;
      }

      ion-chip:hover {
        --background: var(--nxt1-color-surface, #1a1a1a);
        --color: var(--nxt1-color-text-primary, #ffffff);
      }

      .chip--active {
        --background: var(--nxt1-color-primary-alpha-10, rgba(59, 130, 246, 0.1));
        --color: var(--nxt1-color-primary, #3b82f6);
        border-color: var(--nxt1-color-primary-alpha-30, rgba(59, 130, 246, 0.3));
      }

      .chip--active ion-icon {
        color: var(--nxt1-color-primary, #3b82f6);
      }

      /* ============================================
         RANGE SLIDER
         ============================================ */

      .range-display {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        margin-bottom: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px);
        background: var(--nxt1-color-surface-elevated, #252525);
        border-radius: var(--nxt1-radius-md, 8px);
      }

      .range-value {
        font-size: 18px;
        font-weight: 700;
        color: var(--nxt1-color-primary, #3b82f6);
        min-width: 32px;
        text-align: center;
      }

      .range-separator {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      ion-range {
        --bar-background: var(--nxt1-color-surface-elevated, #252525);
        --bar-background-active: var(--nxt1-color-primary, #3b82f6);
        --knob-background: var(--nxt1-color-primary, #3b82f6);
        --knob-size: 24px;
        --pin-background: var(--nxt1-color-primary, #3b82f6);
        --pin-color: var(--nxt1-color-text-inverse, #ffffff);
      }

      /* ============================================
         FOOTER
         ============================================ */

      ion-footer ion-toolbar {
        --background: var(--nxt1-color-surface, #1a1a1a);
        --border-color: var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        padding: var(--nxt1-spacing-3, 12px);
      }

      .apply-btn {
        --background: linear-gradient(
          135deg,
          var(--nxt1-color-primary, #3b82f6),
          var(--nxt1-color-secondary, #8b5cf6)
        );
        --border-radius: var(--nxt1-radius-lg, 12px);
        --box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
        font-weight: 600;
        height: 48px;
      }

      .apply-btn__count {
        margin-left: var(--nxt1-spacing-1, 4px);
        opacity: 0.8;
      }

      /* ============================================
         SEARCHBAR
         ============================================ */

      ion-searchbar {
        --background: var(--nxt1-color-surface-elevated, #252525);
        --border-radius: var(--nxt1-radius-md, 8px);
        --box-shadow: none;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --icon-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        padding: 0;
        margin-bottom: var(--nxt1-spacing-3, 12px);
      }

      /* ============================================
         THEME VARIANTS
         ============================================ */

      :host-context(.light-theme) {
        ion-modal {
          --background: var(--nxt1-color-white, #ffffff);
        }

        ion-header ion-toolbar,
        .filter-content,
        ion-footer ion-toolbar {
          --background: var(--nxt1-color-white, #ffffff);
        }

        .filter-section__title {
          color: var(--nxt1-color-gray-900, #111827);
        }

        ion-chip {
          --background: var(--nxt1-color-gray-100, #f3f4f6);
          --color: var(--nxt1-color-gray-600, #4b5563);
          border-color: var(--nxt1-color-gray-200, #e5e7eb);
        }

        .range-display {
          background: var(--nxt1-color-gray-100, #f3f4f6);
        }

        ion-range {
          --bar-background: var(--nxt1-color-gray-200, #e5e7eb);
        }

        ion-searchbar {
          --background: var(--nxt1-color-gray-100, #f3f4f6);
          --color: var(--nxt1-color-gray-900, #111827);
          --placeholder-color: var(--nxt1-color-gray-500, #6b7280);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportFilterPanelComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Current filter state */
  readonly filter = input<ScoutReportFilter>({});

  /** Whether panel is open */
  readonly isOpen = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when filter changes */
  readonly filterChange = output<ScoutReportFilter>();

  /** Emitted when panel closes */
  readonly close = output<void>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Internal filter state for editing */
  protected readonly internalFilter = signal<ScoutReportFilter>({});

  /** State search query */
  protected readonly stateSearch = signal('');

  // ============================================
  // CONSTANTS
  // ============================================

  /** Available sports */
  protected readonly sports = Object.entries(SPORT_LABELS).map(([id, label]) => ({
    id: id as AthleteSport,
    label,
    icon: SPORT_ICONS[id as AthleteSport] ?? 'trophy-outline',
  }));

  /** Graduation years */
  protected readonly gradYears = GRAD_YEARS;

  /** All US states */
  private readonly allStates = US_STATES;

  // ============================================
  // COMPUTED
  // ============================================

  /** Get the first selected sport for position filtering */
  protected readonly selectedSport = computed(() => {
    const sports = this.internalFilter().sports;
    return sports && sports.length > 0 ? sports[0] : null;
  });

  /** Positions for selected sport */
  protected readonly positions = computed(() => {
    const sport = this.selectedSport();
    if (!sport) return [];
    const sportPositions = POSITIONS_BY_SPORT[sport];
    return sportPositions ? Object.keys(sportPositions) : [];
  });

  /** Filtered states based on search */
  protected readonly filteredStates = computed(() => {
    const search = this.stateSearch().toUpperCase().trim();
    if (!search) return this.allStates;
    return this.allStates.filter((state) => state.includes(search));
  });

  /** Count of active filters */
  protected readonly activeFilterCount = computed(() => {
    const f = this.internalFilter();
    let count = 0;
    if (f.sports && f.sports.length > 0) count += f.sports.length;
    if (f.positions && f.positions.length > 0) count += f.positions.length;
    if (f.gradYears && f.gradYears.length > 0) count += f.gradYears.length;
    if (f.states && f.states.length > 0) count += f.states.length;
    if (f.minRating && f.minRating > 1) count++;
    if (f.verifiedOnly) count++;
    return count;
  });

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    addIcons({
      closeOutline,
      refreshOutline,
      checkmarkOutline,
      footballOutline,
      basketballOutline,
      baseballOutline,
      locationOutline,
      calendarOutline,
      starOutline,
    });
    // Sync external filter to internal on open
    effect(() => {
      if (this.isOpen()) {
        this.internalFilter.set({ ...this.filter() });
      }
    });
  }

  // ============================================
  // METHODS
  // ============================================

  /**
   * Toggle sport selection.
   */
  protected toggleSport(sportId: AthleteSport): void {
    this.internalFilter.update((f) => {
      const currentSports = f.sports ?? [];
      const isSelected = currentSports.includes(sportId);
      return {
        ...f,
        sports: isSelected
          ? currentSports.filter((s) => s !== sportId)
          : [...currentSports, sportId],
        // Clear positions if deselecting the only sport
        positions: isSelected && currentSports.length === 1 ? [] : f.positions,
      };
    });
  }

  /**
   * Toggle position selection.
   */
  protected togglePosition(position: string): void {
    this.internalFilter.update((f) => {
      const currentPositions = f.positions ?? [];
      const isSelected = currentPositions.includes(position);
      return {
        ...f,
        positions: isSelected
          ? currentPositions.filter((p) => p !== position)
          : [...currentPositions, position],
      };
    });
  }

  /**
   * Toggle graduation year.
   */
  protected toggleGradYear(year: number): void {
    this.internalFilter.update((f) => {
      const currentYears = f.gradYears ?? [];
      const isSelected = currentYears.includes(year);
      return {
        ...f,
        gradYears: isSelected ? currentYears.filter((y) => y !== year) : [...currentYears, year],
      };
    });
  }

  /**
   * Toggle state selection.
   */
  protected toggleState(state: string): void {
    this.internalFilter.update((f) => {
      const currentStates = f.states ?? [];
      const isSelected = currentStates.includes(state);
      return {
        ...f,
        states: isSelected ? currentStates.filter((s) => s !== state) : [...currentStates, state],
      };
    });
  }

  /**
   * Handle rating range change.
   */
  protected onRatingChange(event: CustomEvent): void {
    const value = event.detail.value as number;
    this.internalFilter.update((f) => ({
      ...f,
      minRating: value,
    }));
  }

  /**
   * Handle state search.
   */
  protected onStateSearch(event: CustomEvent): void {
    this.stateSearch.set(event.detail.value ?? '');
  }

  /**
   * Reset all filters.
   */
  protected resetFilters(): void {
    this.internalFilter.set({});
    this.stateSearch.set('');
  }

  /**
   * Apply filters and close.
   */
  protected applyFilters(): void {
    this.filterChange.emit(this.internalFilter());
    this.close.emit();
  }

  /**
   * Close panel without applying.
   */
  protected onClose(): void {
    this.close.emit();
  }

  /**
   * Check if sport is selected.
   */
  protected isSportSelected(sportId: AthleteSport): boolean {
    const sports = this.internalFilter().sports;
    return sports ? sports.includes(sportId) : false;
  }

  /**
   * Check if position is selected.
   */
  protected isPositionSelected(position: string): boolean {
    const positions = this.internalFilter().positions;
    return positions ? positions.includes(position) : false;
  }

  /**
   * Check if grad year is selected.
   */
  protected isGradYearSelected(year: number): boolean {
    const years = this.internalFilter().gradYears;
    return years ? years.includes(year) : false;
  }

  /**
   * Check if state is selected.
   */
  protected isStateSelected(state: string): boolean {
    const states = this.internalFilter().states;
    return states ? states.includes(state) : false;
  }
}
