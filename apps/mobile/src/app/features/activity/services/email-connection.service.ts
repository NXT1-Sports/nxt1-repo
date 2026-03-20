/**
 * @fileoverview Email Connection Service - Mobile
 * @module @nxt1/mobile/features/activity/services
 * @version 1.0.0
 *
 * Handles connecting Gmail, Microsoft, and Yahoo email accounts for inbox sync.
 * - Gmail: Uses @capacitor-firebase/authentication signInWithGoogle (serverAuthCode flow)
 * - Microsoft: Uses Browser OAuth authorization code flow (system browser)
 * - Yahoo: Uses Capacitor Browser OAuth redirect flow
 *
 * Features:
 * - Native account selection UI
 * - Full error handling with @nxt1/core/errors
 * - API validation and retry logic
 * - Haptic feedback for user actions
 */

import { Injectable, inject } from '@angular/core';
import { getAuth } from '@angular/fire/auth';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NxtLoggingService, NxtToastService, HapticsService } from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';
import {
  parseApiError,
  getErrorMessage,
  shouldRetry,
  getRetryDelay,
  requiresAuth,
  isValidationError,
  getFieldErrors,
  type ApiErrorDetail,
} from '@nxt1/core/errors';
import type { InboxEmailProvider } from '@nxt1/core';
import { environment } from '../../../../environments/environment';
import { ProfileService } from '../../../core/services/profile.service';

/**
 * Mobile Email Connection Service
 *
 * Connects Gmail, Microsoft, and Yahoo accounts for inbox synchronization.
 * Native SDKs automatically show account picker for user selection.
 */
@Injectable({ providedIn: 'root' })
export class MobileEmailConnectionService {
  private readonly logger: ILogger = inject(NxtLoggingService).child(
    'MobileEmailConnectionService'
  );
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  private readonly profileService = inject(ProfileService);

  /**
   * Connect an email provider account.
   * Shows native account picker and sends credentials to backend.
   *
   * @param provider - Email provider to connect
   * @param userId - Current user's Firebase UID
   * @throws Never - errors are handled internally with toast notifications
   */
  async connectProvider(provider: InboxEmailProvider, userId: string): Promise<void> {
    this.logger.info('Connecting email provider', { provider: provider.id, userId });

    try {
      await this.haptics.selection();

      if (provider.id === 'gmail') {
        await this._connectGmail(userId);
      } else if (provider.id === 'microsoft') {
        await this._connectMicrosoft(userId);
      } else if (provider.id === 'yahoo') {
        await this._connectYahoo(userId);
      } else {
        throw new Error(`Unsupported provider: ${provider.id}`);
      }

      await this.haptics.notification('success');
      this.toast.success(`${provider.name} connected successfully!`);
    } catch (error) {
      await this.haptics.notification('error');
      this._handleConnectionError(error, provider);
    }
  }

  // ============================================
  // GMAIL CONNECTION
  // ============================================

  /**
   * Connect Gmail account using @capacitor-firebase/authentication signInWithGoogle.
   * Obtains a serverAuthCode which the backend exchanges for a long-lived refresh token.
   *
   * Token capture strategy:
   * - Capture idToken BEFORE signInWithGoogle (original user token — not affected by Google sign-in)
   * - signInWithGoogle may update Firebase auth state on device, but the pre-captured
   *   idToken remains cryptographically valid for the original UID for its 1-hour lifetime
   */
  private async _connectGmail(userId: string): Promise<void> {
    this.logger.info('Starting Gmail connection flow');

    // Check if running on native platform
    if (!Capacitor.isNativePlatform()) {
      throw new Error(
        'Gmail connection requires the native mobile app. Please use the native iOS or Android app, or connect via the web version.'
      );
    }

    // Capture idToken BEFORE signInWithGoogle to preserve the original user's auth token.
    // signInWithGoogle (skipNativeAuth:false) refreshes Firebase auth state on device;
    // capturing beforehand ensures we send the correct user's token to the backend.
    const auth = getAuth();
    if (!auth.currentUser) {
      throw new Error('Failed to get authentication token. Please sign in again.');
    }
    const idToken = await auth.currentUser.getIdToken();

    // Sign in with Google to obtain serverAuthCode.
    // Shows native Google account picker on iOS/Android.
    const result = await FirebaseAuthentication.signInWithGoogle({
      scopes: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
      ],
    });

