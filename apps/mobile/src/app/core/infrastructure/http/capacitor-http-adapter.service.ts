/**
 * Capacitor HTTP Adapter Service
 *
 * Implements the @nxt1/core HttpAdapter interface for mobile platforms.
 * Uses native HTTP when available via Capacitor, falls back to fetch for web testing.
 *
 * Features:
 * - Native HTTP calls on iOS/Android (bypasses CORS)
 * - Automatic fallback to fetch for web/PWA
 * - Error transformation to HttpAdapterError format
 * - Supports all HTTP methods with proper typing
 * - Fresh token injection per-request via tokenProvider (2026 pattern)
 *
 * @module @nxt1/mobile/core/infrastructure
 */
import { Injectable, inject } from '@angular/core';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { NxtLoggingService } from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';
import type { HttpAdapter, HttpRequestConfig, HttpAdapterError } from '@nxt1/core';
import { parseApiError } from '@nxt1/core/errors';
import { CACHE_KEYS, generateCacheKey } from '@nxt1/core/cache';
import { MobileCacheService } from '../../services/infrastructure/cache.service';
import {
  getMobileHttpCacheInvalidationPatterns,
  getMobileHttpCacheTtl,
  shouldUseMobileHttpCache,
} from './mobile-http-cache.policy';

/**
 * Token provider function type
 *
 * Called on every HTTP request to get a fresh auth token.
 * Returns null when no user is signed in.
 * Firebase's getIdToken() handles caching internally —
 * it returns the cached token if valid, refreshes if expired.
 */
export type TokenProvider = () => Promise<string | null>;

/**
 * Default request timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Capacitor/Fetch implementation of HttpAdapter
 *
 * Uses Capacitor's native HTTP plugin on native platforms,
 * which avoids CORS issues and provides better performance.
 * Falls back to fetch() on web for development/testing.
 *
 * ⭐ 2026 Token Pattern: Uses a tokenProvider function that fetches
 * a fresh Firebase ID token per-request. Firebase SDK handles caching
 * internally — getIdToken() returns cached token if valid, auto-refreshes
 * if expired (~60 min). This eliminates the stale token bug where a
 * static token string would expire after the initial 60-minute window.
 *
 * @example
 * ```typescript
 * const adapter = inject(CapacitorHttpAdapter);
 *
 * // Wire up fresh token provider (called once during auth init)
 * adapter.setTokenProvider(() => firebaseAuth.getIdToken());
 *
 * // Every HTTP request now gets a fresh/valid token automatically
 * const authApi = createAuthApi(adapter, environment.apiURL);
 * ```
 */
@Injectable({ providedIn: 'root' })
export class CapacitorHttpAdapter implements HttpAdapter {
  private readonly logger: ILogger = inject(NxtLoggingService).child('CapacitorHttpAdapter');
  private readonly mobileCache = inject(MobileCacheService);
  private readonly httpCacheKeyPrefix = `${CACHE_KEYS.API_RESPONSE}mobile-http:`;

  /**
   * Whether we're running on a native platform (iOS/Android)
   */
  private readonly isNative = Capacitor.isNativePlatform();

  /**
   * Token provider function for authenticated requests.
   *
   * Called per-request to get a fresh token. Firebase SDK handles
   * internal caching — returns cached token if valid, refreshes if expired.
   * Set by AuthFlowService during auth initialization.
   */
  private tokenProvider: TokenProvider | null = null;

  /**
   * Set the token provider for authenticated requests.
   *
   * The provider is called on every HTTP request to ensure a fresh token.
   * Firebase's getIdToken() handles caching internally, so this is efficient.
   *
   * @param provider - Async function returning a token string or null
   *
   * @example
   * ```typescript
   * // Wire up during auth initialization
   * adapter.setTokenProvider(() => firebaseAuth.getIdToken());
   *
   * // Clear on sign-out
   * adapter.setTokenProvider(null);
   * ```
   */
  setTokenProvider(provider: TokenProvider | null): void {
    const authContextChanged = this.tokenProvider !== provider;
    this.tokenProvider = provider;
    this.logger.debug('Token provider updated', { hasProvider: !!provider });

    if (authContextChanged) {
      void this.clearHttpResponseCache();
    }
  }

