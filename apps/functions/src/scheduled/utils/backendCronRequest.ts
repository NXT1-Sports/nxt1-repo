import { logger } from 'firebase-functions/v2';

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeBackendBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, '');

  if (!trimmed.startsWith('http://')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';

    if (isLocalhost) {
      return trimmed;
    }

    parsed.protocol = 'https:';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return trimmed;
  }
}

function isRetryableFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }

  return err.name === 'TimeoutError' || err.name === 'AbortError' || err instanceof TypeError;
}

interface PostBackendCronJsonOptions {
  readonly backendBaseUrl: string;
  readonly endpointPath: string;
  readonly cronSecret: string;
  readonly jobName: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

/**
 * Calls backend cron endpoints with timeout + bounded retries.
 * Returns null for exhausted retryable failures so scheduled jobs can fail-open.
 */
export async function postBackendCronJson<T>(
  options: PostBackendCronJsonOptions
): Promise<{ data: T; status: number } | null> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxAttempts = options.maxAttempts ?? 3;
  const baseUrl = sanitizeBackendBaseUrl(options.backendBaseUrl);
  const url = `${baseUrl}${options.endpointPath}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': options.cronSecret,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        const json = (await response.json()) as T;
        return { data: json, status: response.status };
      }

      const body = await response.text().catch(() => '');
      const isRetryableStatus = RETRYABLE_STATUS_CODES.has(response.status);
      const hasMoreAttempts = attempt < maxAttempts;

      if (isRetryableStatus && hasMoreAttempts) {
        const nextDelayMs = 1_000 * attempt;
        logger.warn(`${options.jobName}: retryable backend response`, {
          status: response.status,
          attempt,
          maxAttempts,
          nextDelayMs,
          url,
        });
        await sleep(nextDelayMs);
        continue;
      }

      if (isRetryableStatus) {
        logger.warn(`${options.jobName}: backend unavailable after retries`, {
          status: response.status,
          attempt,
          maxAttempts,
          url,
          body: body.slice(0, 500),
        });
        return null;
      }

      throw new Error(
        `${options.jobName}: backend returned ${response.status} ${body.slice(0, 200)}`
      );
    } catch (err) {
      const hasMoreAttempts = attempt < maxAttempts;
      const retryableError = isRetryableFetchError(err);

      if (retryableError && hasMoreAttempts) {
        const nextDelayMs = 1_000 * attempt;
        logger.warn(`${options.jobName}: retryable fetch error`, {
          attempt,
          maxAttempts,
          nextDelayMs,
          url,
          error: err instanceof Error ? err.message : String(err),
        });
        await sleep(nextDelayMs);
        continue;
      }

      if (retryableError) {
        logger.warn(`${options.jobName}: backend request failed after retries`, {
          attempt,
          maxAttempts,
          url,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }

      throw err;
    }
  }

  return null;
}
