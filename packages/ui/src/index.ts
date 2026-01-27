/**
 * @fileoverview @nxt1/ui - Single Entry Point (2026 Angular Best Practices)
 * @module @nxt1/ui
 * @version 2.0.0
 *
 * Shared Angular/Ionic UI components, services, and infrastructure for NXT1 platform.
 * Cross-platform compatible with Web, iOS, and Android.
 *
 * This package consolidates ALL Angular-specific code using modern Angular Package Format (APF):
 * - Single entry point with tree-shaking (no secondary entry points)
 * - Strict encapsulation via package.json exports field
 * - Optimal bundle splitting handled by Angular compiler
 *
 * IMPORTANT: This package contains ANGULAR/IONIC dependencies.
 * For pure TypeScript utilities, use @nxt1/core instead.
 *
 * @example
 * ```typescript
 * // All imports from '@nxt1/ui' - tree-shaking handles optimization
 * import {
 *   // Auth Components
 *   AuthShellComponent,
 *   AuthEmailFormComponent,
 *   AuthSocialButtonsComponent,
 *
 *   // Shared Components
 *   NxtLogoComponent,
 *   NxtIconComponent,
 *
 *   // Services
 *   NxtPlatformService,
 *   NxtToastService,
 *   HapticsService,
 *
 *   // Infrastructure
 *   GlobalErrorHandler,
 *   httpErrorInterceptor,
 *
 *   // Onboarding
 *   OnboardingRoleSelectionComponent,
 *   OnboardingProgressBarComponent,
 * } from '@nxt1/ui';
 * ```
 */

// ============================================
// VERSION
// ============================================
export const NXT1_UI_VERSION = '2.0.0';

// ============================================
// AUTH COMPONENTS
// ============================================
export { AuthShellComponent, type AuthShellVariant } from './auth/auth-shell';
export { AuthTitleComponent, type AuthTitleSize } from './auth/auth-title';
export { AuthSubtitleComponent, type AuthSubtitleSize } from './auth/auth-subtitle';
export { AuthSocialButtonsComponent, type SocialProvidersConfig } from './auth/auth-social-buttons';
export { AuthActionButtonsComponent } from './auth/auth-action-buttons';
export { AuthDividerComponent } from './auth/auth-divider';
export { AuthAppDownloadComponent } from './auth/auth-app-download';
export { AuthModeSwitcherComponent, type AuthMode } from './auth/auth-mode-switcher';
export { AuthTermsDisclaimerComponent } from './auth/auth-terms-disclaimer';
export {
  AuthEmailFormComponent,
  type AuthEmailFormData,
  type AuthEmailFormMode,
} from './auth/auth-email-form';
export {
  AuthTeamCodeComponent,
  AuthTeamCodeBannerComponent,
  type TeamCodeValidationState,
  type ValidatedTeamInfo,
} from './auth/auth-team-code';
export { AuthBiometricPromptComponent } from './auth/auth-biometric-prompt';
export {
  AuthBiometricButtonComponent,
  type BiometryButtonType,
} from './auth/auth-biometric-button';

// Biometric Prompt Service (2026 Native-Style Modal)
export {
  BiometricPromptService,
  BiometricPromptContentComponent,
  type BiometryDisplayType,
  type BiometricPromptConfig,
  type BiometricPromptResult,
} from './auth/biometric-prompt';

// ============================================
// SHARED COMPONENTS
// ============================================
export { NxtLogoComponent, type LogoSize, type LogoVariant } from './shared/logo';
export {
  NxtImageComponent,
  type ImageFit,
  type ImageLoading,
  type ImageVariant,
  type ImageState,
} from './shared/image';
export {
  NxtIconComponent,
  type IconName,
  type UIIconName,
  type BrandIconName,
} from './shared/icon';
export { NxtChipComponent, type ChipSize, type ChipVariant } from './shared/chip';
export {
  NxtValidationSummaryComponent,
  type ValidationSummaryVariant,
} from './shared/validation-summary';
export { NxtFormFieldComponent } from './shared/form-field';
export { NxtTeamLogoPickerComponent } from './shared/team-logo-picker';
export { NxtColorPickerComponent } from './shared/color-picker';

// ============================================
// BOTTOM SHEET (2026 Native-Style Modal)
// ============================================
export {
  NxtBottomSheetComponent,
  NxtBottomSheetService,
  type BottomSheetAction,
  type BottomSheetConfig,
  type BottomSheetResult,
  type BottomSheetVariant,
} from './shared/bottom-sheet';

// ============================================
// MOBILE FOOTER / TAB BAR (2026 Native-Style Navigation)
// ============================================
export {
  // Component
  NxtMobileFooterComponent,
  // Types (from @nxt1/core)
  type NavIconName,
  type FooterTabItem,
  type FooterConfig,
  type FooterVariant,
  type FooterIndicatorStyle,
  type FooterTabSelectEvent,
  type FooterTabSelectEventBase,
  // Constants (from @nxt1/core)
  DEFAULT_FOOTER_TABS,
  FOOTER_HEIGHTS,
  FOOTER_ANIMATION,
  // Helper functions (from @nxt1/core)
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
} from './shared/footer';

