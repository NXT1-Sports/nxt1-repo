/**
 * @fileoverview NxtBackButtonComponent - Cross-Platform Navigation Back Button
 * @module @nxt1/ui/components/back-button
 * @version 1.0.0
 *
 * Professional-grade, accessible back button component built on the design token system.
 * Uses NxtIconComponent for consistent iconography across platforms.
 *
 * Features:
 * - Platform-aware icons: chevronLeft for iOS, arrowBack for Android/web
 * - Touch-optimized: Minimum 44px hit target (iOS HIG compliance)
 * - Design token integration: Sizing, colors, transitions from design system
 * - Haptic feedback: Tactile response on native platforms
 * - Full accessibility: ARIA labels, focus states, keyboard navigation
 * - SSR-safe: No browser dependencies in render
 *
 * @example
 * ```html
 * <!-- Basic usage -->
 * <nxt1-back-button (click)="goBack()" />
 *
 * <!-- With custom aria label -->
 * <nxt1-back-button
 *   ariaLabel="Return to previous page"
 *   (click)="goBack()"
 * />
 *
 * <!-- Different sizes -->
 * <nxt1-back-button size="sm" (click)="goBack()" />
 * <nxt1-back-button size="lg" (click)="goBack()" />
 *
 * <!-- Custom variant -->
 * <nxt1-back-button variant="floating" (click)="goBack()" />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../icon';
import { HapticsService } from '../../services/haptics';

/**
 * Back button size variants mapped to design tokens
 */
export type BackButtonSize = 'sm' | 'md' | 'lg';

/**
 * Back button visual variants
 */
export type BackButtonVariant = 'default' | 'floating' | 'ghost' | 'solid';

