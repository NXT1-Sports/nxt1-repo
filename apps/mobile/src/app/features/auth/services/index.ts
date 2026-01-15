/**
 * @fileoverview Auth Services Barrel Export
 * @module @nxt1/mobile/features/auth/services
 *
 * Re-exports all auth services for clean imports.
 *
 * Usage:
 * ```typescript
 * import { AuthFlowService, AuthApiService } from '../services';
 * ```
 */

export { AuthFlowService } from './auth-flow.service';
export { AuthApiService } from './auth-api.service';
export { FirebaseAuthService } from './firebase-auth.service';
export { MobileAuthService } from './mobile-auth.service';
export { NativeAuthService } from './native-auth.service';
export {
  BiometricService,
  type BiometricType,
  type BiometricAvailability,
  type BiometricAuthOptions,
  type BiometricAuthResult,
} from './biometric.service';
