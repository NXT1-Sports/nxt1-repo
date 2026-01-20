/**
 * Native Auth Service - Capacitor Plugin Integration
 *
 * Handles native OAuth authentication using Capacitor plugins:
 * - @capacitor-firebase/authentication for Google/Apple/Microsoft
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
 * │        @capacitor-firebase/authentication                  │
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
  FirebaseAuthentication,
  type SignInResult,
  type SignInWithOAuthOptions,
} from '@capacitor-firebase/authentication';
import { NxtPlatformService, HapticsService } from '@nxt1/ui';
import type { NativeAuthResult, NativeAuthProvider, NativeAuthAvailability } from '@nxt1/core';

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

    const isIOS = this.currentPlatform === 'ios';

    return {
      google: true, // Available on both iOS and Android
      apple: isIOS, // Only available on iOS 13+
      microsoft: true, // Available via OAuth on both platforms
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
      console.warn('[NativeAuthService] Native Google Sign-In called on non-native platform');
      throw new Error('Native Google Sign-In is only available on iOS/Android');
    }

    try {
      // Provide haptic feedback for native feel
      await this.haptics.impact('light');

      console.debug('[NativeAuthService] Starting Google Sign-In...');
      const result: SignInResult = await FirebaseAuthentication.signInWithGoogle();

      // User cancelled
      if (!result.user) {
        console.debug('[NativeAuthService] Google Sign-In cancelled by user');
        return null;
      }

      // Get the credential for Firebase
      const credential = result.credential;
      if (!credential?.idToken) {
        console.error('[NativeAuthService] No ID token received from Google Sign-In');
        throw new Error('No ID token received from Google Sign-In');
      }

      console.debug('[NativeAuthService] Google Sign-In successful:', result.user.email);
      return this.mapSignInResult(result, 'google');
    } catch (error) {
      // Handle user cancellation gracefully
      if (this.isUserCancellation(error)) {
        console.debug('[NativeAuthService] Google Sign-In cancelled');
        return null;
      }
      console.error('[NativeAuthService] Google Sign-In failed:', error);
      throw this.mapNativeError(error, 'google');
    }
  }

  // ============================================
  // APPLE SIGN-IN
  // ============================================

  /**
   * Sign in with Apple using native UI (iOS only)
   *
   * Uses ASAuthorizationController for native Apple Sign-In.
   * Apple requires this for apps with social login on iOS.
   *
   * @returns NativeAuthResult with idToken for Firebase, or null on cancel
   * @throws Error on failure or if not on iOS
   */
  async signInWithApple(): Promise<NativeAuthResult | null> {
    if (!this.isNativeAvailable) {
      console.warn('[NativeAuthService] Native Apple Sign-In called on non-native platform');
      throw new Error('Native Apple Sign-In is only available on iOS');
    }

    if (this.currentPlatform !== 'ios') {
      console.warn('[NativeAuthService] Apple Sign-In called on Android');
      throw new Error('Apple Sign-In is only available on iOS devices');
    }

    try {
      await this.haptics.impact('light');

      console.debug('[NativeAuthService] Starting Apple Sign-In...');
      const result: SignInResult = await FirebaseAuthentication.signInWithApple({
        scopes: ['email', 'name'],
        skipNativeAuth: false,
      });

      // User cancelled
      if (!result.user) {
        console.debug('[NativeAuthService] Apple Sign-In cancelled by user');
        return null;
      }

      const credential = result.credential;
      if (!credential?.idToken) {
        console.error('[NativeAuthService] No ID token received from Apple Sign-In');
        throw new Error('No ID token received from Apple Sign-In');
      }

      console.debug('[NativeAuthService] Apple Sign-In successful:', result.user.email);
      return this.mapSignInResult(result, 'apple');
    } catch (error) {
      if (this.isUserCancellation(error)) {
        console.debug('[NativeAuthService] Apple Sign-In cancelled');
        return null;
      }
      console.error('[NativeAuthService] Apple Sign-In failed:', error);
      throw this.mapNativeError(error, 'apple');
    }
  }

  // ============================================
  // MICROSOFT SIGN-IN
  // ============================================

  /**
   * Sign in with Microsoft using OAuth
   *
   * Uses in-app browser OAuth flow.
   *
   * @returns NativeAuthResult with idToken for Firebase, or null on cancel
   * @throws Error on failure
   */
  async signInWithMicrosoft(): Promise<NativeAuthResult | null> {
    if (!this.isNativeAvailable) {
      console.warn('[NativeAuthService] Native Microsoft Sign-In called on non-native platform');
      throw new Error('Native Microsoft Sign-In is only available on iOS/Android');
    }

    try {
      await this.haptics.impact('light');

      console.debug('[NativeAuthService] Starting Microsoft Sign-In...');
      const options: SignInWithOAuthOptions = {
        scopes: ['email', 'profile', 'User.Read'],
      };

      const result: SignInResult = await FirebaseAuthentication.signInWithMicrosoft(options);

      // User cancelled
      if (!result.user) {
        console.debug('[NativeAuthService] Microsoft Sign-In cancelled by user');
        return null;
      }

      const credential = result.credential;
      if (!credential?.idToken && !credential?.accessToken) {
        console.error('[NativeAuthService] No token received from Microsoft Sign-In');
        throw new Error('No token received from Microsoft Sign-In');
      }

      console.debug('[NativeAuthService] Microsoft Sign-In successful:', result.user.email);
      return this.mapSignInResult(result, 'microsoft');
    } catch (error) {
      if (this.isUserCancellation(error)) {
        console.debug('[NativeAuthService] Microsoft Sign-In cancelled');
        return null;
      }
      console.error('[NativeAuthService] Microsoft Sign-In failed:', error);
      throw this.mapNativeError(error, 'microsoft');
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
      await FirebaseAuthentication.signOut();
    } catch (error) {
      // Ignore sign-out errors - user is already signed out locally
      console.warn('[NativeAuth] Sign out warning:', error);
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Map Capacitor SignInResult to portable NativeAuthResult
   */
  private mapSignInResult(result: SignInResult, provider: NativeAuthProvider): NativeAuthResult {
    const { user, credential } = result;

    // Type assertion for extended user properties from Apple Sign-In
    interface ExtendedUser {
      givenName?: string | null;
      familyName?: string | null;
    }

    const extendedUser = user as (typeof user & ExtendedUser) | null;

    return {
      provider,
      idToken: credential?.idToken ?? '',
      accessToken: credential?.accessToken ?? undefined,
      rawNonce: credential?.nonce ?? undefined,
      user: {
        id: user?.uid ?? '',
        email: user?.email ?? null,
        displayName: user?.displayName ?? null,
        givenName: extendedUser?.givenName ?? null,
        familyName: extendedUser?.familyName ?? null,
        photoUrl: user?.photoUrl ?? null,
      },
    };
  }

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
        console.error(`[NativeAuthService] Configuration error for ${provider}:`, error);
        return new Error(
          `${providerName} Sign-In is not properly configured. Please contact support.`
        );
      }

      // App not authorized (Apple)
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
      console.error(`[NativeAuthService] ${providerName} Sign-In error:`, error);
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
