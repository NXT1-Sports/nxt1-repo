/**
 * @fileoverview Auth Interceptor (2026 Functional Pattern)
 * @module @nxt1/web/core/infrastructure
 *
 * Adds Firebase ID token to outgoing HTTP requests automatically.
 * Uses functional interceptor pattern (HttpInterceptorFn) per Angular 17+ best practices.
 *
 * Features:
 * - Automatic token injection for API requests
 * - Skips public endpoints
 * - SSR-safe (no token injection on server)
 * - Token refresh handling
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { Auth } from '@angular/fire/auth';
import { NxtLoggingService } from '@nxt1/ui/services';
import { environment } from '../../../../environments/environment';

/**
 * Endpoints that don't require authentication
 */
const PUBLIC_ENDPOINTS = [
  '/auth/team-code/validate',
  '/auth/referral/validate',
  '/auth/profile/check-username',
  '/auth/create-user', // Uses its own token from request body
  '/sitemap',
  '/rankings/public',
  '/explore',
  '/college/search',
  '/college/list',
];

/**
 * Check if a URL is a public endpoint
 */
function isPublicEndpoint(url: string): boolean {
  return PUBLIC_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

/**
 * Check if a URL is an API request
 */
function isApiRequest(url: string): boolean {
  return url.startsWith(environment.apiURL) || url.includes('/api/');
}

/**
 * Auth interceptor function (2026 pattern)
 *
 * Automatically injects Firebase ID token into API requests.
 * Runs only on browser, passes through on server (SSR).
 *
 * @example
 * ```typescript
 * // app.config.ts
 * provideHttpClient(
 *   withInterceptors([authInterceptor])
 * )
 * ```
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const platformId = inject(PLATFORM_ID);
  const auth = inject(Auth, { optional: true });
  const logger = inject(NxtLoggingService).child('AuthInterceptor');

  // SSR: Pass through without modification
  if (!isPlatformBrowser(platformId)) {
    return next(req);
  }

  // Skip non-API requests
  if (!isApiRequest(req.url)) {
    return next(req);
  }

  // Skip public endpoints
  if (isPublicEndpoint(req.url)) {
    return next(req);
  }

  // Skip if request already has Authorization header
  if (req.headers.has('Authorization')) {
    return next(req);
  }

  // No auth instance - pass through
  if (!auth) {
    logger.warn('Firebase Auth not available');
    return next(req);
  }

  // Wait for Firebase to restore auth state from persistence (IndexedDB),
  // then get a fresh ID token. This fixes the race condition where
  // auth.currentUser is null on initial page load even though the user
  // is signed in (Firebase restores the session asynchronously).
  return from(auth.authStateReady().then(() => auth.currentUser?.getIdToken() ?? null)).pipe(
    switchMap((token) => {
      if (!token) {
        logger.debug('No user signed in, request may fail');
        return next(req);
      }

      // Clone request with Authorization header
      const authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });

      return next(authReq);
    })
  );
};

/**
 * Export for barrel file
 */
export default authInterceptor;
