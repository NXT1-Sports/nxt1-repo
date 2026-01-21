/**
 * @fileoverview BiometricService - Face ID / Touch ID / Fingerprint Authentication
 * @module @nxt1/mobile/services
 *
 * Native biometric authentication for secure user verification.
 * Supports Face ID (iOS), Touch ID (iOS/Mac), and Fingerprint (Android).
 *
 * Features:
 * - Platform-specific biometric authentication
 * - Availability checking
 * - Credential storage integration
 * - Graceful fallback when unavailable
 * - SSR-safe implementation
 *
 * Usage:
 * ```typescript
 * import { BiometricService } from './services/biometric.service';
 *
 * export class SecureComponent {
 *   private readonly biometric = inject(BiometricService);
 *
 *   async verifyIdentity() {
 *     const result = await this.biometric.authenticate({
 *       reason: 'Verify your identity to view sensitive data',
 *     });
 *
 *     if (result.success) {
 *       this.showSensitiveData();
 *     }
 *   }
 * }
 * ```
 */

import { Injectable, inject, PLATFORM_ID, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Platform } from '@ionic/angular/standalone';

/** Biometric types available on device */
export type BiometricType = 'face' | 'fingerprint' | 'iris' | 'none';

/** Biometric availability info */
export interface BiometricAvailability {
  available: boolean;
  biometryType: BiometricType;
  reason?: string;
}

/** Authentication options */
export interface BiometricAuthOptions {
  /** Reason shown to user explaining why biometric is needed */
  reason: string;
  /** Title for the dialog (Android) */
  title?: string;
  /** Subtitle for the dialog (Android) */
  subtitle?: string;
  /** Negative button text (Android) - defaults to "Cancel" */
  negativeButtonText?: string;
  /** Allow device credentials fallback (PIN/pattern/password) */
  allowDeviceCredential?: boolean;
  /** Maximum attempts before failing (Android) */
  maxAttempts?: number;
}

/** Authentication result */
export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

/** Error codes for biometric failures */
export const BIOMETRIC_ERROR_CODES = {
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  NOT_ENROLLED: 'NOT_ENROLLED',
  USER_CANCELLED: 'USER_CANCELLED',
  LOCKOUT: 'LOCKOUT',
  LOCKOUT_PERMANENT: 'LOCKOUT_PERMANENT',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  UNKNOWN: 'UNKNOWN',
} as const;

