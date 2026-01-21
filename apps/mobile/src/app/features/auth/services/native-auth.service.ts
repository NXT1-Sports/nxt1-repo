/**
 * Native Auth Service - Capacitor Plugin Integration
 *
 * Handles native OAuth authentication using Capacitor plugins:
 * - @codetrix-studio/capacitor-google-auth for Google Sign-In
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
 * │        @codetrix-studio/capacitor-google-auth              │
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
// TODO: Uncomment when @codetrix-studio/capacitor-google-auth is installed
// import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
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

    return {
      // TODO: Set to true when @codetrix-studio/capacitor-google-auth is installed
      google: false, // Requires @codetrix-studio/capacitor-google-auth
      apple: false, // Not supported by current plugin
      microsoft: false, // Not supported by current plugin
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
    // TODO: Uncomment when @codetrix-studio/capacitor-google-auth is installed
    throw new Error(
      'Google Sign-In requires @codetrix-studio/capacitor-google-auth. Install with: npm install @codetrix-studio/capacitor-google-auth'
    );
  }

  // ============================================
  // APPLE SIGN-IN (Not supported - requires additional plugin)
  // ============================================

  /**
   * Sign in with Apple - NOT SUPPORTED in current implementation
   *
   * To enable Apple Sign-In, install:
   * npm install @capacitor-community/apple-sign-in
   */
  async signInWithApple(): Promise<NativeAuthResult | null> {
    throw new Error(
      'Apple Sign-In requires additional plugin. Install @capacitor-community/apple-sign-in'
    );
  }

  // ============================================
  // MICROSOFT SIGN-IN (Not supported - requires additional plugin)
  // ============================================

  /**
   * Sign in with Microsoft - NOT SUPPORTED in current implementation
   */
  async signInWithMicrosoft(): Promise<NativeAuthResult | null> {
    throw new Error('Microsoft Sign-In is not currently supported in native mobile');
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

    // TODO: Uncomment when @codetrix-studio/capacitor-google-auth is installed
    // try {
    //   await GoogleAuth.signOut();
    // } catch (error) {
    //   // Ignore sign-out errors - user is already signed out locally
    //   console.warn('[NativeAuth] Sign out warning:', error);
    // }
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
        console.error(`[NativeAuthService] Configuration error for ${provider}:`, error);
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
