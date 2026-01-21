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
        font-family: var(--nxt1-fontFamily-brand);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        text-align: center;
        margin: 0;
        margin-bottom: var(--nxt1-spacing-2);
        line-height: 1.4;
      }

      .auth-subtitle--sm {
        font-size: var(--nxt1-fontSize-sm);
      }

      .auth-subtitle--md {
        font-size: var(--nxt1-fontSize-base);
      }

      .auth-subtitle--lg {
        font-size: var(--nxt1-fontSize-md);
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
