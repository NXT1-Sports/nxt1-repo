/**
 * @fileoverview Performance HTTP Interceptor
 * @module @nxt1/web/core/infrastructure
 *
 * HTTP interceptor that automatically traces API requests with Firebase Performance.
 * Adds custom attributes for endpoint, method, and response status.
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { HttpInterceptorFn, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap, finalize } from 'rxjs/operators';
import { PerformanceService } from '../services';
import { ATTRIBUTE_NAMES } from '@nxt1/core/performance';

/**
 * Configuration for performance tracing interceptor
 */
export interface PerformanceInterceptorConfig {
  /** Patterns to exclude from tracing (e.g., health checks) */
  excludePatterns?: (string | RegExp)[];
  /** Whether to trace only API calls (starts with /api) */
  apiOnly?: boolean;
  /** Base API URL to normalize endpoint names */
  apiBaseUrl?: string;
}

/**
 * Default configuration
 */
const defaultConfig: PerformanceInterceptorConfig = {
  excludePatterns: [/health/i, /ping/i, /favicon/i, /\.map$/, /hot-update/],
  apiOnly: true,
  apiBaseUrl: '/api/v1',
};

/**
 * Check if URL should be traced
 */
function shouldTrace(url: string, config: PerformanceInterceptorConfig): boolean {
  // Check exclude patterns
  if (
    config.excludePatterns?.some((pattern) => {
      if (typeof pattern === 'string') {
        return url.includes(pattern);
      }
      return pattern.test(url);
    })
  ) {
    return false;
  }

  // Check API only flag
  if (config.apiOnly) {
    return url.includes('/api/') || url.includes('api.');
  }

  return true;
}

/**
 * Extract endpoint name from URL for trace naming
 */
function getEndpointName(url: string, baseUrl?: string): string {
  try {
    const urlObj = new URL(url, 'http://localhost');
    let path = urlObj.pathname;

    // Remove base URL prefix
    if (baseUrl && path.startsWith(baseUrl)) {
      path = path.slice(baseUrl.length);
    }

    // Normalize: remove leading/trailing slashes, replace slashes with underscores
    const normalized = path
      .replace(/^\/+|\/+$/g, '')
      .replace(/\//g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 50); // Firebase limits trace names

    return normalized || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * HTTP Performance Tracing Interceptor Factory
 *
 * Creates an HTTP interceptor that automatically traces API requests.
 *
 * @param config - Optional configuration
 * @returns HTTP interceptor function
 *
 * @example
 * ```typescript
 * // In app.config.ts
 * provideHttpClient(
 *   withInterceptors([
 *     httpPerformanceInterceptor({ apiOnly: true }),
 *   ])
 * )
 * ```
 */
export function httpPerformanceInterceptor(
  config?: PerformanceInterceptorConfig
): HttpInterceptorFn {
  const mergedConfig = { ...defaultConfig, ...config };

  return (req, next) => {
    const performance = inject(PerformanceService);

    // Check if we should trace this request
    if (!shouldTrace(req.url, mergedConfig)) {
      return next(req);
    }

    const endpoint = getEndpointName(req.url, mergedConfig.apiBaseUrl);
    const traceName = `http_${req.method.toLowerCase()}_${endpoint}`;
    const startTime = Date.now();

    // Track trace reference for async operations
    let activeTrace: Awaited<ReturnType<typeof performance.startTrace>> | null = null;

    // Start trace asynchronously (don't block request)
    performance
      .startTrace(traceName)
      .then(async (trace) => {
        activeTrace = trace;

        // Set initial attributes
        await trace.putAttribute(ATTRIBUTE_NAMES.ENDPOINT, endpoint);
        await trace.putAttribute(ATTRIBUTE_NAMES.HTTP_METHOD, req.method);

        // Track request size if available
        if (req.body) {
          try {
            const bodySize = JSON.stringify(req.body).length;
            await trace.putMetric('request_size_bytes', bodySize);
          } catch {
            // Body might not be serializable
          }
        }
      })
      .catch(() => {
        // Silently handle trace setup errors
      });

    // Return the request pipeline with tracing side effects
    return next(req).pipe(
      tap({
        next: async (event) => {
          if (event instanceof HttpResponse && activeTrace) {
            await activeTrace.putAttribute(ATTRIBUTE_NAMES.STATUS_CODE, String(event.status));
            await activeTrace.putAttribute('success', 'true');

            // Track response size
            if (event.body) {
              try {
                const bodySize = JSON.stringify(event.body).length;
                await activeTrace.putMetric('response_size_bytes', bodySize);
              } catch {
                // Body might not be serializable
              }
            }

            // Track content type
            const contentType = event.headers.get('content-type');
            if (contentType) {
              await activeTrace.putAttribute(
                ATTRIBUTE_NAMES.CONTENT_TYPE,
                contentType.split(';')[0]
              );
            }
          }
        },
        error: async (error: HttpErrorResponse) => {
          if (activeTrace) {
            await activeTrace.putAttribute(ATTRIBUTE_NAMES.STATUS_CODE, String(error.status || 0));
            await activeTrace.putAttribute('success', 'false');
            await activeTrace.putAttribute(ATTRIBUTE_NAMES.ERROR_TYPE, error.name || 'HttpError');
            if (error.status) {
              await activeTrace.putAttribute(ATTRIBUTE_NAMES.ERROR_CODE, String(error.status));
            }
          }
        },
      }),
      finalize(async () => {
        if (activeTrace) {
          await activeTrace.putMetric('duration_ms', Date.now() - startTime);
          await activeTrace.stop();
        }
      })
    );
  };
}

/**
 * Simple HTTP Performance Interceptor
 *
 * Use this when you want minimal configuration.
 * Traces all API calls to /api/ endpoints.
 */
export const simpleHttpPerformanceInterceptor: HttpInterceptorFn = httpPerformanceInterceptor();
