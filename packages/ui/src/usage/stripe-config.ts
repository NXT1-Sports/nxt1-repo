/**
 * @fileoverview Stripe Configuration Tokens
 * @module @nxt1/ui/usage
 *
 * Provides the Stripe publishable key as an Angular injection token.
 * Apps must provide this token in their app.config.ts using the
 * environment-specific key.
 *
 * @example
 * ```typescript
 * // In app.config.ts:
 * { provide: STRIPE_PUBLISHABLE_KEY, useFactory: () => environment.stripePublishableKey }
 * ```
 */

import { InjectionToken } from '@angular/core';

/**
 * Injection token for the Stripe publishable key.
 * Provide this in each app's root config pointing to the correct environment key.
 *
 * - Staging / dev: `pk_test_...`  (Stripe test mode)
 * - Production:     `pk_live_...` (Stripe live mode)
 */
export const STRIPE_PUBLISHABLE_KEY = new InjectionToken<string>('STRIPE_PUBLISHABLE_KEY', {
  providedIn: 'root',
  factory: () => '',
});