    if (!result.credential?.serverAuthCode && !result.credential?.accessToken) {
      throw new Error(
        'Failed to get Google credentials. Please try again or check app permissions.'
      );
    }

    this.logger.debug('Got Google credentials', {
      hasServerAuthCode: !!result.credential.serverAuthCode,
      hasAccessToken: !!result.credential.accessToken,
      email: result.user?.email,
    });

    // Send credentials to backend using original user's idToken.
    // redirect_uri is intentionally omitted for the native serverAuthCode exchange
    // (Google token endpoint requires empty/absent redirect_uri for native codes).
    await this._sendToBackend('/auth/google/connect-gmail', idToken, {
      serverAuthCode: result.credential.serverAuthCode,
      accessToken: result.credential.accessToken,
    });

    this.logger.info('Gmail connected successfully', {
      userId,
      email: result.user?.email,
    });

    // Reload profile to update connectedEmails in UI
    await this.profileService.load(userId);
  }

  // ============================================
  // MICROSOFT CONNECTION
  // ============================================

  /**
   * Connect Microsoft (Outlook) account using Browser-based OAuth authorization code flow.
   * Opens the system browser for Microsoft sign-in, then captures the redirect back to the app.
   * Requires `nxt1sports://microsoft/callback` to be registered in Azure AD as a redirect URI
   * under "Mobile and desktop applications > Custom redirect URIs".
   */
  private async _connectMicrosoft(userId: string): Promise<void> {
    this.logger.info('Starting Microsoft connection flow');

    // Check if running on native platform
    if (!Capacitor.isNativePlatform()) {
      throw new Error(
        'Microsoft email connection requires the native mobile app. Please use the native iOS or Android app.'
      );
    }

    // Validate Microsoft client ID is configured
    if (!environment.msClientId) {
      throw new Error(
        'Microsoft authentication is not configured. Please set up an Azure AD app and add the client ID to environment.msClientId.'
      );
    }

    // Get Firebase ID token for backend authentication
    const auth = getAuth();
    const idToken = await auth.currentUser?.getIdToken();

    if (!idToken) {
      throw new Error('Failed to get authentication token. Please sign in again.');
    }

    // Build OAuth URL (authorization code flow, same pattern as Yahoo)
    const redirectUri = `${environment.appScheme}://microsoft/callback`;
    const oauthUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    oauthUrl.searchParams.set('client_id', environment.msClientId);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('response_mode', 'query');
    oauthUrl.searchParams.set('scope', 'User.Read Mail.Send Mail.Read offline_access');
    oauthUrl.searchParams.set('state', userId);
    oauthUrl.searchParams.set('prompt', 'select_account');

    this.logger.debug('Opening Microsoft OAuth URL', { redirectUri });

    // Set up app URL listener for redirect callback
    const authCode = await new Promise<string>((resolve, reject) => {
      let resolved = false;
      let listenerHandle: Awaited<ReturnType<typeof App.addListener>> | null = null;

      const timeout = setTimeout(
        () => {
          if (!resolved) {
            resolved = true;
            void listenerHandle?.remove();
            reject(new Error('Microsoft authentication timed out. Please try again.'));
          }
        },
        5 * 60 * 1000 // 5 minutes
      );

      void (async () => {
        listenerHandle = await App.addListener('appUrlOpen', (data: { url: string }) => {
          if (!resolved && data.url.startsWith(redirectUri)) {
            resolved = true;
            clearTimeout(timeout);
            void listenerHandle?.remove();
            void Browser.close();

            const url = new URL(data.url);
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');

            if (error) {
              reject(
                new Error(
                  error === 'access_denied'
                    ? 'Microsoft authentication was canceled'
                    : `Microsoft authentication failed: ${error}`
                )
              );
            } else if (code) {
              resolve(code);
            } else {
              reject(new Error('No authorization code received from Microsoft'));
            }
          }
        });
      })();

      // Open system browser for OAuth
      void Browser.open({
        url: oauthUrl.toString(),
        presentationStyle: 'popover',
      });
    });

    this.logger.debug('Got Microsoft authorization code');

    // Send code to backend for token exchange
    await this._sendToBackend('/auth/microsoft/connect-mail', idToken, {
      code: authCode,
      redirectUri,
    });

    this.logger.info('Microsoft connected successfully', { userId });

    // Reload profile to update connectedEmails in UI
    await this.profileService.load(userId);
  }

  // ============================================
  // YAHOO CONNECTION
  // ============================================

  /**
   * Connect Yahoo account using Browser OAuth redirect flow.
   * Opens system browser for authentication, then captures redirect.
   * Only available on iOS/Android native platforms.
   */
  private async _connectYahoo(userId: string): Promise<void> {
    this.logger.info('Starting Yahoo connection flow');

    // Check if running on native platform
    if (!Capacitor.isNativePlatform()) {
      throw new Error(
        'Yahoo email connection requires the native mobile app. Please use the native iOS or Android app.'
      );
    }

    // Validate Yahoo client ID is configured
    if (!environment.yahooClientId) {
      throw new Error(
        'Yahoo authentication is not configured. Please set up a Yahoo app and add the client ID to environment.yahooClientId.'
      );
    }

    // Get Firebase ID token for backend authentication
    const auth = getAuth();
    const idToken = await auth.currentUser?.getIdToken();

    if (!idToken) {
      throw new Error('Failed to get authentication token. Please sign in again.');
    }

    // Build OAuth URL
    const redirectUri = `${environment.appScheme}://yahoo/callback`;
    const oauthUrl = new URL('https://api.login.yahoo.com/oauth2/request_auth');
    oauthUrl.searchParams.set('client_id', environment.yahooClientId);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('state', userId);
    oauthUrl.searchParams.set('scope', 'mail-w');
    oauthUrl.searchParams.set('prompt', 'consent');

    this.logger.debug('Opening Yahoo OAuth URL', {
      redirectUri,
    });

    // Set up app URL listener for redirect callback
    const authCode = await new Promise<string>((resolve, reject) => {
      let resolved = false;
      let listenerHandle: Awaited<ReturnType<typeof App.addListener>> | null = null;

      const timeout = setTimeout(
        () => {
          if (!resolved) {
            resolved = true;
            void listenerHandle?.remove();
            reject(new Error('Yahoo authentication timed out. Please try again.'));
          }
        },
        5 * 60 * 1000
      ); // 5 minutes timeout

      void (async () => {
        listenerHandle = await App.addListener('appUrlOpen', (data: { url: string }) => {
          if (!resolved && data.url.startsWith(redirectUri)) {
            resolved = true;
            clearTimeout(timeout);
            void listenerHandle?.remove();
            void Browser.close();

            // Parse authorization code from URL
            const url = new URL(data.url);
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');

            if (error) {
              reject(
                new Error(
                  error === 'access_denied'
                    ? 'Yahoo authentication was canceled'
                    : `Yahoo authentication failed: ${error}`
                )
              );
            } else if (code) {
              resolve(code);
            } else {
              reject(new Error('No authorization code received from Yahoo'));
            }
          }
        });
      })();

      // Open browser for OAuth
      void Browser.open({
        url: oauthUrl.toString(),
        presentationStyle: 'popover',
      });
    });

    this.logger.debug('Got Yahoo authorization code');

    // Send code to backend for token exchange
    await this._sendToBackend('/auth/yahoo/connect-mail', idToken, {
      code: authCode,
      redirectUri,
    });

    this.logger.info('Yahoo connected successfully', {
      userId,
    });

    // Reload profile to update connectedEmails in UI
    await this.profileService.load(userId);
  }

  // ============================================
  // BACKEND API
  // ============================================

  /**
   * Send OAuth credentials to backend API.
   * Includes retry logic and comprehensive error handling.
   */
  private async _sendToBackend(
    endpoint: string,
    idToken: string,
    credentials: Record<string, unknown>
  ): Promise<void> {
    const url = `${environment.apiUrl}${endpoint}`;
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        this.logger.debug(`Sending credentials to backend (attempt ${attempt}/${maxAttempts})`, {
          url,
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(credentials),
        });

        if (response.ok) {
          this.logger.info('Backend API call successful', { endpoint, attempt });
          return;
        }

        // Parse error response
        const errorData = await response.json().catch(() => null);
        const apiError = parseApiError(errorData || { status: response.status });

        // Check if we should retry
        if (shouldRetry(apiError) && attempt < maxAttempts) {
          const delay = getRetryDelay(apiError);
          this.logger.warn('API call failed, retrying', {
            endpoint,
            attempt,
            error: apiError.code,
            retryAfter: delay,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // No more retries - throw the error
        throw apiError;
      } catch (error) {
        // Network error or timeout
        if (
          error instanceof TypeError ||
          (error && typeof error === 'object' && 'message' in error && !('code' in error))
        ) {
          if (attempt < maxAttempts) {
            this.logger.warn('Network error, retrying', { endpoint, attempt, error });
            await new Promise((resolve) => setTimeout(resolve, 2000));
            continue;
          }
        }

        throw error;
      }
    }
  }

  // ============================================
  // ERROR HANDLING
  // ============================================

  /**
   * Handle connection errors with user-friendly messages.
   * Uses @nxt1/core/errors for consistent error parsing.
   */
  private _handleConnectionError(error: unknown, provider: InboxEmailProvider): void {
    this.logger.error('Email connection failed', error, { provider: provider.id });

    // User canceled OAuth flow
    if (this._isUserCanceled(error)) {
      this.logger.debug('User canceled OAuth flow');
      return; // Silent - no toast needed
    }

    // Parse API error
    const apiError = parseApiError(error);
    const message = getErrorMessage(apiError);

    // Handle platform requirement error
    if (message.includes('native mobile app') || message.includes('native iOS or Android app')) {
      this.toast.error(message);
      return;
    }

    // Handle Azure AD configuration errors
    if (
      message.includes('unauthorized_client') ||
      message.includes('client does not exist') ||
      message.includes('not configured') ||
      message.includes('Azure AD app')
    ) {
      this.toast.error(
        `${provider.name} is not configured yet. Please contact support or try again later.`
      );
      return;
    }

    // Handle specific error cases
    if (requiresAuth(apiError)) {
      this.toast.error('Your session has expired. Please sign in again.');
      return;
    }

    if (isValidationError(apiError)) {
      const fieldErrors = getFieldErrors(apiError);
      if (fieldErrors.length > 0) {
        this.toast.error(fieldErrors[0].message);
        return;
      }
    }

    // Handle provider-specific errors
    if (message.includes('permission') || message.includes('scope')) {
      this.toast.error(`Please grant ${provider.name} permissions to connect your account.`);
      return;
    }

    if (message.includes('network') || message.includes('connection')) {
      this.toast.error('Connection failed. Please check your internet and try again.');
      return;
    }

    // Generic error with provider context
    this.toast.error(`Failed to connect ${provider.name}. ${message}`);
  }

  /**
   * Check if error is from user canceling OAuth flow
   */
  private _isUserCanceled(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const err = error as Record<string, unknown>;
    const message = String(err['message'] || '').toLowerCase();

    return (
      message.includes('cancel') ||
      message.includes('abort') ||
      message.includes('user denied') ||
      message.includes('user rejected') ||
      err['code'] === 'auth/popup-closed-by-user' ||
      err['code'] === 'auth/cancelled-popup-request'
    );
  }
}
