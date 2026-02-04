/**
 * @fileoverview Browser Helper Functions
 * @module @nxt1/core/browser
 *
 * Pure utility functions for URL validation and link type detection.
 * Zero dependencies - pure TypeScript.
 */

import type { LinkType } from './browser.types';

// ============================================
// URL VALIDATION
// ============================================

/**
 * Check if a string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Ensure URL has a protocol
 * Adds https:// if missing
 */
export function ensureProtocol(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `https://${url}`;
}

/**
 * Sanitize URL for safe opening
 * - Trims whitespace
 * - Ensures protocol
 * - Validates format
 */
export function sanitizeUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  const withProtocol = ensureProtocol(trimmed);
  return isValidUrl(withProtocol) ? withProtocol : null;
}

// ============================================
// LINK TYPE DETECTION
// ============================================

/** Social media domain patterns */
const SOCIAL_DOMAINS = [
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'snapchat.com',
  'threads.net',
];

/** Video platform domain patterns */
const VIDEO_DOMAINS = ['youtube.com', 'youtu.be', 'vimeo.com', 'hudl.com', 'twitch.tv'];

/** News domain patterns */
const NEWS_DOMAINS = [
  'espn.com',
  'sports.yahoo.com',
  'bleacherreport.com',
  'si.com',
  'theathletic.com',
  'maxpreps.com',
  '247sports.com',
  'rivals.com',
  'on3.com',
];

/** App store domains */
const STORE_DOMAINS = ['apps.apple.com', 'itunes.apple.com', 'play.google.com'];

/** Payment processor domains */
const PAYMENT_DOMAINS = ['stripe.com', 'paypal.com', 'checkout.stripe.com'];

/**
 * Detect the type of link from URL
 * Used for analytics and customizing browser behavior
 */
export function detectLinkType(url: string): LinkType {
  if (!url) return 'external';

  try {
    const parsed = new URL(ensureProtocol(url));
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Check for .edu domains (college websites)
    if (hostname.endsWith('.edu')) {
      return 'college';
    }

    // Check for legal pages (privacy, terms)
    const path = parsed.pathname.toLowerCase();
    if (
      path.includes('privacy') ||
      path.includes('terms') ||
      path.includes('legal') ||
      path.includes('policy')
    ) {
      return 'legal';
    }

    // Check for support/help pages
    if (
      path.includes('help') ||
      path.includes('support') ||
      path.includes('faq') ||
      hostname.includes('support')
    ) {
      return 'support';
    }

    // Check known domains
    if (SOCIAL_DOMAINS.some((d) => hostname.includes(d))) {
      return 'social';
    }

    if (VIDEO_DOMAINS.some((d) => hostname.includes(d))) {
      return 'video';
    }

    if (NEWS_DOMAINS.some((d) => hostname.includes(d))) {
      return 'news';
    }

    if (STORE_DOMAINS.some((d) => hostname.includes(d))) {
      return 'store';
    }

    if (PAYMENT_DOMAINS.some((d) => hostname.includes(d))) {
      return 'payment';
    }

    return 'external';
  } catch {
    return 'external';
  }
}

/**
 * Extract domain from URL for display
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(ensureProtocol(url));
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Check if URL should open in external app instead of in-app browser
 * (App Store links, deep links, etc.)
 */
export function shouldOpenInExternalApp(url: string): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(ensureProtocol(url));
    const hostname = parsed.hostname.toLowerCase();

    // App store links should open in native store app
    if (STORE_DOMAINS.some((d) => hostname.includes(d))) {
      return true;
    }

    // Email/phone/sms links
    if (['mailto:', 'tel:', 'sms:'].some((p) => url.startsWith(p))) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if URL is an internal NXT1 link
 */
export function isInternalLink(url: string): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(ensureProtocol(url));
    const hostname = parsed.hostname.toLowerCase();

    return (
      hostname.includes('nxt1') ||
      hostname.includes('nxt1sports') ||
      hostname === 'localhost' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.')
    );
  } catch {
    return false;
  }
}
