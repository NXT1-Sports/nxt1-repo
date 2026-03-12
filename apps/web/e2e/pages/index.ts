/**
 * @fileoverview Pages Barrel Export
 * @module @nxt1/web/e2e/pages
 *
 * Central export for all page objects.
 * Import from here for convenience.
 *
 * @example
 * ```typescript
 * import { LoginPage, SignupPage } from '@pages';
 * ```
 */

// Base page class
export { BasePage, type PageOptions } from './base.page';

// Auth pages
export * from './auth';

// Settings pages
export { SettingsPage, AccountInformationPage } from './settings.page';

// Activity pages
export { ActivityPage } from './activity.page';

// Add additional page exports here as features are developed:
// export * from './profile';
// export * from './onboarding';
// export * from './dashboard';
