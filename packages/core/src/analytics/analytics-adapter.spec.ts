/**
 * @fileoverview Unit Tests for Analytics Adapter Interface
 * @module @nxt1/core/analytics
 *
 * Tests the AnalyticsAdapter interface contract and default configuration.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ANALYTICS_CONFIG,
  isAnalyticsReady,
  type AnalyticsAdapter,
  type AnalyticsConfig,
} from './analytics-adapter';

describe('Analytics Adapter Interface', () => {
  describe('DEFAULT_ANALYTICS_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_ANALYTICS_CONFIG).toEqual({
        debug: false,
        enabled: true,
        platform: 'web',
      });
    });

    it('should have enabled true by default', () => {
      expect(DEFAULT_ANALYTICS_CONFIG.enabled).toBe(true);
    });

    it('should have debug false by default', () => {
      expect(DEFAULT_ANALYTICS_CONFIG.debug).toBe(false);
    });

    it('should have web as default platform', () => {
      expect(DEFAULT_ANALYTICS_CONFIG.platform).toBe('web');
    });
  });

  describe('isAnalyticsReady', () => {
    it('should return true for initialized adapter', () => {
      const mockAdapter: AnalyticsAdapter = {
        trackEvent: () => {},
        trackPageView: () => {},
        setUserId: () => {},
        setUserProperties: () => {},
        clearUser: () => {},
        isInitialized: () => true,
        getUserId: () => null,
        setEnabled: () => {},
        setDefaultEventParams: () => {},
      };

      expect(isAnalyticsReady(mockAdapter)).toBe(true);
    });

    it('should return false for uninitialized adapter', () => {
      const mockAdapter: AnalyticsAdapter = {
        trackEvent: () => {},
        trackPageView: () => {},
        setUserId: () => {},
        setUserProperties: () => {},
        clearUser: () => {},
        isInitialized: () => false,
        getUserId: () => null,
        setEnabled: () => {},
        setDefaultEventParams: () => {},
      };

      expect(isAnalyticsReady(mockAdapter)).toBe(false);
    });

    it('should return false for null adapter', () => {
      expect(isAnalyticsReady(null)).toBe(false);
    });

    it('should return false for undefined adapter', () => {
      expect(isAnalyticsReady(undefined)).toBe(false);
    });
  });

  describe('AnalyticsConfig type', () => {
    it('should accept partial configuration', () => {
      const config: AnalyticsConfig = {
        debug: true,
      };

      expect(config.debug).toBe(true);
      expect(config.enabled).toBeUndefined();
    });

    it('should accept full configuration', () => {
      const config: AnalyticsConfig = {
        enabled: true,
        debug: true,
        platform: 'ios',
        measurementId: 'G-TEST123',
        appVersion: '1.0.0',
        defaultParams: { app_name: 'NXT1' },
      };

      expect(config.enabled).toBe(true);
      expect(config.debug).toBe(true);
      expect(config.platform).toBe('ios');
      expect(config.measurementId).toBe('G-TEST123');
      expect(config.appVersion).toBe('1.0.0');
      expect(config.defaultParams).toEqual({ app_name: 'NXT1' });
    });
  });
});
