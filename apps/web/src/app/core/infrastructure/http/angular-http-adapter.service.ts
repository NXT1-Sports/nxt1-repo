/**
 * Angular HTTP Adapter Service
 *
 * Implements the @nxt1/core HttpAdapter interface using Angular's HttpClient.
 * This bridges the platform-agnostic core API layer with Angular's HTTP system.
 *
 * Features:
 * - Converts RxJS Observables to Promises for core API compatibility
 * - Transforms errors to unified @nxt1/core error format
 * - Supports all HTTP methods with proper typing
 * - SSR-safe (HttpClient works on server via TransferState)
 *
 * @module @nxt1/web/core/infrastructure
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import type { HttpAdapter, HttpRequestConfig, HttpAdapterError } from '@nxt1/core';
import { parseApiError, getErrorMessage, API_ERROR_CODES } from '@nxt1/core';

/**
 * Default request timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Angular implementation of HttpAdapter
 *
 * @example
 * ```typescript
 * const authApi = createAuthApi(
 *   inject(AngularHttpAdapter),
 *   environment.apiURL
 * );
 * ```
 */
@Injectable({ providedIn: 'root' })
export class AngularHttpAdapter implements HttpAdapter {
  private readonly http = inject(HttpClient);

  /**
   * Perform GET request
   */
  async get<T>(url: string, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);
    const params = this.buildParams(config);

    return firstValueFrom(
      this.http
        .get<T>(url, {
          headers,
          params,
          withCredentials: config?.withCredentials,
        })
        .pipe(
          timeout(config?.timeout ?? DEFAULT_TIMEOUT),
          catchError((error) => throwError(() => this.transformError(error)))
        )
    );
  }

  /**
   * Perform POST request
   */
  async post<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);
    const params = this.buildParams(config);

    return firstValueFrom(
      this.http
        .post<T>(url, body, {
          headers,
          params,
          withCredentials: config?.withCredentials,
        })
        .pipe(
          timeout(config?.timeout ?? DEFAULT_TIMEOUT),
          catchError((error) => throwError(() => this.transformError(error)))
        )
    );
  }

  /**
   * Perform PUT request
   */
  async put<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);
    const params = this.buildParams(config);

    return firstValueFrom(
      this.http
        .put<T>(url, body, {
          headers,
          params,
          withCredentials: config?.withCredentials,
        })
        .pipe(
          timeout(config?.timeout ?? DEFAULT_TIMEOUT),
          catchError((error) => throwError(() => this.transformError(error)))
        )
    );
  }

  /**
   * Perform PATCH request
   */
  async patch<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);
    const params = this.buildParams(config);

    return firstValueFrom(
      this.http
        .patch<T>(url, body, {
          headers,
          params,
          withCredentials: config?.withCredentials,
        })
        .pipe(
          timeout(config?.timeout ?? DEFAULT_TIMEOUT),
          catchError((error) => throwError(() => this.transformError(error)))
        )
    );
  }

  /**
   * Perform DELETE request
   */
  async delete<T>(url: string, config?: HttpRequestConfig): Promise<T> {
    const headers = this.buildHeaders(config);
    const params = this.buildParams(config);

    return firstValueFrom(
      this.http
        .delete<T>(url, {
          headers,
          params,
          withCredentials: config?.withCredentials,
        })
        .pipe(
          timeout(config?.timeout ?? DEFAULT_TIMEOUT),
          catchError((error) => throwError(() => this.transformError(error)))
        )
    );
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Build HttpHeaders from config
   */
  private buildHeaders(config?: HttpRequestConfig): HttpHeaders | undefined {
    if (!config?.headers) return undefined;
    return new HttpHeaders(config.headers);
  }

  /**
   * Build HttpParams from config
   */
  private buildParams(config?: HttpRequestConfig): HttpParams | undefined {
    if (!config?.params) return undefined;

    let params = new HttpParams();
    for (const [key, value] of Object.entries(config.params)) {
      params = params.set(key, String(value));
    }
    return params;
  }

  /**
   * Transform Angular HttpErrorResponse to HttpAdapterError
   * Uses unified @nxt1/core error system for consistency
   */
  private transformError(error: unknown): HttpAdapterError {
    if (error instanceof HttpErrorResponse) {
      // Server responded with an error
      if (error.status === 0) {
        // Network error
        return {
          status: 0,
          code: API_ERROR_CODES.CLIENT_NETWORK_ERROR,
          message: 'Unable to connect to server. Please check your internet connection.',
          details: error,
        };
      }

      // Try to parse as unified API error response
      if (error.error && typeof error.error === 'object') {
        const parsed = parseApiError(error.error);
        return {
          status: error.status,
          code: parsed.code,
          message: parsed.message,
          details: parsed,
        };
      }

      // Fallback: Extract error message from response
      const message =
        error.error?.message ||
        error.error?.error ||
        error.statusText ||
        'An unexpected error occurred';

      return {
        status: error.status,
        code: this.getErrorCode(error.status),
        message,
        details: error.error,
      };
    }

    // Timeout error from RxJS
    if (error instanceof Error && error.name === 'TimeoutError') {
      return {
        status: 0,
        code: API_ERROR_CODES.CLIENT_TIMEOUT,
        message: 'Request timed out. Please try again.',
        details: error,
      };
    }

    // Unknown error - use unified parser
    const parsed = parseApiError(error);
    return {
      status: 0,
      code: parsed.code,
      message: getErrorMessage(error),
      details: error,
    };
  }

  /**
   * Map HTTP status code to unified error code
   */
  private getErrorCode(status: number): string {
    switch (status) {
      case 400:
        return API_ERROR_CODES.VAL_INVALID_INPUT;
      case 401:
        return API_ERROR_CODES.AUTH_TOKEN_INVALID;
      case 403:
        return API_ERROR_CODES.AUTHZ_FORBIDDEN;
      case 404:
        return API_ERROR_CODES.RES_NOT_FOUND;
      case 409:
        return API_ERROR_CODES.RES_CONFLICT;
      case 422:
        return API_ERROR_CODES.VAL_INVALID_INPUT;
      case 429:
        return API_ERROR_CODES.RATE_LIMIT_EXCEEDED;
      case 500:
        return API_ERROR_CODES.SRV_INTERNAL_ERROR;
      case 502:
        return API_ERROR_CODES.EXT_SERVICE_ERROR;
      case 503:
        return API_ERROR_CODES.SRV_UNAVAILABLE;
      case 504:
        return API_ERROR_CODES.EXT_TIMEOUT;
      default:
        return API_ERROR_CODES.SRV_INTERNAL_ERROR;
    }
  }
}
