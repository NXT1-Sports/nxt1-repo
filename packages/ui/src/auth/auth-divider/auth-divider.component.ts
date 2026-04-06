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
    <div class="my-6 flex w-full items-center gap-4" data-testid="auth-divider">
      <span class="bg-border-subtle h-px flex-1"></span>
      <span class="text-text-tertiary text-[13px] font-medium uppercase tracking-wide">{{
        text
      }}</span>
      <span class="bg-border-subtle h-px flex-1"></span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthDividerComponent {
  /** Divider text */
  @Input() text = 'OR';
}
