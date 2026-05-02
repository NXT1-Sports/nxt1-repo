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
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, from, switchMap, throwError } from 'rxjs';
import { NxtLoggingService } from '@nxt1/ui/services';
import { environment } from '../../../../environments/environment';
import { AuthFlowService } from '../../services/auth';

/**
 * Endpoints that don't require authentication
 */
const PUBLIC_ENDPOINTS = [
  '/auth/team-code/validate',
  '/auth/referral/validate',
  '/auth/profile/check-username',
  '/auth/create-user', // Uses its own token from request body
  '/invite/validate', // Needed on join page — user may not be authenticated yet
  '/sitemap',
  '/rankings/public',
  '/college/search',
  '/college/list',
  '/programs/search', // Onboarding program search — no auth on backend
  '/help-center', // Help Center is publicly accessible (backend uses optionalAuth)
  '/agent-x/health', // Intentionally unauthenticated — used by health checks / load balancers
  // Team public profile pages — accessible without auth (backend uses optionalAuth)

  // Need public link to team profile pages to allow sharing team profiles with unauthenticated users, and to allow unauthenticated access to team profiles for SEO purposes. The backend uses optionalAuth for these routes, so they will return public team data even without a valid token.
  // '/teams/by-teamcode/', // /team/:slug/:teamCode canonical URL
  // '/teams/by-slug/', // /team/:slug SEO-friendly URL
  // '/teams/by-id/', // Direct team ID lookup
];

/**
 * Check if a URL is a public endpoint.
 * Strips the API base URL first for accurate path matching.
 */
function isPublicEndpoint(url: string): boolean {
  const baseIndex = url.indexOf(environment.apiURL);
  const apiPath = baseIndex !== -1 ? url.slice(baseIndex + environment.apiURL.length) : url;

  return PUBLIC_ENDPOINTS.some((endpoint) => apiPath.startsWith(endpoint));
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
  const authFlow = inject(AuthFlowService);
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

  // Use AuthFlowService.getIdToken() which reads from the auth cache first,
  // then falls back to Firebase Auth. This avoids the race condition where
  // auth.authStateReady() resolves but auth.currentUser is still null because
  // Firebase hasn't confirmed the session from IndexedDB yet, while the app
  // already knows the user is authenticated from the localStorage token cache.
  return from(authFlow.getIdToken()).pipe(
    switchMap((token) => {
      if (!token) {
        // No authenticated user — throw a synthetic 401 instead of sending
        // an unauthenticated request (which the backend would reject anyway).
        logger.debug('No user signed in — blocking request', { url: req.url });
        return throwError(
          () =>
            new HttpErrorResponse({
              status: 401,
              statusText: 'Unauthorized',
              url: req.url,
              error: { code: 'AUTH_NOT_AUTHENTICATED', message: 'No authenticated user' },
            })
        );
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
