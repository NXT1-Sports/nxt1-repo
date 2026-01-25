/**
 * @fileoverview BiometricService - Face ID / Touch ID / Fingerprint Authentication
 * @module @nxt1/mobile/services
 *
 * Native biometric authentication for secure user verification.
 * Supports Face ID (iOS), Touch ID (iOS/Mac), and Fingerprint (Android).
 *
 * 2026 Best Practices:
 * - Seamless biometric sign-in like professional apps (Instagram, banking apps)
 * - Secure credential storage with biometric protection
 * - User preference tracking for biometric enrollment
 * - Graceful fallback when unavailable
 * - SSR-safe implementation
 *
 * Features:
 * - Platform-specific biometric authentication
 * - Availability checking
 * - Credential storage integration for auto-login
 * - Biometric enrollment tracking (user preference)
 * - Graceful fallback when unavailable
 *
 * Usage:
 * ```typescript
 * import { BiometricService } from './services/biometric.service';
 *
 * export class AuthComponent {
 *   private readonly biometric = inject(BiometricService);
 *
 *   async onLogin() {
 *     // Check if user has biometric login enabled
 *     if (await this.biometric.hasSavedCredentials()) {
 *       const result = await this.biometric.authenticateAndGetCredentials();
 *       if (result) {
 *         await this.authService.signIn(result.email, result.password);
 *       }
 *     }
 *   }
 *
 *   async onSignupSuccess(email: string, password: string) {
 *     // Prompt to enable biometric for future logins
 *     const enrolled = await this.biometric.promptEnrollment(email, password);
 *   }
 * }
 * ```
 */

import { Injectable, inject, PLATFORM_ID, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Platform } from '@ionic/angular/standalone';
import { Preferences } from '@capacitor/preferences';

/** Server identifier for credential storage */
const BIOMETRIC_CREDENTIAL_SERVER = 'nxt1-auth';

/** Storage key for biometric enrollment preference */
const BIOMETRIC_ENROLLED_KEY = 'nxt1_biometric_enrolled';

/** Storage key for last authenticated email */
const BIOMETRIC_LAST_EMAIL_KEY = 'nxt1_biometric_last_email';

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

/** Stored credentials for auto-login */
export interface BiometricCredentials {
  email: string;
  password: string;
}

