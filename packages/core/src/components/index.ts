/**
 * @fileoverview Components Barrel Export
 * @module @nxt1/core/components
 *
 * @deprecated These components have moved to @nxt1/ui
 *
 * Please update your imports:
 * ```typescript
 * // Before (deprecated)
 * import { AuthShellComponent } from '@nxt1/core';
 *
 * // After (recommended)
 * import { AuthShellComponent } from '@nxt1/ui';
 * import { AuthEmailFormComponent } from '@nxt1/ui/auth';
 * import { NxtLogoComponent } from '@nxt1/ui/shared';
 * ```
 *
 * This keeps @nxt1/core as pure TypeScript with no Angular dependencies.
 */

export * from './logo';
export * from './auth-shell';
export * from './auth-social-buttons';
export * from './auth-divider';
export * from './auth-email-form';
