/**
 * @fileoverview NxtValidationSummaryComponent - Cross-Platform Validation Success Box
 * @module @nxt1/ui/shared
 * @version 1.0.0
 *
 * Reusable validation summary component for form success states.
 * Shows a green success box with icon and message.
 *
 * Features:
 * - Consistent success state styling
 * - Optional icon override
 * - Customizable message via content projection
 * - Design token based styling
 * - Test IDs for E2E testing
 *
 * Usage:
 * ```html
 * <nxt1-validation-summary testId="team-validation">
 *   Team info looks good!
 * </nxt1-validation-summary>
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

// ============================================
// TYPES
// ============================================

/**
 * Validation summary variants
 * - 'success': Green success state (default)
 * - 'info': Blue informational state
 * - 'warning': Yellow warning state
 */
export type ValidationSummaryVariant = 'success' | 'info' | 'warning';

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-validation-summary',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="nxt1-validation-summary"
      [class.nxt1-validation-summary--info]="variant() === 'info'"
      [class.nxt1-validation-summary--warning]="variant() === 'warning'"
      [attr.role]="role()"
      [attr.aria-live]="ariaLive()"
      [attr.data-testid]="testId()"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" class="nxt1-validation-icon" aria-hidden="true">
        @switch (variant()) {
          @case ('info') {
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
            />
          }
          @case ('warning') {
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          }
          @default {
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
            />
          }
        }
      </svg>
      <span class="nxt1-validation-message">
        <ng-content />
      </span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ============================================
       BASE VALIDATION SUMMARY
       ============================================ */
      .nxt1-validation-summary {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-successBg);
        border: 1px solid var(--nxt1-color-success);
        border-radius: var(--nxt1-borderRadius-lg);
      }

      /* ============================================
       ICON
       ============================================ */
      .nxt1-validation-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-success);
      }

      /* ============================================
       MESSAGE
       ============================================ */
      .nxt1-validation-message {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-success);
      }

      /* ============================================
       INFO VARIANT
       ============================================ */
      .nxt1-validation-summary--info {
        background: var(--nxt1-color-infoBg);
        border-color: var(--nxt1-color-info);
      }

      .nxt1-validation-summary--info .nxt1-validation-icon,
      .nxt1-validation-summary--info .nxt1-validation-message {
        color: var(--nxt1-color-info);
      }

      /* ============================================
       WARNING VARIANT
       ============================================ */
      .nxt1-validation-summary--warning {
        background: var(--nxt1-color-warningBg);
        border-color: var(--nxt1-color-warning);
      }

      .nxt1-validation-summary--warning .nxt1-validation-icon,
      .nxt1-validation-summary--warning .nxt1-validation-message {
        color: var(--nxt1-color-warning);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtValidationSummaryComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Visual variant */
  readonly variant = input<ValidationSummaryVariant>('success');

  /** Test ID for E2E testing */
  readonly testId = input<string | null>(null);

  /** ARIA role attribute */
  readonly role = input<string>('status');

  /** ARIA live region behavior */
  readonly ariaLive = input<'polite' | 'assertive' | 'off'>('polite');
}
