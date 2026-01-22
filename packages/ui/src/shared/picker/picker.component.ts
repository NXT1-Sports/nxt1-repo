/**
 * @fileoverview NxtPickerComponent - Unified Picker Modal Component
 * @module @nxt1/ui/shared/picker
 * @version 1.0.0
 *
 * This is the main picker component that combines the shell with content.
 * It is created dynamically by the NxtPickerService and handles:
 * - Composing shell + content components
 * - Wiring up events between shell and content
 * - Returning results via ModalController
 *
 * This component should NOT be used directly in templates.
 * Always use NxtPickerService to open pickers.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  signal,
  computed,
  viewChild,
  ChangeDetectionStrategy,
  inject,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import type { PositionGroup, SportItem } from './picker.types';
import { NxtPickerShellComponent } from './picker-shell.component';
import { NxtSportPickerContentComponent } from './sport-picker-content.component';
import { NxtPositionPickerContentComponent } from './position-picker-content.component';

// ============================================
// TYPES
// ============================================

export type PickerMode = 'sport' | 'position';

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-picker',
  standalone: true,
  imports: [
    CommonModule,
    NxtPickerShellComponent,
    NxtSportPickerContentComponent,
    NxtPositionPickerContentComponent,
  ],
  template: `
    <nxt1-picker-shell
      [title]="title"
      [showSearch]="showSearch"
      [searchPlaceholder]="searchPlaceholder"
      [showCount]="showCount"
      [currentCount]="currentCount()"
      [maxCount]="maxCount"
      [confirmText]="confirmText"
      [cancelText]="cancelText"
      [canConfirm]="canConfirm()"
      [autoFocusSearch]="autoFocusSearch"
      (confirm)="onConfirm()"
      (cancel)="onCancel()"
      (searchChange)="onSearchChange($event)"
    >
      @switch (mode) {
        @case ('sport') {
          <nxt1-sport-picker-content
            #sportContent
            [addedSports]="addedSports"
            [availableSports]="availableSports"
            [searchQuery]="searchQuery()"
            (sportSelected)="onSportSelected($event)"
          />
        }
        @case ('position') {
          <nxt1-position-picker-content
            #positionContent
            [positionGroups]="positionGroups"
            [initialSelectedPositions]="initialSelectedPositions"
            [maxPositions]="maxPositions"
            [searchQuery]="searchQuery()"
            (selectionChange)="onPositionSelectionChange($event)"
          />
        }
      }
    </nxt1-picker-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtPickerComponent implements AfterViewInit {
  // ============================================
  // DEPENDENCIES
  // ============================================

  private readonly modalCtrl = inject(ModalController);

  // ============================================
  // VIEW CHILDREN
  // ============================================

  readonly sportContent = viewChild<NxtSportPickerContentComponent>('sportContent');
  readonly positionContent = viewChild<NxtPositionPickerContentComponent>('positionContent');

  // ============================================
  // SHARED INPUTS (from service via componentProps)
  // Note: Using regular properties instead of signal inputs because
  // ModalController.create() doesn't properly bind signal inputs
  // ============================================

  /** Picker mode (determines which content to show) */
  mode!: PickerMode;

  /** Title for the picker */
  title = 'Select';

  /** Whether to show search */
  showSearch = false;

  /** Search placeholder */
  searchPlaceholder = 'Search...';

  /** Whether to show count badge */
  showCount = false;

  /** Maximum selections allowed */
  maxCount = 0;

  /** Confirm button text */
  confirmText = 'Done';

  /** Cancel button text */
  cancelText = 'Cancel';

  /** Auto-focus search on open */
  autoFocusSearch = false;

  // ============================================
  // SPORT PICKER INPUTS
  // ============================================

  /** Sports already added (shown as disabled) */
  addedSports: readonly string[] = [];

  /** Available sports to display */
  availableSports: readonly SportItem[] = [];

  // ============================================
  // POSITION PICKER INPUTS
  // ============================================

  /** Position groups for display */
  positionGroups: readonly PositionGroup[] = [];

  /** Initially selected positions */
  initialSelectedPositions: readonly string[] = [];

  /** Maximum positions allowed */
  maxPositions = 5;

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Current search query */
  readonly searchQuery = signal<string>('');

  /** Selected sport (for sport mode) */
  readonly selectedSport = signal<string | null>(null);

  /** Selected positions (for position mode) */
  readonly selectedPositions = signal<string[]>([]);

  // ============================================
  // COMPUTED
  // ============================================

  /** Current count for display */
  readonly currentCount = computed(() => {
    if (this.mode === 'position') {
      return this.selectedPositions().length;
    }
    return this.selectedSport() ? 1 : 0;
  });

  /** Whether confirm button should be enabled */
  readonly canConfirm = computed(() => {
    if (this.mode === 'sport') {
      return this.selectedSport() !== null;
    }
    // For positions, allow confirmation even with 0 selections (user may want to clear)
    return true;
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngAfterViewInit(): void {
    // Initialize position selection from input
    if (this.mode === 'position') {
      this.selectedPositions.set([...this.initialSelectedPositions]);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Handle search change from shell */
  onSearchChange(query: string): void {
    this.searchQuery.set(query);
  }

  /** Handle sport selection from content */
  onSportSelected(sport: string): void {
    this.selectedSport.set(sport);
    // For single-select sport picker, auto-confirm on selection
    this.dismiss(true);
  }

  /** Handle position selection change from content */
  onPositionSelectionChange(positions: string[]): void {
    this.selectedPositions.set(positions);
  }

  /** Handle confirm button */
  onConfirm(): void {
    this.dismiss(true);
  }

  /** Handle cancel button */
  onCancel(): void {
    this.dismiss(false);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /** Dismiss the modal with result */
  private dismiss(confirmed: boolean): void {
    if (this.mode === 'sport') {
      this.modalCtrl.dismiss({
        confirmed,
        sport: confirmed ? this.selectedSport() : null,
      });
    } else {
      this.modalCtrl.dismiss({
        confirmed,
        positions: confirmed ? this.selectedPositions() : [],
      });
    }
  }
}