/** Error codes for biometric failures */
export const BIOMETRIC_ERROR_CODES = {
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  NOT_ENROLLED: 'NOT_ENROLLED',
  USER_CANCELLED: 'USER_CANCELLED',
  LOCKOUT: 'LOCKOUT',
  LOCKOUT_PERMANENT: 'LOCKOUT_PERMANENT',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  NO_CREDENTIALS: 'NO_CREDENTIALS',
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
  private _isEnrolled = signal(false);
  private _lastEmail = signal<string | null>(null);
  private _isInitialized = false;

  // ============================================
  // PUBLIC SIGNALS
  // ============================================

  /** Whether biometric auth is available on this device */
  readonly isAvailable = computed(() => this._isAvailable());

  /** Type of biometric available (face, fingerprint, etc.) */
  readonly biometryType = computed(() => this._biometryType());

  /** Whether user has enrolled biometric login (saved credentials) */
  readonly isEnrolled = computed(() => this._isEnrolled());

  /** Last email used for biometric login (for display purposes) */
  readonly lastEmail = computed(() => this._lastEmail());

  /** Whether biometric login is ready to use (available AND enrolled) */
  readonly isReadyForLogin = computed(() => this._isAvailable() && this._isEnrolled());

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
    console.log('[BiometricService] initialize() called, isInitialized:', this._isInitialized);

    if (this._isInitialized) {
      return {
        available: this._isAvailable(),
        biometryType: this._biometryType(),
      };
    }

    if (!isPlatformBrowser(this.platformId)) {
      console.log('[BiometricService] Not browser platform');
      return { available: false, biometryType: 'none', reason: 'Server-side rendering' };
    }

    const isCapacitor = this.ionicPlatform.is('capacitor');
    console.log('[BiometricService] Is Capacitor:', isCapacitor);

    if (!isCapacitor) {
      return { available: false, biometryType: 'none', reason: 'Not running in native app' };
    }

    try {
      console.log('[BiometricService] Importing NativeBiometric plugin...');
      const { NativeBiometric } = await import('capacitor-native-biometric');

      console.log('[BiometricService] Checking availability...');
      const result = await NativeBiometric.isAvailable();
      console.log('[BiometricService] isAvailable result:', result);

      const biometryType = this.mapBiometryType(result.biometryType);
      this._isAvailable.set(result.isAvailable);
      this._biometryType.set(biometryType);
      this._isInitialized = true;

      console.log('[BiometricService] Initialized successfully:', {
        available: result.isAvailable,
        type: biometryType,
        rawType: result.biometryType,
      });

      return {
        available: result.isAvailable,
        biometryType,
        reason: result.errorCode ? this.getErrorMessage(String(result.errorCode)) : undefined,
      };
    } catch (error) {
      console.error('[BiometricService] Plugin error:', error);
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
  // ENROLLMENT MANAGEMENT (2026 Best Practices)
  // ============================================

  /**
   * Load enrollment status from persistent storage
   * Call this during app initialization
   */
  async loadEnrollmentStatus(): Promise<void> {
    try {
      const [enrolledResult, emailResult] = await Promise.all([
        Preferences.get({ key: BIOMETRIC_ENROLLED_KEY }),
        Preferences.get({ key: BIOMETRIC_LAST_EMAIL_KEY }),
      ]);

      this._isEnrolled.set(enrolledResult.value === 'true');
      this._lastEmail.set(emailResult.value || null);

      console.debug('[BiometricService] Enrollment status loaded', {
        enrolled: this._isEnrolled(),
        email: this._lastEmail(),
      });
    } catch (error) {
      console.error('[BiometricService] Failed to load enrollment status:', error);
    }
  }

  /**
   * Enroll user for biometric login
   * Stores credentials securely and marks user as enrolled
   *
   * @param email - User's email
   * @param password - User's password
   * @returns Success status
   */
  async enrollBiometric(email: string, password: string): Promise<boolean> {
    const availability = await this.initialize();

    if (!availability.available) {
      console.warn('[BiometricService] Cannot enroll - biometric not available');
      return false;
    }

    try {
      // Store credentials with biometric protection
      const stored = await this.setCredentials(BIOMETRIC_CREDENTIAL_SERVER, email, password);

      if (!stored) {
        return false;
      }

      // Mark as enrolled
      await Promise.all([
        Preferences.set({ key: BIOMETRIC_ENROLLED_KEY, value: 'true' }),
        Preferences.set({ key: BIOMETRIC_LAST_EMAIL_KEY, value: email }),
      ]);

      this._isEnrolled.set(true);
      this._lastEmail.set(email);

      console.debug('[BiometricService] User enrolled for biometric login:', email);
      return true;
    } catch (error) {
      console.error('[BiometricService] Enrollment failed:', error);
      return false;
    }
  }

  /**
   * Authenticate and retrieve stored credentials for auto-login
   * This is the main method for biometric sign-in
   *
   * @returns Credentials if successful, null otherwise
   */
  async authenticateAndGetCredentials(): Promise<BiometricCredentials | null> {
    if (!this._isEnrolled()) {
      console.debug('[BiometricService] Not enrolled, cannot authenticate');
      return null;
    }

    const biometryName = this.biometryName();
    const credentials = await this.getCredentials(
      BIOMETRIC_CREDENTIAL_SERVER,
      `Sign in with ${biometryName}`
    );

    if (!credentials) {
      return null;
    }

    return {
      email: credentials.username,
      password: credentials.password,
    };
  }

  /**
   * Check if biometric login should be shown on auth screen
   * Returns true if: available, enrolled, and has saved credentials
   */
  async shouldShowBiometricLogin(): Promise<boolean> {
    await this.initialize();
    await this.loadEnrollmentStatus();

    return this._isAvailable() && this._isEnrolled();
  }

  /**
   * Clear biometric enrollment (user wants to disable)
   * Removes stored credentials and clears enrollment status
   */
  async clearEnrollment(): Promise<void> {
    try {
      // Delete stored credentials
      await this.deleteCredentials(BIOMETRIC_CREDENTIAL_SERVER);

      // Clear enrollment status
      await Promise.all([
        Preferences.remove({ key: BIOMETRIC_ENROLLED_KEY }),
        Preferences.remove({ key: BIOMETRIC_LAST_EMAIL_KEY }),
      ]);

      this._isEnrolled.set(false);
      this._lastEmail.set(null);

      console.debug('[BiometricService] Enrollment cleared');
    } catch (error) {
      console.error('[BiometricService] Failed to clear enrollment:', error);
    }
  }

  /**
   * Update stored password (e.g., after password change)
   *
   * @param email - User's email
   * @param newPassword - New password
   */
  async updateStoredPassword(email: string, newPassword: string): Promise<boolean> {
    if (!this._isEnrolled()) {
      return false;
    }

    return this.setCredentials(BIOMETRIC_CREDENTIAL_SERVER, email, newPassword);
  }

  /**
   * Prompt user to enable biometric login using NATIVE dialog only
   *
   * This shows the actual iOS Face ID / Android Fingerprint system dialog.
   * No custom UI - clean, trusted, native experience.
   *
   * Flow:
   * 1. Show native biometric prompt with custom reason text
   * 2. If user authenticates successfully → store credentials
   * 3. If user cancels → gracefully continue (no enrollment)
   *
   * @param email - User's email to store
   * @param password - User's password to store
   * @returns Object with enrolled status and reason
   */
  async promptNativeEnrollment(
    email: string,
    password: string
  ): Promise<{ enrolled: boolean; reason: 'success' | 'cancelled' | 'failed' }> {
    const availability = await this.initialize();

    if (!availability.available) {
      console.debug('[BiometricService] Native enrollment skipped - not available');
      return { enrolled: false, reason: 'failed' };
    }

    // Already enrolled? Skip
    if (this._isEnrolled()) {
      console.debug('[BiometricService] Already enrolled, skipping prompt');
      return { enrolled: true, reason: 'success' };
    }

    const biometryName = this.biometryName();

    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');

      // Show native biometric prompt
      await NativeBiometric.verifyIdentity({
        reason: `Enable ${biometryName} to sign in faster next time`,
        title: `Enable ${biometryName}`,
        subtitle: 'Quick and secure sign-in',
        negativeButtonText: 'Not Now',
        useFallback: false,
        maxAttempts: 1, // Just need one successful scan to confirm
      });

      // User authenticated successfully - store their credentials
      const enrolled = await this.enrollBiometric(email, password);

      if (enrolled) {
        console.debug('[BiometricService] Native enrollment successful');
        return { enrolled: true, reason: 'success' };
      } else {
        console.warn('[BiometricService] Native enrollment - credential storage failed');
        return { enrolled: false, reason: 'failed' };
      }
    } catch (error: unknown) {
      const errorCode = this.parseErrorCode(error);

      if (errorCode === 'USER_CANCELLED' || errorCode === BIOMETRIC_ERROR_CODES.USER_CANCELLED) {
        console.debug('[BiometricService] User declined biometric enrollment');
        return { enrolled: false, reason: 'cancelled' };
      }

      console.debug('[BiometricService] Native enrollment failed:', errorCode);
      return { enrolled: false, reason: 'failed' };
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
