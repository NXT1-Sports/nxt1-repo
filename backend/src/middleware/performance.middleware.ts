/**
 * @fileoverview Performance Monitoring Middleware
 * @module @nxt1/backend/middleware/performance
 *
 * Tracks request duration, response times, and custom metrics
 * Compatible with Firebase Performance Monitoring patterns
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

// Performance metrics storage (in-memory for now)
interface PerformanceMetric {
  traceName: string;
  duration: number;
  timestamp: Date;
  attributes: Record<string, string>;
  metrics: Record<string, number>;
  success: boolean;
  httpStatus?: number;
}

const metrics: PerformanceMetric[] = [];
const MAX_METRICS = 1000; // Keep last 1000 metrics

/**
 * Standard trace names for consistency
 */
export const BACKEND_TRACE_NAMES = {
  // Team endpoints
  TEAMS_GET_ALL: 'backend_teams_get_all',
  TEAMS_GET_BY_ID: 'backend_teams_get_by_id',
  TEAMS_GET_BY_CODE: 'backend_teams_get_by_code',
  TEAMS_GET_BY_UNICODE: 'backend_teams_get_by_unicode',
  TEAMS_GET_USER_TEAMS: 'backend_teams_get_user_teams',
  TEAMS_CREATE: 'backend_teams_create',
  TEAMS_UPDATE: 'backend_teams_update',
  TEAMS_DELETE: 'backend_teams_delete',
  TEAMS_JOIN: 'backend_teams_join',
  TEAMS_INVITE_MEMBER: 'backend_teams_invite_member',
  TEAMS_REMOVE_MEMBER: 'backend_teams_remove_member',
  TEAMS_UPDATE_ROLE: 'backend_teams_update_role',

  // Generic
  HTTP_REQUEST: 'backend_http_request',
} as const;

/**
 * Performance tracking middleware
 * Automatically tracks duration of all requests
 */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const traceName = getTraceNameFromRequest(req);

  // Store original end function
  const originalEnd = res.end;
  const originalJson = res.json;

  // Override res.end to capture completion time
  res.end = function (chunk?: any, encoding?: any, callback?: any): Response {
    const duration = Date.now() - startTime;

    // Record metric
    recordMetric({
      traceName,
      duration,
      timestamp: new Date(),
      attributes: {
        method: req.method,
        path: req.path,
        route: req.route?.path || 'unknown',
        cached: res.locals['cached'] ? 'true' : 'false',
      },
      metrics: {
        duration_ms: duration,
        status_code: res.statusCode,
      },
      success: res.statusCode < 400,
      httpStatus: res.statusCode,
    });

    // Log performance
    logger.info('[Performance]', {
      trace: traceName,
      duration: `${duration}ms`,
      status: res.statusCode,
      method: req.method,
      path: req.path,
      cached: res.locals['cached'] || false,
    });

    // Call original end
    return originalEnd.call(this, chunk, encoding, callback);
  };

  // Also track res.json calls
  res.json = function (body?: any): Response {
    return originalJson.call(this, body);
  };

  next();
}

/**
 * Get trace name based on request path and method
 */
