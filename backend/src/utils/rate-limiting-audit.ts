/**
 * @fileoverview Rate Limiting Audit and Coverage Report
 * @module @nxt1/backend/audit/rate-limiting
 *
 * This file provides a comprehensive audit of rate limiting coverage
 * across all API endpoints in the NXT1 backend.
 */

import {
  RATE_LIMIT_CONFIGS,
  type RateLimitType,
} from '../middleware/rate-limit/rate-limit.config.js';

/**
 * Rate limit configurations with their thresholds
 */
const RATE_LIMIT_THRESHOLDS = {
  auth: {
    window: RATE_LIMIT_CONFIGS.auth.auditWindow,
    max: RATE_LIMIT_CONFIGS.auth.max,
    description: RATE_LIMIT_CONFIGS.auth.description,
  },
  billing: {
    window: RATE_LIMIT_CONFIGS.billing.auditWindow,
    max: RATE_LIMIT_CONFIGS.billing.max,
    description: RATE_LIMIT_CONFIGS.billing.description,
  },
  email: {
    window: RATE_LIMIT_CONFIGS.email.auditWindow,
    max: RATE_LIMIT_CONFIGS.email.max,
    description: RATE_LIMIT_CONFIGS.email.description,
  },
  upload: {
    window: RATE_LIMIT_CONFIGS.upload.auditWindow,
    max: RATE_LIMIT_CONFIGS.upload.max,
    description: RATE_LIMIT_CONFIGS.upload.description,
  },
  search: {
    window: RATE_LIMIT_CONFIGS.search.auditWindow,
    max: RATE_LIMIT_CONFIGS.search.max,
    description: RATE_LIMIT_CONFIGS.search.description,
  },
  api: {
    window: RATE_LIMIT_CONFIGS.api.auditWindow,
    max: RATE_LIMIT_CONFIGS.api.max,
    description: RATE_LIMIT_CONFIGS.api.description,
  },
  lenient: {
    window: RATE_LIMIT_CONFIGS.lenient.auditWindow,
    max: RATE_LIMIT_CONFIGS.lenient.max,
    description: RATE_LIMIT_CONFIGS.lenient.description,
  },
  ai: {
    window: RATE_LIMIT_CONFIGS.ai.auditWindow,
    max: RATE_LIMIT_CONFIGS.ai.max,
    description: RATE_LIMIT_CONFIGS.ai.description,
  },
  password: {
    window: RATE_LIMIT_CONFIGS.password.auditWindow,
    max: RATE_LIMIT_CONFIGS.password.max,
    description: RATE_LIMIT_CONFIGS.password.description,
  },
} as const;

/**
 * Complete route coverage mapping
 */
const ROUTE_COVERAGE = {
  // ============================================
  // PROTECTED ENDPOINTS
  // ============================================

  // Auth profile/session routes (Firebase handles actual authentication)
  auth: {
    rateLimitType: 'api' as RateLimitType,
    paths: ['/api/v1/auth', '/api/v1/staging/auth'],
    description: 'Profile management, onboarding, and session tracking',
  },

  // File uploads (upload limits)
  upload: {
    rateLimitType: 'upload' as RateLimitType,
    paths: ['/api/v1/upload', '/api/v1/staging/upload'],
    description: 'File uploads and video processing',
  },

  // Invite flows (unthrottled for QR/link onboarding)
  invite: {
    paths: ['/api/v1/invite', '/api/v1/staging/invite'],
    description: 'Invite links, QR onboarding, and invite tracking',
    protection: 'UNTHROTTLED',
  },

  // Search and discovery (moderate)
  search: {
    rateLimitType: 'search' as RateLimitType,
    paths: ['/api/v1/programs', '/api/v1/staging/programs'],
    description: 'Search queries and discovery endpoints',
  },

  // Billing operations (strict)
  billing: {
    rateLimitType: 'billing' as RateLimitType,
    paths: [
      '/api/v1/billing',
      '/api/v1/staging/billing',
      '/api/v1/webhook',
      '/api/v1/staging/webhook',
    ],
    description: 'Payment processing, billing webhooks, and cost reconciliation',
  },

  // Standard API endpoints
  standardApi: {
    rateLimitType: 'api' as RateLimitType,
    paths: [
      '/api/v1/activity',
      '/api/v1/staging/activity',
      '/api/v1/feed/posts',
      '/api/v1/staging/feed/posts',
      '/api/v1/analytics',
      '/api/v1/staging/analytics',
      '/api/v1/settings',
      '/api/v1/staging/settings',
      '/api/v1/help-center',
      '/api/v1/staging/help-center',
      '/api/v1/marketing',
      '/api/v1/staging/marketing',
      '/api/v1/profile',
      '/api/v1/staging/profile',
      '/api/v1/agent-x',
      '/api/v1/staging/agent-x',
      '/api/v1/messages',
      '/api/v1/staging/messages',
      '/api/v1/sentry-webhook',
      '/api/v1/staging/sentry-webhook',
      '/api/v1/usage',
      '/api/v1/staging/usage',
      '/api/v1/cloudflare-webhook',
      '/api/v1/staging/cloudflare-webhook',
      '/api/v1/firecrawl-monitor-webhook',
      '/api/v1/staging/firecrawl-monitor-webhook',
      '/api/v1/teams',
      '/api/v1/staging/teams',
      '/api/v1/engagement',
      '/api/v1/staging/engagement',
      '/api/v1/logs',
      '/api/v1/staging/logs',
      '/api/v1/debug/performance', // Debug endpoint
      '/api/v1/debug/rate-limits', // Debug endpoint
    ],
    description: 'Standard content and feature endpoints',
  },

  // Apple IAP verification needs more headroom after StoreKit completes charge.
  iap: {
    rateLimitType: 'lenient' as RateLimitType,
    paths: ['/api/v1/iap', '/api/v1/staging/iap'],
    description: 'Apple IAP verification and wallet credit confirmation',
  },

  // Nested Agent X endpoints with an additional per-user AI route limiter
  agentAi: {
    rateLimitType: 'ai' as RateLimitType,
    paths: [
      '/api/v1/agent-x/chat',
      '/api/v1/staging/agent-x/chat',
      '/api/v1/agent-x/enqueue',
      '/api/v1/staging/agent-x/enqueue',
      '/api/v1/agent-x/playbook/generate',
      '/api/v1/staging/agent-x/playbook/generate',
      '/api/v1/agent-x/briefing/generate',
      '/api/v1/staging/agent-x/briefing/generate',
    ],
    description: 'Agent X chat/enqueue/generation admission and stream attachment',
  },

  // SEO and public (lenient)
  seo: {
    rateLimitType: 'lenient' as RateLimitType,
    paths: ['/', '/sitemap.xml', '/robots.txt', '/feed.xml'],
    description: 'SEO crawlers and public content',
  },

  // ============================================
  // UNPROTECTED ENDPOINTS (Intentionally skipped)
  // ============================================

  healthChecks: {
    paths: ['/health', '/staging/health'],
    description: 'Health checks - automatically skipped by rate limiting middleware',
    protection: 'SKIPPED',
  },
} as const;

