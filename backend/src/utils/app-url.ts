import { getRuntimeEnvironment, type RuntimeEnvironment } from '../config/runtime-environment.js';

const DEFAULT_STAGING_APP_URL = 'https://nxt1-repo--nxt-1-staging-v2.us-central1.hosted.app';
const DEFAULT_PRODUCTION_APP_URL = 'https://nxt1sports.com';

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    return parsed.origin.replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function parseOriginList(value: string | undefined): readonly string[] {
  if (typeof value !== 'string' || !value.trim()) return [];

  return value
    .split(',')
    .map((entry) => normalizeBaseUrl(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeProto(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.split(',')[0]?.trim().toLowerCase();
  return trimmed === 'http' || trimmed === 'https' ? trimmed : undefined;
}

function normalizeHost(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.split(',')[0]?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).host;
    } catch {
      return undefined;
    }
  }

  return trimmed.replace(/\/$/, '');
}

function resolveOriginFromHost(
  host?: string,
  protocol?: string,
  forwardedHost?: string,
  forwardedProto?: string
): string | undefined {
  const normalizedHost = normalizeHost(forwardedHost) ?? normalizeHost(host);
  if (!normalizedHost) return undefined;

  const normalizedProtocol = normalizeProto(forwardedProto) ?? normalizeProto(protocol);
  if (!normalizedProtocol) return undefined;

  return normalizeBaseUrl(`${normalizedProtocol}://${normalizedHost}`);
}

function resolveOriginCandidate(
  origin?: string,
  referer?: string,
  host?: string,
  protocol?: string,
  forwardedHost?: string,
  forwardedProto?: string
): string | undefined {
  const normalizedOrigin = normalizeBaseUrl(origin);
  if (normalizedOrigin) return normalizedOrigin;

  if (typeof referer === 'string' && referer.trim()) {
    try {
      return new URL(referer).origin.replace(/\/$/, '');
    } catch {
      return resolveOriginFromHost(host, protocol, forwardedHost, forwardedProto);
    }
  }

  return resolveOriginFromHost(host, protocol, forwardedHost, forwardedProto);
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function isAllowedConfiguredOrigin(origin: string): boolean {
  const allowedOrigins = new Set<string>([
    ...parseOriginList(process.env['CORS_ORIGINS']),
    ...parseOriginList(process.env['STAGING_ALLOWED_FRONTEND_ORIGINS']),
  ]);

  return allowedOrigins.has(origin);
}

function getDefaultAppBaseUrl(environment: RuntimeEnvironment): string {
  const envSpecific =
    environment === 'production'
      ? normalizeBaseUrl(process.env['PRODUCTION_APP_URL'])
      : normalizeBaseUrl(process.env['STAGING_APP_URL']);

  return (
    envSpecific ??
    (environment === 'production' ? DEFAULT_PRODUCTION_APP_URL : DEFAULT_STAGING_APP_URL)
  );
}

export interface ResolveAppBaseUrlOptions {
  readonly environment?: RuntimeEnvironment;
  readonly appBaseUrl?: string;
  readonly origin?: string;
  readonly referer?: string;
  readonly host?: string;
  readonly protocol?: string;
  readonly forwardedHost?: string;
  readonly forwardedProto?: string;
}

export function resolveAppBaseUrl(options: ResolveAppBaseUrlOptions = {}): string {
  const explicitBaseUrl = normalizeBaseUrl(options.appBaseUrl ?? process.env['APP_URL']);
  if (explicitBaseUrl) return explicitBaseUrl;

  const requestOrigin = resolveOriginCandidate(
    options.origin,
    options.referer,
    options.host,
    options.protocol,
    options.forwardedHost,
    options.forwardedProto
  );
  if (
    requestOrigin &&
    (isLocalDevelopmentOrigin(requestOrigin) || isAllowedConfiguredOrigin(requestOrigin))
  ) {
    return requestOrigin;
  }

  return getDefaultAppBaseUrl(options.environment ?? getRuntimeEnvironment());
}

export function toAbsoluteAppUrl(path: string, options: ResolveAppBaseUrlOptions = {}): string {
  const baseUrl = resolveAppBaseUrl(options);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
