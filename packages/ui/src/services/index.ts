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

export { AuthNavigationService, type NavAnimation, type NavOptions } from './auth-navigation';

export { AuthErrorHandler, type AuthError, type AuthRecoveryAction } from './auth-error';

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
