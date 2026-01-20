/**
 * @fileoverview NxtChipComponent - Cross-Platform Selectable Chip/Pill
 * @module @nxt1/ui/shared
 * @version 1.0.0
 *
 * Reusable chip/pill component for selection interfaces.
 * Used for graduation year, positions, sports, tags, and filters.
 *
 * Features:
 * - Single or multi-select modes
 * - Optional checkmark icon when selected
 * - Fully accessible with ARIA support
 * - Haptic feedback ready
 * - Design token based styling
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <!-- Simple chip -->
 * <nxt1-chip
 *   [selected]="isSelected"
 *   [disabled]="isLoading"
 *   (chipClick)="onSelect()"
 * >
 *   2026
 * </nxt1-chip>
 *
 * <!-- Chip with checkmark -->
 * <nxt1-chip
 *   [selected]="isSelected"
 *   [showCheck]="true"
 *   (chipClick)="onSelect()"
 * >
 *   Point Guard
 * </nxt1-chip>
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, input, output, ChangeDetectionStrategy, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HapticButtonDirective } from '../../services/haptics';

// ============================================
// TYPES
// ============================================

/**
 * Chip size variants
 * - 'sm': Compact size for dense layouts
 * - 'md': Default size for most use cases
 * - 'lg': Larger size for emphasis
 */
export type ChipSize = 'sm' | 'md' | 'lg';

/**
 * Chip variant for different visual styles
 * - 'default': Standard outlined chip
 * - 'filled': Solid background (used for tags)
 */
export type ChipVariant = 'default' | 'filled';

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-chip',
  standalone: true,
  imports: [CommonModule, HapticButtonDirective],
  template: `
    <button
      type="button"
      class="nxt1-chip"
      [class.selected]="selected()"
      [class.nxt1-chip--sm]="size() === 'sm'"
      [class.nxt1-chip--lg]="size() === 'lg'"
      [class.nxt1-chip--filled]="variant() === 'filled'"
      [disabled]="disabled()"
      [attr.aria-pressed]="ariaRole() === 'toggle' ? selected() : null"
      [attr.aria-checked]="ariaRole() === 'radio' ? selected() : null"
      [attr.role]="ariaRole() === 'radio' ? 'radio' : null"
      [attr.data-testid]="testId()"
      (click)="onClick($event)"
      nxtHaptic="selection"
    >
      <span class="nxt1-chip__content">
        <ng-content />
      </span>
      @if (showCheck() && selected()) {
        <span class="nxt1-chip__check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </span>
      }
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }

      /* ============================================
       BASE CHIP STYLES
       ============================================ */
      .nxt1-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1-5);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        min-width: 80px;
        min-height: 44px;
        background: var(--nxt1-color-state-hover);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        cursor: pointer;
        transition: all var(--nxt1-transition-fast, 150ms) ease;
        -webkit-tap-highlight-color: transparent;
      }

      /* ============================================
       CHIP CONTENT
       ============================================ */
      .nxt1-chip__content {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 15px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        white-space: nowrap;
        line-height: 1.3;
      }

      /* ============================================
       SIZE VARIANTS
       ============================================ */
      .nxt1-chip--sm {
        padding: var(--nxt1-spacing-1-5) var(--nxt1-spacing-3);
        min-width: 48px;
      }

      .nxt1-chip--sm .nxt1-chip__content {
        font-size: 12px;
      }

      .nxt1-chip--lg {
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-5);
        min-width: 80px;
      }

      .nxt1-chip--lg .nxt1-chip__content {
        font-size: 16px;
      }

      /* ============================================
       FILLED VARIANT
       ============================================ */
      .nxt1-chip--filled {
        background: var(--nxt1-color-alpha-primary10);
        border-color: transparent;
      }

      .nxt1-chip--filled .nxt1-chip__content {
        color: var(--nxt1-color-text-primary);
      }

      /* ============================================
       INTERACTIVE STATES
       ============================================ */
      .nxt1-chip:hover:not(:disabled):not(.selected) {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-alpha-primary5);
      }

      .nxt1-chip:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .nxt1-chip:active:not(:disabled) {
        transform: scale(0.98);
      }

      /* ============================================
       SELECTED STATE
       ============================================ */
      .nxt1-chip.selected {
        background: var(--nxt1-color-primary);
        border-color: var(--nxt1-color-primary);
      }

      .nxt1-chip.selected .nxt1-chip__content {
        color: var(--nxt1-color-text-onPrimary);
      }

      /* ============================================
       DISABLED STATE
       ============================================ */
      .nxt1-chip:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* ============================================
       CHECKMARK ICON
       ============================================ */
      .nxt1-chip__check {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-onPrimary);
        flex-shrink: 0;
      }

      .nxt1-chip__check svg {
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtChipComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Whether the chip is selected */
  readonly selected = input<boolean>(false);

  /** Whether the chip is disabled */
  readonly disabled = input<boolean>(false);

  /** Whether to show checkmark when selected */
  readonly showCheck = input<boolean>(false);

  /** Chip size variant */
  readonly size = input<ChipSize>('md');

  /** Chip visual variant */
  readonly variant = input<ChipVariant>('default');

  /** Test ID for E2E testing */
  readonly testId = input<string | null>(null);

  /**
   * ARIA role behavior:
   * - 'toggle': Uses aria-pressed (for multi-select)
   * - 'radio': Uses role="radio" and aria-checked (for single select in radiogroup)
   * - 'button': No additional ARIA (for action buttons)
   */
  readonly ariaRole = input<'toggle' | 'radio' | 'button'>('toggle');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when chip is clicked */
  readonly chipClick = output<void>();

  // ============================================
  // HOST BINDINGS
  // ============================================

  @HostBinding('class.nxt1-chip-host--selected')
  get hostSelected(): boolean {
    return this.selected();
  }

  @HostBinding('class.nxt1-chip-host--disabled')
  get hostDisabled(): boolean {
    return this.disabled();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle chip click
   * Prevents default and emits chipClick event
   */
  onClick(event: Event): void {
    event.preventDefault();
    if (!this.disabled()) {
      this.chipClick.emit();
    }
  }
}
