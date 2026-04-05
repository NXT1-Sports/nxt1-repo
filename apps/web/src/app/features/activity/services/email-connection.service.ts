/**
 * @fileoverview Email Connection Service - Web
 * @module @nxt1/web/features/activity/services
 * @version 1.0.0
 *
 * Handles connecting Gmail, Microsoft, and Yahoo email accounts for inbox sync on web.
 * Uses browser-based OAuth flows with popup account selection:
 * - Gmail: Uses Firebase signInWithPopup with Google provider
 * - Microsoft: Uses OAuth authorization code flow (popup window)
 * - Yahoo: Uses OAuth authorization code flow (popup window)
 *
 * Features:
 * - Pure authorization flows (no "sign in" confusion)
 * - Browser popup account selection
 * - Full error handling with @nxt1/core/errors
 * - API validation and retry logic
 * - Popup blocker detection
 */

import { Injectable, inject } from '@angular/core';
import { getAuth, GoogleAuthProvider, signInWithPopup } from '@angular/fire/auth';
import { NxtLoggingService, NxtToastService } from '@nxt1/ui';
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
import { AUTH_SERVICE, type IAuthService } from '../../auth/services/auth.interface';

/**
 * Web Email Connection Service
 *
 * Connects Gmail, Microsoft, and Yahoo accounts using browser-based OAuth flows.
 * Popups automatically show account selection.
 */
@Injectable({ providedIn: 'root' })
export class WebEmailConnectionService {
  private readonly logger: ILogger = inject(NxtLoggingService).child('WebEmailConnectionService');
  private readonly toast = inject(NxtToastService);
  private readonly authService = inject(AUTH_SERVICE) as IAuthService;

  /** Lock to prevent concurrent connection attempts */
  private isMicrosoftConnecting = false;
  private isGmailConnecting = false;
  private isYahooConnecting = false;

  /**
   * Connect an email provider account.
   * Shows browser popup with account picker and sends credentials to backend.
   *
   * @param provider - Email provider to connect
   * @param userId - Current user's Firebase UID
   * @throws Never - errors are handled internally with toast notifications
   */
  async connectProvider(provider: InboxEmailProvider, userId: string): Promise<void> {
    this.logger.info('Connecting email provider', { provider: provider.id, userId });

    try {
      if (provider.id === 'gmail') {
        await this._connectGmail(userId);
      } else if (provider.id === 'microsoft') {
        await this._connectMicrosoft(userId);
      } else if (provider.id === 'yahoo') {
        await this._connectYahoo(userId);
      } else {
        throw new Error(`Unsupported provider: ${provider.id}`);
      }

      this.toast.success(`${provider.name} connected successfully!`);
    } catch (error) {
      this._handleConnectionError(error, provider);
    }
  }

  // ============================================
  // GMAIL CONNECTION
  // ============================================

