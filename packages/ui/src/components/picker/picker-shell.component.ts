/**
 * @fileoverview NxtPickerShellComponent - Unified Picker Container
 * @module @nxt1/ui/components/picker
 * @version 1.0.0
 *
 * Reusable picker shell component that provides consistent UI chrome
 * for all picker types (sport, position, etc.). The shell handles:
 * - Header with title, count badge, and close button
 * - Optional search bar with clear functionality
 * - Scrollable content area (receives ng-content or dynamic component)
 * - Footer with cancel/confirm buttons
 *
 * The actual content (grid of sports, list of positions, etc.) is rendered
 * via ng-content or dynamic component injection, keeping the shell reusable.
 *
 * Usage:
 * ```typescript
 * // Via NxtPickerService (recommended)
 * const result = await this.pickerService.openSportPicker({
 *   selectedSports: ['Football'],
 *   maxSports: 5
 * });
 *
 * // Or for positions
 * const result = await this.pickerService.openPositionPicker({
 *   sport: 'Football',
 *   selectedPositions: ['QB', 'WR'],
 *   maxPositions: 5
 * });
 * ```
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
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonInput,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, closeCircle, searchOutline, checkmark } from 'ionicons/icons';
import { HapticButtonDirective } from '../../services/haptics';

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-picker-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonInput,
    HapticButtonDirective,
  ],
  template: `
    <!-- Header -->
    <ion-header class="nxt1-picker-header">
      <ion-toolbar class="nxt1-picker-toolbar">
        <!-- Cancel Button -->
        <ion-buttons slot="start">
          <ion-button
            fill="clear"
            (click)="onCancel()"
            nxtHaptic="light"
            class="nxt1-cancel-btn"
            data-testid="picker-cancel-btn"
          >
            {{ cancelText() }}
          </ion-button>
        </ion-buttons>

        <!-- Title with optional count badge -->
        <ion-title class="nxt1-picker-title">
          {{ title() }}
          @if (showCount() && maxCount() > 0) {
            <span class="nxt1-count-badge" [class.at-max]="isAtMax()">
              {{ currentCount() }}/{{ maxCount() }}
            </span>
          }
        </ion-title>

        <!-- Confirm Button -->
        <ion-buttons slot="end">
          <ion-button
            fill="clear"
            (click)="onConfirm()"
            nxtHaptic="medium"
            class="nxt1-confirm-btn"
            [class.active]="canConfirm()"
            [disabled]="!canConfirm()"
            data-testid="picker-confirm-btn"
          >
            {{ confirmText() }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <!-- Search Bar (if enabled) -->
      @if (showSearch()) {
        <ion-toolbar class="nxt1-search-toolbar">
          <div class="nxt1-search-container">
            <ion-icon name="search-outline" class="nxt1-search-icon" aria-hidden="true" />
            <ion-input
              #searchInput
              type="text"
              class="nxt1-search-input"
              [placeholder]="searchPlaceholder()"
              aria-label="Search"
              [value]="searchQuery()"
              (ionInput)="onSearchInput($event)"
              enterkeyhint="search"
              inputmode="search"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              data-testid="picker-search-input"
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
        </ion-toolbar>
      }
    </ion-header>

    <!-- Content Area (ng-content for picker-specific content) -->
    <ion-content class="nxt1-picker-content" [scrollY]="true">
      <ng-content />
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
       HEADER & TOOLBAR
       ============================================ */
      .nxt1-picker-header {
        --background: var(--nxt1-color-surface-elevated, #121212);
        /* Prevent header from being affected by safe areas incorrectly */
        padding-top: 0;
      }

      .nxt1-picker-header ion-toolbar:first-of-type {
        /* Remove top padding from first toolbar (modal handles safe area) */
        --padding-top: 0;
      }

      .nxt1-picker-toolbar {
        --background: var(--nxt1-color-surface-elevated, #121212);
        --border-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        --min-height: 56px;
        --padding-start: var(--nxt1-spacing-2, 8px);
        --padding-end: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-picker-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .nxt1-count-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-1, 4px) var(--nxt1-spacing-2, 8px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        min-width: 40px;
      }

      .nxt1-count-badge.at-max {
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        background: var(--nxt1-color-primary, #ccff00);
      }

      .nxt1-cancel-btn {
        --color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-family: var(--nxt1-fontFamily-brand);
        font-weight: 500;
      }

      .nxt1-confirm-btn {
        --color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-family: var(--nxt1-fontFamily-brand);
        font-weight: 600;
        transition: color var(--nxt1-duration-fast, 150ms) ease;
      }

      .nxt1-confirm-btn.active {
        --color: var(--nxt1-color-primary, #ccff00);
      }

      .nxt1-confirm-btn:disabled {
        opacity: 0.5;
      }

      /* ============================================
       SEARCH BAR
       ============================================ */
      .nxt1-search-toolbar {
        --background: var(--nxt1-color-surface-elevated, #121212);
        --border-width: 0;
        --padding-start: var(--nxt1-spacing-4, 16px);
        --padding-end: var(--nxt1-spacing-4, 16px);
        --padding-top: 0;
        --padding-bottom: var(--nxt1-spacing-3, 12px);
      }

      .nxt1-search-container {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
      }

      .nxt1-search-icon {
        position: absolute;
        left: var(--nxt1-spacing-3, 12px);
        font-size: var(--nxt1-fontSize-lg, 1.125rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        z-index: 1;
        pointer-events: none;
      }

      .nxt1-search-input {
        --background: var(--nxt1-color-surface-100);
        --border-radius: var(--nxt1-borderRadius-lg, 12px);
        --padding-start: 40px;
        --padding-end: 40px;
        --padding-top: var(--nxt1-spacing-3, 12px);
        --padding-bottom: var(--nxt1-spacing-3, 12px);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --color: var(--nxt1-color-text-primary, #ffffff);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base, 1rem);
        width: 100%;
        min-height: 44px;
        transition: all var(--nxt1-duration-fast, 150ms) ease-out;
      }

      .nxt1-search-input:hover {
        --background: var(--nxt1-color-surface-200);
      }

      .nxt1-search-clear {
        position: absolute;
        right: var(--nxt1-spacing-2, 8px);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        cursor: pointer;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-search-clear:hover {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .nxt1-search-clear ion-icon {
        font-size: var(--nxt1-fontSize-xl, 1.25rem);
      }

      /* ============================================
       CONTENT AREA
       ============================================ */
      .nxt1-picker-content {
        --background: var(--nxt1-color-surface-default, var(--ion-background-color, #0a0a0a));
        --padding-start: 0;
        --padding-end: 0;
        --padding-top: 0;
        --padding-bottom: env(safe-area-inset-bottom, 16px);
        /* Ensure content can scroll and doesn't clip */
        overflow-y: auto;
        flex: 1 1 auto;
        min-height: 0;
      }

      /* Ensure the scroll container has proper dimensions */
      .nxt1-picker-content::part(scroll) {
        overflow-y: auto;
        padding-bottom: var(--nxt1-spacing-4, 16px);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtPickerShellComponent implements AfterViewInit {
  // ============================================
  // DEPENDENCIES
  // ============================================

  // ============================================
  // VIEW CHILDREN
  // ============================================

  @ViewChild('searchInput', { read: ElementRef })
  searchInputRef?: ElementRef<HTMLIonInputElement>;

  // ============================================
  // INPUTS
  // ============================================

  /** Title displayed in the header */
  readonly title = input<string>('Select');

  /** Whether to show the search bar */
  readonly showSearch = input<boolean>(false);

  /** Placeholder for search input */
  readonly searchPlaceholder = input<string>('Search...');

  /** Whether to show the count badge */
  readonly showCount = input<boolean>(false);

  /** Current selection count */
  readonly currentCount = input<number>(0);

  /** Maximum selection count */
  readonly maxCount = input<number>(0);

  /** Text for confirm button */
  readonly confirmText = input<string>('Done');

  /** Text for cancel button */
  readonly cancelText = input<string>('Cancel');

  /** Whether confirmation is allowed (selection is valid) */
  readonly canConfirm = input<boolean>(true);

  /** Whether to auto-focus search on open */
  readonly autoFocusSearch = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emits when user confirms selection */
  readonly confirm = output<void>();

  /** Emits when user cancels/dismisses */
  readonly cancel = output<void>();

  /** Emits when search query changes */
  readonly searchChange = output<string>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Current search query */
  readonly searchQuery = signal<string>('');

  // ============================================
  // COMPUTED
  // ============================================

  /** Whether at maximum selection count */
  readonly isAtMax = computed(() => {
    const max = this.maxCount();
    return max > 0 && this.currentCount() >= max;
  });

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    addIcons({ close, closeCircle, searchOutline, checkmark });
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  ngAfterViewInit(): void {
    // Auto-focus search if enabled
    if (this.autoFocusSearch() && this.showSearch() && this.searchInputRef) {
      setTimeout(() => {
        this.searchInputRef?.nativeElement?.setFocus?.();
      }, 300);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Handle search input */
  onSearchInput(event: CustomEvent): void {
    const value = (event.target as HTMLInputElement)?.value || '';
    this.searchQuery.set(value);
    this.searchChange.emit(value);
  }

  /** Clear search query */
  clearSearch(): void {
    this.searchQuery.set('');
    this.searchChange.emit('');
    // Re-focus the input
    setTimeout(() => {
      this.searchInputRef?.nativeElement?.setFocus?.();
    }, 50);
  }

  /** Handle confirm button click */
  onConfirm(): void {
    if (this.canConfirm()) {
      this.confirm.emit();
    }
  }

  /** Handle cancel button click */
  onCancel(): void {
    this.cancel.emit();
  }
}
