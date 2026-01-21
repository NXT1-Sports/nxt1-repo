/**
 * Mobile app services barrel export
 * @module @nxt1/mobile/services
 */

export {
  NativeAppService,
  type StatusBarStyle,
  type StatusBarConfig,
  type KeyboardConfig,
  type KeyboardResizeMode,
  type NativeAppConfig,
  type AppLifecycleEvent,
  type AppLifecycleHandler,
} from '../core/services/native-app.service';

export { BiometricService, type BiometricType } from '../features/auth/services/biometric.service';

export { NetworkService } from './network.service';
