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
 * - Token injection for authenticated requests
 *
 * @module @nxt1/mobile/core/infrastructure
 */
import { Injectable } from '@angular/core';
import { CapacitorHttp, HttpResponse } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import type { HttpAdapter, HttpRequestConfig, HttpAdapterError } from '@nxt1/core';

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
 * @example
 * ```typescript
 * const authApi = createAuthApi(
 *   inject(CapacitorHttpAdapter),
 *   environment.apiURL
 * );
 * ```
 */
@Injectable({ providedIn: 'root' })
export class CapacitorHttpAdapter implements HttpAdapter {
  /**
   * Whether we're running on a native platform (iOS/Android)
   */
  private readonly isNative = Capacitor.isNativePlatform();

  /**
   * Auth token for authenticated requests
   * Set by AuthFlowService when user signs in
   */
  private authToken: string | null = null;

  /**
   * Set the auth token for subsequent requests
   */
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  /**
   * Perform GET request
   */
  async get<T>(url: string, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);

    if (this.isNative) {
      const response = await CapacitorHttp.get({
        url: this.buildUrl(url, config?.params),
        headers,
        readTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
        connectTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
      });
      return this.handleResponse<T>(response);
    }

    // Fallback to fetch for web/PWA
    const response = await this.fetchWithTimeout(
      this.buildUrl(url, config?.params),
      {
        method: 'GET',
        headers,
        credentials: config?.withCredentials ? 'include' : 'same-origin',
      },
      config?.timeout ?? DEFAULT_TIMEOUT
    );
    return this.handleFetchResponse<T>(response);
  }

  /**
   * Perform POST request
   */
  async post<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);

    if (this.isNative) {
      const response = await CapacitorHttp.post({
        url: this.buildUrl(url, config?.params),
        headers,
        data: body,
        readTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
        connectTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
      });
      return this.handleResponse<T>(response);
    }

    // Fallback to fetch for web/PWA
    const response = await this.fetchWithTimeout(
      this.buildUrl(url, config?.params),
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        credentials: config?.withCredentials ? 'include' : 'same-origin',
      },
      config?.timeout ?? DEFAULT_TIMEOUT
    );
    return this.handleFetchResponse<T>(response);
  }

  /**
   * Perform PUT request
   */
  async put<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);

    if (this.isNative) {
      const response = await CapacitorHttp.put({
        url: this.buildUrl(url, config?.params),
        headers,
        data: body,
        readTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
        connectTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
      });
      return this.handleResponse<T>(response);
    }

    // Fallback to fetch for web/PWA
    const response = await this.fetchWithTimeout(
      this.buildUrl(url, config?.params),
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
        credentials: config?.withCredentials ? 'include' : 'same-origin',
      },
      config?.timeout ?? DEFAULT_TIMEOUT
    );
    return this.handleFetchResponse<T>(response);
  }

  /**
   * Perform PATCH request
   */
  async patch<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);

    if (this.isNative) {
      const response = await CapacitorHttp.patch({
        url: this.buildUrl(url, config?.params),
        headers,
        data: body,
        readTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
        connectTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
      });
      return this.handleResponse<T>(response);
    }

    // Fallback to fetch for web/PWA
    const response = await this.fetchWithTimeout(
      this.buildUrl(url, config?.params),
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
        credentials: config?.withCredentials ? 'include' : 'same-origin',
      },
      config?.timeout ?? DEFAULT_TIMEOUT
    );
    return this.handleFetchResponse<T>(response);
  }

  /**
   * Perform DELETE request
   */
  async delete<T>(url: string, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);

    if (this.isNative) {
      const response = await CapacitorHttp.delete({
        url: this.buildUrl(url, config?.params),
        headers,
        readTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
        connectTimeout: config?.timeout ?? DEFAULT_TIMEOUT,
      });
      return this.handleResponse<T>(response);
    }

    // Fallback to fetch for web/PWA
    const response = await this.fetchWithTimeout(
      this.buildUrl(url, config?.params),
      {
        method: 'DELETE',
        headers,
        credentials: config?.withCredentials ? 'include' : 'same-origin',
      },
      config?.timeout ?? DEFAULT_TIMEOUT
    );
    return this.handleFetchResponse<T>(response);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Build headers including auth token
   */
  private buildHeaders(config?: HttpRequestConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...config?.headers,
    };

    // Add auth token if available
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
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

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle Capacitor HTTP response
   */
  private handleResponse<T>(response: HttpResponse): T {
    if (response.status >= 200 && response.status < 300) {
      return response.data as T;
    }

    throw this.createError(response.status, response.data);
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
   */
  private createError(status: number, data: unknown): HttpAdapterError {
    const errorData = data as Record<string, unknown> | undefined;

    return {
      status,
      code: this.getErrorCode(status),
      message:
        (errorData?.['message'] as string) ||
        (errorData?.['error'] as string) ||
        `HTTP Error ${status}`,
      details: errorData,
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
