/**
 * @fileoverview Email Connection Service - Web
 * @module @nxt1/web/core/services/web
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
import { AUTH_SERVICE, type IAuthService } from '../auth/auth.interface';

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
  private isGoogleOAuthConnecting = false;
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
        await this._connectGoogleOAuth(userId);
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

  /**
   * Connect Google or Microsoft via a real OAuth account-picker popup.
   * This is a pure CONNECT flow — it only stores a refresh/access token for
   * Agent X to use later. It does NOT sign the user in to Firebase.
   *
   * Returns `true` on success, `false` on failure (error is shown via toast internally).
   */
  async connectForLinkedAccounts(
    platform: 'google' | 'microsoft',
    userId: string
  ): Promise<boolean> {
    this.logger.info('Connecting linked account via OAuth popup', { platform, userId });
    try {
      if (platform === 'google') {
        await this._connectGoogleOAuth(userId);
      } else {
        await this._connectMicrosoft(userId);
      }
      const providerName = platform === 'google' ? 'Gmail' : 'Microsoft';
      this.toast.success(`${providerName} account connected!`);
      return true;
    } catch (error) {
      const providerName = platform === 'google' ? 'Google' : 'Microsoft';
      const msg = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.error(`Failed to connect ${providerName} linked account: ${msg}`, error);
      console.error(`[OAuth] ${providerName} connect error:`, error);
      this.toast.error(`Failed to connect ${providerName}: ${msg}`);
      return false;
    }
  }

  // ============================================
  // GOOGLE OAUTH (connect-only, no Firebase sign-in)
  // ============================================

  /**
   * Wait for the backend OAuth callback success page to post a message.
   * The backend renders an HTML page that sends:
   *   { type: 'oauth-connected', provider: string, success: boolean }
   * then auto-closes. Falls back to popup-closed detection if user closes manually.
   */
  private _waitForOAuthConnected(popup: Window, providerLabel: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let resolved = false;

      const finish = (success: boolean, errorMsg?: string) => {
        if (resolved) return;
        resolved = true;
        channel.close();
        clearInterval(closedCheck);
        clearTimeout(timeout);

        if (success) {
          resolve();
        } else {
          reject(new Error(errorMsg ?? `${providerLabel} connection failed`));
        }
      };

      // BroadcastChannel works regardless of COOP (OAuth providers sever window.opener)
      const channel = new BroadcastChannel('oauth-connect');
      channel.onmessage = (event: MessageEvent) => {
        const data = event.data as { type?: string; success?: boolean; message?: string };
        if (data?.type === 'oauth-connected') {
          finish(
            !!data.success,
            data.success ? undefined : (data.message ?? `${providerLabel} connection failed`)
          );
        }
      };

      // Fallback: detect popup closed before BroadcastChannel message arrives.
      // When popup closes we clear the interval and wait a generous grace period
      // (Angular needs time to bootstrap /oauth/success and fire BroadcastChannel).
      let closedGraceStarted = false;
      const closedCheck = setInterval(() => {
        try {
          if ((!popup || popup.closed) && !resolved && !closedGraceStarted) {
            closedGraceStarted = true;
            clearInterval(closedCheck);
            // Give the popup's Angular app 4 seconds to fire BroadcastChannel before failing
            setTimeout(() => {
              if (!resolved) {
                finish(
                  false,
                  `${providerLabel} authentication window was closed. Please try again.`
                );
              }
            }, 4000);
          }
        } catch {
          // COOP blocks popup.closed — ignore and rely on BroadcastChannel + timeout
        }
      }, 500);

      const timeout = setTimeout(
        () => {
          if (!resolved) {
            finish(false, `${providerLabel} authentication timed out. Please try again.`);
            if (!popup.closed)
              try {
                popup.close();
              } catch {
                /* ignore */
              }
          }
        },
        5 * 60 * 1000
      );
    });
  }

  /**
   * Wait for an OAuth popup to post back the authorization code via postMessage.
   * Used for Yahoo (frontend callback) flow.
   */
  private _waitForOAuthCode(
    popup: Window,
    redirectUri: string,
    providerLabel: string
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let resolved = false;

      const finish = (code: string | null, error?: string, errorDescription?: string) => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener('message', onMessage);
        clearInterval(closedCheck);
        clearTimeout(timeout);
        if (!popup.closed) popup.close();

        if (error) {
          reject(
            new Error(
              error === 'access_denied'
                ? `${providerLabel} connection was canceled`
                : `${providerLabel} connection failed: ${errorDescription ?? error}`
            )
          );
        } else if (code) {
          resolve(code);
        } else {
          reject(new Error(`No authorization code received from ${providerLabel}`));
        }
      };

      // Primary: postMessage from OAuthCallbackComponent
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as {
          type?: string;
          code?: string;
          error?: string;
          errorDescription?: string;
        };
        if (data?.type === 'oauth-callback') {
          finish(data.code ?? null, data.error, data.errorDescription);
        }
      };
      window.addEventListener('message', onMessage);

      // Fallback: detect popup closed by user
      const closedCheck = setInterval(() => {
        if (!popup || popup.closed) {
          if (!resolved) {
            resolved = true;
            window.removeEventListener('message', onMessage);
            clearInterval(closedCheck);
            clearTimeout(timeout);
            reject(
              new Error(`${providerLabel} authentication window was closed. Please try again.`)
            );
          }
        }
      }, 500);

      const timeout = setTimeout(
        () => {
          if (!resolved) {
            resolved = true;
            window.removeEventListener('message', onMessage);
            clearInterval(closedCheck);
            if (!popup.closed) popup.close();
            reject(new Error(`${providerLabel} authentication timed out. Please try again.`));
          }
        },
        5 * 60 * 1000
      );
    });
  }

  /**
   * Connect Google account via backend-generated OAuth URL.
   * Backend redirect_uri points to the backend callback — backend handles code exchange
   * and token storage. Frontend just opens the popup and waits for success postMessage.
   */
  private async _connectGoogleOAuth(userId: string): Promise<void> {
    if (this.isGoogleOAuthConnecting) {
      this.logger.warn('Google OAuth connection already in progress, ignoring...');
      throw new Error('Google connection is already in progress. Please wait.');
    }

    this.isGoogleOAuthConnecting = true;

    try {
      this.logger.info('Starting Google OAuth connect flow (backend-redirect popup)');

      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Failed to get authentication token. Please sign in again.');
      }

      // Ask backend for the OAuth URL (redirect_uri points to backend callback)
      // Pass origin so the callback can redirect back to whichever domain we're running on
      const origin = encodeURIComponent(window.location.origin);
      const urlResponse = await fetch(
        `${environment.apiURL}/auth/google/connect-url?origin=${origin}`,
        {
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      if (!urlResponse.ok) {
        const err = await urlResponse.json().catch(() => ({ message: 'Failed to get OAuth URL' }));
        throw new Error((err as { message?: string }).message ?? 'Failed to get OAuth URL');
      }
      const { url: oauthUrl } = (await urlResponse.json()) as { url: string };

      this.logger.debug('Opening Google OAuth popup (backend-redirect)');

      const popup = window.open(
        oauthUrl,
        'google-oauth',
        'width=600,height=700,popup=1,resizable=1'
      );
      if (!popup) {
        throw new Error('Popup blocked! Please allow popups for this site and try again.');
      }

      await this._waitForOAuthConnected(popup, 'Google');

      this.logger.info('Google account connected successfully', { userId });
      await this.authService.refreshUserProfile?.();
    } finally {
      this.isGoogleOAuthConnecting = false;
    }
  }

  // ============================================
  // GMAIL CONNECTION (legacy inbox-sync flow — uses signInWithPopup)
  // ============================================

  /**
   * Connect Gmail account using Firebase signInWithPopup.
   * Shows Google account picker in browser popup.
   * NOTE: This method DOES sign the user in via Firebase. Use _connectGoogleOAuth
   * for the settings "connect" flow where no auth change is desired.
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
    if (this.isMicrosoftConnecting) {
      this.logger.warn('Microsoft connection already in progress, ignoring...');
      throw new Error('Microsoft connection is already in progress. Please wait.');
    }

    this.isMicrosoftConnecting = true;

    try {
      this.logger.info('Starting Microsoft connection flow (backend-redirect popup)');

      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Failed to get authentication token. Please sign in again.');
      }

      // Ask backend for the OAuth URL (redirect_uri points to backend callback)
      const origin = encodeURIComponent(window.location.origin);
      const urlResponse = await fetch(
        `${environment.apiURL}/auth/microsoft/connect-url?origin=${origin}`,
        {
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      if (!urlResponse.ok) {
        const err = await urlResponse.json().catch(() => ({ message: 'Failed to get OAuth URL' }));
        throw new Error((err as { message?: string }).message ?? 'Failed to get OAuth URL');
      }
      const { url: oauthUrl } = (await urlResponse.json()) as { url: string };

      this.logger.debug('Opening Microsoft OAuth popup (backend-redirect)');

      const popup = window.open(
        oauthUrl,
        'microsoft-oauth',
        'width=600,height=700,popup=1,resizable=1'
      );
      if (!popup) {
        throw new Error('Popup blocked! Please allow popups for this site and try again.');
      }

      await this._waitForOAuthConnected(popup, 'Microsoft');

      this.logger.info('Microsoft connected successfully', { userId });
      await this.authService.refreshUserProfile?.();
    } finally {
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

      const authCode = await this._waitForOAuthCode(popup, redirectUri, 'Yahoo');

      this.logger.debug('Got Yahoo authorization code');

      await this._sendToBackend('/auth/yahoo/connect-mail', idToken, {
        code: authCode,
        redirectUri,
      });

      this.logger.info('Yahoo connected successfully', { userId });
      await this.authService.refreshUserProfile?.();
    } finally {
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
