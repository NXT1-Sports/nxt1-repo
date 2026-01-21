/**
 * @fileoverview AuthTermsDisclaimerComponent - Terms & Privacy Disclaimer
 * @module @nxt1/ui/auth
 *
 * Shared terms of service and privacy policy disclaimer for signup flows.
 * Provides consistent legal copy and links across web and mobile platforms.
 *
 * Features:
 * - Configurable terms and privacy policy URLs
 * - Consistent styling with design tokens
 * - Accessible link semantics
 *
 * Usage:
 * ```html
 * <nxt1-auth-terms-disclaimer />
 * ```
 */

import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nxt1-auth-terms-disclaimer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <p class="text-text-tertiary mt-4 text-center text-xs" data-testid="auth-terms-disclaimer">
      By creating an account, you agree to {{ brandName }}'s
      <a
        [href]="termsUrl"
        class="text-primary hover:underline"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="terms-link"
      >
        Terms of Service
      </a>
      and
      <a
        [href]="privacyUrl"
        class="text-primary hover:underline"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="privacy-link"
      >
        Privacy Policy
      </a>
    </p>
  `,
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthTermsDisclaimerComponent {
  /** Brand name to display */
  @Input() brandName = 'NXT1';

  /** Terms of service URL */
  @Input() termsUrl = '/terms';

  /** Privacy policy URL */
  @Input() privacyUrl = '/privacy';
}
