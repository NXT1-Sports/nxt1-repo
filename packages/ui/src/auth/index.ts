/**
 * @fileoverview Auth Components Barrel Export
 * @module @nxt1/ui/auth
 *
 * Authentication UI components for consistent auth experience
 * across web and mobile platforms.
 */

export { AuthShellComponent, type AuthShellVariant } from './auth-shell';
export { AuthTitleComponent, type AuthTitleSize } from './auth-title';
export { AuthSubtitleComponent, type AuthSubtitleSize } from './auth-subtitle';
export { AuthSocialButtonsComponent, type SocialProvidersConfig } from './auth-social-buttons';
export { AuthActionButtonsComponent } from './auth-action-buttons';
export { AuthDividerComponent } from './auth-divider';
export { AuthAppDownloadComponent } from './auth-app-download';
export { AuthModeSwitcherComponent, type AuthMode } from './auth-mode-switcher';
export { AuthTermsDisclaimerComponent } from './auth-terms-disclaimer';
export {
  AuthEmailFormComponent,
  type AuthEmailFormData,
  type AuthEmailFormMode,
} from './auth-email-form';
export {
  AuthTeamCodeComponent,
  AuthTeamCodeBannerComponent,
  type TeamCodeValidationState,
  type ValidatedTeamInfo,
} from './auth-team-code';
export { AuthBiometricPromptComponent, type BiometryDisplayType } from './auth-biometric-prompt';
export { AuthBiometricButtonComponent, type BiometryButtonType } from './auth-biometric-button';
