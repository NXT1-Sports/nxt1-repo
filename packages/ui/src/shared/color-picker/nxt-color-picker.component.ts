/**
 * @fileoverview NxtColorPickerComponent - Cross-Platform Team Color Picker
 * @module @nxt1/ui/shared
 * @version 1.0.0
 *
 * Professional color picker component for team colors during onboarding.
 * Supports multiple colors with add/remove functionality.
 *
 * Features:
 * - Preset color palette (common team colors)
 * - Custom color input via native color picker
 * - Multiple colors support with add/remove
 * - Compact inline design
 * - Touch-friendly color swatches
 * - Accessible with ARIA labels
 * - Haptic feedback ready
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-color-picker
 *   [colors]="teamColors()"
 *   [maxColors]="4"
 *   [disabled]="isLoading()"
 *   (colorsChange)="onColorsChange($event)"
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
  ViewChild,
  ElementRef,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import type { ILogger } from '@nxt1/core/logging';
import { HapticButtonDirective } from '../../services/haptics';
import { NxtLoggingService } from '../../services/logging';

// ============================================
// CONSTANTS
// ============================================

/** Default preset colors (common team colors) */
const PRESET_COLORS: readonly string[] = [
  '#000000', // Black
  '#FFFFFF', // White
  '#FF0000', // Red
  '#00008B', // Navy Blue
  '#228B22', // Forest Green
  '#FFD700', // Gold
  '#800000', // Maroon
  '#FF8C00', // Orange
  '#4B0082', // Purple
  '#C0C0C0', // Silver
  '#CCFF00', // Lime (NXT1 primary)
  '#8B4513', // Brown
] as const;