  /**
   * @deprecated Use setTokenProvider() instead for automatic token refresh.
   * This static method stores a snapshot that becomes stale after ~60 minutes.
   * Kept for backwards compatibility during migration.
   */
  setAuthToken(_token: string | null): void {
    this.logger.warn(
      'setAuthToken() is deprecated — use setTokenProvider() for automatic token refresh'
    );
    // No-op: callers should migrate to setTokenProvider()
  }

  /**
   * Perform GET request
   */
  async get<T>(url: string, config?: HttpRequestConfig): Promise<T> {
    const headers = await this.buildHeaders(config);
    const fullUrl = this.buildUrl(url, config?.params);

    this.logger.debug('GET request', {
      url: fullUrl,
      isNative: this.isNative,
      isAuthed: !!headers['Authorization'],
    });

    const executeRequest = async (): Promise<T> => {
      try {
        if (this.isNative) {
          const response = await CapacitorHttp.get({
            url: fullUrl,
            headers,
            readTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
            connectTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
          });
          return this.handleResponse<T>(response);
        }

        // Fallback to fetch for web/PWA
        this.logger.debug('Using fetch fallback (browser mode)');
        const response = await this.fetchWithTimeout(
          fullUrl,
          {
            method: 'GET',
            headers,
            credentials: config?.withCredentials ? 'include' : 'same-origin',
          },
          config?.timeout ?? DEFAULT_TIMEOUT
        );
        return this.handleFetchResponse<T>(response);
      } catch (err) {
        // Handle native HTTP errors (timeout, network errors, etc.)
        this.logger.error('❌ HTTP GET failed', {
          url: fullUrl,
          error: err instanceof Error ? err.message : String(err),
          errorCode: (err as { code?: string })?.code,
          errorMessage: (err as { errorMessage?: string })?.errorMessage,
          message: (err as { message?: string })?.message,
        });

        // Re-throw as standardized error
        if (err instanceof Error || (err as { message?: string })?.message) {
          throw err;
        }

        // Capacitor native error format
        const nativeError = err as { errorMessage?: string; code?: string };
        throw new Error(nativeError.errorMessage || nativeError.code || 'Network request failed', {
          cause: err,
        });
      }
    };

    if (!shouldUseMobileHttpCache('GET', fullUrl, config?.headers)) {
      return executeRequest();
    }

    const cacheKey = this.createHttpCacheKey(fullUrl, headers);
    const ttl = getMobileHttpCacheTtl(fullUrl);

    return this.mobileCache.getOrFetch<T>(cacheKey, executeRequest, ttl);
  }

  /**
   * Perform POST request
   */
  async post<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const isFormData = body instanceof FormData;
    const headers = await this.buildHeaders(config, isFormData);
    const fullUrl = this.buildUrl(url, config?.params);

    this.logger.debug('POST request', {
      url: fullUrl,
      isNative: this.isNative,
      isAuthed: !!headers['Authorization'],
      isFormData,
      bodyPreview: isFormData ? '[FormData]' : JSON.stringify(body).substring(0, 100),
    });

    // Use fetch for FormData uploads (even on native) because Capacitor HTTP doesn't support FormData
    if (isFormData) {
      this.logger.debug('Using fetch for FormData upload');
      const response = await this.fetchWithTimeout(
        fullUrl,
        {
          method: 'POST',
          headers,
          body: body as FormData,
          credentials: config?.withCredentials ? 'include' : 'same-origin',
        },
        config?.timeout ?? DEFAULT_TIMEOUT
      );
      const data = await this.handleFetchResponse<T>(response);
      await this.invalidateRelatedHttpCache(fullUrl);
      return data;
    }

