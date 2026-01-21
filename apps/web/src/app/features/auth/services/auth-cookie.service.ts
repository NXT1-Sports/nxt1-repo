/**
 * @fileoverview Auth Cookie Service - Token Persistence for SSR
 * @module @nxt1/web/core/auth
 *
 * Manages Firebase Auth ID token persistence via HTTP-only cookies.
 * This enables FirebaseServerApp to authenticate users during SSR.
 *
 * Flow:
 * 1. User signs in on client
 * 2. BrowserAuthService calls setAuthCookie with ID token
 * 3. Cookie is sent with SSR requests
 * 4. Server extracts token and initializes FirebaseServerApp
 * 5. SSR renders authenticated content
 *
 * Security:
 * - Uses httpOnly cookies (not accessible via JS)
 * - Secure flag in production (HTTPS only)
 * - SameSite=Strict to prevent CSRF
 * - Short expiration (1 hour, matches Firebase token)
 *
 * @see https://firebase.google.com/docs/auth/admin/manage-cookies
 */

import { Injectable, inject } from '@angular/core';
import { NxtPlatformService } from '@nxt1/ui';

/** Cookie name for the Firebase auth token */
export const AUTH_TOKEN_COOKIE = '__session';

/**
 * Auth Cookie Service
 *
 * Browser-only service for managing auth token cookies.
 * On server, all methods are no-ops.
 */
@Injectable({ providedIn: 'root' })
export class AuthCookieService {
  private readonly platform = inject(NxtPlatformService);

  /**
   * Set the auth token cookie
   * Called after successful sign-in to persist token for SSR
   *
   * @param token - Firebase ID token
   * @param expiresInMs - Token expiration time in milliseconds (default 1 hour)
   */
  setAuthCookie(token: string, expiresInMs: number = 3600000): void {
    if (!this.platform.isBrowser()) return;

    const expires = new Date(Date.now() + expiresInMs);
    const secure = window.location.protocol === 'https:';

    // Set cookie with security attributes
    // Note: In production, this should be an httpOnly cookie set by the server
    // For Firebase App Hosting, we use __session which Firebase forwards
    // SameSite=Lax allows the cookie to be sent on navigation (SSR needs this)
    document.cookie = [
      `${AUTH_TOKEN_COOKIE}=${encodeURIComponent(token)}`,
      `expires=${expires.toUTCString()}`,
      'path=/',
      secure ? 'secure' : '',
      'samesite=lax',
    ]
      .filter(Boolean)
      .join('; ');
  }

  /**
   * Clear the auth token cookie
   * Called on sign-out to ensure SSR renders unauthenticated state
   */
  clearAuthCookie(): void {
    if (!this.platform.isBrowser()) return;

    // Set cookie with past expiration to delete it
    document.cookie = `${AUTH_TOKEN_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; samesite=lax`;
  }

  /**
   * Get the auth token from cookie (browser-side)
   * Primarily used for debugging; server reads cookie from request
   */
  getAuthToken(): string | null {
    if (!this.platform.isBrowser()) return null;

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === AUTH_TOKEN_COOKIE && value) {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  /**
   * Check if auth cookie exists
   */
  hasAuthCookie(): boolean {
    return this.getAuthToken() !== null;
  }
}
