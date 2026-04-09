/**
 * @fileoverview Email Connection Service - Mobile
 * @module @nxt1/mobile/core/services
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
} from '@nxt1/core/errors';
import type { InboxEmailProvider } from '@nxt1/core';
import { environment } from '../../../../environments/environment';
import { ProfileService } from '../state/profile.service';

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

  /** Lock to prevent concurrent connection attempts */
  private isMicrosoftConnecting = false;
  private isGmailConnecting = false;
  private isGoogleOAuthConnecting = false;
  private isYahooConnecting = false;

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

  /**
   * Connect Google or Microsoft via a real OAuth account-picker.
   * Pure CONNECT flow — only stores a refresh token for Agent X.
   * Does NOT call FirebaseAuthentication.signInWithGoogle and does NOT
   * change the user's current Firebase auth session.
   *
   * Returns `true` on success, `false` on failure (error shown via toast).
   */
  async connectForLinkedAccounts(
    platform: 'google' | 'microsoft',
    userId: string
  ): Promise<boolean> {
    this.logger.info('Connecting linked account via OAuth', { platform, userId });
    try {
      if (platform === 'google') {
        await this._connectGoogleOAuth(userId);
      } else {
        await this._connectMicrosoft(userId);
      }
      return true;
    } catch (error) {
      const providerName = platform === 'google' ? 'Google' : 'Microsoft';
      this.logger.error(`Failed to connect ${providerName} linked account`, error);
      if (!this._isUserCanceled(error) && !this._isAlreadyInProgress(error)) {
        this.toast.error(`Failed to connect ${providerName}. Please try again.`);
      }
      return false;
    }
  }

  // ============================================
  // GOOGLE OAUTH (connect-only, no Firebase sign-in)
  // ============================================

  /**
   * Connect Google account using system Browser OAuth2 code flow.
   * This is a pure CONNECT flow — opens the Google account picker via the
   * system browser, captures the redirect back to `nxt1sports://google/callback`,
   * then sends the authorization code to the backend for a refresh token.
   * Does NOT call FirebaseAuthentication.signInWithGoogle — does NOT change
   * the user's current Firebase auth session.
   *
   * Requires `nxt1sports://google/callback` to be registered in Google Cloud Console
   * under the web client credential's Authorized Redirect URIs.
   */
  private async _connectGoogleOAuth(userId: string): Promise<void> {
    if (this.isGoogleOAuthConnecting) {
      this.logger.warn('Google OAuth connection already in progress, ignoring...');
      return; // Silent no-op — treat duplicate taps as if user cancelled
    }

    if (!Capacitor.isNativePlatform()) {
      throw new Error(
        'Google OAuth connection requires the native mobile app. Please use the native iOS or Android app.'
      );
    }

    this.isGoogleOAuthConnecting = true;
    // Safety valve: release the lock after 6 minutes in case the deep-link never arrives
    const lockTimeout = setTimeout(
      () => {
        if (this.isGoogleOAuthConnecting) {
          this.logger.warn('Google OAuth lock timed out — releasing');
          this.isGoogleOAuthConnecting = false;
        }
      },
      6 * 60 * 1000
    );

    try {
      this.logger.info('Starting Google OAuth connect flow (backend-proxied)');

      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Failed to get authentication token. Please sign in again.');
      }

      // Ask the backend for the OAuth URL — the backend uses its own HTTPS redirect_uri
      // which IS registered in Google Cloud Console. The backend will redirect back to
      // `${appScheme}://oauth/callback` after exchanging tokens.
      const connectUrlEndpoint = `${environment.apiUrl}/auth/google/connect-url?mobileScheme=${encodeURIComponent(environment.appScheme)}`;
      const connectUrlRes = await fetch(connectUrlEndpoint, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!connectUrlRes.ok) {
        const errBody = await connectUrlRes.json().catch(() => null);
        throw new Error(
          (errBody as { message?: string } | null)?.message ??
            `Failed to get Google OAuth URL (${connectUrlRes.status})`
        );
      }
      const { url: oauthUrl } = (await connectUrlRes.json()) as { url: string };

      const callbackPrefix = `${environment.appScheme}://oauth/callback`;
      this.logger.debug('Opening backend-generated Google OAuth URL', { callbackPrefix });

      await new Promise<void>((resolve, reject) => {
        let resolved = false;
        let listenerHandle: Awaited<ReturnType<typeof App.addListener>> | null = null;

        const timeout = setTimeout(
          () => {
            if (!resolved) {
              resolved = true;
              void listenerHandle?.remove();
              reject(new Error('Google authentication timed out. Please try again.'));
            }
          },
          5 * 60 * 1000
        );

        void (async () => {
          listenerHandle = await App.addListener('appUrlOpen', (data: { url: string }) => {
            this.logger.debug('Received app URL open event', { url: data.url });

            if (!resolved && data.url.startsWith(callbackPrefix)) {
              resolved = true;
              clearTimeout(timeout);
              void listenerHandle?.remove();
              void Browser.close();

              const url = new URL(data.url);
              const success = url.searchParams.get('success') === 'true';
              const message = url.searchParams.get('message') ?? '';

              if (success) {
                resolve();
              } else {
                reject(
                  new Error(
                    message.toLowerCase().includes('cancel') || message === 'Connection cancelled'
                      ? 'Google authentication was canceled'
                      : `Google authentication failed: ${message}`
                  )
                );
              }
            }
          });
        })();

        void Browser.open({
          url: oauthUrl,
          presentationStyle: 'popover',
        });
      });

      this.logger.info('Google account connected successfully', { userId });
      await this.profileService.load(userId);
    } finally {
      clearTimeout(lockTimeout);
      this.isGoogleOAuthConnecting = false;
    }
  }

  // ============================================
  // GMAIL CONNECTION
  // ============================================

  /**
   * Connect Gmail account using @capacitor-firebase/authentication signInWithGoogle.
   * Obtains a serverAuthCode which the backend exchanges for a long-lived refresh token.
   * Requires GIDServerClientID in GoogleService-Info.plist to generate correct serverAuthCode.
   */
  private async _connectGmail(userId: string): Promise<void> {
    this.logger.info('Starting Gmail connection flow (native serverAuthCode for refresh_token)');

    // Check if running on native platform
    if (!Capacitor.isNativePlatform()) {
      throw new Error(
        'Gmail connection requires the native mobile app. Please use the native iOS or Android app, or connect via the web version.'
      );
    }

    // Get Firebase ID token for backend authentication
    const auth = getAuth();
    if (!auth.currentUser) {
      throw new Error('Failed to get authentication token. Please sign in again.');
    }
    const idToken = await auth.currentUser.getIdToken();

    // Sign in with Google to obtain serverAuthCode
    // Shows native Google account picker on iOS/Android
    // serverAuthCode is automatically generated when GoogleService-Info.plist has GIDServerClientID
    console.log('🚀 [DEBUG] About to call FirebaseAuthentication.signInWithGoogle');
    const result = await FirebaseAuthentication.signInWithGoogle({
      scopes: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
      ],
    });
    console.log('✅ [DEBUG] signInWithGoogle completed');

    if (!result.credential?.serverAuthCode) {
      throw new Error(
        'Failed to get serverAuthCode. Please check GoogleService-Info.plist has GIDServerClientID.'
      );
    }

    console.log('🔍 Gmail OAuth Credentials:', {
      hasServerAuthCode: !!result.credential.serverAuthCode,
      serverAuthCodeLength: result.credential.serverAuthCode.length,
      email: result.user?.email,
    });

    this.logger.debug('Got serverAuthCode', {
      hasServerAuthCode: !!result.credential.serverAuthCode,
      serverAuthCodeLength: result.credential.serverAuthCode.length,
      email: result.user?.email,
    });

    // Send serverAuthCode to backend for exchange → refresh_token
    console.log('📤 [DEBUG] Sending serverAuthCode to backend');
    await this._sendToBackend('/auth/google/connect-gmail', idToken, {
      serverAuthCode: result.credential.serverAuthCode,
    });

    this.logger.info('Gmail connected successfully (backend has refresh_token now)', {
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
   * Requires `nxt1sports://ms/callback` to be registered in Azure AD as a redirect URI
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

    // Get Firebase ID token for backend authentication
    const auth = getAuth();
    const idToken = await auth.currentUser?.getIdToken();

    if (!idToken) {
      throw new Error('Failed to get authentication token. Please sign in again.');
    }

    // Ask the backend for the OAuth URL — the backend uses its own HTTPS redirect_uri
    // registered in Azure AD. The backend will redirect back to
    // `${appScheme}://oauth/callback` after exchanging tokens.
    const connectUrlEndpoint = `${environment.apiUrl}/auth/microsoft/connect-url?mobileScheme=${encodeURIComponent(environment.appScheme)}`;
    const connectUrlRes = await fetch(connectUrlEndpoint, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!connectUrlRes.ok) {
      const errBody = await connectUrlRes.json().catch(() => null);
      throw new Error(
        (errBody as { message?: string } | null)?.message ??
          `Failed to get Microsoft OAuth URL (${connectUrlRes.status})`
      );
    }
    const { url: oauthUrl } = (await connectUrlRes.json()) as { url: string };

    const callbackPrefix = `${environment.appScheme}://oauth/callback`;
    this.logger.debug('Opening backend-generated Microsoft OAuth URL', { callbackPrefix });

    // Set up app URL listener for redirect callback
    await new Promise<void>((resolve, reject) => {
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
          this.logger.debug('Received app URL open event', { url: data.url });

          if (!resolved && data.url.startsWith(callbackPrefix)) {
            resolved = true;
            clearTimeout(timeout);
            void listenerHandle?.remove();
            void Browser.close();

            const url = new URL(data.url);
            const success = url.searchParams.get('success') === 'true';
            const message = url.searchParams.get('message') ?? '';

            if (success) {
              resolve();
            } else {
              reject(
                new Error(
                  message.toLowerCase().includes('cancel') || message === 'Connection cancelled'
                    ? 'Microsoft authentication was canceled'
                    : `Microsoft authentication failed: ${message}`
                )
              );
            }
          }
        });
      })();

      // Open system browser for OAuth
      void Browser.open({
        url: oauthUrl,
        presentationStyle: 'popover',
      });
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
    console.log('🌐 [DEBUG] Full API URL:', url); // Log để kiểm tra staging vs prod
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        this.logger.debug(`Sending credentials to backend (attempt ${attempt}/${maxAttempts})`, {
          url,
          hasServerAuthCode: !!credentials['serverAuthCode'],
          hasAccessToken: !!credentials['accessToken'],
          hasCode: !!credentials['code'],
          hasRedirectUri: !!credentials['redirectUri'],
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

        // Log full error details to Xcode console with JSON stringification
        console.error('❌ [DEBUG] Backend Error Details:');
        console.error('  Status:', response.status, response.statusText);
        console.error('  Error Data:', JSON.stringify(errorData, null, 2));
        console.error('  Endpoint:', endpoint);

        this.logger.error('Backend API error response', {
          status: response.status,
          statusText: response.statusText,
          errorData: errorData ? JSON.stringify(errorData) : null,
          endpoint,
        });

        const apiError = parseApiError(errorData || { status: response.status });

        // Auth codes are one-time use and expire quickly — never retry.
        if (credentials['code'] || credentials['serverAuthCode']) {
          throw apiError;
        }

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
  private _isAlreadyInProgress(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const msg = String((error as Record<string, unknown>)['message'] || '').toLowerCase();
    return msg.includes('already in progress');
  }

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