    if (this.isNative) {
      const response = await CapacitorHttp.post({
        url: fullUrl,
        headers,
        data: body,
        readTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
        connectTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
      });
      const data = this.handleResponse<T>(response);
      await this.invalidateRelatedHttpCache(fullUrl);
      return data;
    }

    // Fallback to fetch for web/PWA
    this.logger.debug('Using fetch fallback (browser mode)');
    const response = await this.fetchWithTimeout(
      fullUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        credentials: config?.withCredentials ? 'include' : 'same-origin',
      },
      config?.timeout ?? DEFAULT_TIMEOUT
    );
    const data = await this.handleFetchResponse<T>(response);
    await this.invalidateRelatedHttpCache(fullUrl);
    return data;
  }

  /**
   * Perform PUT request
   */
  async put<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = await this.buildHeaders(config);
    const fullUrl = this.buildUrl(url, config?.params);

    if (this.isNative) {
      const response = await CapacitorHttp.put({
        url: fullUrl,
        headers,
        data: body,
        readTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
        connectTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
      });
      const data = this.handleResponse<T>(response);
      await this.invalidateRelatedHttpCache(fullUrl);
      return data;
    }

    // Fallback to fetch for web/PWA
    const response = await this.fetchWithTimeout(
      fullUrl,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
        credentials: config?.withCredentials ? 'include' : 'same-origin',
      },
      config?.timeout ?? DEFAULT_TIMEOUT
    );
    const data = await this.handleFetchResponse<T>(response);
    await this.invalidateRelatedHttpCache(fullUrl);
    return data;
  }

  /**
   * Perform PATCH request
   */
  async patch<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = await this.buildHeaders(config);
    const fullUrl = this.buildUrl(url, config?.params);

    if (this.isNative) {
      const response = await CapacitorHttp.patch({
        url: fullUrl,
        headers,
        data: body,
        readTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
        connectTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
      });
      const data = this.handleResponse<T>(response);
      await this.invalidateRelatedHttpCache(fullUrl);
      return data;
    }

    // Fallback to fetch for web/PWA
    const response = await this.fetchWithTimeout(
      fullUrl,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
        credentials: config?.withCredentials ? 'include' : 'same-origin',
      },
      config?.timeout ?? DEFAULT_TIMEOUT
    );
    const data = await this.handleFetchResponse<T>(response);
    await this.invalidateRelatedHttpCache(fullUrl);
    return data;
  }

  /**
   * Perform DELETE request
   */
  async delete<T>(url: string, config?: HttpRequestConfig): Promise<T> {
    const headers = await this.buildHeaders(config);
    const fullUrl = this.buildUrl(url, config?.params);

    if (this.isNative) {
      const response = await CapacitorHttp.delete({
        url: fullUrl,
        headers,
        readTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
        connectTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
      });
      const data = this.handleResponse<T>(response);
      await this.invalidateRelatedHttpCache(fullUrl);
      return data;
    }

    // Fallback to fetch for web/PWA
    const response = await this.fetchWithTimeout(
      fullUrl,
      {
        method: 'DELETE',
        headers,
        credentials: config?.withCredentials ? 'include' : 'same-origin',
      },
      config?.timeout ?? DEFAULT_TIMEOUT
    );
    const data = await this.handleFetchResponse<T>(response);
    await this.invalidateRelatedHttpCache(fullUrl);
    return data;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Build headers with fresh auth token from provider.
   *
   * Calls the tokenProvider on every request to ensure the token is valid.
   * Firebase SDK caches tokens internally — getIdToken() only makes a
   * network call when the cached token is expired (~60 min), making this
   * pattern both safe and efficient.
   *
   * @param config - Optional HTTP request configuration
   * @param isFormData - If true, skip Content-Type header (let browser set multipart/form-data with boundary)
   */
  private async buildHeaders(
    config?: HttpRequestConfig,
    isFormData = false
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...config?.headers,
    };

    // Only set Content-Type for JSON requests (not FormData)
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    // Get fresh token from provider (Firebase handles caching internally)
    if (this.tokenProvider) {
      try {
        const token = await this.tokenProvider();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        } else {
          this.logger.warn('Token provider returned null — request will proceed without auth');
        }
      } catch (err) {
        this.logger.warn('Token provider threw an exception, proceeding without auth', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return headers;
  }

  /**
   * Build URL with query params
   */
  private buildUrl(url: string, params?: Record<string, string | number | boolean>): string {
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      searchParams.append(key, String(value));
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${searchParams.toString()}`;
  }

  private createHttpCacheKey(url: string, headers: Record<string, string>): string {
    const cacheVaryHeaders = Object.entries(headers)
      .filter(
        ([key]) => !['authorization', 'cache-control', 'x-no-cache'].includes(key.toLowerCase())
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');

    return generateCacheKey(`${this.httpCacheKeyPrefix}${url}::${cacheVaryHeaders}`);
  }

  private async clearHttpResponseCache(): Promise<void> {
    try {
      await this.mobileCache.clear(`${this.httpCacheKeyPrefix}*`);
      this.logger.debug('Cleared mobile HTTP response cache');
    } catch (error) {
      this.logger.warn('Failed to clear mobile HTTP response cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async invalidateRelatedHttpCache(url: string): Promise<void> {
    const patterns = getMobileHttpCacheInvalidationPatterns(url);
    if (patterns.length === 0) {
      return;
    }

    try {
      await Promise.all(patterns.map((pattern) => this.mobileCache.clear(pattern)));
      this.logger.debug('Invalidated related mobile HTTP cache entries', { url, patterns });
    } catch (error) {
      this.logger.warn('Failed to invalidate related mobile HTTP cache entries', {
        url,
        patterns,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    this.logger.debug(`${requestId} Starting fetch`, {
      url,
      method: options.method,
      timeoutMs,
      isNative: this.isNative,
    });

    const timeoutId = setTimeout(() => {
      this.logger.warn(`${requestId} TIMEOUT after ${timeoutMs}ms - aborting`);
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      this.logger.debug(`${requestId} Fetch completed`, {
        status: response.status,
        ok: response.ok,
      });
      return response;
    } catch (error) {
      // Check if this is an abort error vs other network errors
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      this.logger.error(`${requestId} Fetch error`, {
        isAbortError,
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        wasTimedOut: controller.signal.aborted,
        abortReason: controller.signal.reason,
      });
      throw error;
    } finally {
      clearTimeout(timeoutId);
      this.logger.debug(`${requestId} Cleanup complete`);
    }
  }

  /**
   * Handle Capacitor HTTP response
   */
  private handleResponse<T>(response: HttpResponse): T {
    this.logger.debug('Handling Capacitor HTTP response', {
      status: response.status,
      url: response.url,
      hasData: !!response.data,
      dataPreview:
        typeof response.data === 'object'
          ? JSON.stringify(response.data).substring(0, 200)
          : String(response.data).substring(0, 200),
    });

    if (response.status >= 200 && response.status < 300) {
      return response.data as T;
    }

    const error = this.createError(response.status, response.data);
    this.logger.error('❌ HTTP Error Response', {
      status: response.status,
      code: error.code,
      message: error.message,
      details: error.details,
    });
    throw error;
  }

  /**
   * Handle fetch response
   */
  private async handleFetchResponse<T>(response: Response): Promise<T> {
    if (response.ok) {
      // Handle empty responses
      const text = await response.text();
      if (!text) {
        return {} as T;
      }
      return JSON.parse(text) as T;
    }

    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText };
    }

    throw this.createError(response.status, errorData);
  }

  /**
   * Create standardized error object
   * Uses unified @nxt1/core error parser for consistency
   */
  private createError(status: number, data: unknown): HttpAdapterError {
    // Use core error parser to extract message properly
    const parsed = parseApiError(data);

    return {
      status,
      code: this.getErrorCode(status),
      message: parsed.message,
      details: data,
    };
  }

  /**
   * Get error code for common HTTP status codes
   */
  private getErrorCode(status: number): string {
    const errorCodes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return errorCodes[status] || 'UNKNOWN_ERROR';
  }
}