/**
 * Coverage statistics
 */
export function getCoverageStats() {
  const protected_endpoints = Object.values(ROUTE_COVERAGE)
    .filter((route) => 'rateLimitType' in route)
    .reduce((total, route) => total + route.paths.length, 0);

  const skipped_endpoints = Object.values(ROUTE_COVERAGE)
    .filter((route) => !('rateLimitType' in route))
    .reduce((total, route) => total + route.paths.length, 0);

  const total_endpoints = protected_endpoints + skipped_endpoints;

  return {
    protected_endpoints,
    skipped_endpoints,
    total_endpoints,
    coverage_percentage: Math.round((protected_endpoints / total_endpoints) * 100),
  };
}

/**
 * Generate rate limiting audit report
 */
export function generateAuditReport(): string {
  const stats = getCoverageStats();

  let report = '\n🛡️ RATE LIMITING COVERAGE AUDIT\n';
  report += '='.repeat(50) + '\n\n';

  // Summary
  report += `📊 SUMMARY:\n`;
  report += `   Protected Endpoints: ${stats.protected_endpoints}\n`;
  report += `   Skipped Endpoints: ${stats.skipped_endpoints}\n`;
  report += `   Total Coverage: ${stats.coverage_percentage}%\n\n`;

  // Rate limit types
  report += `⚙️ RATE LIMIT TYPES:\n`;
  Object.entries(RATE_LIMIT_THRESHOLDS).forEach(([type, config]) => {
    report += `   ${type.toUpperCase()}: ${config.max}/${config.window} - ${config.description}\n`;
  });
  report += '\n';

  // Protected routes by category
  report += `🔒 PROTECTED ROUTES:\n`;
  Object.entries(ROUTE_COVERAGE).forEach(([category, config]) => {
    if ('rateLimitType' in config) {
      const rateLimitType = config.rateLimitType;
      const threshold = RATE_LIMIT_THRESHOLDS[rateLimitType as keyof typeof RATE_LIMIT_THRESHOLDS];
      report += `   ${category.toUpperCase()} (${rateLimitType}): ${threshold.max}/${threshold.window}\n`;
      config.paths.forEach((path) => {
        report += `     - ${path}\n`;
      });
      report += '\n';
    }
  });

  // Unprotected routes
  report += `⚪ UNPROTECTED ROUTES:\n`;
  Object.entries(ROUTE_COVERAGE).forEach(([category, config]) => {
    if (!('rateLimitType' in config)) {
      report += `   ${category.toUpperCase()}: ${config.protection || 'NONE'}\n`;
      config.paths.forEach((path) => {
        report += `     - ${path}\n`;
      });
      report += '\n';
    }
  });

  return report;
}

/**
 * Validate that all endpoints are properly configured
 */
export function validateCoverage(): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for duplicate paths
  const allPaths = new Set<string>();
  Object.values(ROUTE_COVERAGE).forEach((config) => {
    config.paths.forEach((path) => {
      if (allPaths.has(path)) {
        issues.push(`Duplicate route: ${path}`);
      }
      allPaths.add(path);
    });
  });

  // Check for missing staging routes
  const productionRoutes = Array.from(allPaths).filter(
    (path) =>
      path.startsWith('/api/v1/') &&
      !path.includes('/staging/') &&
      !path.startsWith('/api/v1/debug/')
  );
  productionRoutes.forEach((prodPath) => {
    const stagingPath = prodPath.replace('/api/v1/', '/api/v1/staging/');
    if (!allPaths.has(stagingPath)) {
      issues.push(`Missing staging route for: ${prodPath} (expected: ${stagingPath})`);
    }
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}

// Export for use in tests or admin endpoints
export default {
  RATE_LIMIT_THRESHOLDS,
  ROUTE_COVERAGE,
  getCoverageStats,
  generateAuditReport,
  validateCoverage,
};
