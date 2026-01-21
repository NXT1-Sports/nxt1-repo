/**
 * @fileoverview AuthModeSwitcherComponent - Login/Signup Mode Toggle
 * @module @nxt1/ui/auth
 *
 * Shared mode switcher for toggling between login and signup modes.
 * Provides consistent UI and behavior across web and mobile platforms.
 *
 * Features:
 * - Pill-style toggle between Sign In / Sign Up
 * - Active state styling with smooth transitions
 * - Theme-aware using CSS custom properties
 * - Accessible with proper button semantics
 *
 * Usage:
 * ```html
 * <nxt1-auth-mode-switcher
 *   [mode]="currentMode()"
 *   (modeChange)="onModeChange($event)"
 * />
 * ```
 */

import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Auth mode type */
export type AuthMode = 'login' | 'signup';

@Component({
  selector: 'nxt1-auth-mode-switcher',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mode-toggle" role="tablist" aria-label="Authentication mode">
      <button
        type="button"
        role="tab"
        class="mode-tab"
        [class.active]="mode === 'login'"
        [attr.aria-selected]="mode === 'login'"
        [attr.tabindex]="mode === 'login' ? 0 : -1"
        (click)="onModeClick('login')"
        data-testid="auth-mode-login"
      >
        {{ loginLabel }}
      </button>
      <button
        type="button"
        role="tab"
        class="mode-tab"
        [class.active]="mode === 'signup'"
        [attr.aria-selected]="mode === 'signup'"
        [attr.tabindex]="mode === 'signup' ? 0 : -1"
        (click)="onModeClick('signup')"
        data-testid="auth-mode-signup"
      >
        {{ signupLabel }}
      </button>
    </div>
  `,
  styles: [
    `
      .mode-toggle {
        display: flex;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-1);
        gap: var(--nxt1-spacing-1);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .mode-tab {
        flex: 1;
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-4);
        border: none;
        background: transparent;
        border-radius: var(--nxt1-borderRadius-md);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast) ease;
      }

      .mode-tab:hover:not(.active) {
        color: var(--nxt1-color-text-primary);
      }

      .mode-tab.active {
        background: var(--nxt1-color-bg-primary);
        color: var(--nxt1-color-text-primary);
        box-shadow: var(--nxt1-shadow-sm);
      }

      .mode-tab:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthModeSwitcherComponent {
  /** Current auth mode */
  @Input() mode: AuthMode = 'login';

  /** Label for login tab */
  @Input() loginLabel = 'Sign In';

  /** Label for signup tab */
  @Input() signupLabel = 'Sign Up';

  /** Emitted when mode changes */
  @Output() modeChange = new EventEmitter<AuthMode>();

  /**
   * Handle mode tab click
   */
  onModeClick(newMode: AuthMode): void {
    if (newMode !== this.mode) {
      this.modeChange.emit(newMode);
    }
  }
}
