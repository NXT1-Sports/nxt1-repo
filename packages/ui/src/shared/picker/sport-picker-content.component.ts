/**
 * @fileoverview NxtSportPickerContentComponent - Sport Grid Content for Picker
 * @module @nxt1/ui/shared/picker
 * @version 1.0.0
 *
 * Content component that renders the sport selection grid inside the unified
 * picker shell. This component handles:
 * - Sport grid layout with icons and names
 * - Search filtering
 * - Showing which sports are already added (disabled state)
 * - Single selection behavior
 *
 * This is rendered inside NxtPickerShellComponent via the NxtPickerService.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, input, output, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle } from 'ionicons/icons';
import { DEFAULT_SPORTS, formatSportDisplayName, type SportCell } from '@nxt1/core/constants';
import { HapticButtonDirective } from '../../services/haptics';

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-sport-picker-content',
  standalone: true,
  imports: [CommonModule, IonIcon, HapticButtonDirective],
  template: `
    <div class="nxt1-sport-picker-content">
      <!-- Sport Grid -->
      <div class="nxt1-sport-grid" role="listbox" aria-label="Select a sport">
        @for (sport of filteredSports(); track sport.name) {
          <button
            type="button"
            class="nxt1-sport-card"
            [class.disabled]="isSportAdded(sport.name)"
            [class.selected]="isSelected(sport.name)"
            [disabled]="isSportAdded(sport.name)"
            (click)="selectSport(sport)"
            [attr.aria-disabled]="isSportAdded(sport.name)"
            [attr.aria-selected]="isSelected(sport.name)"
            [attr.data-testid]="'sport-picker-' + sanitizeTestId(sport.name)"
            role="option"
            nxtHaptic="selection"
          >
            <span class="nxt1-sport-icon" aria-hidden="true">
              @if (isIconUrl(sport.icon)) {
                <img
                  [src]="sport.icon"
                  [alt]="formatDisplayName(sport.name)"
                  class="nxt1-sport-img"
                  loading="lazy"
                />
              } @else {
                {{ sport.icon }}
              }
            </span>
            <span class="nxt1-sport-name">{{ formatDisplayName(sport.name) }}</span>
            @if (isSportAdded(sport.name)) {
              <span class="nxt1-added-badge">Added</span>
            }
            @if (isSelected(sport.name)) {
              <ion-icon name="checkmark-circle" class="nxt1-selected-icon" aria-hidden="true" />
            }
          </button>
        } @empty {
          <div class="nxt1-sport-empty">
            <p class="nxt1-empty-message">No sports found matching "{{ searchQuery() }}"</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       CONTENT CONTAINER
       ============================================ */
      .nxt1-sport-picker-content {
        padding: var(--nxt1-spacing-4);
      }

      /* ============================================
       SPORT GRID
       ============================================ */
      .nxt1-sport-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      @media (min-width: 480px) {
        .nxt1-sport-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      @media (min-width: 768px) {
        .nxt1-sport-grid {
          grid-template-columns: repeat(5, 1fr);
        }
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
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-2);
        background: var(--nxt1-color-surface-elevated);
        border: 2px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-xl);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast) ease;
        -webkit-tap-highlight-color: transparent;
        min-height: 100px;
      }

      .nxt1-sport-card:hover:not(:disabled) {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary5);
        transform: translateY(-2px);
      }

      .nxt1-sport-card:active:not(:disabled) {
        transform: scale(0.96);
      }

      .nxt1-sport-card.selected {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10);
      }

      .nxt1-sport-card.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-sport-card.disabled:hover {
        transform: none;
        border-color: var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-elevated);
      }

      /* ============================================
       SPORT ICON
       ============================================ */
      .nxt1-sport-icon {
        font-size: 2rem;
        line-height: 1;
      }

      .nxt1-sport-img {
        width: 40px;
        height: 40px;
        object-fit: contain;
      }

      /* ============================================
       SPORT NAME
       ============================================ */
      .nxt1-sport-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        color: var(--nxt1-color-text-primary);
        text-align: center;
        line-height: 1.2;
        word-break: break-word;
        max-width: 100%;
      }

      /* ============================================
       BADGES & ICONS
       ============================================ */
      .nxt1-added-badge {
        position: absolute;
        top: var(--nxt1-spacing-1);
        right: var(--nxt1-spacing-1);
        padding: 2px var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: 600;
        color: var(--nxt1-color-text-onPrimary);
        background: var(--nxt1-color-text-tertiary);
        border-radius: var(--nxt1-borderRadius-full);
        text-transform: uppercase;
      }

      .nxt1-selected-icon {
        position: absolute;
        top: var(--nxt1-spacing-1);
        right: var(--nxt1-spacing-1);
        font-size: var(--nxt1-fontSize-xl);
        color: var(--nxt1-color-primary);
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
        padding: var(--nxt1-spacing-8);
        text-align: center;
      }

      .nxt1-empty-message {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtSportPickerContentComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Sports that are already added (shown as disabled) */
  readonly addedSports = input<readonly string[]>([]);

  /** Available sports to show (defaults to DEFAULT_SPORTS) */
  readonly availableSports = input<readonly SportCell[]>(DEFAULT_SPORTS);

  /** Current search query (from shell) */
  readonly searchQuery = input<string>('');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when a sport is selected */
  readonly sportSelected = output<string>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Currently selected sport (before confirmation) */
  readonly selectedSport = signal<string | null>(null);

  // ============================================
  // COMPUTED
  // ============================================

  /** Filtered sports based on search query */
  readonly filteredSports = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const sports = this.availableSports();

    if (!query) {
      return sports;
    }

    return sports.filter(
      (sport) =>
        sport.name.toLowerCase().includes(query) ||
        formatSportDisplayName(sport.name).toLowerCase().includes(query)
    );
  });

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    addIcons({ checkmarkCircle });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Select a sport */
  selectSport(sport: SportCell): void {
    if (!this.isSportAdded(sport.name)) {
      this.selectedSport.set(sport.name);
      this.sportSelected.emit(sport.name);
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /** Check if sport is already added */
  isSportAdded(sportName: string): boolean {
    return this.addedSports().includes(sportName);
  }

  /** Check if sport is currently selected */
  isSelected(sportName: string): boolean {
    return this.selectedSport() === sportName;
  }

  /** Format sport name for display */
  formatDisplayName(name: string): string {
    return formatSportDisplayName(name);
  }

  /** Check if icon is a URL (vs emoji) */
  isIconUrl(icon: string): boolean {
    return icon.startsWith('http') || icon.startsWith('/');
  }

  /** Sanitize string for test IDs */
  sanitizeTestId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  // ============================================
  // PUBLIC API (for service integration)
  // ============================================

  /** Get the current selection (for service to retrieve) */
  getSelection(): string | null {
    return this.selectedSport();
  }

  /** Reset selection */
  resetSelection(): void {
    this.selectedSport.set(null);
  }
}
