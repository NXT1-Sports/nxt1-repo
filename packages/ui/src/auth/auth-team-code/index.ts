/**
 * @fileoverview Auth Team Code Components Barrel Export
 * @module @nxt1/ui/auth/auth-team-code
 *
 * Types are re-exported from @nxt1/core for convenience.
 * Components use types from core to ensure consistency.
 */

// Components
export { AuthTeamCodeComponent } from './auth-team-code.component';
export {
  AuthTeamCodeBannerComponent,
  type TeamCodeBannerVariant,
} from './auth-team-code-banner.component';

// Re-export types from @nxt1/core for convenience
export type { ValidatedTeamInfo, TeamCodeValidationState } from '@nxt1/core';
