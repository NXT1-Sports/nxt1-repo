/**
 * @fileoverview Core Web Vitals Tracking Service — 2026 A+ Performance
 * @module @nxt1/web/core/services
 *
 * Measures and reports real user metrics (RUM) using the `web-vitals` library.
 * Automatically tracks all Google Core Web Vitals after first render:
 *
 *   - LCP  (Largest Contentful Paint)  — loading
 *   - INP  (Interaction to Next Paint) — interactivity
 *   - CLS  (Cumulative Layout Shift)   — visual stability
 *   - FCP  (First Contentful Paint)    — perceived load speed
 *   - TTFB (Time to First Byte)        — server response time
 *
 * Metrics are forwarded through the web analytics relay as custom web_vital events
 * and logged via the NXT1 structured logger. This enables:
 *   1. Backend-owned event aggregation and Mongo rollups
 *   2. Alerting on regressions through the platform observability stack
 *   3. Correlation with deploy versions and feature flags
 *
 * SSR-safe: all browser API calls are guarded.
 *
 * @see https://web.dev/articles/vitals
 * @see https://github.com/GoogleChrome/web-vitals
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ILogger } from '@nxt1/core/logging';
import { NxtLoggingService } from '@nxt1/ui/services';
/** Threshold ratings aligned with Google's "good / needs-improvement / poor" bands. */
type VitalRating = 'good' | 'needs-improvement' | 'poor';

/** Shape emitted by web-vitals v4 callbacks */
interface MetricEntry {
  name: string;
  value: number;
  rating: VitalRating;
  delta: number;
  id: string;
  navigationType: string;
}

@Injectable({ providedIn: 'root' })
export class WebVitalsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger: ILogger = inject(NxtLoggingService).child('WebVitals');

  /** Guard: only run in the browser */
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  /**
   * Start collecting Core Web Vitals.
   *
   * Call once from AppComponent's `afterNextRender` (or `requestIdleCallback`).
   * Each metric fires at most once per page load.
   *
   * @example
   * ```typescript
   * afterNextRender(() => this.webVitals.initialize());
   * ```
   */
  initialize(): void {
    if (!this.isBrowser) return;

    // Dynamic import keeps web-vitals out of the initial bundle.
    // The library is tiny (~1.5 KB gzip) but we load it lazily anyway
    // to avoid any main-thread work before LCP.
    import('web-vitals')
      .then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
        const report = (metric: MetricEntry) => this.reportMetric(metric);

        onCLS(report);
        onINP(report);
        onLCP(report);
        onFCP(report);
        onTTFB(report);

        this.logger.debug('Core Web Vitals observers registered');
      })
      .catch((err: unknown) => {
        // Non-critical — never break the app for telemetry.
        this.logger.warn('Failed to load web-vitals', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  // ============================================
  // PRIVATE
  // ============================================

  /**
   * Forward a single metric through the backend analytics relay and structured logs.
   *
   * Firebase event name: `web_vital`
   * Custom dimensions:
   *   - metric_name  : CLS | INP | LCP | FCP | TTFB
   *   - metric_value : numeric value (ms or score)
   *   - metric_rating: good | needs-improvement | poor
   *   - metric_delta : change from last report
   *   - metric_id    : unique ID for deduplication
   *   - nav_type     : navigate | reload | back_forward | prerender
   */
  private reportMetric(metric: MetricEntry): void {
    const { name, value, rating, delta, id, navigationType } = metric;

    // Round to 3 decimal places for clean logging
    const rounded = Math.round(value * 1000) / 1000;

    // Structured log (shows in server logs via NxtLoggingService)
    this.logger.info(`[${name}] ${rounded} (${rating})`, {
      metric_name: name,
      metric_value: rounded,
      metric_rating: rating,
      metric_delta: Math.round(delta * 1000) / 1000,
      nav_type: navigationType,
    });
    // NOTE: web_vital events are NOT relayed to MongoDB — Firebase Performance
    // (providePerformance) captures all Core Web Vitals natively in the Firebase
    // Console. Storing them here would be a redundant duplicate.
  }
}
