/**
 * @fileoverview Mobile Auth Interceptor (2026 Functional Pattern)
 * @module @nxt1/mobile/core/infrastructure/interceptors
 *
 * Adds Firebase ID token to outgoing HttpClient requests.
 * Mobile equivalent of apps/web auth.interceptor.ts.
 *
 * Most mobile API calls go through CapacitorHttpAdapter (which has its own
 * token provider), but shared @nxt1/ui services (e.g. AgentXJobService) use
 * Angular HttpClient and need auth tokens injected via interceptor.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { Auth } from '@angular/fire/auth';
import { NxtLoggingService } from '@nxt1/ui';
import { environment } from '../../../../environments/environment';

/**
 * Endpoints that don't require authentication
 */
const PUBLIC_ENDPOINTS = [
  '/auth/team-code/validate',
  '/auth/referral/validate',
  '/auth/profile/check-username',
  '/auth/create-user',
  '/sitemap',
  '/rankings/public',
  '/explore',
  '/college/search',
  '/college/list',
];

function isPublicEndpoint(url: string): boolean {
  return PUBLIC_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

function isApiRequest(url: string): boolean {
  return url.startsWith(environment.apiUrl) || url.includes('/api/');
}

/**
 * Mobile auth interceptor — injects Firebase ID token into HttpClient requests.
 *
 * @example
 * ```typescript
 * provideHttpClient(
 *   withInterceptors([mobileAuthInterceptor, httpErrorInterceptor()])
 * )
 * ```
 */
export const mobileAuthInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const auth = inject(Auth, { optional: true });
  const logger = inject(NxtLoggingService).child('MobileAuthInterceptor');

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

  // No auth instance — pass through
  if (!auth) {
    logger.warn('Firebase Auth not available');
    return next(req);
  }

  // Wait for Firebase to restore auth state, then get fresh ID token
  return from(auth.authStateReady().then(() => auth.currentUser?.getIdToken() ?? null)).pipe(
    switchMap((token) => {
      if (!token) {
        logger.debug('No user signed in, request may fail');
        return next(req);
      }

      const authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });

      return next(authReq);
    })
  );
};
