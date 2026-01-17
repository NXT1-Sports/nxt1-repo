/**
 * @fileoverview AuthTitleComponent - Shared Auth Page Title
 * @module @nxt1/ui/auth
 *
 * Consistent title typography for all authentication pages.
 * Uses design tokens for theme-aware styling.
 *
 * @example
 * ```html
 * <nxt1-auth-title>Welcome back</nxt1-auth-title>
 * <nxt1-auth-title size="lg">Create Account</nxt1-auth-title>
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Title size variants */
export type AuthTitleSize = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'nxt1-auth-title',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1
      class="auth-title"
      [class.auth-title--sm]="size === 'sm'"
      [class.auth-title--md]="size === 'md'"
      [class.auth-title--lg]="size === 'lg'"
      [class.auth-title--xl]="size === 'xl'"
      [attr.data-testid]="testId"
    >
      <ng-content></ng-content>
    </h1>
  `,
  styles: [
    `
      .auth-title {
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        text-align: center;
        margin: 0;
        line-height: 1.2;
      }

      .auth-title--sm {
        font-size: 1.25rem; /* 20px */
      }

      .auth-title--md {
        font-size: 1.5rem; /* 24px */
      }

      .auth-title--lg {
        font-size: 1.875rem; /* 30px */
      }

      .auth-title--xl {
        font-size: 2.25rem; /* 36px */
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthTitleComponent {
  /** Size variant */
  @Input() size: AuthTitleSize = 'lg';

  /** Test ID for E2E testing */
  @Input() testId = 'auth-title';
}