  /**
   * Connect Gmail account using Firebase signInWithPopup.
   * Shows Google account picker in browser popup.
   */
  private async _connectGmail(userId: string): Promise<void> {
    // Prevent concurrent connection attempts
    if (this.isGmailConnecting) {
      this.logger.warn('Gmail connection already in progress, ignoring...');
      throw new Error('Gmail connection is already in progress. Please wait.');
    }

    this.isGmailConnecting = true;

    try {
      this.logger.info('Starting Gmail connection flow');

      // Get Firebase ID token for backend authentication
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();

      if (!idToken) {
        throw new Error('Failed to get authentication token. Please sign in again.');
      }

      // Create Google provider with Gmail scopes
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/gmail.send');
      provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
      provider.setCustomParameters({
        prompt: 'select_account', // Force account selection
      });

      // Sign in with popup - shows Google account picker
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);

      if (!credential?.accessToken) {
        throw new Error(
          'Failed to get Google credentials. Please allow popup and grant permissions.'
        );
      }

      this.logger.debug('Got Google credentials', {
        hasAccessToken: !!credential.accessToken,
        email: result.user.email,
      });

      // Send credentials to backend (only accessToken, Firebase idToken goes in Authorization header)
      await this._sendToBackend('/auth/google/connect-gmail', idToken, {
        accessToken: credential.accessToken,
      });

      this.logger.info('Gmail connected successfully', {
        userId,
        email: result.user.email,
      });
      // Refresh user profile to update connectedEmails in UI
      this.logger.debug('🔄 Refreshing user profile after Gmail connection...');
      await this.authService.refreshUserProfile?.();
      this.logger.info('✅ User profile refreshed - UI should update now');
    } finally {
      // Always release lock
      this.isGmailConnecting = false;
    }
  }

  // ============================================
  // MICROSOFT CONNECTION
  // ============================================

  /**
   * Connect Microsoft account using popup OAuth authorization flow.
   * Uses direct OAuth URL instead of MSAL to avoid "sign in" confusion.
   *
   * This is pure authorization - only requesting email permissions,
   * not authenticating the user into the app.
   */
  private async _connectMicrosoft(userId: string): Promise<void> {
    // Prevent concurrent connection attempts
    if (this.isMicrosoftConnecting) {
      this.logger.warn('Microsoft connection already in progress, ignoring...');
      throw new Error('Microsoft connection is already in progress. Please wait.');
    }

    this.isMicrosoftConnecting = true;

    try {
      this.logger.info('Starting Microsoft connection flow');

      // Validate Microsoft configuration
      if (
        !environment.msalConfig?.clientId ||
        environment.msalConfig.clientId === 'YOUR_MICROSOFT_APP_CLIENT_ID'
      ) {
        throw new Error(
          'Microsoft authentication is not configured. Please set up an Azure AD app and add the client ID to environment.msalConfig.'
        );
      }

      // Get Firebase ID token for backend authentication
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();

      if (!idToken) {
        throw new Error('Failed to get authentication token. Please sign in again.');
      }

      // Build OAuth URL (similar to Yahoo flow)
      const redirectUri = `${window.location.origin}/microsoft/callback`;
      const oauthUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      oauthUrl.searchParams.set('client_id', environment.msalConfig.clientId);
      oauthUrl.searchParams.set('response_type', 'code');
      oauthUrl.searchParams.set('redirect_uri', redirectUri);
      oauthUrl.searchParams.set('response_mode', 'query');
      oauthUrl.searchParams.set('scope', 'User.Read Mail.Send Mail.Read offline_access');
      oauthUrl.searchParams.set('state', userId);
      oauthUrl.searchParams.set('prompt', 'consent'); // Force consent screen

      this.logger.debug('Opening Microsoft OAuth popup', {
        redirectUri,
      });

      // Open popup window for OAuth
      const popup = window.open(
        oauthUrl.toString(),
        'microsoft-oauth',
        'width=600,height=700,popup=1,resizable=1'
      );

      if (!popup) {
        throw new Error(
          'Popup blocked! Please allow popups for this site and try again. You may need to check your browser settings.'
        );
      }

      // Wait for redirect callback with authorization code
      const authCode = await new Promise<string>((resolve, reject) => {
        let resolved = false;
        const timeout = setTimeout(
          () => {
            if (!resolved) {
              resolved = true;
              popup.close();
              reject(new Error('Microsoft authentication timed out. Please try again.'));
            }
          },
          5 * 60 * 1000
        ); // 5 minutes timeout

        // Poll popup URL for redirect
        const checkPopup = setInterval(() => {
          if (!popup || popup.closed) {
            if (!resolved) {
              resolved = true;
              clearInterval(checkPopup);
              clearTimeout(timeout);
              reject(new Error('Microsoft authentication window was closed. Please try again.'));
            }
            return;
          }

          try {
            // Check if popup URL matches our redirect URI
            const popupUrl = popup.location.href;
            if (popupUrl && popupUrl.startsWith(redirectUri)) {
              resolved = true;
              clearInterval(checkPopup);
              clearTimeout(timeout);
              popup.close();

              // Parse authorization code from URL
              const url = new URL(popupUrl);
              const code = url.searchParams.get('code');
              const error = url.searchParams.get('error');
              const errorDescription = url.searchParams.get('error_description');

              if (error) {
                reject(
                  new Error(
                    error === 'access_denied'
                      ? 'Microsoft authentication was canceled'
                      : `Microsoft authentication failed: ${errorDescription || error}`
                  )
                );
              } else if (code) {
                resolve(code);
              } else {
                reject(new Error('No authorization code received from Microsoft'));
              }
            }
          } catch {
            // Cross-origin error - popup not on our domain yet, continue polling
          }
        }, 500); // Check every 500ms
      });

      this.logger.debug('Got Microsoft authorization code', {
        codeLength: authCode.length,
        redirectUri,
      });

      // Send code to backend for token exchange
      this.logger.debug('Sending code to backend for token exchange...');

      await this._sendToBackend('/auth/microsoft/connect-mail', idToken, {
        code: authCode,
        redirectUri,
      });

      this.logger.info('✅ Microsoft connected successfully', {
        userId,
      });

      // Refresh user profile to update connectedEmails in UI
      this.logger.debug('🔄 Refreshing user profile after Microsoft connection...');
      await this.authService.refreshUserProfile?.();
      this.logger.info('✅ User profile refreshed - UI should update now');
    } finally {
      // Always release lock
      this.isMicrosoftConnecting = false;
    }
  }

  // ============================================
  // YAHOO CONNECTION
  // ============================================

  /**
   * Connect Yahoo account using popup window OAuth redirect flow.
   * Opens popup for authentication, then captures redirect with authorization code.
   */
  private async _connectYahoo(userId: string): Promise<void> {
    // Prevent concurrent connection attempts
    if (this.isYahooConnecting) {
      this.logger.warn('Yahoo connection already in progress, ignoring...');
      throw new Error('Yahoo connection is already in progress. Please wait.');
    }

    this.isYahooConnecting = true;

    try {
      this.logger.info('Starting Yahoo connection flow');

      // Validate Yahoo configuration
      if (!environment.yahooClientId || environment.yahooClientId === 'YOUR_YAHOO_CLIENT_ID') {
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
      const redirectUri = `${window.location.origin}/yahoo/callback`;
      const oauthUrl = new URL('https://api.login.yahoo.com/oauth2/request_auth');
      oauthUrl.searchParams.set('client_id', environment.yahooClientId);
      oauthUrl.searchParams.set('redirect_uri', redirectUri);
      oauthUrl.searchParams.set('response_type', 'code');
      oauthUrl.searchParams.set('state', userId);
      oauthUrl.searchParams.set('scope', 'mail-w');
      oauthUrl.searchParams.set('prompt', 'consent');

      this.logger.debug('Opening Yahoo OAuth popup', {
        redirectUri,
      });

      // Open popup window for OAuth
      const popup = window.open(
        oauthUrl.toString(),
        'yahoo-oauth',
        'width=600,height=700,popup=1,resizable=1'
      );

      if (!popup) {
        throw new Error(
          'Popup blocked! Please allow popups for this site and try again. You may need to check your browser settings.'
        );
      }

      // Wait for redirect callback with authorization code
      const authCode = await new Promise<string>((resolve, reject) => {
        let resolved = false;
        const timeout = setTimeout(
          () => {
            if (!resolved) {
              resolved = true;
              popup.close();
              reject(new Error('Yahoo authentication timed out. Please try again.'));
            }
          },
          5 * 60 * 1000
        ); // 5 minutes timeout

        // Poll popup URL for redirect
        const checkPopup = setInterval(() => {
          if (!popup || popup.closed) {
            if (!resolved) {
              resolved = true;
              clearInterval(checkPopup);
              clearTimeout(timeout);
              reject(new Error('Yahoo authentication window was closed. Please try again.'));
            }
            return;
          }

          try {
            // Check if popup URL matches our redirect URI
            const popupUrl = popup.location.href;
            if (popupUrl && popupUrl.startsWith(redirectUri)) {
              resolved = true;
              clearInterval(checkPopup);
              clearTimeout(timeout);
              popup.close();

              // Parse authorization code from URL
              const url = new URL(popupUrl);
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
          } catch {
            // Cross-origin error - popup not on our domain yet, continue polling
          }
        }, 500); // Check every 500ms
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
      // Refresh user profile to update connectedEmails in UI
      this.logger.debug('🔄 Refreshing user profile after Yahoo connection...');
      await this.authService.refreshUserProfile?.();
      this.logger.info('✅ User profile refreshed - UI should update now');
    } finally {
      // Always release lock
      this.isYahooConnecting = false;
    }
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
    const url = `${environment.apiURL}${endpoint}`;
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

    // Log detailed error for debugging
    if (error && typeof error === 'object') {
      const errObj = error as Record<string, unknown>;
      this.logger.error('Detailed error:', {
        name: errObj['name'],
        message: errObj['message'],
        stack: errObj['stack'],
        response: errObj['response'],
      });
    }

    // User canceled OAuth flow
    if (this._isUserCanceled(error)) {
      this.logger.debug('User canceled OAuth flow');
      return; // Silent - no toast needed
    }

    // Popup blocked
    if (this._isPopupBlocked(error)) {
      this.toast.error('Popup was blocked. Please allow popups for this site and try again.');
      return;
    }

    // Parse API error
    const apiError = parseApiError(error);
    const message = getErrorMessage(apiError);

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
    const code = String(err['code'] || '').toLowerCase();

    return (
      message.includes('cancel') ||
      message.includes('abort') ||
      message.includes('user denied') ||
      message.includes('user rejected') ||
      message.includes('user_cancelled') ||
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'user_cancelled'
    );
  }

  /**
   * Check if error is from popup being blocked
   */
  private _isPopupBlocked(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const err = error as Record<string, unknown>;
    const message = String(err['message'] || '').toLowerCase();
    const code = String(err['code'] || '').toLowerCase();

    return (
      message.includes('popup') || message.includes('blocked') || code === 'auth/popup-blocked'
    );
  }
}