@Injectable({ providedIn: 'root' })
export class BiometricService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ionicPlatform = inject(Platform);

  // ============================================
  // PRIVATE STATE
  // ============================================

  private _isAvailable = signal(false);
  private _biometryType = signal<BiometricType>('none');
  private _isInitialized = false;

  // ============================================
  // PUBLIC SIGNALS
  // ============================================

  /** Whether biometric auth is available */
  readonly isAvailable = computed(() => this._isAvailable());

  /** Type of biometric available (face, fingerprint, etc.) */
  readonly biometryType = computed(() => this._biometryType());

  /** Human-readable name for the biometric type */
  readonly biometryName = computed(() => {
    const type = this._biometryType();
    switch (type) {
      case 'face':
        return this.ionicPlatform.is('ios') ? 'Face ID' : 'Face Recognition';
      case 'fingerprint':
        return this.ionicPlatform.is('ios') ? 'Touch ID' : 'Fingerprint';
      case 'iris':
        return 'Iris Scanner';
      default:
        return 'Biometric';
    }
  });

  // ============================================
  // INITIALIZATION
  // ============================================

  /**
   * Initialize biometric service and check availability
   *
   * This is called lazily on first use, but you can call it
   * early to pre-check availability.
   */
  async initialize(): Promise<BiometricAvailability> {
    if (this._isInitialized) {
      return {
        available: this._isAvailable(),
        biometryType: this._biometryType(),
      };
    }

    if (!isPlatformBrowser(this.platformId)) {
      return { available: false, biometryType: 'none', reason: 'Server-side rendering' };
    }

    if (!this.ionicPlatform.is('capacitor')) {
      return { available: false, biometryType: 'none', reason: 'Not running in native app' };
    }

    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');

      const result = await NativeBiometric.isAvailable();

      const biometryType = this.mapBiometryType(result.biometryType);
      this._isAvailable.set(result.isAvailable);
      this._biometryType.set(biometryType);
      this._isInitialized = true;

      console.debug('[BiometricService] Initialized', {
        available: result.isAvailable,
        type: biometryType,
      });

      return {
        available: result.isAvailable,
        biometryType,
        reason: result.errorCode ? this.getErrorMessage(String(result.errorCode)) : undefined,
      };
    } catch (error) {
      console.debug('[BiometricService] Plugin not available:', error);
      this._isInitialized = true;
      return {
        available: false,
        biometryType: 'none',
        reason: 'Biometric plugin not installed',
      };
    }
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  /**
   * Authenticate user with biometrics
   *
   * @param options - Authentication options
   * @returns Promise with authentication result
   */
  async authenticate(options: BiometricAuthOptions): Promise<BiometricAuthResult> {
    // Ensure initialized
    const availability = await this.initialize();

    if (!availability.available) {
      return {
        success: false,
        error: availability.reason || 'Biometric not available',
        errorCode: BIOMETRIC_ERROR_CODES.NOT_AVAILABLE,
      };
    }

    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');

      await NativeBiometric.verifyIdentity({
        reason: options.reason,
        title: options.title || 'Biometric Authentication',
        subtitle: options.subtitle,
        negativeButtonText: options.negativeButtonText || 'Cancel',
        useFallback: options.allowDeviceCredential ?? false,
        maxAttempts: options.maxAttempts ?? 3,
      });

      console.debug('[BiometricService] Authentication successful');
      return { success: true };
    } catch (error: unknown) {
      const errorCode = this.parseErrorCode(error);
      const errorMessage = this.getErrorMessage(errorCode);

      console.debug('[BiometricService] Authentication failed:', errorCode, errorMessage);

      return {
        success: false,
        error: errorMessage,
        errorCode,
      };
    }
  }

  /**
   * Quick authentication with default options
   *
   * @param reason - Brief reason for authentication
   */
  async quickAuth(reason = 'Verify your identity'): Promise<boolean> {
    const result = await this.authenticate({ reason });
    return result.success;
  }

  // ============================================
  // CREDENTIAL STORAGE
  // ============================================

  /**
   * Store credentials securely with biometric protection
   *
   * The credentials are encrypted and can only be retrieved
   * after successful biometric authentication.
   *
   * @param server - Identifier for the credentials (e.g., 'nxt1-auth')
   * @param username - Username to store
   * @param password - Password/token to store
   */
  async setCredentials(server: string, username: string, password: string): Promise<boolean> {
    if (!this._isAvailable()) {
      console.warn('[BiometricService] Cannot store credentials - biometric not available');
      return false;
    }

    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');

      await NativeBiometric.setCredentials({
        server,
        username,
        password,
      });

      console.debug('[BiometricService] Credentials stored for:', server);
      return true;
    } catch (error) {
      console.error('[BiometricService] Failed to store credentials:', error);
      return false;
    }
  }

  /**
   * Retrieve stored credentials after biometric verification
   *
   * @param server - Identifier for the credentials
   * @param reason - Reason for biometric prompt
   */
  async getCredentials(
    server: string,
    reason = 'Authenticate to retrieve saved login'
  ): Promise<{ username: string; password: string } | null> {
    const authResult = await this.authenticate({ reason });

    if (!authResult.success) {
      return null;
    }

    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');

      const credentials = await NativeBiometric.getCredentials({ server });

      console.debug('[BiometricService] Credentials retrieved for:', server);
      return credentials;
    } catch {
      console.debug('[BiometricService] No credentials found for:', server);
      return null;
    }
  }

  /**
   * Delete stored credentials
   *
   * @param server - Identifier for the credentials
   */
  async deleteCredentials(server: string): Promise<boolean> {
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');

      await NativeBiometric.deleteCredentials({ server });
      console.debug('[BiometricService] Credentials deleted for:', server);
      return true;
    } catch (error) {
      console.debug('[BiometricService] Failed to delete credentials:', error);
      return false;
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  private mapBiometryType(type: number): BiometricType {
    // BiometryType enum from capacitor-native-biometric:
    // 0 = NONE, 1 = TOUCH_ID, 2 = FACE_ID, 3 = FINGERPRINT, 4 = FACE_AUTHENTICATION, 5 = IRIS_AUTHENTICATION
    switch (type) {
      case 1: // TOUCH_ID
      case 3: // FINGERPRINT
        return 'fingerprint';
      case 2: // FACE_ID
      case 4: // FACE_AUTHENTICATION
        return 'face';
      case 5: // IRIS_AUTHENTICATION
        return 'iris';
      default:
        return 'none';
    }
  }

  private parseErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      return String((error as { code: unknown }).code);
    }
    return BIOMETRIC_ERROR_CODES.UNKNOWN;
  }

  private getErrorMessage(code: string): string {
    switch (code) {
      case 'BIOMETRIC_NOT_AVAILABLE':
      case BIOMETRIC_ERROR_CODES.NOT_AVAILABLE:
        return 'Biometric authentication is not available on this device';
      case 'BIOMETRIC_NOT_ENROLLED':
      case BIOMETRIC_ERROR_CODES.NOT_ENROLLED:
        return 'No biometric data enrolled. Please set up Face ID or Fingerprint in Settings.';
      case 'USER_CANCELLED':
      case BIOMETRIC_ERROR_CODES.USER_CANCELLED:
        return 'Authentication cancelled';
      case 'BIOMETRIC_LOCKOUT':
      case BIOMETRIC_ERROR_CODES.LOCKOUT:
        return 'Too many failed attempts. Please try again later.';
      case 'BIOMETRIC_LOCKOUT_PERMANENT':
      case BIOMETRIC_ERROR_CODES.LOCKOUT_PERMANENT:
        return 'Biometric locked. Please use device passcode.';
      default:
        return 'Authentication failed';
    }
  }
}
