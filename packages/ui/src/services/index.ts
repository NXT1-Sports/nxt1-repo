/**
 * @fileoverview UI Services Barrel Export
 * @module @nxt1/ui/services
 *
 * Angular injectable services for UI-specific functionality.
 *
 * For infrastructure services (auth, network), use @nxt1/infrastructure:
 * - BiometricService → @nxt1/infrastructure/auth
 * - NetworkService → @nxt1/infrastructure/network
 */

export {
  NxtPlatformService,
  type DeviceType,
  type OperatingSystem,
  type Orientation,
  type IonicMode,
  type PlatformCapabilities,
  type ViewportInfo,
  BREAKPOINTS,
} from './platform';

export {
  NxtToastService,
  type ToastType,
  type ToastPosition,
  type ToastAction,
  type ToastOptions,
} from './toast';

export {
  HapticsService,
  type HapticImpact,
  type HapticNotification,
  HapticButtonDirective,
  HapticSelectionDirective,
  type HapticFeedbackType,
} from './haptics';

export { NxtLoggingService, LOGGING_CONFIG, type LoggingConfig } from './logging';

// Analytics adapter token (provided by apps)
export { ANALYTICS_ADAPTER } from './analytics/analytics-adapter.token';

// Performance adapter token (provided by apps)
export { PERFORMANCE_ADAPTER } from './performance/performance-adapter.token';

export { AuthNavigationService, type NavAnimation, type NavOptions } from './auth-navigation';

export { AuthErrorHandler, type AuthError, type AuthRecoveryAction } from './auth-error';

// Browser service (2026 Professional In-App Browser)
export {
  NxtBrowserService,
  type BrowserState,
  type BrowserOpenResult,
  type BrowserServiceConfig,
} from './browser';

// Scroll service (2026 Professional Scroll Management)
export {
  NxtScrollService,
  type ScrollBehavior,
  type ScrollTarget,
  type ScrollToTopOptions,
  DEFAULT_SCROLL_OPTIONS,
} from './scroll';

// Theme service (2026 Professional Theme Management)
export {
  NxtThemeService,
  THEME_OPTIONS,
  SPORT_THEME_OPTIONS,
  type ThemePreference,
  type EffectiveTheme,
  type SportTheme,
  type ThemeChangeEvent,
  type ThemeOption,
  type SportThemeOption,
} from './theme';

// Gesture services
export {
  // Generic swipe gesture handler (framework-agnostic)
  createSwipeGestureHandler,
  createGestureConfig,
  DEFAULT_GESTURE_CONFIG,
  // Sidenav-specific gesture service
  NxtSidenavGestureService,
  // Types
  type SwipeDirection,
  type GesturePhase,
  type SwipeGestureConfig,
  type GestureStartState,
  type GestureState,
  type GestureResult,
  type GestureCallbacks,
  type GestureHandler,
  type SidenavGestureConfig,
} from './gesture';

// Global Badge Service (2026 Professional Badge Management)
export { GlobalBadgeService, type BadgeType } from './badge';

// Notification State Service (2026 Professional Global State)
export { NxtNotificationStateService } from './notification-state';

// ============================================
// MODAL SERVICE (2026 Unified Native Modal System)
// ============================================
export {
  NxtModalService,
  type AlertConfig,
  type ConfirmConfig,
  type PromptConfig,
  type PromptResult,
  type ActionSheetConfig,
  type ActionSheetAction,
  type ActionSheetResult,
  type LoadingConfig,
  type ActiveModal,
  type ModalCapabilities,
  type ModalPreference,
} from './modal';

// Breadcrumb / Crashlytics integration
export {
  NxtBreadcrumbService,
  NxtTrackClickDirective,
  NxtTrackFormDirective,
  NxtTrackVisibleDirective,
} from './breadcrumb';

// Media Service (2026 Global Cross-Platform Save-to-Device)
export {
  NxtMediaService,
  type MediaImageFormat,
  type SaveImageOptions,
  type SaveImageResult,
  type ShareImageOptions,
  type ShareImageResult,
} from './media';
