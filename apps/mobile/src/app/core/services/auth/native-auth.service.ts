/**
 * Native Auth Service - Capacitor Plugin Integration
 *
 * Handles native OAuth authentication using Capacitor plugins:
 * - @southdevs/capacitor-google-auth for Google Sign-In
 *
 * This service provides native system UI for OAuth sign-in,
 * returning tokens that can be used with Firebase Auth.
 *
 * Architecture:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                    │
 * ├────────────────────────────────────────────────────────────┤
 * │              ⭐ AuthFlowService (Business Logic) ⭐         │
 * ├────────────────────────────────────────────────────────────┤
 * │              FirebaseAuthService (Firebase SDK)            │
 * │                         ↓ uses ↓                           │
 * │             ⭐ NativeAuthService (THIS FILE) ⭐            │
 * │           Capacitor plugins for native OAuth               │
 * ├────────────────────────────────────────────────────────────┤
 * │            @southdevs/capacitor-google-auth                │
 * │                Native iOS/Android SDKs                     │
 * └────────────────────────────────────────────────────────────┘
 *
 * Web Compatibility:
 * - This service is ONLY active on iOS/Android native platforms
 * - When running on web (PWA/dev), isNativeAvailable returns false
 * - FirebaseAuthService falls back to signInWithPopup() for web
 * - Both paths produce identical Firebase UserCredential
 * - Backend receives the same Firebase ID token regardless of platform
 *
 * @module @nxt1/mobile/features/auth
 */
import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  SignInWithApple,
  SignInWithAppleOptions,
  SignInWithAppleResponse,
} from '@capacitor-community/apple-sign-in';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { MsAuthPlugin } from '@recognizebv/capacitor-plugin-msauth';
import { NxtPlatformService, HapticsService, NxtLoggingService } from '@nxt1/ui';
import { type ILogger } from '@nxt1/core/logging';
import type { NativeAuthResult, NativeAuthProvider, NativeAuthAvailability } from '@nxt1/core';
import { environment } from 'src/environments/environment';

/** Timeout for native auth operations (ms) */
const NATIVE_AUTH_TIMEOUT = 60000;