// ============================================
// DESKTOP TOP NAVIGATION (2026 Native-Style Navigation)
// ============================================
export {
  // Component
  NxtDesktopNavComponent,
  // Angular-specific Types
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  type TopNavSearchSubmitEvent,
} from './shared/top-nav';

// Re-export core types for convenience
export {
  type TopNavIconName,
  type TopNavItem,
  type TopNavDropdownItem,
  type TopNavUserMenuItem,
  type TopNavUserData,
  type TopNavVariant,
  type TopNavConfig,
  type TopNavActionEvent,
  type TopNavSearchEvent,
  DEFAULT_TOP_NAV_ITEMS,
  DEFAULT_USER_MENU_ITEMS,
  TOP_NAV_HEIGHTS,
  TOP_NAV_ANIMATION,
  createTopNavConfig,
  findTopNavItemById,
  findTopNavItemByRoute,
  updateTopNavBadge,
} from '@nxt1/core';

// ============================================
// UNIFIED PICKER SYSTEM
// ============================================
export {
  // Service (primary API)
  NxtPickerService,
  // Types
  type PickerType,
  type PickerBaseConfig,
  type SportPickerConfig,
  type SportItem,
  type SportPickerResult,
  type PositionGroup,
  type PositionPickerConfig,
  type PositionPickerResult,
  type PickerResult,
  // Defaults
  SPORT_PICKER_DEFAULTS,
  POSITION_PICKER_DEFAULTS,
  // Type guards
  isSportPickerResult,
  isPositionPickerResult,
  // Components (rarely needed directly)
  NxtPickerShellComponent,
  NxtPickerComponent,
  NxtSportPickerContentComponent,
  NxtPositionPickerContentComponent,
} from './shared/picker';

// ============================================
// SERVICES
// ============================================
export {
  NxtPlatformService,
  type DeviceType,
  type OperatingSystem,
  type Orientation,
  type IonicMode,
  type PlatformCapabilities,
  type ViewportInfo,
  BREAKPOINTS,
} from './services/platform';

export {
  NxtToastService,
  type ToastType,
  type ToastPosition,
  type ToastAction,
  type ToastOptions,
} from './services/toast';

export {
  HapticsService,
  type HapticImpact,
  type HapticNotification,
  HapticButtonDirective,
  HapticSelectionDirective,
  type HapticFeedbackType,
} from './services/haptics';

export { NxtLoggingService, LOGGING_CONFIG, type LoggingConfig } from './services/logging';

// ============================================
// BREADCRUMB TRACKING (Crashlytics Integration)
// ============================================
export {
  NxtBreadcrumbService,
  NxtTrackClickDirective,
  NxtTrackFormDirective,
  NxtTrackVisibleDirective,
} from './services/breadcrumb';

// ============================================
// INFRASTRUCTURE - Error Handling
// ============================================
export {
  GlobalErrorHandler,
  GLOBAL_ERROR_LOGGER,
  GLOBAL_CRASHLYTICS,
  type ErrorSeverity,
  ERROR_MESSAGES,
} from './infrastructure/error-handling';

// ============================================
// INFRASTRUCTURE - HTTP Interceptors
// ============================================
export {
  httpErrorInterceptor,
  type HttpErrorInterceptorOptions,
} from './infrastructure/interceptors';

// ============================================
// AUTH SERVICES
// ============================================
export {
  AuthErrorHandler,
  type AuthError,
  type AuthRecoveryAction,
} from './auth-services/auth-error.handler';

// ============================================
// ONBOARDING COMPONENTS
// ============================================
export {
  OnboardingRoleSelectionComponent,
  ONBOARDING_ROLE_OPTIONS,
  type RoleOption,
} from './onboarding/onboarding-role-selection';

export { OnboardingProfileStepComponent } from './onboarding/onboarding-profile-step';

export {
  OnboardingTeamStepComponent,
  TEAM_TYPE_OPTIONS,
  type TeamTypeOption,
} from './onboarding/onboarding-team-step';

export { OnboardingSportStepComponent } from './onboarding/onboarding-sport-step';

export { OnboardingPositionStepComponent } from './onboarding/onboarding-position-step';

export { OnboardingContactStepComponent } from './onboarding/onboarding-contact-step';

export {
  OnboardingReferralStepComponent,
  REFERRAL_OPTIONS,
  type ReferralOption,
  type ReferralSourceType,
} from './onboarding/onboarding-referral-step';

export { OnboardingProgressBarComponent } from './onboarding/onboarding-progress-bar';

export { OnboardingNavigationButtonsComponent } from './onboarding/onboarding-navigation-buttons';

export { OnboardingButtonMobileComponent } from './onboarding/onboarding-button-mobile';

export { OnboardingProgressPillsComponent } from './onboarding/onboarding-progress-pills';

export {
  OnboardingStepCardComponent,
  type StepCardVariant,
  type AnimationDirection,
} from './onboarding/onboarding-step-card';

export { OnboardingCelebrationComponent } from './onboarding/onboarding-celebration';

export { OnboardingCompleteComponent } from './onboarding/onboarding-complete';

export { OnboardingWelcomeComponent } from './onboarding/onboarding-welcome';

// ============================================
// GENERAL COMPONENTS
// ============================================
export { NxtRefreshContainerComponent, type RefreshEvent } from './components/refresh-container';
