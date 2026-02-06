/**
 * @fileoverview Theme Selector Component - Professional Theme Picker (2026)
 * @module @nxt1/ui/components/theme-selector
 * @version 2.0.0
 *
 * Modern theme selector with appearance mode AND sport color themes.
 * Inspired by iOS Settings, Twitter/X, Discord, and Spotify theme pickers.
 *
 * Features:
 * - Appearance: System/Light/Dark with animated selection
 * - Sport Colors: Football/Basketball/Baseball/Softball themes
 * - Real-time theme preview
 * - Accessible (keyboard navigation, ARIA)
 * - Haptic feedback on selection
 * - Ionic icons for native feel
 *
 * Usage:
 * ```html
 * <nxt1-theme-selector />
 *
 * <!-- Compact variant for sidenav -->
 * <nxt1-theme-selector variant="compact" />
 *
 * <!-- Appearance only (no sport colors) -->
 * <nxt1-theme-selector [showSportThemes]="false" />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  inject,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  contrastOutline,
  sunnyOutline,
  moonOutline,
  phonePortraitOutline,
  sparkles,
  checkmark,
  checkmarkCircle,
  colorPaletteOutline,
  americanFootballOutline,
  basketballOutline,
  baseballOutline,
} from 'ionicons/icons';
import { HapticsService } from '../../services/haptics';
import {
  NxtThemeService,
  THEME_OPTIONS,
  SPORT_THEME_OPTIONS,
  type ThemePreference,
  type ThemeOption,
  type SportTheme,
  type SportThemeOption,
} from '../../services/theme';

/** Component variant */
export type ThemeSelectorVariant = 'default' | 'compact' | 'inline';

/** Theme selection event */
export interface ThemeSelectEvent {
  type: 'appearance' | 'sport';
  theme: ThemePreference | SportTheme | null;
  timestamp: number;
}

