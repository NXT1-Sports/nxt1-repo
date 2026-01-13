/**
 * @fileoverview Services Barrel Export
 * @module @nxt1/ui/services
 *
 * Angular injectable services for platform-specific functionality.
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

export { HapticsService, type HapticImpact, type HapticNotification } from './haptics';
