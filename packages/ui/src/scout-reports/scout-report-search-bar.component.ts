/**
 * @fileoverview Scout Report Search Bar Component
 * @module @nxt1/ui/scout-reports
 * @version 1.0.0
 *
 * Reusable search bar with autocomplete suggestions and debounce.
 * Native-feeling with clear button and cancel functionality.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Debounced search input
 * - Clear button
 * - Cancel button (mobile)
 * - Search icon animation
 * - Placeholder text
 *
 * @example
 * ```html
 * <nxt1-scout-report-search-bar
 *   [value]="searchQuery()"
 *   placeholder="Search athletes..."
 *   (valueChange)="onSearchChange($event)"
 *   (search)="onSearch($event)"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonSearchbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { searchOutline, closeCircle } from 'ionicons/icons';

// Register icons
addIcons({ searchOutline, closeCircle });

@Component({
  selector: 'nxt1-scout-report-search-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, IonSearchbar],
  template: `
    <div class="search-bar" [class.search-bar--focused]="isFocused()">
      <ion-searchbar
        [value]="internalValue()"
        [placeholder]="placeholder()"
        [debounce]="debounce()"
        [animated]="true"
        [showCancelButton]="showCancelButton()"
        cancelButtonText="Cancel"
        (ionInput)="onInput($event)"
        (ionChange)="onChange($event)"
        (ionFocus)="onFocus()"
        (ionBlur)="onBlur()"
        (ionCancel)="onCancel()"
        (ionClear)="onClear()"
      />
    </div>
  `,
  styles: [
    `
      /* ============================================
         SEARCH BAR CONTAINER
         ============================================ */

      :host {
        display: block;
        flex: 1;
        min-width: 0;
      }

      .search-bar {
        --background: var(--nxt1-color-surface-elevated, #252525);
        --border-radius: var(--nxt1-radius-lg, 12px);
        --box-shadow: none;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --icon-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --clear-button-color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --cancel-button-color: var(--nxt1-color-primary, #3b82f6);

        transition: all 0.2s ease;
      }

      .search-bar--focused {
        --icon-color: var(--nxt1-color-primary, #3b82f6);
      }

      /* ============================================
         ION-SEARCHBAR OVERRIDES
         ============================================ */

      ion-searchbar {
        --background: var(--nxt1-color-surface-elevated, #252525);
        --border-radius: var(--nxt1-radius-lg, 12px);
        --box-shadow: none;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --placeholder-opacity: 1;
        --icon-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --clear-button-color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --cancel-button-color: var(--nxt1-color-primary, #3b82f6);
        padding: 0;
        min-height: 40px;
      }

      ion-searchbar::part(native) {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        transition: border-color 0.2s ease;
      }

      .search-bar--focused ion-searchbar::part(native) {
        border-color: var(--nxt1-color-primary-alpha-50, rgba(59, 130, 246, 0.5));
      }

      /* ============================================
         THEME VARIANTS
         ============================================ */

      :host-context(.light-theme) {
        .search-bar {
          --background: var(--nxt1-color-gray-100, #f3f4f6);
          --color: var(--nxt1-color-gray-900, #111827);
          --placeholder-color: var(--nxt1-color-gray-500, #6b7280);
          --icon-color: var(--nxt1-color-gray-400, #9ca3af);
          --clear-button-color: var(--nxt1-color-gray-500, #6b7280);
        }

        ion-searchbar {
          --background: var(--nxt1-color-gray-100, #f3f4f6);
          --color: var(--nxt1-color-gray-900, #111827);
          --placeholder-color: var(--nxt1-color-gray-500, #6b7280);
          --icon-color: var(--nxt1-color-gray-400, #9ca3af);
          --clear-button-color: var(--nxt1-color-gray-500, #6b7280);
        }

        ion-searchbar::part(native) {
          border-color: var(--nxt1-color-gray-200, #e5e7eb);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutReportSearchBarComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Current search value */
  readonly value = input<string>('');

  /** Placeholder text */
  readonly placeholder = input<string>(
    'Search anything (athletes, videos, colleges, teams, and more)'
  );

  /** Debounce time in ms */
  readonly debounce = input<number>(300);

  /** Show cancel button */
  readonly showCancelButton = input<'focus' | 'never' | 'always'>('focus');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when value changes (debounced) */
  readonly valueChange = output<string>();

  /** Emitted when search is submitted */
  readonly search = output<string>();

  /** Emitted when search is cleared */
  readonly clear = output<void>();

  /** Emitted when cancel is pressed */
  readonly cancel = output<void>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Whether input is focused */
  protected readonly isFocused = signal(false);

  /** Internal value for two-way binding */
  protected readonly internalValue = signal('');

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Sync external value to internal
    effect(() => {
      this.internalValue.set(this.value());
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle input event (debounced).
   */
  protected onInput(event: CustomEvent): void {
    const value = event.detail.value ?? '';
    this.internalValue.set(value);
    this.valueChange.emit(value);
  }

  /**
   * Handle change event (on blur/enter).
   */
  protected onChange(event: CustomEvent): void {
    const value = event.detail.value ?? '';
    this.search.emit(value);
  }

  /**
   * Handle focus.
   */
  protected onFocus(): void {
    this.isFocused.set(true);
  }

  /**
   * Handle blur.
   */
  protected onBlur(): void {
    this.isFocused.set(false);
  }

  /**
   * Handle cancel button.
   */
  protected onCancel(): void {
    this.internalValue.set('');
    this.valueChange.emit('');
    this.cancel.emit();
  }

  /**
   * Handle clear button.
   */
  protected onClear(): void {
    this.internalValue.set('');
    this.valueChange.emit('');
    this.clear.emit();
  }
}
