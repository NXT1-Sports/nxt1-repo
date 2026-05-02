/**
 * @fileoverview Favicon Registry — Centralized favicon mapping for external sources
 * @module @nxt1/backend/modules/agent/tools/favicon-registry
 *
 * Provides:
 * - `FAVICON_REGISTRY` — Domain → favicon URL mapping
 * - `resolveUrlDisplay()` — Converts URLs to compact markdown links with favicon
 * - `extractDomain()` — Gets domain from URL
 */

import {
  PLATFORM_FAVICON_DOMAINS,
  PLATFORM_REGISTRY,
  getPlatformFaviconUrl,
} from '@nxt1/core/platforms';

/**
 * Centralized mapping of domains → display names + favicon URLs.
 * Used for all tools that reference external URLs.
 */
export const FAVICON_REGISTRY: Record<string, { displayName: string; faviconUrl: string }> =
  (() => {
    const bySlug: Record<string, { displayName: string; faviconUrl: string }> = {};

    // Build from the same source-of-truth used by connected sources and profile UIs.
    for (const definition of PLATFORM_REGISTRY) {
      const platform = definition.platform.toLowerCase();
      const faviconUrl = getPlatformFaviconUrl(platform);
      if (!faviconUrl) continue;
      bySlug[platform] = {
        displayName: definition.label,
        faviconUrl,
      };
    }

    // Domain aliases that appear in URLs but differ from platform IDs.
    const aliasToPlatform: Record<string, string> = {
      x: 'twitter',
      athleticnet: 'athletic',
      ncsasports: 'ncsa',
    };
    for (const [alias, platform] of Object.entries(aliasToPlatform)) {
      const mapped = bySlug[platform];
      if (mapped) bySlug[alias] = mapped;
    }

    // Ensure every platform with a domain map is represented even if missing from PLATFORM_REGISTRY.
    for (const [platform, domain] of Object.entries(PLATFORM_FAVICON_DOMAINS)) {
      const normalized = platform.toLowerCase();
      if (normalized.endsWith('_signin')) continue;
      if (bySlug[normalized]) continue;

      const fallbackLabel = normalized
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      bySlug[normalized] = {
        displayName: fallbackLabel,
        faviconUrl: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      };
    }

    return bySlug;
  })();

/**
 * Extract domain slug from URL string.
 * @example
 * extractDomain('https://www.maxpreps.com/athlete/abc')  → 'maxpreps'
 * extractDomain('https://hudl.com/video/123')            → 'hudl'
 * extractDomain('invalid')                               → 'source'
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();

    // Handle special cases
    if (hostname.includes('247sports')) return '247sports';
    if (hostname.includes('athletic')) return 'athleticnet';

    // Extract base domain
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }

    return hostname;
  } catch {
    return 'source';
  }
}

/**
 * Get favicon URL for a domain.
 * Returns the favicon URL if found in registry, otherwise undefined.
 */
export function getFaviconUrl(domain: string): string | undefined {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  const slug = extractDomain(`https://${normalizedDomain}`);
  return FAVICON_REGISTRY[slug]?.faviconUrl;
}

/**
 * Get display name for a domain.
 * Returns the display name if found in registry, otherwise the domain itself.
 */
export function getDisplayName(domain: string): string {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
  const slug = extractDomain(`https://${normalizedDomain}`);
  return FAVICON_REGISTRY[slug]?.displayName ?? domain;
}

export interface UrlDisplayOptions {
  /**
   * Display style:
   * - 'link' (default): `[🔗 Source](url)` or `[icon Domain](url)` if favicon available
   * - 'domain': `[domain.com](url)`
   * - 'short': `[→](url)` (minimal)
   */
  style?: 'link' | 'domain' | 'short';

  /**
   * Optional label to override the default.
   * If provided, used as the link text before domain name.
   */
  label?: string;

