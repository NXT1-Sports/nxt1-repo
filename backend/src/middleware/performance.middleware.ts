/**
 * @fileoverview Performance Monitoring Middleware
 * @module @nxt1/backend/middleware/performance
 *
 * Tracks request duration, response times, and custom metrics.
 * Uses a fixed-size circular buffer to prevent unbounded memory growth.
 * Metrics are ephemeral (lost on restart) — for persistent monitoring,
 * integrate with an APM service (e.g., OpenTelemetry, Datadog).
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

interface PerformanceMetric {
  traceName: string;
  duration: number;
  timestamp: Date;
  attributes: Record<string, string>;
  metrics: Record<string, number>;
  success: boolean;
  httpStatus?: number;
}

interface PerformanceTraceStats {
  count: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  successRate: number;
  cacheHitRate: number;
}

// ============================================
// CIRCULAR BUFFER — Fixed-size, zero-allocation after init
// ============================================

const BUFFER_SIZE = 1024; // power-of-2 for fast modulo
const buffer: (PerformanceMetric | null)[] = new Array(BUFFER_SIZE).fill(null);
let writeIndex = 0;
let totalRecorded = 0;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Record performance metric into the circular buffer.
 * O(1) time and memory — never allocates after init.
 */
function recordMetric(metric: PerformanceMetric): void {
  buffer[writeIndex] = metric;
  writeIndex = (writeIndex + 1) % BUFFER_SIZE;
  totalRecorded++;
}

/**
 * Get all recorded metrics (ordered oldest → newest).
 */
function getMetrics(): PerformanceMetric[] {
  const count = Math.min(totalRecorded, BUFFER_SIZE);
  const result: PerformanceMetric[] = [];

  // If buffer hasn't wrapped, read from 0..writeIndex
  // If wrapped, read from writeIndex..BUFFER_SIZE, then 0..writeIndex
  const start = totalRecorded >= BUFFER_SIZE ? writeIndex : 0;
  for (let i = 0; i < count; i++) {
    const idx = (start + i) % BUFFER_SIZE;
    const m = buffer[idx];
    if (m) result.push(m);
  }

  return result;
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(): {
  totalRequests: number;
  averageDuration: number;
  successRate: number;
  byTrace: Record<string, PerformanceTraceStats>;
} {
  const metrics = getMetrics();

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
  const traceStats: Record<string, PerformanceTraceStats> = {};
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
  totalEverRecorded: number;
  bufferSize: number;
  recentMetrics: Array<Omit<PerformanceMetric, 'timestamp'> & { timestamp: string }>;
}> {
  const stats = getPerformanceStats();
  const metrics = getMetrics();
  const recentMetrics = metrics.slice(-10);

  logger.info('[Performance Test]', {
    totalRequests: stats.totalRequests,
    avgDuration: `${stats.averageDuration}ms`,
    successRate: `${stats.successRate}%`,
  });

  return {
    status: 'success',
    message: 'Performance monitoring is working',
    stats,
    totalEverRecorded: totalRecorded,
    bufferSize: BUFFER_SIZE,
    recentMetrics: recentMetrics.map((m) => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    })),
  };
}

/**
 * Clear performance metrics (for testing)
 */
export function clearPerformanceMetrics(): void {
  buffer.fill(null);
  writeIndex = 0;
  totalRecorded = 0;
  logger.info('[Performance] Metrics cleared');
}
