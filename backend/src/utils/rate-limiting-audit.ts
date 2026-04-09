/**
 * @fileoverview Rate Limiting Audit and Coverage Report
 * @module @nxt1/backend/audit/rate-limiting
 *
 * This file provides a comprehensive audit of rate limiting coverage
 * across all API endpoints in the NXT1 backend.
 */

import type { RateLimitType } from '../middleware/redis-rate-limit.middleware.js';

/**
 * Rate limit configurations with their thresholds
 */
export const RATE_LIMIT_THRESHOLDS = {
  auth: { window: '15min', max: 5, description: 'Authentication endpoints' },
  billing: { window: '5min', max: 10, description: 'Payment processing' },
  email: { window: '1hour', max: 3, description: 'Email sending' },
  upload: { window: '15min', max: 20, description: 'File/video uploads' },
  search: { window: '15min', max: 50, description: 'Search and discovery' },
  api: { window: '1min', max: 150, description: 'Standard API endpoints' },
  lenient: { window: '1min', max: 300, description: 'Less sensitive endpoints' },
} as const;

/**
 * Complete route coverage mapping
 */
export const ROUTE_COVERAGE = {
  // ============================================
  // PROTECTED ENDPOINTS
  // ============================================

  // Authentication (strictest)
  auth: {
    rateLimitType: 'auth' as RateLimitType,
    paths: ['/api/v1/auth', '/api/v1/staging/auth'],
    description: 'Login, registration, password reset',
  },

  // File uploads (upload limits)
  upload: {
    rateLimitType: 'upload' as RateLimitType,
    paths: ['/api/v1/upload', '/api/v1/staging/upload', '/api/v1/videos', '/api/v1/staging/videos'],
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
    paths: [
      '/api/v1/colleges',
      '/api/v1/staging/colleges',
      '/api/v1/athletes',
      '/api/v1/staging/athletes',
      '/api/v1/leaderboards',
      '/api/v1/staging/leaderboards',
    ],
    description: 'Search queries and discovery endpoints',
  },

  // Billing operations (strict)
  billing: {
    rateLimitType: 'billing' as RateLimitType,
    paths: ['/api/v1/billing', '/api/v1/staging/billing'],
    description: 'Payment processing and webhooks',
  },

  // Standard API endpoints
  standardApi: {
    rateLimitType: 'api' as RateLimitType,
    paths: [
      '/api/v1/feed',
      '/api/v1/staging/feed',
      '/api/v1/explore',
      '/api/v1/staging/explore',
      '/api/v1/activity',
      '/api/v1/staging/activity',
      '/api/v1/posts',
      '/api/v1/staging/posts',
      '/api/v1/scout-reports',
      '/api/v1/staging/scout-reports',
      '/api/v1/analytics',
      '/api/v1/staging/analytics',
      '/api/v1/news',
      '/api/v1/staging/news',
      '/api/v1/missions',
      '/api/v1/staging/missions',
      '/api/v1/settings',
      '/api/v1/staging/settings',
      '/api/v1/help-center',
      '/api/v1/staging/help-center',
      '/api/v1/profile',
      '/api/v1/staging/profile',
      '/api/v1/agent-x',
      '/api/v1/staging/agent-x',
      '/api/v1/users',
      '/api/v1/staging/users',
      '/api/v1/locations',
      '/api/v1/staging/locations',
      '/api/v1/teams',
      '/api/v1/staging/teams',
      '/api/v1/camps',
      '/api/v1/staging/camps',
      '/api/v1/events',
      '/api/v1/staging/events',
      '/api/v1/ssr',
      '/api/v1/staging/ssr',
      '/api/v1/debug/performance', // Debug endpoint
    ],
    description: 'Standard content and feature endpoints',
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
    (path) => path.startsWith('/api/v1/') && !path.includes('/staging/')
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
