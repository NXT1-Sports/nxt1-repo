export interface FilmTrackingWorkerTimeRange {
  readonly startSec: number;
  readonly endSec: number;
}

export interface FilmTrackingWorkerRequest {
  readonly fileId: string;
  readonly sourceId?: string;
  readonly sport: string;
  readonly scope: 'play' | 'selected_plays' | 'timeline' | 'full_video';
  readonly mode: 'draft' | 'metric';
  readonly playIds?: readonly string[];
  readonly videoStoragePath?: string;
  readonly timeRange?: FilmTrackingWorkerTimeRange;
}

export interface FilmTrackingWorkerResponse {
  readonly status: 'ready' | 'limited' | 'failed';
  readonly capability:
    | 'none'
    | 'detection_only'
    | 'tracked_image_space'
    | 'calibrated_surface'
    | 'identified_roster'
    | 'metric_ready';
  readonly manifestStoragePath?: string;
  readonly manifest?: unknown;
  readonly chunks?: readonly unknown[];
  readonly error?: string;
}

export interface FilmTrackingWorkerClientOptions {
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_FILM_TRACKING_WORKER_TIMEOUT_MS = 120_000;

export class FilmTrackingWorkerClientUnavailableError extends Error {
  constructor() {
    super('Film tracking worker URL is not configured');
    this.name = 'FilmTrackingWorkerClientUnavailableError';
  }
}

export class FilmTrackingWorkerClientError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'FilmTrackingWorkerClientError';
  }
}

export class FilmTrackingWorkerClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FilmTrackingWorkerClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env['FILM_TRACKING_WORKER_URL'] ?? '').replace(
      /\/+$/,
      ''
    );
    this.timeoutMs = options.timeoutMs ?? DEFAULT_FILM_TRACKING_WORKER_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get configured(): boolean {
    return this.baseUrl.length > 0;
  }

  async track(request: FilmTrackingWorkerRequest): Promise<FilmTrackingWorkerResponse> {
    if (!this.configured) {
      throw new FilmTrackingWorkerClientUnavailableError();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/track`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new FilmTrackingWorkerClientError(
          resolveWorkerErrorMessage(payload) ?? `Film tracking worker failed (${response.status})`,
          response.status
        );
      }

      if (!isFilmTrackingWorkerResponse(payload)) {
        throw new FilmTrackingWorkerClientError('Film tracking worker returned an invalid payload');
      }

      return payload;
    } catch (error) {
      if (error instanceof FilmTrackingWorkerClientError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new FilmTrackingWorkerClientError('Film tracking worker request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function resolveWorkerErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const detail = (payload as { detail?: unknown }).detail;
  const error = (payload as { error?: unknown }).error;
  return typeof detail === 'string' ? detail : typeof error === 'string' ? error : null;
}

function isFilmTrackingWorkerResponse(payload: unknown): payload is FilmTrackingWorkerResponse {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as Partial<FilmTrackingWorkerResponse>;
  return (
    (value.status === 'ready' || value.status === 'limited' || value.status === 'failed') &&
    typeof value.capability === 'string'
  );
}