function getTraceNameFromRequest(req: Request): string {
  const method = req.method.toLowerCase();
  const path = req.path.toLowerCase();

  // Teams endpoints
  if (path.startsWith('/api/v1/teams')) {
    if (path === '/api/v1/teams' || path === '/api/v1/teams/') {
      return method === 'get'
        ? BACKEND_TRACE_NAMES.TEAMS_GET_ALL
        : BACKEND_TRACE_NAMES.TEAMS_CREATE;
    }
    if (path === '/api/v1/teams/all') return BACKEND_TRACE_NAMES.TEAMS_GET_ALL;
    if (path.includes('/user/my-teams')) return BACKEND_TRACE_NAMES.TEAMS_GET_USER_TEAMS;
    if (path.match(/\/teams\/[^/]+\/join$/)) return BACKEND_TRACE_NAMES.TEAMS_JOIN;
    if (path.match(/\/teams\/[^/]+\/invite$/)) return BACKEND_TRACE_NAMES.TEAMS_INVITE_MEMBER;
    if (path.match(/\/teams\/code\//)) return BACKEND_TRACE_NAMES.TEAMS_GET_BY_CODE;
    if (path.match(/\/teams\/unicode\//)) return BACKEND_TRACE_NAMES.TEAMS_GET_BY_UNICODE;
    if (path.match(/\/teams\/[^/]+$/)) {
      if (method === 'get') return BACKEND_TRACE_NAMES.TEAMS_GET_BY_ID;
      if (method === 'patch') return BACKEND_TRACE_NAMES.TEAMS_UPDATE;
      if (method === 'delete') return BACKEND_TRACE_NAMES.TEAMS_DELETE;
    }
  }

  // Default to generic HTTP trace
  return `${BACKEND_TRACE_NAMES.HTTP_REQUEST}_${method}_${path.split('/').filter(Boolean).join('_')}`;
}

/**
 * Record performance metric
 */
function recordMetric(metric: PerformanceMetric): void {
  metrics.push(metric);

  // Keep only last MAX_METRICS
  if (metrics.length > MAX_METRICS) {
    metrics.splice(0, metrics.length - MAX_METRICS);
  }
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(): {
  totalRequests: number;
  averageDuration: number;
  successRate: number;
  byTrace: Record<
    string,
    {
      count: number;
      avgDuration: number;
      minDuration: number;
      maxDuration: number;
      p95Duration: number;
      successRate: number;
      cacheHitRate: number;
    }
  >;
} {
  if (metrics.length === 0) {
    return {
      totalRequests: 0,
      averageDuration: 0,
      successRate: 0,
      byTrace: {},
    };
  }

  // Group by trace name
  const byTrace: Record<string, PerformanceMetric[]> = {};
  metrics.forEach((metric) => {
    if (!byTrace[metric.traceName]) {
      byTrace[metric.traceName] = [];
    }
    byTrace[metric.traceName].push(metric);
  });

  // Calculate stats per trace
  const traceStats: Record<string, any> = {};
  Object.entries(byTrace).forEach(([traceName, traceMetrics]) => {
    const durations = traceMetrics.map((m) => m.duration).sort((a, b) => a - b);
    const successes = traceMetrics.filter((m) => m.success).length;
    const cacheHits = traceMetrics.filter((m) => m.attributes['cached'] === 'true').length;

    const p95Index = Math.floor(durations.length * 0.95);

    traceStats[traceName] = {
      count: traceMetrics.length,
      avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p95Duration: durations[p95Index] || durations[durations.length - 1],
      successRate: Math.round((successes / traceMetrics.length) * 100),
      cacheHitRate: Math.round((cacheHits / traceMetrics.length) * 100),
    };
  });

  // Overall stats
  const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
  const totalSuccess = metrics.filter((m) => m.success).length;

  return {
    totalRequests: metrics.length,
    averageDuration: Math.round(totalDuration / metrics.length),
    successRate: Math.round((totalSuccess / metrics.length) * 100),
    byTrace: traceStats,
  };
}

/**
 * Test performance monitoring (for debugging)
 * Call from route: GET /api/v1/performance/test
 */
export async function testPerformance(): Promise<{
  status: string;
  message: string;
  stats: ReturnType<typeof getPerformanceStats>;
  recentMetrics: PerformanceMetric[];
}> {
  const stats = getPerformanceStats();
  const recentMetrics = metrics.slice(-10); // Last 10 metrics

  logger.info('[Performance Test]', {
    totalRequests: stats.totalRequests,
    avgDuration: `${stats.averageDuration}ms`,
    successRate: `${stats.successRate}%`,
  });

  return {
    status: 'success',
    message: 'Performance monitoring is working',
    stats,
    recentMetrics: recentMetrics.map((m) => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    })) as any,
  };
}

/**
 * Clear performance metrics (for testing)
 */
export function clearPerformanceMetrics(): void {
  metrics.length = 0;
  logger.info('[Performance] Metrics cleared');
}
