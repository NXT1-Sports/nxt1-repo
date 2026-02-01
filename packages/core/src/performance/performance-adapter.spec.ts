/**
 * @fileoverview Performance Adapter Unit Tests
 * @module @nxt1/core/performance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMemoryPerformanceAdapter,
  createNoOpPerformanceAdapter,
  MemoryPerformanceAdapter,
  NoOpPerformanceAdapter,
  TRACE_NAMES,
  METRIC_NAMES,
  ATTRIBUTE_NAMES,
  DEFAULT_PERFORMANCE_CONFIG,
  type ActiveTrace as _ActiveTrace,
} from './index';

describe('Performance Adapter', () => {
  describe('MemoryPerformanceAdapter', () => {
    let adapter: MemoryPerformanceAdapter;

    beforeEach(() => {
      adapter = createMemoryPerformanceAdapter();
    });

    describe('initialization', () => {
      it('should initialize with default config', async () => {
        await adapter.initialize();
        expect(adapter.isEnabled()).toBe(true);
      });

      it('should initialize with custom config', async () => {
        await adapter.initialize({ enabled: false, debugLogging: true });
        expect(adapter.isEnabled()).toBe(false);
      });

      it('should allow enabling/disabling at runtime', async () => {
        await adapter.initialize();
        expect(adapter.isEnabled()).toBe(true);

        await adapter.setEnabled(false);
        expect(adapter.isEnabled()).toBe(false);

        await adapter.setEnabled(true);
        expect(adapter.isEnabled()).toBe(true);
      });
    });

    describe('custom traces', () => {
      it('should start and stop a trace', async () => {
        const trace = await adapter.startTrace('test_trace');

        expect(trace.name).toBe('test_trace');
        expect(trace.state).toBe('running');
        expect(trace.startTime).toBeGreaterThan(0);

        await trace.stop();

        expect(trace.state).toBe('stopped');
        expect(adapter.traces).toHaveLength(1);
        expect(adapter.traces[0].name).toBe('test_trace');
        expect(adapter.traces[0].duration).toBeGreaterThanOrEqual(0);
      });

      it('should support trace metrics', async () => {
        const trace = await adapter.startTrace('metric_test');

        await trace.putMetric('items_loaded', 10);
        await trace.putMetric('cache_hits', 5);
        await trace.incrementMetric('retry_count');
        await trace.incrementMetric('retry_count', 2);
        await trace.stop();

        expect(adapter.traces[0].metrics).toEqual({
          items_loaded: 10,
          cache_hits: 5,
          retry_count: 3,
        });
      });

      it('should support trace attributes', async () => {
        const trace = await adapter.startTrace('attr_test');

        await trace.putAttribute('user_role', 'athlete');
        await trace.putAttribute('cache_status', 'miss');

        expect(trace.getAttribute('user_role')).toBe('athlete');
        expect(trace.getAttributes()).toEqual({
          user_role: 'athlete',
          cache_status: 'miss',
        });

        await trace.removeAttribute('cache_status');
        expect(trace.getAttribute('cache_status')).toBeUndefined();

        await trace.stop();

        expect(adapter.traces[0].attributes.user_role).toBe('athlete');
      });

      it('should start trace with initial config', async () => {
        const trace = await adapter.startTraceWithConfig({
          name: 'configured_trace',
          metrics: { initial_count: 5 },
          attributes: { source: 'test' },
        });

        await trace.stop();

        expect(adapter.traces[0].metrics.initial_count).toBe(5);
        expect(adapter.traces[0].attributes.source).toBe('test');
      });

      it('should not record twice if stopped multiple times', async () => {
        const trace = await adapter.startTrace('double_stop');

        await trace.stop();
        await trace.stop();

        expect(adapter.traces).toHaveLength(1);
      });
    });

    describe('HTTP metrics', () => {
      it('should track HTTP metrics', async () => {
        const metric = await adapter.startHttpMetric('https://api.example.com/users', 'GET');

        expect(metric.url).toBe('https://api.example.com/users');
        expect(metric.method).toBe('GET');
        expect(metric.startTime).toBeGreaterThan(0);

        await metric.setHttpResponseCode(200);
        await metric.setRequestPayloadSize(0);
        await metric.setResponsePayloadSize(1024);
        await metric.setResponseContentType('application/json');
        await metric.putAttribute('cache_status', 'miss');
        await metric.stop();

        expect(adapter.httpMetrics).toHaveLength(1);
        expect(adapter.httpMetrics[0].httpResponseCode).toBe(200);
        expect(adapter.httpMetrics[0].responsePayloadSize).toBe(1024);
      });
    });

    describe('screen traces', () => {
      it('should track screen traces', async () => {
        const screenTrace = await adapter.startScreenTrace('HomeScreen');

        expect(screenTrace.screenName).toBe('HomeScreen');
        expect(screenTrace.startTime).toBeGreaterThan(0);

        await screenTrace.stop();

        expect(adapter.screenTraces).toHaveLength(1);
        expect(adapter.screenTraces[0].screenName).toBe('HomeScreen');
      });
    });

    describe('global attributes', () => {
      it('should manage global attributes', async () => {
        await adapter.setGlobalAttribute('app_version', '2.0.0');
        await adapter.setGlobalAttribute('platform', 'ios');

        expect(adapter.getGlobalAttributes()).toEqual({
          app_version: '2.0.0',
          platform: 'ios',
        });

        await adapter.removeGlobalAttribute('platform');

        expect(adapter.getGlobalAttributes()).toEqual({
          app_version: '2.0.0',
        });
      });

      it('should include global attributes in traces', async () => {
        await adapter.setGlobalAttribute('user_tier', 'premium');

        const trace = await adapter.startTrace('global_attr_test');
        await trace.putAttribute('local_attr', 'value');
        await trace.stop();

        expect(adapter.traces[0].attributes).toEqual({
          local_attr: 'value',
          user_tier: 'premium',
        });
      });
    });

    describe('trace helper', () => {
      it('should wrap async function with tracing', async () => {
        const result = await adapter.trace('wrapped_fn', async () => {
          return 'success';
        });

        expect(result).toBe('success');
        expect(adapter.traces).toHaveLength(1);
        expect(adapter.traces[0].name).toBe('wrapped_fn');
      });

      it('should call onSuccess callback', async () => {
        const onSuccess = vi.fn();

        await adapter.trace('success_callback', async () => 'result', { onSuccess });

        expect(onSuccess).toHaveBeenCalledWith('result', expect.any(Object));
      });

      it('should call onError callback and rethrow', async () => {
        const onError = vi.fn();
        const error = new Error('Test error');

        await expect(
          adapter.trace(
            'error_callback',
            async () => {
              throw error;
            },
            { onError }
          )
        ).rejects.toThrow('Test error');

        expect(onError).toHaveBeenCalledWith(error, expect.any(Object));
        expect(adapter.traces).toHaveLength(1); // Trace should still be recorded
      });

      it('should apply initial metrics and attributes', async () => {
        await adapter.trace('with_options', async () => 'done', {
          metrics: { count: 10 },
          attributes: { source: 'test' },
        });

        expect(adapter.traces[0].metrics.count).toBe(10);
        expect(adapter.traces[0].attributes.source).toBe('test');
      });
    });

    describe('clear', () => {
      it('should clear all recorded data', async () => {
        await adapter.startTrace('t1').then((t) => t.stop());
        await adapter.startHttpMetric('/api', 'GET').then((m) => m.stop());
        await adapter.startScreenTrace('Screen1').then((s) => s.stop());
        await adapter.setGlobalAttribute('key', 'value');

        adapter.clear();

        expect(adapter.traces).toHaveLength(0);
        expect(adapter.httpMetrics).toHaveLength(0);
        expect(adapter.screenTraces).toHaveLength(0);
        expect(adapter.getGlobalAttributes()).toEqual({});
      });
    });
  });

  describe('NoOpPerformanceAdapter', () => {
    let adapter: NoOpPerformanceAdapter;

    beforeEach(() => {
      adapter = createNoOpPerformanceAdapter() as NoOpPerformanceAdapter;
    });

    it('should initialize without error', async () => {
      await adapter.initialize();
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should return no-op trace', async () => {
      const trace = await adapter.startTrace('noop_trace');

      expect(trace.state).toBe('stopped');
      await trace.putMetric('test', 1);
      await trace.putAttribute('key', 'value');
      await trace.stop();
      // Should not throw
    });

    it('should execute traced function without overhead', async () => {
      const result = await adapter.trace('noop', async () => 42);
      expect(result).toBe(42);
    });

    it('should manage global attributes', async () => {
      await adapter.setGlobalAttribute('key', 'value');
      expect(adapter.getGlobalAttributes()).toEqual({ key: 'value' });
    });
  });

  describe('Constants', () => {
    it('should export TRACE_NAMES', () => {
      expect(TRACE_NAMES.AUTH_LOGIN).toBe('auth_login');
      expect(TRACE_NAMES.FEED_LOAD).toBe('feed_load');
      expect(TRACE_NAMES.PROFILE_LOAD).toBe('profile_load');
    });

    it('should export METRIC_NAMES', () => {
      expect(METRIC_NAMES.ITEMS_LOADED).toBe('items_loaded');
      expect(METRIC_NAMES.PAYLOAD_SIZE_BYTES).toBe('payload_size_bytes');
    });

    it('should export ATTRIBUTE_NAMES', () => {
      expect(ATTRIBUTE_NAMES.USER_ID).toBe('user_id');
      expect(ATTRIBUTE_NAMES.SCREEN_NAME).toBe('screen_name');
    });

    it('should export DEFAULT_PERFORMANCE_CONFIG', () => {
      expect(DEFAULT_PERFORMANCE_CONFIG.enabled).toBe(true);
      expect(DEFAULT_PERFORMANCE_CONFIG.screenTracesEnabled).toBe(true);
      expect(DEFAULT_PERFORMANCE_CONFIG.networkRequestsEnabled).toBe(true);
    });
  });
});
