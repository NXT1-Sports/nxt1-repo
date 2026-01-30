/**
 * @fileoverview Performance Monitoring Module Barrel Export
 * @module @nxt1/core/performance
 *
 * ⭐ THIS FILE IS 100% PORTABLE - NO PLATFORM DEPENDENCIES ⭐
 *
 * Enterprise-grade performance monitoring for NXT1 monorepo.
 * Uses Firebase Performance Monitoring on native platforms and web.
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    Your Application                             │
 * │  import { PerformanceAdapter, TRACE_NAMES } from '@nxt1/core/performance'
 * ├─────────────────────────────────────────────────────────────────┤
 * │                  PerformanceAdapter Interface                   │
 * │  startTrace() | startHttpMetric() | setGlobalAttribute() | ... │
 * ├───────────────┬─────────────────┬───────────────────────────────┤
 * │ Mobile (Native)│ Web (Firebase) │ SSR/Test (No-op/Memory)      │
 * │ @capacitor-    │ @angular/fire  │ In-memory or silent          │
 * │ firebase/      │ firebase/      │                              │
 * │ performance    │ performance    │                              │
 * └───────────────┴─────────────────┴───────────────────────────────┘
 * ```
 *
 * @example Mobile (Capacitor)
 * ```typescript
 * // apps/mobile/src/app/core/services/performance.service.ts
 * import { PerformanceAdapter, TRACE_NAMES } from '@nxt1/core/performance';
 * import { FirebasePerformance } from '@capacitor-firebase/performance';
 *
 * @Injectable({ providedIn: 'root' })
 * export class PerformanceService implements PerformanceAdapter {
 *   async startTrace(name: string) {
 *     await FirebasePerformance.startTrace({ traceName: name });
 *     // return ActiveTrace handle
 *   }
 * }
 * ```
 *
 * @example Web (@angular/fire)
 * ```typescript
 * // apps/web/src/app/core/services/performance.service.ts
 * import { PerformanceAdapter, TRACE_NAMES } from '@nxt1/core/performance';
 * import { trace } from '@angular/fire/performance';
 *
 * @Injectable({ providedIn: 'root' })
 * export class PerformanceService implements PerformanceAdapter {
 *   private perf = inject(Performance);
 *
 *   async startTrace(name: string) {
 *     const t = trace(this.perf, name);
 *     t.start();
 *     // return ActiveTrace handle
 *   }
 * }
 * ```
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

// ============================================
// TYPES
// ============================================
export type {
  TraceState,
  TraceMetrics,
  TraceAttributes,
  TraceConfig,
  ActiveTrace,
  HttpMethod,
  HttpMetricData,
  ActiveHttpMetric,
  ScreenTrace,
  PerformanceConfig,
  TraceName,
  MetricName,
  AttributeName,
} from './performance.types';

export {
  DEFAULT_PERFORMANCE_CONFIG,
  TRACE_NAMES,
  METRIC_NAMES,
  ATTRIBUTE_NAMES,
} from './performance.types';

// ============================================
// ADAPTER INTERFACE & IMPLEMENTATIONS
// ============================================
export type {
  PerformanceAdapter,
  RecordedTrace,
  RecordedHttpMetric,
  RecordedScreenTrace,
} from './performance-adapter';

export {
  MemoryPerformanceAdapter,
  NoOpPerformanceAdapter,
  createNoOpPerformanceAdapter,
  createMemoryPerformanceAdapter,
} from './performance-adapter';

// ============================================
// TRACE UTILITIES
// ============================================
export type { Timer, BatchTraceResult, TracedRetryConfig, AggregatedMetrics } from './trace-utils';

export {
  createTimer,
  TraceBuilder,
  traceBuilder,
  traceBatch,
  traceParallel,
  traceWithRetry,
  aggregateMetrics,
} from './trace-utils';
