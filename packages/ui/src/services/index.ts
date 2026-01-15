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
