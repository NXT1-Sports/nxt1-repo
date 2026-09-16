/**
 * @fileoverview Demo Request API Factory - Pure TypeScript
 * @module @nxt1/core/demo-request
 *
 * 100% portable - NO platform dependencies. Uses the HttpAdapter pattern
 * so the same factory works across web, mobile, and backend callers.
 */

import type { HttpAdapter } from '../api/http-adapter';
import type { DemoRequestSubmission, DemoRequestResponse } from './demo-request.types';
import { createApiError, isNxtApiError } from '../errors';

export type DemoRequestApi = ReturnType<typeof createDemoRequestApi>;

const DEMO_REQUEST_ENDPOINT = '/marketing/demo-request';

/**
 * Extract a human-readable message from any thrown value, including
 * Angular's HttpErrorResponse (which implements Error but does not extend
 * the native Error class, so `instanceof Error` checks miss it).
 */
function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const shaped = error as {
      error?: { error?: string; message?: string } | string;
      message?: string;
    };

    if (typeof shaped.error === 'string') return shaped.error;
    if (typeof shaped.error?.error === 'string') return shaped.error.error;
    if (typeof shaped.error?.message === 'string') return shaped.error.message;
    if (typeof shaped.message === 'string') return shaped.message;
  }

  return 'Unknown error submitting demo request';
}

/**
 * Create Demo Request API instance.
 *
 * @param http - Platform-specific HTTP adapter
 * @param baseUrl - Base URL for API endpoints
 *
 * @example
 * ```typescript
 * const api = createDemoRequestApi(angularHttpAdapter, environment.apiURL);
 * await api.submit({ name, email, organization });
 * ```
 */
export function createDemoRequestApi(http: HttpAdapter, baseUrl: string) {
  return {
    async submit(input: DemoRequestSubmission): Promise<DemoRequestResponse> {
      try {
        const response = await http.post<DemoRequestResponse>(
          `${baseUrl}${DEMO_REQUEST_ENDPOINT}`,
          input
        );

        if (!response.success) {
          throw createApiError('SRV_INTERNAL_ERROR', {
            message: response.error ?? 'Failed to submit demo request',
          });
        }

        return response;
      } catch (error) {
        if (isNxtApiError(error)) throw error;

        throw createApiError('SRV_INTERNAL_ERROR', {
          message: extractErrorMessage(error),
        });
      }
    },
  } as const;
}
