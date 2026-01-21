/**
 * @fileoverview AuthSubtitleComponent - Shared Auth Page Subtitle
 * @module @nxt1/ui/auth
 *
 * Consistent subtitle typography for all authentication pages.
 * Uses design tokens for theme-aware styling.
 *
 * @example
 * ```html
 * <nxt1-auth-subtitle>Sign in to continue</nxt1-auth-subtitle>
 * <nxt1-auth-subtitle size="lg">Enter your details below</nxt1-auth-subtitle>
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Subtitle size variants */
export type AuthSubtitleSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'nxt1-auth-subtitle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p
      class="auth-subtitle"
      [class.auth-subtitle--sm]="size === 'sm'"
      [class.auth-subtitle--md]="size === 'md'"
      [class.auth-subtitle--lg]="size === 'lg'"
      [attr.data-testid]="testId"
    >
      <ng-content></ng-content>
    </p>
  `,
  styles: [
    `
      .auth-subtitle {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        text-align: center;
        margin: 0;
        margin-bottom: 0.5rem;
        line-height: 1.4;
      }

      .auth-subtitle--sm {
        font-size: 0.8125rem; /* 13px */
      }

      .auth-subtitle--md {
        font-size: 0.875rem; /* 14px */
      }

      .auth-subtitle--lg {
        font-size: 1rem; /* 16px */
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthSubtitleComponent {
  /** Size variant */
  @Input() size: AuthSubtitleSize = 'md';

  /** Test ID for E2E testing */
  @Input() testId = 'auth-subtitle';
}