/**
 * Native Auth Service
 *
 * Provides native OAuth authentication using Capacitor plugins.
 * Returns standardized NativeAuthResult that can be used with Firebase.
 *
 * @example
 * ```typescript
 * const result = await nativeAuth.signInWithGoogle();
 * if (result) {
 *   // Use result.idToken with Firebase signInWithCredential
 *   const credential = GoogleAuthProvider.credential(result.idToken);
 *   await signInWithCredential(auth, credential);
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class NativeAuthService {
  private readonly platform = inject(NxtPlatformService);
  private readonly haptics = inject(HapticsService);

  /** Structured logger for native auth operations */
  private readonly logger: ILogger = inject(NxtLoggingService).child('NativeAuthService');

  /**
   * Check if native auth is available
   * Returns true on iOS/Android, false on web
   */
  get isNativeAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Get current platform
   */
  get currentPlatform(): 'ios' | 'android' | 'web' {
    return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
  }

  /**
   * Check availability of each native auth provider
   */
  async checkAvailability(): Promise<NativeAuthAvailability> {
    if (!this.isNativeAvailable) {
      return { google: false, apple: false, microsoft: false };
    }

    return {
      google: true,
      apple: this.currentPlatform === 'ios',
      microsoft: true,
    };
  }

  // ============================================
  // GOOGLE SIGN-IN
  // ============================================

  /**
   * Sign in with Google using native UI
   *
   * On iOS: Uses Google Sign-In SDK
   * On Android: Uses Google Play Services
   *
   * @returns NativeAuthResult with idToken for Firebase, or null on cancel
   * @throws Error on failure
   */
  async signInWithGoogle(): Promise<NativeAuthResult | null> {
    if (!this.isNativeAvailable) {
      throw new Error('Native Google Sign-In is only available on iOS/Android');
    }

    try {
      this.logger.info('Starting Google Sign-In via @capacitor-firebase/authentication');
      await this.haptics.selection();

      // Sign in with Google using Firebase plugin
      // serverAuthCode is automatically generated when GoogleService-Info.plist is properly configured
      const result = await FirebaseAuthentication.signInWithGoogle({
        scopes: [
          'email',
          'profile',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
        ],
      });

      this.logger.info('Google Sign-In successful', {
        hasIdToken: !!result.credential?.idToken,
        hasAccessToken: !!result.credential?.accessToken,
        providerId: result.credential?.providerId,
      });

      await this.haptics.notification('success');

      // Validate we have required tokens
      // Note: On iOS simulator, sometimes idToken is missing but serverAuthCode is present
      if (!result.credential?.idToken && !result.credential?.serverAuthCode) {
        throw new Error(
          'Google Sign-In did not return valid credentials. Please check Firebase configuration or try on a real device.'
        );
      }

      // If we have idToken, use it directly.
      // serverAuthCode is always forwarded so the backend can exchange it
      // for a Gmail refresh token (used to send emails on behalf of the user).
      if (result.credential?.idToken) {
        return {
          provider: 'google',
          idToken: result.credential.idToken,
          accessToken: result.credential.accessToken,
          serverAuthCode: result.credential.serverAuthCode,
          user: {
            id: result.user?.uid || '',
            email: result.user?.email || null,
            displayName: result.user?.displayName || null,
            photoUrl: result.user?.photoUrl || null,
          },
        };
      }

      return {
        provider: 'google',
        idToken: '', // Will be handled by Firebase SDK
        accessToken: result.credential.accessToken,
        serverAuthCode: result.credential.serverAuthCode,
        user: {
          id: result.user?.uid || '',
          email: result.user?.email || null,
          displayName: result.user?.displayName || null,
          photoUrl: result.user?.photoUrl || null,
        },
      };
    } catch (error: unknown) {
      // User canceled
      if (error && typeof error === 'object' && 'message' in error) {
        const err = error as { message: string };
        if (err.message.includes('cancel') || err.message.includes('abort')) {
          this.logger.debug('Google Sign-In canceled by user');
          return null;
        }
      }

      await this.haptics.notification('error');
      throw error;
    }
  }

  // ============================================
  // APPLE SIGN-IN
  // ============================================

  /**
   * Sign in with Apple using native ASAuthorizationController
   *
   * iOS only: Uses Apple's native Sign in with Apple SDK
   * Required by App Store if app offers any social login
   *
   * @returns NativeAuthResult with idToken and rawNonce for Firebase, or null on cancel
   * @throws Error on failure or if not on iOS
   */
  async signInWithApple(): Promise<NativeAuthResult | null> {
    if (!this.isNativeAvailable) {
      throw new Error('Native Apple Sign-In is only available on iOS/Android');
    }

    if (this.currentPlatform !== 'ios') {
      throw new Error('Apple Sign-In is only supported on iOS');
    }

    try {
      this.logger.info('Starting Apple Sign-In');
      await this.haptics.selection();
      const rawNonce = this.generateNonce();
      // Hash nonce with SHA-256 for Apple (required by Apple Sign-In)
      const hashedNonce = await this.sha256(rawNonce);
      // Configure Apple Sign-In options
      const options: SignInWithAppleOptions = {
        clientId: 'com.nxt1sports.nxt1', // Your app bundle ID (matches Xcode project)
        redirectURI: 'https://nxt1.app/__/auth/handler', // Firebase auth handler
        scopes: 'email name', // Request email and name
        state: Math.random().toString(36).substring(2, 15), // Random state for security
        nonce: hashedNonce, // Send SHA-256 hashed nonce to Apple
      };

      this.logger.debug('Apple Sign-In options', {
        clientId: options.clientId,
        hasRawNonce: !!rawNonce,
        hasHashedNonce: !!hashedNonce,
      });

      // Show native Apple Sign-In sheet
      const result: SignInWithAppleResponse = await SignInWithApple.authorize(options);

      this.logger.info('Apple Sign-In successful', {
        email: result.response.email,
        hasIdToken: !!result.response.identityToken,
        hasAuthCode: !!result.response.authorizationCode,
      });

      // Haptic feedback on success
      await this.haptics.notification('success');

      // Apple user ID should always be present, but handle null case defensively
      if (!result.response.user) {
        throw new Error('Apple Sign-In did not return user ID');
      }

      // Return standardized result for Firebase
      return {
        provider: 'apple',
        idToken: result.response.identityToken,
        rawNonce: rawNonce, // Pass raw (unhashed) nonce to Firebase
        user: {
          id: result.response.user,
          email: result.response.email ?? null,
          displayName:
            result.response.givenName && result.response.familyName
              ? `${result.response.givenName} ${result.response.familyName}`
              : null,
          givenName: result.response.givenName ?? null,
          familyName: result.response.familyName ?? null,
          photoUrl: null, // Apple doesn't provide photo
        },
      };
    } catch (error: unknown) {
      // User canceled
      if (error && typeof error === 'object' && 'message' in error) {
        const err = error as { message: string };
        if (err.message.includes('1001') || err.message.toLowerCase().includes('cancel')) {
          this.logger.debug('Apple Sign-In canceled by user');
          return null;
        }
      }

      // Error haptic feedback
      await this.haptics.notification('error');
      this.logger.error('Apple Sign-In error', error);
      throw error;
    }
  }

  /**
   * Generate a random nonce for Apple Sign-In
   * Used to prevent replay attacks
   */
  private generateNonce(length = 32): string {
    const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    let result = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);

    for (let i = 0; i < length; i++) {
      result += charset[randomValues[i] % charset.length];
    }

    return result;
  }

  /**
   * Hash a string with SHA-256
   * Required for Apple Sign-In nonce
   */
  private async sha256(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  // ============================================
  // MICROSOFT SIGN-IN (@capacitor-firebase/authentication)
  // ============================================

  /**
   * Sign in with Microsoft using @capacitor-firebase/authentication
   *
   * Uses Firebase's official plugin which supports Microsoft OAuth natively.
   * This creates proper Firebase users with Microsoft provider (icon appears in Console).
   *
   * @returns NativeAuthResult with Microsoft OAuth credential, or null if cancelled
   */
  async signInWithMicrosoft(): Promise<NativeAuthResult | null> {
    if (!this.isNativeAvailable) {
      this.logger.debug('Microsoft Sign-In - not on native platform');
      return null;
    }

    try {
      this.logger.info('Starting Microsoft Sign-In via native MSAL SDK');
      await this.haptics.selection();

      // Use MSAL directly to get native Microsoft tokens.
      // Firebase credential exchange is handled by FirebaseAuthService via
      // the backend /auth/microsoft/custom-token endpoint to avoid the
      // signInWithCredential 400 error and the @capacitor-firebase/authentication
      // "missing initial state" redirect flow issue in WebView.
      // Clear cached MSAL session first to force the account picker UI.
      // Without this, MSAL silently reuses the cached account and skips the picker.
      try {
        await MsAuthPlugin.logout({ clientId: environment.msClientId });
      } catch {
        // Ignore logout errors — no cached account is fine
      }

      const result = await MsAuthPlugin.login({
        clientId: environment.msClientId,
        // Use only User.Read for sign-in. MSAL automatically includes openid/profile/email
        // OIDC scopes so the idToken contains preferred_username/name claims.
        // Mail.Send and Mail.Read are admin-consent scopes that cannot be combined
        // with OIDC scopes in a single request for personal Microsoft accounts.
        scopes: ['User.Read'],
        prompt: 'select_account',
      });

      this.logger.info('Microsoft MSAL Sign-In successful', {
        hasIdToken: !!result.idToken,
        hasAccessToken: !!result.accessToken,
        scopes: result.scopes,
      });

      await this.haptics.notification('success');

      if (!result.idToken) {
        throw new Error('Microsoft Sign-In did not return ID token');
      }

      return {
        provider: 'microsoft',
        idToken: result.idToken,
        accessToken: result.accessToken,
        user: {
          id: '',
          email: null,
          displayName: null,
          photoUrl: null,
        },
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'message' in error) {
        const err = error as { message: string };
        if (
          err.message.includes('cancel') ||
          err.message.includes('abort') ||
          err.message.includes('user_cancelled')
        ) {
          this.logger.debug('Microsoft Sign-In canceled by user');
          return null;
        }
      }

      await this.haptics.notification('error');
      this.logger.error('Microsoft Sign-In error', error);
      throw error;
    }
  }

  // ============================================
  // SIGN OUT
  // ============================================

  /**
   * Sign out from native providers
   * Clears cached credentials on native platforms
   */
  async signOut(): Promise<void> {
    if (!this.isNativeAvailable) return;

    try {
      this.logger.debug('Signing out from Firebase Authentication...');
      await FirebaseAuthentication.signOut();
      this.logger.debug('Sign out successful');
    } catch (error: unknown) {
      // Log but don't throw - user might already be signed out
      this.logger.debug('Sign out error (may be already signed out)', {
        error: String(error),
      });
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Check if error is user cancellation
   */
  private isUserCancellation(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      const code = (error as Error & { code?: string }).code?.toLowerCase() ?? '';
      return (
        message.includes('cancel') ||
        message.includes('user closed') ||
        message.includes('popup closed') ||
        message.includes('aborted') ||
        message.includes('the user did not') ||
        message.includes('sign_in_cancelled') ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      );
    }
    return false;
  }

  /**
   * Map native errors to user-friendly messages
   */
  private mapNativeError(error: unknown, provider: NativeAuthProvider): Error {
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Network errors
      if (
        message.includes('network') ||
        message.includes('internet') ||
        message.includes('offline') ||
        message.includes('no connection')
      ) {
        return new Error('Please check your internet connection and try again.');
      }

      // Configuration errors
      if (
        message.includes('configuration') ||
        message.includes('client id') ||
        message.includes('misconfigured') ||
        message.includes('invalid_client')
      ) {
        // Log detailed error for debugging (not shown to user)
        this.logger.error(`Configuration error for ${provider}`, error);
        return new Error(
          `${providerName} Sign-In is not properly configured. Please contact support.`
        );
      }

      // App not authorized
      if (message.includes('not authorized') || message.includes('capability')) {
        return new Error(`${providerName} Sign-In is not enabled for this app.`);
      }

      // Timeout errors
      if (message.includes('timeout') || message.includes('timed out')) {
        return new Error('Sign-in timed out. Please try again.');
      }

      // Account conflicts
      if (message.includes('account-exists') || message.includes('already in use')) {
        return new Error(
          'An account with this email already exists. Try signing in with a different method.'
        );
      }

      // Generic error - don't expose internal details to users in production
      this.logger.error(`${providerName} Sign-In error`, error);
      return new Error(`${providerName} Sign-In failed. Please try again.`);
    }

    return new Error(`${providerName} Sign-In failed. Please try again.`);
  }

  /**
   * Wrap async operation with timeout
   */
  private withTimeout<T>(promise: Promise<T>, ms: number = NATIVE_AUTH_TIMEOUT): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), ms)
      ),
    ]);
  }
}
