import { CACHE_CONFIG } from '@nxt1/core/cache';

interface MobileHttpCacheTtlConfig {
  pattern: RegExp;
  ttl: number;
}

interface MobileHttpCacheInvalidationConfig {
  pattern: RegExp;
  invalidate: readonly string[];
}

const MOBILE_HTTP_CACHE_TTL_CONFIG: readonly MobileHttpCacheTtlConfig[] = [
  { pattern: /\/activity\/feed/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/activity\/badges/, ttl: 30_000 },
  { pattern: /\/activity\/summary/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/usage\/overview(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/usage\/dashboard(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/usage\/chart(?:\/|$)/, ttl: 5 * 60_000 },
  { pattern: /\/usage\/breakdown(?:\/|$)/, ttl: 5 * 60_000 },
  { pattern: /\/usage\/history(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/usage\/payment-methods(?:\/|$)/, ttl: 30 * 60_000 },
  { pattern: /\/usage\/budgets(?:\/|$)/, ttl: 10 * 60_000 },
  { pattern: /\/billing\/budget(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/help-center\/articles\//, ttl: 30 * 60_000 },
  { pattern: /\/help-center\/categories\//, ttl: 10 * 60_000 },
  { pattern: /\/help-center\/faqs(?:\/|$)/, ttl: CACHE_CONFIG.LONG_TTL },
  { pattern: /\/help-center\/search(?:\/|$)/, ttl: 5 * 60_000 },
  { pattern: /\/help-center(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/college\//, ttl: CACHE_CONFIG.LONG_TTL },
  { pattern: /\/auth\/profile\/[^/]+\/timeline/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/auth\/profile/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/profile\/[^/]+\/timeline/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/profile\//, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/teams(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/feed\/users\//, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/feed\/teams\//, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/feed\/posts\/[^/]+$/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/feed(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/explore\/search(?:\/|\?|$)/, ttl: 2 * 60_000 },
  { pattern: /\/explore\/suggestions(?:\/|\?|$)/, ttl: 2 * 60_000 },
  { pattern: /\/explore\/counts(?:\/|\?|$)/, ttl: 2 * 60_000 },
  { pattern: /\/explore\/trending(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/athletes\/[^/]+(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/videos\/[^/]+(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/leaderboards\//, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/explore(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/api\/v1\/scout-reports\/search(?:\/|\?|$)/, ttl: 5 * 60_000 },
  { pattern: /\/api\/v1\/scout-reports\/summary(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/api\/v1\/scout-reports\/[^/]+(?:\/|$)/, ttl: CACHE_CONFIG.LONG_TTL },
  { pattern: /\/api\/v1\/scout-reports(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/pulse\/search(?:\/|\?|$)/, ttl: 5 * 60_000 },
  { pattern: /\/pulse\/trending(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/pulse\/[^/]+(?:\/|$)/, ttl: CACHE_CONFIG.LONG_TTL },
  { pattern: /\/pulse(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/api\/v1\/settings\/check-update(?:\/|$)/, ttl: 60_000 },
  { pattern: /\/api\/v1\/settings\/billing\/history(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/api\/v1\/settings\/subscription(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/api\/v1\/settings\/usage(?:\/|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/api\/v1\/settings(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/v1\/notifications\/settings(?:\/|$)/, ttl: CACHE_CONFIG.MEDIUM_TTL },
  { pattern: /\/v1\/notifications(?:\/|$)/, ttl: 30_000 },
  { pattern: /\/messages\/unread-count(?:\/|$)/, ttl: 30_000 },
  { pattern: /\/messages\/conversations(?:\/|\?|$)/, ttl: CACHE_CONFIG.SHORT_TTL },
  { pattern: /\/sports/, ttl: CACHE_CONFIG.EXTENDED_TTL },
  { pattern: /\/positions/, ttl: CACHE_CONFIG.EXTENDED_TTL },
];

const MOBILE_HTTP_CACHE_INVALIDATION_CONFIG: readonly MobileHttpCacheInvalidationConfig[] = [
  { pattern: /\/auth\/profile|\/profile\//, invalidate: ['*auth/profile*', '*profile*'] },
  { pattern: /\/teams(?:\/|$)/, invalidate: ['*teams*'] },
  { pattern: /\/activity\//, invalidate: ['*activity*'] },
  { pattern: /\/usage\/billing-mode/, invalidate: ['*usage*', '*billing/budget*'] },
  { pattern: /\/usage\//, invalidate: ['*usage*'] },
  { pattern: /\/billing\/budget/, invalidate: ['*billing/budget*', '*usage*'] },
  { pattern: /\/help-center\//, invalidate: ['*help-center*'] },
  { pattern: /\/invite\//, invalidate: ['*invite*'] },
  { pattern: /\/feed\/posts\/[^/]+\/(like|share|report)/, invalidate: ['*feed*'] },
  { pattern: /\/api\/v1\/scout-reports/, invalidate: ['*scout-reports*'] },
  { pattern: /\/api\/v1\/settings/, invalidate: ['*settings*'] },
  { pattern: /\/v1\/notifications\/read/, invalidate: ['*notifications*'] },
  {
    pattern: /\/messages\/(send|create|read|delete|mute|pin)/,
    invalidate: ['*messages/conversations*', '*messages/unread-count*'],
  },
];

const MOBILE_HTTP_CACHE_EXCLUDE_URLS: readonly RegExp[] = [
  /\/auth\/(?:login|register|signup|logout|token|refresh|verify|password|connect-url|callback|google|microsoft|apple|yahoo)/,
  /\/login/,
  /\/register/,
  /\/stripe\//,
  /\/paypal\//,
  /\/admin\//,
  /\/agent-x\//,
  /\/messages\/thread\//,
  /\/pulse\/generate/,
  /\/feed\/posts\/[^/]+\/(like|share|report|view)/,
  /\/v1\/notifications\/(read|register-token|unsubscribe)/,
];

function getHeaderValue(
  headers: Record<string, string> | undefined,
  name: string
): string | undefined {
  if (!headers) {
    return undefined;
  }

  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalized) {
      return value;
    }
  }

  return undefined;
}

export function getMobileHttpCacheTtl(url: string): number {
  for (const { pattern, ttl } of MOBILE_HTTP_CACHE_TTL_CONFIG) {
    if (pattern.test(url)) {
      return ttl;
    }
  }

  return CACHE_CONFIG.DEFAULT_TTL;
}

export function shouldUseMobileHttpCache(
  method: string,
  url: string,
  headers?: Record<string, string>
): boolean {
  if (method !== 'GET') {
    return false;
  }

  if (getHeaderValue(headers, 'X-No-Cache')) {
    return false;
  }

  const cacheControl = getHeaderValue(headers, 'Cache-Control');
  if (cacheControl?.includes('no-cache') || cacheControl?.includes('no-store')) {
    return false;
  }

  return !MOBILE_HTTP_CACHE_EXCLUDE_URLS.some((pattern) => pattern.test(url));
}

export function getMobileHttpCacheInvalidationPatterns(url: string): readonly string[] {
  const patterns = new Set<string>();

  for (const config of MOBILE_HTTP_CACHE_INVALIDATION_CONFIG) {
    if (config.pattern.test(url)) {
      for (const invalidatePattern of config.invalidate) {
        patterns.add(invalidatePattern);
      }
    }
  }

  return Array.from(patterns);
}