  /**
   * If true, returns just the URL without markdown link formatting.
   * Useful when you want the URL separately.
   */
  rawUrl?: boolean;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function resolveUrlText(url: string, options?: UrlDisplayOptions): string {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, '');
    const slug = extractDomain(url);

    switch (options?.style) {
      case 'domain':
        return domain;
      case 'short':
        return 'Source';
      case 'link':
      default:
        return FAVICON_REGISTRY[slug]?.displayName ?? options?.label ?? 'Source';
    }
  } catch {
    return options?.label ?? 'Source';
  }
}

/**
 * Convert a URL to a compact markdown link using favicon system.
 *
 * @example
 * // With favicon available (MaxPreps)
 * resolveUrlDisplay('https://www.maxpreps.com/athlete/abc')
 * → `[📋 MaxPreps](https://www.maxpreps.com/athlete/abc)`
 *
 * @example
 * // Without favicon, fallback to domain
 * resolveUrlDisplay('https://example-unknown.com/page')
 * → `[→ Source](https://example-unknown.com/page)`
 *
 * @example
 * // Custom style
 * resolveUrlDisplay('https://hudl.com/video/123', { style: 'domain' })
 * → `[hudl.com](https://hudl.com/video/123)`
 *
 * @example
 * // Raw URL only (no markdown)
 * resolveUrlDisplay('https://www.maxpreps.com/athlete/abc', { rawUrl: true })
 * → `https://www.maxpreps.com/athlete/abc`
 */
export function resolveUrlDisplay(url: string, options?: UrlDisplayOptions): string {
  if (options?.rawUrl) {
    return url;
  }

  try {
    const textLabel = resolveUrlText(url, options);
    const linkText =
      options?.style === 'short'
        ? '→'
        : options?.style === 'domain'
          ? new URL(url).hostname.replace(/^www\./, '')
          : FAVICON_REGISTRY[extractDomain(url)]
            ? textLabel
            : `→ ${textLabel}`;

    return `[${linkText}](${url})`;
  } catch {
    // Fallback for invalid URLs
    return options?.label ? `[${options.label}](${url})` : `[🔗 Source](${url})`;
  }
}

/**
 * Format a list of URLs as compact markdown links.
 * Useful for displaying multiple URLs in tool results.
 *
 * @example
 * formatUrlsList([
 *   'https://www.maxpreps.com/athlete/abc',
 *   'https://hudl.com/video/123',
 *   'https://example.com/page'
 * ])
 * → `[🔗 MaxPreps](https://...), [🔗 Hudl](https://...), [→ Source](https://...)`
 */
export function formatUrlsList(urls: string[], options?: UrlDisplayOptions): string {
  if (urls.length === 0) return '';
  return urls.map((url) => resolveUrlDisplay(url, options)).join(', ');
}

/**
 * Replace all URLs in markdown text with compact link versions.
 * Preserves existing markdown formatting.
 *
 * @example
 * compactizeMarkdownUrls(
 *   'Check out [my profile](https://maxpreps.com/athlete/abc) and [this video](https://hudl.com/video/123)'
 * )
 * → Replaces full links with compact versions
 */
export function compactizeMarkdownUrls(markdown: string): string {
  // Match markdown links: [text](url)
  const compactedMarkdownLinks = markdown.replace(
    /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/gi,
    (_, text, url) => {
      // If original text is a full URL or too long, replace with compact
      if (text.includes('http') || text.length > 50) {
        return resolveUrlDisplay(url);
      }
      // Keep original text if it's short and descriptive
      return `[${text}](${url})`;
    }
  );

  // Replace naked URLs that are not already inside a markdown link target.
  return compactedMarkdownLinks.replace(
    /(^|[^[(])((https?:\/\/[^\s)<\]]+))/gi,
    (_, prefix, __, url) => {
      if (!isHttpUrl(url)) return `${prefix}${url}`;
      return `${prefix}${resolveUrlDisplay(url)}`;
    }
  );
}