@Component({
  selector: 'nxt1-theme-selector',
  standalone: true,
  imports: [IonIcon],
  template: `
    <div
      class="theme-selector"
      [class.theme-selector--compact]="variant === 'compact'"
      [class.theme-selector--inline]="variant === 'inline'"
    >
      <!-- APPEARANCE SECTION -->
      @if (showAppearance) {
        <section class="theme-section" role="group" aria-labelledby="appearance-label">
          @if (showLabels) {
            <h3 id="appearance-label" class="theme-section__title">
              <ion-icon name="contrast-outline" class="theme-section__icon"></ion-icon>
              Appearance
            </h3>
          }

          <div class="theme-options" role="radiogroup" aria-label="Theme mode">
            @for (option of themeOptions; track option.id) {
              <button
                type="button"
                class="theme-option"
                [class.theme-option--selected]="themeService.preference() === option.id"
                role="radio"
                [attr.aria-checked]="themeService.preference() === option.id"
                [attr.aria-label]="option.label"
                (click)="selectAppearance(option)"
              >
                <div class="theme-option__icon-wrapper">
                  <ion-icon [name]="option.icon" class="theme-option__icon"></ion-icon>
                </div>
                <span class="theme-option__label">{{ option.label }}</span>
                @if (themeService.preference() === option.id) {
                  <div class="theme-option__check">
                    <ion-icon name="checkmark" class="theme-option__check-icon"></ion-icon>
                  </div>
                }
              </button>
            }
          </div>
        </section>
      }

      <!-- SPORT COLORS SECTION -->
      @if (showSportThemes) {
        <section
          class="theme-section theme-section--sport"
          role="group"
          aria-labelledby="sport-label"
        >
          @if (showLabels) {
            <h3 id="sport-label" class="theme-section__title">
              <ion-icon name="color-palette-outline" class="theme-section__icon"></ion-icon>
              Sport Colors
            </h3>
          }

          <div class="sport-options">
            <!-- Default (No sport theme) -->
            <button
              type="button"
              class="sport-option"
              [class.sport-option--selected]="!themeService.hasSportTheme()"
              role="radio"
              [attr.aria-checked]="!themeService.hasSportTheme()"
              aria-label="NXT1 Default (Volt Green)"
              (click)="clearSportTheme()"
            >
              <div class="sport-option__color sport-option__color--default">
                <ion-icon name="sparkles" class="sport-option__icon"></ion-icon>
              </div>
              <span class="sport-option__label">Default</span>
              @if (!themeService.hasSportTheme()) {
                <ion-icon name="checkmark-circle" class="sport-option__check"></ion-icon>
              }
            </button>

            <!-- Sport themes -->
            @for (sport of sportOptions; track sport.id) {
              <button
                type="button"
                class="sport-option"
                [class.sport-option--selected]="themeService.sportTheme() === sport.id"
                role="radio"
                [attr.aria-checked]="themeService.sportTheme() === sport.id"
                [attr.aria-label]="sport.label"
                (click)="selectSport(sport)"
              >
                <div class="sport-option__color" [style.--sport-color]="sport.primaryColor">
                  <ion-icon [name]="sport.icon" class="sport-option__icon"></ion-icon>
                </div>
                <span class="sport-option__label">{{ sport.label }}</span>
                @if (themeService.sportTheme() === sport.id) {
                  <ion-icon name="checkmark-circle" class="sport-option__check"></ion-icon>
                }
              </button>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         CSS CUSTOM PROPERTIES
         ============================================ */
      :host {
        display: block;
        --section-gap: 20px;
        --option-gap: 8px;

        --bg-surface: var(--nxt1-color-surface-100);
        --bg-hover: var(--nxt1-color-surface-200);
        --bg-selected: var(--nxt1-color-alpha-primary10);
        --border-selected: var(--nxt1-color-primary);
        --border-radius: var(--nxt1-borderRadius-lg, 12px);

        --text-primary: var(--nxt1-color-text-primary);
        --text-secondary: var(--nxt1-color-text-secondary);
        --text-tertiary: var(--nxt1-color-text-tertiary);

        --accent: var(--nxt1-color-primary);
        --accent-text: var(--nxt1-color-text-onPrimary, #000);
      }

      /* Compact variant */
      :host .theme-selector--compact {
        --section-gap: 16px;
        --option-gap: 6px;
      }

      /* ============================================
         CONTAINER
         ============================================ */
      .theme-selector {
        display: flex;
        flex-direction: column;
        gap: var(--section-gap);
      }

      .theme-selector--inline {
        flex-direction: row;
        align-items: flex-start;
        gap: 24px;
      }

      /* ============================================
         SECTION
         ============================================ */
      .theme-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .theme-selector--compact .theme-section {
        gap: 8px;
      }

      .theme-section__title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        padding: 0 4px;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 11px;
        font-weight: 600;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.8px;
      }

      .theme-section__icon {
        font-size: 14px;
      }

      /* ============================================
         APPEARANCE OPTIONS
         ============================================ */
      .theme-options {
        display: flex;
        gap: var(--option-gap);
        padding: 4px;
        background: var(--bg-surface);
        border-radius: var(--border-radius);
      }

      .theme-option {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 12px 8px;
        background: transparent;
        border: 2px solid transparent;
        border-radius: calc(var(--border-radius) - 4px);
        cursor: pointer;
        transition: all 150ms ease-out;
        position: relative;

        /* Mobile touch optimization */
        -webkit-tap-highlight-color: transparent;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        touch-action: manipulation;
      }

      .theme-selector--compact .theme-option {
        padding: 10px 6px;
        gap: 4px;
      }

      .theme-option:hover {
        background: var(--bg-hover);
      }

      .theme-option:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      .theme-option--selected {
        background: var(--bg-selected);
        border-color: var(--border-selected);
      }

      .theme-option--selected:hover {
        background: var(--bg-selected);
      }

      .theme-option__icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--bg-hover);
        transition: all 150ms ease-out;
      }

      .theme-selector--compact .theme-option__icon-wrapper {
        width: 32px;
        height: 32px;
      }

      .theme-option__icon {
        font-size: 20px;
        color: var(--text-secondary);
        transition: all 150ms ease-out;
      }

      .theme-selector--compact .theme-option__icon {
        font-size: 16px;
      }

      .theme-option--selected .theme-option__icon-wrapper {
        background: var(--accent);
      }

      .theme-option--selected .theme-option__icon {
        color: var(--accent-text);
      }

      .theme-option__label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 12px;
        font-weight: 500;
        color: var(--text-secondary);
        transition: color 150ms ease-out;
      }

      .theme-selector--compact .theme-option__label {
        font-size: 11px;
      }

      .theme-option--selected .theme-option__label {
        color: var(--text-primary);
        font-weight: 600;
      }

      .theme-option__check {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--accent);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: check-pop 200ms ease-out;
      }

      .theme-option__check-icon {
        font-size: 10px;
        color: var(--accent-text);
      }

      /* ============================================
         SPORT COLOR OPTIONS
         ============================================ */
      .sport-options {
        display: flex;
        gap: 10px;
        overflow-x: auto;
        padding: 4px;
        margin: -4px;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }

      .sport-options::-webkit-scrollbar {
        display: none;
      }

      .sport-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 8px;
        background: transparent;
        border: none;
        border-radius: var(--border-radius);
        cursor: pointer;
        transition: all 150ms ease-out;
        position: relative;
        flex-shrink: 0;
        min-width: 64px;

        /* Mobile touch optimization */
        -webkit-tap-highlight-color: transparent;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        touch-action: manipulation;
      }

      .theme-selector--compact .sport-option {
        padding: 6px;
        gap: 4px;
        min-width: 56px;
      }

      .sport-option:hover {
        background: var(--bg-hover);
      }

      .sport-option:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      .sport-option--selected {
        background: var(--bg-selected);
      }

      .sport-option__color {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--sport-color, var(--accent));
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 150ms ease-out;
        box-shadow: 0 2px 8px var(--sport-color, var(--accent));
        opacity: 0.9;
      }

      .theme-selector--compact .sport-option__color {
        width: 36px;
        height: 36px;
      }

      .sport-option--selected .sport-option__color {
        opacity: 1;
        transform: scale(1.05);
        box-shadow: 0 4px 16px var(--sport-color, var(--accent));
      }

      .sport-option__color--default {
        background: linear-gradient(135deg, #ccff00 0%, #a3cc00 100%);
        box-shadow: 0 2px 8px rgba(204, 255, 0, 0.4);
      }

      .sport-option--selected .sport-option__color--default {
        box-shadow: 0 4px 16px rgba(204, 255, 0, 0.5);
      }

      .sport-option__icon {
        font-size: 22px;
        color: #000;
      }

      .theme-selector--compact .sport-option__icon {
        font-size: 18px;
      }

      .sport-option__label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 11px;
        font-weight: 500;
        color: var(--text-secondary);
        transition: color 150ms ease-out;
        white-space: nowrap;
      }

      .theme-selector--compact .sport-option__label {
        font-size: 10px;
      }

      .sport-option--selected .sport-option__label {
        color: var(--text-primary);
        font-weight: 600;
      }

      .sport-option__check {
        position: absolute;
        top: 4px;
        right: 4px;
        font-size: 16px;
        color: var(--accent);
        animation: check-pop 200ms ease-out;
      }

      /* ============================================
         ANIMATIONS
         ============================================ */
      @keyframes check-pop {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        50% {
          transform: scale(1.2);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* ============================================
         RESPONSIVE
         ============================================ */
      @media (max-width: 380px) {
        .theme-option__label {
          font-size: 11px;
        }

        .sport-option__label {
          font-size: 10px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtThemeSelectorComponent {
  protected readonly themeService = inject(NxtThemeService);
  private readonly haptics = inject(HapticsService);

  /** Component variant */
  @Input() variant: ThemeSelectorVariant = 'default';

  /** Whether to show section labels */
  @Input() showLabels = true;

  /** Whether to show appearance mode options (System/Light/Dark) */
  @Input() showAppearance = true;

  /** Whether to show sport theme options */
  @Input() showSportThemes = true;

  /** Theme selection event */
  @Output() themeSelect = new EventEmitter<ThemeSelectEvent>();

  /** Available appearance options */
  protected readonly themeOptions: readonly ThemeOption[] = THEME_OPTIONS;

  /** Available sport theme options */
  protected readonly sportOptions: readonly SportThemeOption[] = SPORT_THEME_OPTIONS;

  constructor() {
    // Register Ionicons used by this component
    addIcons({
      'contrast-outline': contrastOutline,
      'sunny-outline': sunnyOutline,
      'moon-outline': moonOutline,
      'phone-portrait-outline': phonePortraitOutline,
      sparkles,
      checkmark,
      'checkmark-circle': checkmarkCircle,
      'color-palette-outline': colorPaletteOutline,
      'american-football-outline': americanFootballOutline,
      'basketball-outline': basketballOutline,
      'baseball-outline': baseballOutline,
    });
  }

  /**
   * Handle appearance theme selection.
   */
  protected selectAppearance(option: ThemeOption): void {
    console.log('[ThemeSelector] selectAppearance clicked:', option.id);
    console.log('[ThemeSelector] current preference:', this.themeService.preference());

    if (this.themeService.preference() === option.id) {
      console.log('[ThemeSelector] Same theme selected, skipping');
      return;
    }

    console.log('[ThemeSelector] Calling haptics and setTheme');
    void this.haptics.impact('light');
    this.themeService.setTheme(option.id);

    this.themeSelect.emit({
      type: 'appearance',
      theme: option.id,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle sport theme selection.
   */
  protected selectSport(sport: SportThemeOption): void {
    if (this.themeService.sportTheme() === sport.id) return;

    void this.haptics.impact('medium');
    this.themeService.setSportTheme(sport.id);

    this.themeSelect.emit({
      type: 'sport',
      theme: sport.id,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear sport theme (revert to default NXT1 colors).
   */
  protected clearSportTheme(): void {
    if (!this.themeService.hasSportTheme()) return;

    void this.haptics.impact('light');
    this.themeService.clearSportTheme();

    this.themeSelect.emit({
      type: 'sport',
      theme: null,
      timestamp: Date.now(),
    });
  }
}