@Component({
  selector: 'nxt1-back-button',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <button
      type="button"
      class="nxt1-back-button"
      [class.nxt1-back-button--sm]="size() === 'sm'"
      [class.nxt1-back-button--md]="size() === 'md'"
      [class.nxt1-back-button--lg]="size() === 'lg'"
      [class.nxt1-back-button--floating]="variant() === 'floating'"
      [class.nxt1-back-button--ghost]="variant() === 'ghost'"
      [class.nxt1-back-button--solid]="variant() === 'solid'"
      [class.nxt1-back-button--disabled]="disabled()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel() || 'Go back'"
      [attr.data-testid]="testId()"
      (click)="onClick($event)"
    >
      <span class="nxt1-back-button__icon-wrapper">
        <nxt1-icon [name]="iconName()" class="nxt1-back-button__icon" [ariaHidden]="true" />
      </span>
    </button>
  `,
  styles: [
    `
      /* ============================================
         BACK BUTTON - Design Token Integration
         ============================================ */

      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;

        /* Design tokens for back button */
        --nxt1-back-button-size-sm: var(--nxt1-component-backButton-size-sm, 36px);
        --nxt1-back-button-size-md: var(--nxt1-component-backButton-size-md, 44px);
        --nxt1-back-button-size-lg: var(--nxt1-component-backButton-size-lg, 48px);
        --nxt1-back-button-icon-sm: var(--nxt1-component-backButton-iconSize-sm, 20px);
        --nxt1-back-button-icon-md: var(--nxt1-component-backButton-iconSize-md, 24px);
        --nxt1-back-button-icon-lg: var(--nxt1-component-backButton-iconSize-lg, 28px);
        --nxt1-back-button-radius: var(
          --nxt1-component-backButton-borderRadius,
          var(--nxt1-border-radius-full, 9999px)
        );
        --nxt1-back-button-transition: var(--nxt1-motion-duration-fast, 150ms)
          var(--nxt1-motion-easing-standard, ease-out);

        /* Color tokens */
        --nxt1-back-button-color: var(--nxt1-color-text-primary, currentColor);
        --nxt1-back-button-color-hover: var(--nxt1-color-text-primary, currentColor);
        --nxt1-back-button-bg: transparent;
        --nxt1-back-button-bg-hover: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.08));
        --nxt1-back-button-bg-active: var(--nxt1-color-state-pressed, rgba(255, 255, 255, 0.12));
      }

      .nxt1-back-button {
        /* Reset */
        appearance: none;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;

        /* Layout */
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        /* Sizing - default to md */
        width: var(--nxt1-back-button-size-md);
        height: var(--nxt1-back-button-size-md);
        min-width: 44px; /* iOS HIG: minimum touch target */
        min-height: 44px;

        /* Appearance */
        background: var(--nxt1-back-button-bg);
        color: var(--nxt1-back-button-color);
        border-radius: var(--nxt1-back-button-radius);

        /* Transitions */
        transition:
          background-color var(--nxt1-back-button-transition),
          color var(--nxt1-back-button-transition),
          transform var(--nxt1-back-button-transition),
          opacity var(--nxt1-back-button-transition);
      }

      /* Size variants */
      .nxt1-back-button--sm {
        width: var(--nxt1-back-button-size-sm);
        height: var(--nxt1-back-button-size-sm);
        min-width: 36px;
        min-height: 36px;
      }

      .nxt1-back-button--sm .nxt1-back-button__icon-wrapper {
        width: var(--nxt1-back-button-icon-sm);
        height: var(--nxt1-back-button-icon-sm);
      }

      .nxt1-back-button--md .nxt1-back-button__icon-wrapper {
        width: var(--nxt1-back-button-icon-md);
        height: var(--nxt1-back-button-icon-md);
      }

      .nxt1-back-button--lg {
        width: var(--nxt1-back-button-size-lg);
        height: var(--nxt1-back-button-size-lg);
      }

      .nxt1-back-button--lg .nxt1-back-button__icon-wrapper {
        width: var(--nxt1-back-button-icon-lg);
        height: var(--nxt1-back-button-icon-lg);
      }

      /* Hover state (desktop only) */
      @media (hover: hover) and (pointer: fine) {
        .nxt1-back-button:hover:not(:disabled) {
          background: var(--nxt1-back-button-bg-hover);
          color: var(--nxt1-back-button-color-hover);
        }
      }

      /* Active/pressed state */
      .nxt1-back-button:active:not(:disabled) {
        background: var(--nxt1-back-button-bg-active);
        transform: scale(0.95);
      }

      /* Focus state */
      .nxt1-back-button:focus-visible {
        outline: 2px solid var(--nxt1-color-focus-ring, var(--nxt1-color-primary, #ccff00));
        outline-offset: 2px;
      }

      /* Disabled state */
      .nxt1-back-button--disabled,
      .nxt1-back-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      /* Variant: Floating (elevated with shadow) */
      .nxt1-back-button--floating {
        background: var(--nxt1-color-surface-elevated, rgba(20, 20, 20, 0.9));
        box-shadow: var(--nxt1-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.15));
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      .nxt1-back-button--floating:hover:not(:disabled) {
        background: var(--nxt1-color-surface-elevated, rgba(30, 30, 30, 0.95));
        box-shadow: var(--nxt1-shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.2));
      }

      /* Variant: Ghost (minimal, no background) */
      .nxt1-back-button--ghost {
        background: transparent;
      }

      .nxt1-back-button--ghost:hover:not(:disabled) {
        background: var(--nxt1-back-button-bg-hover);
      }

      /* Variant: Solid (always has background) */
      .nxt1-back-button--solid {
        background: var(--nxt1-color-surface-secondary, rgba(255, 255, 255, 0.08));
      }

      .nxt1-back-button--solid:hover:not(:disabled) {
        background: var(--nxt1-color-surface-tertiary, rgba(255, 255, 255, 0.12));
      }

      /* Icon wrapper - sizes controlled by design tokens */
      .nxt1-back-button__icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-back-button-icon-md);
        height: var(--nxt1-back-button-icon-md);
        pointer-events: none;
      }

      /* Icon inherits size from wrapper */
      .nxt1-back-button__icon {
        width: 100%;
        height: 100%;
        color: inherit;
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-back-button {
          transition: none;
        }

        .nxt1-back-button:active:not(:disabled) {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtBackButtonComponent {
  private readonly haptics = inject(HapticsService);

  // ============================================
  // INPUTS
  // ============================================

  /** Button size variant */
  readonly size = input<BackButtonSize>('md');

  /** Visual variant */
  readonly variant = input<BackButtonVariant>('default');

  /** Whether the button is disabled */
  readonly disabled = input<boolean>(false);

  /** Custom ARIA label */
  readonly ariaLabel = input<string>();

  /** Test ID for e2e testing */
  readonly testId = input<string>('back-button');

  /** Override icon (defaults to platform-specific) */
  readonly icon = input<string>();

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when button is clicked (after haptic feedback) */
  readonly backClick = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  /**
   * Platform-aware icon name
   * - iOS: chevronLeft (standard iOS navigation pattern)
   * - Android/Web: chevronLeft (unified, modern design)
   */
  readonly iconName = computed(() => {
    const override = this.icon();
    if (override) return override;

    // Use chevronLeft across all platforms for consistency
    // This matches modern design patterns (Twitter/X, Instagram, etc.)
    return 'chevronLeft';
  });

  // ============================================
  // HANDLERS
  // ============================================

  /**
   * Handle button click with haptic feedback
   */
  async onClick(event: Event): Promise<void> {
    if (this.disabled()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Trigger haptic feedback (no-op on web)
    await this.haptics.impact('light');

    // Emit the back click event
    this.backClick.emit();
  }
}