/** Maximum number of colors allowed by default */
const DEFAULT_MAX_COLORS = 4;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-color-picker',
  standalone: true,
  imports: [CommonModule, HapticButtonDirective],
  template: `
    <div class="nxt1-color-picker" [attr.data-testid]="testId()">
      <!-- Label -->
      @if (label()) {
        <label class="nxt1-color-label">
          {{ label() }}
          @if (!required()) {
            <span class="nxt1-optional">(Optional)</span>
          }
        </label>
      }

      <!-- Selected Colors -->
      <div class="nxt1-selected-colors" role="list" aria-label="Selected team colors">
        @if (selectedColors().length === 0 && !showPalette()) {
          <span class="nxt1-color-placeholder">{{ placeholder() }}</span>
        }
        @for (color of selectedColors(); track $index) {
          <button
            type="button"
            class="nxt1-color-swatch nxt1-color-swatch--selected"
            [style.background-color]="color"
            [class.is-light]="isLightColor(color)"
            [disabled]="disabled()"
            (click)="onRemoveColor($index)"
            [attr.aria-label]="'Remove color ' + color"
            [attr.data-testid]="testId() + '-color-' + $index"
            nxtHaptic="selection"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              class="nxt1-remove-icon"
              aria-hidden="true"
            >
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        }

        <!-- Add Color Button -->
        @if (canAddMore()) {
          <button
            type="button"
            class="nxt1-color-swatch nxt1-color-swatch--add"
            [disabled]="disabled()"
            (click)="onAddColorClick()"
            aria-label="Add team color"
            [attr.data-testid]="testId() + '-add'"
            nxtHaptic="selection"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="nxt1-add-icon" aria-hidden="true">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        }
      </div>

      <!-- Color Palette (shown when adding) -->
      @if (showPalette()) {
        <div
          class="nxt1-color-palette"
          role="listbox"
          aria-label="Choose a color"
          [attr.data-testid]="testId() + '-palette'"
        >
          <!-- Preset Colors -->
          <div class="nxt1-preset-colors">
            @for (color of presetColors; track color) {
              <button
                type="button"
                class="nxt1-palette-swatch"
                [style.background-color]="color"
                [class.is-light]="isLightColor(color)"
                [class.is-selected]="isColorSelected(color)"
                [disabled]="disabled() || isColorSelected(color)"
                (click)="onSelectPresetColor(color)"
                [attr.aria-label]="'Select ' + color"
                [attr.aria-selected]="isColorSelected(color)"
                role="option"
                nxtHaptic="selection"
              >
                @if (isColorSelected(color)) {
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="nxt1-check-icon"
                    aria-hidden="true"
                  >
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                }
              </button>
            }
          </div>

          <!-- Custom Color Input -->
          <div class="nxt1-custom-color">
            <button
              type="button"
              class="nxt1-custom-color-button"
              [disabled]="disabled()"
              (click)="onCustomColorClick()"
              [attr.data-testid]="testId() + '-custom'"
              nxtHaptic="selection"
            >
              <span class="nxt1-custom-color-rainbow"></span>
              <span class="nxt1-custom-color-label">Custom</span>
            </button>
            <input
              #colorInput
              type="color"
              class="hidden"
              [value]="customColorValue()"
              (change)="onCustomColorChange($event)"
              [attr.data-testid]="testId() + '-custom-input'"
            />
          </div>

          <!-- Close palette button -->
          <button
            type="button"
            class="nxt1-palette-close"
            (click)="closePalette()"
            aria-label="Close color palette"
            nxtHaptic="light"
          >
            Done
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .hidden {
        display: none;
      }

      /* ============================================
       CONTAINER
       ============================================ */
      .nxt1-color-picker {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      /* ============================================
       LABEL
       ============================================ */
      .nxt1-color-label {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .nxt1-optional {
        font-weight: 400;
        color: var(--nxt1-color-text-tertiary);
        text-transform: none;
        font-size: 12px;
      }

      /* ============================================
       PLACEHOLDER TEXT
       ============================================ */
      .nxt1-color-placeholder {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
        color: var(--nxt1-color-text-tertiary);
        padding: var(--nxt1-spacing-2) 0;
      }

      /* ============================================
       SELECTED COLORS ROW
       ============================================ */
      .nxt1-selected-colors {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
        align-items: center;
      }

      /* ============================================
       COLOR SWATCH (both selected and add button)
       ============================================ */
      .nxt1-color-swatch {
        width: 40px;
        height: 40px;
        min-width: 40px;
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        border: 2px solid var(--nxt1-color-border-default);
        cursor: pointer;
        transition: all var(--nxt1-transition-fast, 150ms) ease;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-color-swatch:hover:not(:disabled) {
        transform: scale(1.05);
        border-color: var(--nxt1-color-border-strong);
      }

      .nxt1-color-swatch:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .nxt1-color-swatch:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Selected color swatch */
      .nxt1-color-swatch--selected {
        border-color: transparent;
        box-shadow:
          0 2px 4px rgba(0, 0, 0, 0.2),
          inset 0 0 0 1px rgba(255, 255, 255, 0.1);
      }

      .nxt1-color-swatch--selected.is-light {
        box-shadow:
          0 2px 4px rgba(0, 0, 0, 0.1),
          inset 0 0 0 1px rgba(0, 0, 0, 0.1);
      }

      /* Remove icon (hidden by default, shown on hover) */
      .nxt1-remove-icon {
        width: 16px;
        height: 16px;
        color: white;
        opacity: 0;
        transition: opacity var(--nxt1-transition-fast, 150ms) ease;
      }

      .nxt1-color-swatch--selected.is-light .nxt1-remove-icon {
        color: rgba(0, 0, 0, 0.8);
      }

      .nxt1-color-swatch--selected:hover .nxt1-remove-icon,
      .nxt1-color-swatch--selected:focus-visible .nxt1-remove-icon {
        opacity: 1;
      }

      /* Always show on touch devices */
      @media (hover: none) {
        .nxt1-color-swatch--selected .nxt1-remove-icon {
          opacity: 0.7;
        }
      }

      /* Add button swatch */
      .nxt1-color-swatch--add {
        background: var(--nxt1-color-state-hover);
        border-style: solid;
      }

      .nxt1-color-swatch--add:hover:not(:disabled) {
        background: var(--nxt1-color-alpha-primary5);
        border-color: var(--nxt1-color-primary);
      }

      .nxt1-add-icon {
        width: 20px;
        height: 20px;
        color: var(--nxt1-color-text-tertiary);
        transition: color var(--nxt1-transition-fast, 150ms) ease;
      }

      .nxt1-color-swatch--add:hover:not(:disabled) .nxt1-add-icon {
        color: var(--nxt1-color-primary);
      }

      /* ============================================
       COLOR PALETTE (dropdown)
       ============================================ */
      .nxt1-color-palette {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-bg-secondary);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        margin-top: var(--nxt1-spacing-2);
      }

      /* Preset colors grid */
      .nxt1-preset-colors {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: var(--nxt1-spacing-2);
      }

      @media (max-width: 360px) {
        .nxt1-preset-colors {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      /* Palette swatch */
      .nxt1-palette-swatch {
        width: 100%;
        aspect-ratio: 1;
        min-height: 36px;
        border-radius: var(--nxt1-borderRadius-md, 8px);
        border: 2px solid transparent;
        cursor: pointer;
        transition: all var(--nxt1-transition-fast, 150ms) ease;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-palette-swatch:hover:not(:disabled) {
        transform: scale(1.1);
        z-index: 1;
      }

      .nxt1-palette-swatch:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .nxt1-palette-swatch:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-palette-swatch.is-selected {
        border-color: var(--nxt1-color-primary);
        box-shadow: 0 0 0 2px var(--nxt1-color-alpha-primary30);
      }

      .nxt1-check-icon {
        width: 18px;
        height: 18px;
        color: white;
      }

      .nxt1-palette-swatch.is-light .nxt1-check-icon {
        color: rgba(0, 0, 0, 0.8);
      }

      /* Custom color button */
      .nxt1-custom-color {
        display: flex;
        align-items: center;
      }

      .nxt1-custom-color-button {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-state-hover);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-md, 8px);
        cursor: pointer;
        transition: all var(--nxt1-transition-fast, 150ms) ease;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-custom-color-button:hover:not(:disabled) {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-alpha-primary5);
      }

      .nxt1-custom-color-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nxt1-custom-color-rainbow {
        width: 24px;
        height: 24px;
        border-radius: var(--nxt1-borderRadius-sm, 4px);
        background: linear-gradient(
          to right,
          #ff0000,
          #ff8000,
          #ffff00,
          #00ff00,
          #00ffff,
          #0000ff,
          #8000ff
        );
      }

      .nxt1-custom-color-label {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
      }

      /* Done button */
      .nxt1-palette-close {
        align-self: flex-end;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        background: transparent;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-md, 8px);
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-size: 14px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition: all var(--nxt1-transition-fast, 150ms) ease;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-palette-close:hover {
        border-color: var(--nxt1-color-primary);
        color: var(--nxt1-color-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtColorPickerComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly loggingService = inject(NxtLoggingService);

  /** Namespaced logger for this component */
  private readonly logger: ILogger = this.loggingService.child('ColorPicker');

  /** Reference to the hidden color input element */
  @ViewChild('colorInput') colorInputRef!: ElementRef<HTMLInputElement>;

  // ============================================
  // SIGNAL INPUTS (Angular 19+ pattern)
  // ============================================

  /** Current selected colors */
  readonly colors = input<string[]>([]);

  /** Maximum number of colors allowed */
  readonly maxColors = input<number>(DEFAULT_MAX_COLORS);

  /** Whether a color is required */
  readonly required = input<boolean>(false);

  /** Label for the color picker */
  readonly label = input<string | null>(null);

  /** Placeholder text when no colors selected */
  readonly placeholder = input<string>('Add team colors');

  /** Whether interaction is disabled */
  readonly disabled = input<boolean>(false);

  /** Test ID for E2E testing */
  readonly testId = input<string>('color-picker');

  // ============================================
  // SIGNAL OUTPUTS (Angular 19+ pattern)
  // ============================================

  /** Emits when colors change */
  readonly colorsChange = output<string[]>();

  // ============================================
  // CONFIGURATION
  // ============================================

  /** Preset colors palette */
  readonly presetColors = PRESET_COLORS;

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Currently selected colors (local copy) */
  readonly selectedColors = signal<string[]>([]);

  /** Whether the color palette is visible */
  readonly showPalette = signal(false);

  /** Current custom color value */
  readonly customColorValue = signal('#CCFF00');

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Whether more colors can be added */
  readonly canAddMore = computed(() => this.selectedColors().length < this.maxColors());

  /** Whether running in browser (SSR safety) */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Sync internal state when colors input changes
    effect(
      () => {
        const inputColors = this.colors();
        this.selectedColors.set([...inputColors]);
      },
      { allowSignalWrites: true }
    );
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Check if a color is light (for contrast)
   */
  isLightColor(hex: string): boolean {
    // Remove # if present
    const color = hex.replace('#', '');

    // Parse RGB values
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.5;
  }

  /**
   * Check if a color is already selected
   */
  isColorSelected(color: string): boolean {
    return this.selectedColors().some((c) => c.toLowerCase() === color.toLowerCase());
  }

  /**
   * Close the color palette
   */
  closePalette(): void {
    this.showPalette.set(false);
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /**
   * Handle add color button click
   */
  onAddColorClick(): void {
    this.showPalette.set(true);
    this.logger.debug('Color palette opened');
  }

  /**
   * Handle removing a color
   */
  onRemoveColor(index: number): void {
    const currentColors = this.selectedColors();
    const removedColor = currentColors[index];
    const newColors = currentColors.filter((_, i) => i !== index);

    this.selectedColors.set(newColors);
    this.colorsChange.emit(newColors);

    this.logger.debug('Color removed', { removedColor, index, remainingColors: newColors.length });
  }

  /**
   * Handle selecting a preset color
   */
  onSelectPresetColor(color: string): void {
    if (this.isColorSelected(color) || !this.canAddMore()) return;

    const newColors = [...this.selectedColors(), color];
    this.selectedColors.set(newColors);
    this.colorsChange.emit(newColors);

    this.logger.debug('Preset color selected', { color, totalColors: newColors.length });

    // Auto-close if max colors reached
    if (newColors.length >= this.maxColors()) {
      this.showPalette.set(false);
    }
  }

  /**
   * Handle custom color button click
   */
  onCustomColorClick(): void {
    if (this.isBrowser && this.colorInputRef?.nativeElement) {
      this.colorInputRef.nativeElement.click();
    }
  }

  /**
   * Handle custom color selection
   */
  onCustomColorChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const color = input.value.toUpperCase();

    if (!this.canAddMore()) {
      this.logger.warn('Cannot add more colors', { maxColors: this.maxColors() });
      return;
    }

    // Check if color is already selected
    if (this.isColorSelected(color)) {
      this.logger.debug('Color already selected', { color });
      return;
    }

    const newColors = [...this.selectedColors(), color];
    this.selectedColors.set(newColors);
    this.customColorValue.set(color);
    this.colorsChange.emit(newColors);

    this.logger.debug('Custom color selected', { color, totalColors: newColors.length });

    // Auto-close if max colors reached
    if (newColors.length >= this.maxColors()) {
      this.showPalette.set(false);
    }
  }
}
