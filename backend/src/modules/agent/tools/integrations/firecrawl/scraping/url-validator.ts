/**
 * @fileoverview SSRF-Safe URL Validator
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/scraping
 *
 * Pure-function URL validation for outbound scraping requests.
 * Blocks private/internal hosts, cloud metadata endpoints, non-HTTP(S) protocols,
 * and social media platforms that require authentication.
 *
 * Extracted as a standalone module so scraping tools can validate URLs
 * without depending on the full ScraperService.
 */

import { BLOCKED_INTERNAL_DOMAINS, BLOCKED_SOCIAL_MEDIA_DOMAINS } from './scraper.types.js';
import { AgentEngineError } from '../../../../exceptions/agent-engine.error.js';

export interface ValidateUrlOptions {
  /** Allow social domains (instagram/twitter/x/etc) for authenticated live-view sessions. */
  readonly allowSocialMedia?: boolean;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Validates and sanitizes a URL for SSRF safety.
 *
 * @param raw - The raw URL string from user/LLM input.
 * @returns The sanitized `URL.href` string.
 * @throws {Error} If URL is invalid, uses a blocked protocol, or targets
 *                 a blocked host (private IPs, cloud metadata endpoints).
 */
export function validateUrl(raw: string, options: ValidateUrlOptions = {}): string {
  const trimmed = raw.trim();

  // Must be a valid URL
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AgentEngineError('AGENT_VALIDATION_FAILED', `Invalid URL: "${trimmed}"`);
  }

  // Protocol must be HTTP or HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AgentEngineError(
      'AGENT_VALIDATION_FAILED',
      `Blocked protocol: "${parsed.protocol}". Only HTTP(S) is allowed.`
    );
  }

  // Block private/internal hosts (SSRF prevention)
  const hostname = parsed.hostname.toLowerCase();
  for (const blocked of BLOCKED_INTERNAL_DOMAINS) {
    if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
      throw new AgentEngineError(
        'AGENT_VALIDATION_FAILED',
        `Blocked host: "${hostname}". Internal/private addresses are not allowed.`
      );
    }
  }

  // Social media domains are blocked by default for generic Firecrawl scraping;
  // dedicated social/Apify tools own those sources, and live-view can opt in.
  if (!options.allowSocialMedia) {
    for (const blocked of BLOCKED_SOCIAL_MEDIA_DOMAINS) {
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
        throw new AgentEngineError(
          'AGENT_VALIDATION_FAILED',
          buildSocialMediaRoutingMessage(hostname, parsed.href)
        );
      }
    }
  }

  // Block private IP ranges (IPv4: 10.x, 172.16-31.x, 192.168.x; IPv6: link-local, unique-local)
  if (isPrivateIp(hostname)) {
    throw new AgentEngineError(
      'AGENT_VALIDATION_FAILED',
      `Blocked host: "${hostname}". Private IP addresses are not allowed.`
    );
  }

  return parsed.href;
}

function buildSocialMediaRoutingMessage(hostname: string, href: string): string {
  if (hostname === 'x.com' || hostname.endsWith('.x.com') || hostname === 'twitter.com') {
    const username = extractTwitterUsername(href);
    const example = username
      ? `scrape_twitter({ mode: "profile_tweets", usernames: ["${username}"], limit: 30 })`
      : 'scrape_twitter({ mode: "profile_tweets", usernames: ["<handle>"], limit: 30 })';
    return `Generic profile scraping cannot be used for "${hostname}". Use the dedicated X/Twitter route instead: ${example}.`;
  }

  return `Generic profile scraping cannot be used for "${hostname}". Use the dedicated social or Apify route for this platform instead of relying only on provided context.`;
}

function extractTwitterUsername(href: string): string | null {
  try {
    const parsed = new URL(href);
    const [firstPathSegment] = parsed.pathname.split('/').filter(Boolean);
    if (!firstPathSegment || firstPathSegment.toLowerCase() === 'i') return null;
    return firstPathSegment.replace(/^@/, '');
  } catch {
    return null;
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** Check if a hostname is a private/reserved IPv4 or IPv6 address. */
function isPrivateIp(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, '');

  if (clean === '::1' || clean === '0:0:0:0:0:0:0:1') return true;
  if (/^fe[89ab]/i.test(clean)) return true;
  if (/^f[cd]/i.test(clean)) return true;
  const v4Mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(clean);
  if (v4Mapped) return isPrivateIpv4(v4Mapped[1]);

  return isPrivateIpv4(clean);
}

/** Check if a dotted-decimal string is a private/reserved IPv4 address. */
function isPrivateIpv4(hostname: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!ipv4) return false;

  const [, a, b] = ipv4.map(Number);
  return (
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a === 127 || // loopback
    a === 0 // 0.0.0.0/8
  );
}
