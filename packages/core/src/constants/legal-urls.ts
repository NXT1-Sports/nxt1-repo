/**
 * @fileoverview Legal Document URLs
 * @module @nxt1/core/constants
 * @version 1.0.0
 *
 * Centralized URLs for legal documents hosted on Termly.
 * Used across web and mobile apps for Terms of Service and Privacy Policy links.
 *
 * ✏️ TO UPDATE: Replace UUIDs with new Termly document IDs when regenerating policies.
 */

/**
 * Legal document URLs (hosted on Termly)
 *
 * @see https://termly.io - Legal document management platform
 */
export const LEGAL_URLS = {
  /**
   * Terms of Service (Termly-hosted)
   * Last updated: March 18, 2026
   */
  TERMS:
    'https://app.termly.io/document/terms-of-use-for-saas/15feca2e-250a-4fea-bab4-f975aa666eca',

  /**
   * Privacy Policy (Termly-hosted)
   * Last updated: March 18, 2026
   */
  PRIVACY: 'https://app.termly.io/document/privacy-policy/e603559c-9483-42d0-ab85-58249660e18a',

  /**
   * Cookie Policy (Termly-hosted)
   * Add this when available
   */
  COOKIE_POLICY: '',
} as const;

/**
 * Type-safe access to legal URLs
 */
export type LegalUrlKey = keyof typeof LEGAL_URLS;
