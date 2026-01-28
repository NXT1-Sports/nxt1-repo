/**
 * @fileoverview NxtPositionPickerContentComponent - Position List Content for Picker
 * @module @nxt1/ui/components/picker
 * @version 1.0.0
 *
 * Content component that renders the position selection list inside the unified
 * picker shell. This component handles:
 * - Grouped position list with category headers
 * - Checkbox-style multi-selection
 * - Maximum selection limit enforcement
 * - Search filtering (optional)
 *
 * This is rendered inside NxtPickerShellComponent via the NxtPickerService.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  input,
  output,
  signal,
  computed,
  ChangeDetectionStrategy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, ellipseOutline } from 'ionicons/icons';
import { formatPositionDisplay } from '@nxt1/core/constants';
import type { PositionGroup } from './picker.types';
import { HapticButtonDirective } from '../../services/haptics';

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-position-picker-content',
  standalone: true,
  imports: [CommonModule, IonIcon, HapticButtonDirective],
  template: `
    <div class="nxt1-position-picker-content">
      @for (group of filteredGroups(); track group.category) {
        <!-- Category Header (only if multiple groups) -->
        @if (positionGroups().length > 1) {
          <div class="nxt1-group-header">
            {{ group.category }}
          </div>
        }

        <!-- Positions List -->
        <div class="nxt1-positions-list" role="listbox" [attr.aria-label]="group.category">
          @for (position of group.positions; track position) {
            <button
              type="button"
              class="nxt1-position-item"
              [class.selected]="isSelected(position)"
              [class.disabled]="isDisabled(position)"
              [disabled]="isDisabled(position)"
              (click)="togglePosition(position)"
              [attr.aria-selected]="isSelected(position)"
              [attr.aria-disabled]="isDisabled(position)"
              [attr.data-testid]="'position-picker-' + sanitizeTestId(position)"
              role="option"
              nxtHaptic="selection"
            >
              <!-- Checkbox Icon -->
              <span class="nxt1-checkbox-icon">
                @if (isSelected(position)) {
                  <ion-icon name="checkmark-circle" class="nxt1-icon-checked" aria-hidden="true" />
                } @else {
                  <ion-icon name="ellipse-outline" class="nxt1-icon-unchecked" aria-hidden="true" />
                }
              </span>

              <!-- Position Name -->
              <span class="nxt1-position-name">{{ formatPosition(position) }}</span>
            </button>
          }
        </div>
      } @empty {
        <div class="nxt1-empty-state">
          @if (searchQuery()) {
            <p class="nxt1-empty-message">No positions found matching "{{ searchQuery() }}"</p>
          } @else {
            <p class="nxt1-empty-message">No positions available for this sport.</p>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       CONTENT CONTAINER
       ============================================ */
      .nxt1-position-picker-content {
        padding: 0;
      }

      /* ============================================
       GROUP HEADER
       ============================================ */
      .nxt1-group-header {
        position: sticky;
        top: 0;
        z-index: 1;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-elevated);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      /* ============================================
       POSITIONS LIST
       ============================================ */
      .nxt1-positions-list {
        display: flex;
        flex-direction: column;
      }

      /* ============================================
       POSITION ITEM
       ============================================ */
      .nxt1-position-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-default);
        border: none;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        cursor: pointer;
        transition: background var(--nxt1-duration-fast) ease;
        -webkit-tap-highlight-color: transparent;
        text-align: left;
      }

      .nxt1-position-item:hover:not(:disabled) {
        background: var(--nxt1-color-state-hover);
      }

      .nxt1-position-item:active:not(:disabled) {
        background: var(--nxt1-color-state-pressed);
      }

      .nxt1-position-item.selected {
        background: var(--nxt1-color-alpha-primary5);
      }

      .nxt1-position-item.selected:hover {
        background: var(--nxt1-color-alpha-primary10);
      }

      .nxt1-position-item.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-position-item.disabled:hover {
        background: var(--nxt1-color-surface-default);
      }

      /* Last item in each group */
      .nxt1-positions-list .nxt1-position-item:last-child {
        border-bottom: none;
      }

      /* ============================================
       CHECKBOX ICON
       ============================================ */
      .nxt1-checkbox-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .nxt1-icon-checked {
        font-size: 24px;
        color: var(--nxt1-color-primary);
      }

      .nxt1-icon-unchecked {
        font-size: 24px;
        color: var(--nxt1-color-border-default);
      }

      /* ============================================
       POSITION NAME
       ============================================ */
      .nxt1-position-name {
        flex: 1;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 500;
        color: var(--nxt1-color-text-primary);
      }

      .nxt1-position-item.selected .nxt1-position-name {
        color: var(--nxt1-color-primary);
      }

      /* ============================================
       EMPTY STATE
       ============================================ */
      .nxt1-empty-state {
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
export class NxtPositionPickerContentComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Position groups to display */
  readonly positionGroups = input<readonly PositionGroup[]>([]);

  /** Initially selected positions */
  readonly initialSelectedPositions = input<readonly string[]>([]);

  /** Maximum positions allowed */
  readonly maxPositions = input<number>(5);

  /** Current search query (from shell) */
  readonly searchQuery = input<string>('');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when selection changes */
  readonly selectionChange = output<string[]>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Currently selected positions */
  readonly selectedPositions = signal<string[]>([]);

  // ============================================
  // COMPUTED
  // ============================================

  /** Filtered groups based on search query */
  readonly filteredGroups = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const groups = this.positionGroups();

    if (!query) {
      return groups;
    }

    // Filter positions within each group
    return groups
      .map((group) => ({
        ...group,
        positions: group.positions.filter(
          (pos) =>
            pos.toLowerCase().includes(query) ||
            formatPositionDisplay(pos).toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.positions.length > 0);
  });

  /** Current selection count */
  readonly selectionCount = computed(() => this.selectedPositions().length);

  /** Whether at maximum selections */
  readonly isAtMax = computed(() => this.selectionCount() >= this.maxPositions());

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    addIcons({ checkmarkCircle, ellipseOutline });

    // Initialize selection from input
    effect(() => {
      const initial = this.initialSelectedPositions();
      if (initial.length > 0) {
        this.selectedPositions.set([...initial]);
      }
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Toggle a position selection */
  togglePosition(position: string): void {
    const current = this.selectedPositions();

    if (current.includes(position)) {
      // Remove position
      const newSelection = current.filter((p) => p !== position);
      this.selectedPositions.set(newSelection);
      this.selectionChange.emit(newSelection);
    } else if (current.length < this.maxPositions()) {
      // Add position
      const newSelection = [...current, position];
      this.selectedPositions.set(newSelection);
      this.selectionChange.emit(newSelection);
    }
    // If at max and trying to add, do nothing
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /** Check if position is selected */
  isSelected(position: string): boolean {
    return this.selectedPositions().includes(position);
  }

  /** Check if position is disabled (max reached and not selected) */
  isDisabled(position: string): boolean {
    return this.isAtMax() && !this.isSelected(position);
  }

  /** Format position for display */
  formatPosition(position: string): string {
    return formatPositionDisplay(position);
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

  /** Get the current selection */
  getSelection(): string[] {
    return [...this.selectedPositions()];
  }

  /** Set selection programmatically */
  setSelection(positions: string[]): void {
    this.selectedPositions.set([...positions]);
  }

  /** Check if selection is valid */
  isSelectionValid(): boolean {
    return this.selectionCount() > 0;
  }
}
