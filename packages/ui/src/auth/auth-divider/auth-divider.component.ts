/**
 * @fileoverview AuthDividerComponent - "OR" divider for auth forms
 * @module @nxt1/ui/auth
 */

import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-auth-divider',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="auth-divider">
      <span class="auth-divider__line"></span>
      <span class="auth-divider__text">{{ text }}</span>
      <span class="auth-divider__line"></span>
    </div>
  `,
  styles: [
    `
      .auth-divider {
        display: flex;
        align-items: center;
        gap: 16px;
        width: 100%;
        margin: 24px 0;
      }

      .auth-divider__line {
        flex: 1;
        height: 1px;
        background: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .auth-divider__text {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 13px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthDividerComponent {
  /** Divider text */
  @Input() text = 'OR';
}
