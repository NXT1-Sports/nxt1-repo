/**
 * HTTP Adapter Interface - Pure TypeScript
 *
 * ⭐ THIS FILE IS 100% PORTABLE TO MOBILE ⭐
 *
 * Platform-agnostic HTTP interface that can be implemented by:
 * - Angular HttpClient (Web)
 * - Fetch API (React Native / Mobile)
 * - Capacitor HTTP plugin (Native)
 * - Node.js http module (Server/Functions)
 *
 * This abstraction enables the same API functions to work
 * across all platforms without modification.
 *
 * @module @nxt1/core/api
 * @version 2.0.0
 *
 * @example Web (Angular)
 * ```typescript
 * const adapter: HttpAdapter = {
 *   get: (url) => firstValueFrom(http.get(url)),
 *   post: (url, body) => firstValueFrom(http.post(url, body)),
 *   // ...
 * };
 * ```
 *
 * @example Mobile (React Native)
 * ```typescript
 * const adapter: HttpAdapter = {
 *   get: (url) => fetch(url).then(r => r.json()),
 *   post: (url, body) => fetch(url, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
 *   // ...
 * };
 * ```
 *
 * @example Mobile (Capacitor)
 * ```typescript
 * import { CapacitorHttp } from '@capacitor/core';
 *
 * const adapter: HttpAdapter = {
 *   get: async (url, config) => {
 *     const response = await CapacitorHttp.get({ url, headers: config?.headers });
 *     return response.data;
 *   },
 * };
 * ```
 */

// ============================================
// REQUEST CONFIG
// ============================================

/**
 * Request configuration options
 */
export interface HttpRequestConfig {
  /** Custom headers to include */
  headers?: Record<string, string>;

  /** Query parameters */
  params?: Record<string, string | number | boolean>;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Whether to include credentials (cookies) */
  withCredentials?: boolean;

  /** Response type */
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
}

// ============================================
// HTTP ADAPTER INTERFACE
// ============================================

/**
 * HTTP adapter interface - implemented differently per platform
 */
export interface HttpAdapter {
  /**
   * Perform GET request
   * @param url - Full URL or path
   * @param config - Optional request configuration
   */
  get<T>(url: string, config?: HttpRequestConfig): Promise<T>;

  /**
   * Perform POST request
   * @param url - Full URL or path
   * @param body - Request body
   * @param config - Optional request configuration
   */
  post<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T>;

  /**
   * Perform PUT request
   * @param url - Full URL or path
   * @param body - Request body
   * @param config - Optional request configuration
   */
  put<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T>;

  /**
   * Perform PATCH request
   * @param url - Full URL or path
   * @param body - Request body
   * @param config - Optional request configuration
   */
  patch<T>(url: string, body: unknown, config?: HttpRequestConfig): Promise<T>;

  /**
   * Perform DELETE request
   * @param url - Full URL or path
   * @param config - Optional request configuration
   */
  delete<T>(url: string, config?: HttpRequestConfig): Promise<T>;
}

// ============================================
// HTTP ADAPTER ERROR
// ============================================

/**
 * API Error structure returned by adapter implementations
 */
export interface HttpAdapterError {
  /** HTTP status code (0 for network errors) */
  status: number;
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Original error details */
  details?: unknown;
}

/**
 * Type guard to check if an error is an HttpAdapterError
 */
export function isHttpAdapterError(error: unknown): error is HttpAdapterError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'code' in error &&
    'message' in error
  );
}

// ============================================
// HTTP ERROR CLASS
// ============================================

/**
 * HTTP Error class for detailed error handling
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly data?: unknown
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'HttpError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

// ============================================
// FETCH-BASED ADAPTER FACTORY
// ============================================

/**
 * Create a fetch-based HTTP adapter
 * Works in browsers, Node.js 18+, and React Native
 *
 * @param baseUrl - Base URL to prepend to all requests
 * @returns HttpAdapter implementation using fetch
 */
export function createFetchAdapter(baseUrl: string = ''): HttpAdapter {
  async function request<T>(
    method: string,
    url: string,
    body?: unknown,
    config?: HttpRequestConfig
  ): Promise<T> {
    const fullUrl = buildUrl(baseUrl + url, config?.params);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config?.headers,
    };

    const options: RequestInit = {
      method,
      headers,
      credentials: config?.withCredentials ? 'include' : 'same-origin',
    };

    if (body && method !== 'GET' && method !== 'HEAD') {
      options.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutId = config?.timeout
      ? setTimeout(() => controller.abort(), config.timeout)
      : undefined;

    options.signal = controller.signal;

    try {
      const response = await fetch(fullUrl, options);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new HttpError(response.status, response.statusText, errorData);
      }

      if (config?.responseType === 'text') {
        return (await response.text()) as unknown as T;
      }
      if (config?.responseType === 'blob') {
        return (await response.blob()) as unknown as T;
      }
      if (config?.responseType === 'arraybuffer') {
        return (await response.arrayBuffer()) as unknown as T;
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) {
        return {} as T;
      }

      return JSON.parse(text) as T;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  return {
    get: <T>(url: string, config?: HttpRequestConfig) => request<T>('GET', url, undefined, config),
    post: <T>(url: string, body: unknown, config?: HttpRequestConfig) =>
      request<T>('POST', url, body, config),
    put: <T>(url: string, body: unknown, config?: HttpRequestConfig) =>
      request<T>('PUT', url, body, config),
    patch: <T>(url: string, body: unknown, config?: HttpRequestConfig) =>
      request<T>('PATCH', url, body, config),
    delete: <T>(url: string, config?: HttpRequestConfig) =>
      request<T>('DELETE', url, undefined, config),
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Build URL with query parameters
 */
function buildUrl(url: string, params?: Record<string, string | number | boolean>): string {
  if (!params || Object.keys(params).length === 0) return url;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}
