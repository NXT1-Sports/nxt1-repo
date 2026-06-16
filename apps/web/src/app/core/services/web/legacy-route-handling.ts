const LEGACY_PROFILE_ROUTE_PATTERNS = [
  /^\/prospect-profile\/([^/]+)\/?$/,
  /^\/profile\/athlete\/[^/]+\/([^/]+)\/?$/,
] as const;

const RETIRED_LEGACY_ROUTE_PATTERNS = [
  /^\/saved-scouting-report(?:\/.*)?$/,
  /^\/search-videos(?:\/.*)?$/,
] as const;

const REDIRECT_TO_PRIMARY_HOSTS = new Set([
  'app.nxt1sports.com',
  'www.nxt1sports.com',
  'discover.nxt1sports.com',
]);

function normalizeRequestPath(requestPath: string): string {
  const withoutQuery = requestPath.split('?')[0]?.split('#')[0] ?? '/';
  if (withoutQuery === '/' || withoutQuery.length === 0) {
    return '/';
  }

  return withoutQuery.replace(/\/+$/, '') || '/';
}

export function extractLegacyProfileLookupParam(requestPath: string): string | null {
  const normalizedPath = normalizeRequestPath(requestPath);

  for (const pattern of LEGACY_PROFILE_ROUTE_PATTERNS) {
    const match = normalizedPath.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function isRetiredLegacyRoute(requestPath: string): boolean {
  const normalizedPath = normalizeRequestPath(requestPath);
  return RETIRED_LEGACY_ROUTE_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

export function buildPreferredHostRedirectUrl(
  fullUrl: string,
  preferredHost = 'nxt1sports.com'
): string | null {
  try {
    const url = new URL(fullUrl);
    if (!REDIRECT_TO_PRIMARY_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }

    url.protocol = 'https:';
    url.hostname = preferredHost;
    return url.toString();
  } catch {
    return null;
  }
}
