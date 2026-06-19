import { logger } from './logger.js';

const DEFAULT_TOKEN_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_TOKEN_REQUEST_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
  [key: string]: unknown;
}

export interface OAuthTokenRequestOptions {
  operation: string;
  logContext?: Record<string, unknown>;
  maxAttempts?: number;
  timeoutMs?: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableTokenFetchError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('premature close') ||
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('fetch failed') ||
    message.includes('body') ||
    message.includes('aborted')
  );
}

async function readJsonBody<T extends OAuthTokenResponse>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;
  if (!body || typeof body !== 'object') {
    throw new Error(`OAuth token endpoint returned non-object JSON body (${response.status})`);
  }
  return body as T;
}

export async function postOAuthTokenForm<T extends OAuthTokenResponse = OAuthTokenResponse>(
  endpoint: string,
  params: URLSearchParams,
  options: OAuthTokenRequestOptions
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_TOKEN_REQUEST_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TOKEN_REQUEST_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal,
      });

      const shouldRetryStatus = RETRYABLE_STATUS_CODES.has(response.status);
      const tokenBody = await readJsonBody<T>(response);

      if (shouldRetryStatus && attempt < maxAttempts) {
        logger.warn('[OAuthTokenRequest] Retryable token endpoint status', {
          operation: options.operation,
          endpoint,
          status: response.status,
          attempt,
          maxAttempts,
          ...options.logContext,
        });
        await delay(250 * attempt);
        continue;
      }

      return tokenBody;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableTokenFetchError(error)) {
        throw error;
      }

      logger.warn('[OAuthTokenRequest] Retrying transient token endpoint failure', {
        operation: options.operation,
        endpoint,
        attempt,
        maxAttempts,
        error: getErrorMessage(error),
        ...options.logContext,
      });
      await delay(250 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
