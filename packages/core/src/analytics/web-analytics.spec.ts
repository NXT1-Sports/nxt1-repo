/**
 * @fileoverview Unit Tests for Web Analytics Adapter (gtag.js)
 * @module @nxt1/core/analytics
 *
 * Tests the web analytics adapter that wraps Google Analytics 4 gtag.js.
 * Uses mocked gtag function since we can't load actual GA in tests.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { createWebAnalyticsAdapter, NXT1_MEASUREMENT_ID } from './web-analytics';
import { APP_EVENTS } from './events';
import type { AnalyticsAdapter } from './analytics-adapter';

// Mock window.gtag
const mockGtag = vi.fn();

describe('Web Analytics Adapter', () => {
  let analytics: AnalyticsAdapter;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup global window with gtag mock and location
    (
      globalThis as unknown as {
        window: { gtag: Mock; dataLayer: unknown[]; location: { href: string } };
      }
    ).window = {
      gtag: mockGtag,
      dataLayer: [],
      location: { href: 'https://nxt1.com/test' },
    };
  });

  describe('createWebAnalyticsAdapter', () => {
    it('should create an adapter instance', () => {
      analytics = createWebAnalyticsAdapter();

      expect(analytics).toBeDefined();
      expect(typeof analytics.trackEvent).toBe('function');
      expect(typeof analytics.trackPageView).toBe('function');
    });

    it('should accept measurement ID in config', () => {
      analytics = createWebAnalyticsAdapter({
        measurementId: 'G-TEST123',
      });

      expect(analytics.isInitialized()).toBe(true);
    });

    it('should accept debug mode in config', () => {
      analytics = createWebAnalyticsAdapter({
        debug: true,
      });

      // Should not throw
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);
    });
  });

  describe('trackEvent', () => {
    beforeEach(() => {
      analytics = createWebAnalyticsAdapter();
    });

    it('should call gtag with event command', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      expect(mockGtag).toHaveBeenCalledWith('event', 'auth_signed_up', expect.any(Object));
    });

    it('should include event properties', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
        method: 'email',
        user_type: 'athlete',
      });

      expect(mockGtag).toHaveBeenCalledWith(
        'event',
        'auth_signed_up',
        expect.objectContaining({
          method: 'email',
          user_type: 'athlete',
        })
      );
    });

    it('should add timestamp to properties', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      const call = mockGtag.mock.calls[0];
      expect(call[2]).toHaveProperty('timestamp');
    });

    it('should add platform to properties', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      const call = mockGtag.mock.calls[0];
      expect(call[2]).toHaveProperty('platform', 'web');
    });

    it('should not call gtag when disabled', () => {
      analytics.setEnabled(false);
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      expect(mockGtag).not.toHaveBeenCalled();
    });
  });

  describe('trackPageView', () => {
    beforeEach(() => {
      analytics = createWebAnalyticsAdapter();
    });

    it('should call gtag with page_view event', () => {
      analytics.trackPageView('/profile/123', 'Profile Page');

      expect(mockGtag).toHaveBeenCalledWith(
        'event',
        'page_view',
        expect.objectContaining({
          page_path: '/profile/123',
          page_title: 'Profile Page',
        })
      );
    });

    it('should work without page title', () => {
      analytics.trackPageView('/home');

      expect(mockGtag).toHaveBeenCalledWith(
        'event',
        'page_view',
        expect.objectContaining({
          page_path: '/home',
        })
      );
    });
  });

  describe('setUserId', () => {
    beforeEach(() => {
      analytics = createWebAnalyticsAdapter({
        measurementId: 'G-TEST123',
      });
    });

    it('should set user ID', () => {
      analytics.setUserId('user-123');

      expect(analytics.getUserId()).toBe('user-123');
    });

    it('should call gtag config with user_id', () => {
      analytics.setUserId('user-123');

      expect(mockGtag).toHaveBeenCalledWith(
        'config',
        'G-TEST123',
        expect.objectContaining({
          user_id: 'user-123',
        })
      );
    });

    it('should clear user ID with null', () => {
      analytics.setUserId('user-123');
      analytics.setUserId(null);

      expect(analytics.getUserId()).toBeNull();
    });
  });

  describe('setUserProperties', () => {
    beforeEach(() => {
      analytics = createWebAnalyticsAdapter();
    });

    it('should call gtag set with user_properties', () => {
      analytics.setUserProperties({
        user_type: 'athlete',
        sport: 'basketball',
      });

      expect(mockGtag).toHaveBeenCalledWith(
        'set',
        'user_properties',
        expect.objectContaining({
          user_type: 'athlete',
          sport: 'basketball',
        })
      );
    });
  });

  describe('clearUser', () => {
    beforeEach(() => {
      analytics = createWebAnalyticsAdapter({
        measurementId: 'G-TEST123',
      });
    });

    it('should clear user ID', () => {
      analytics.setUserId('user-123');
      analytics.clearUser();

      expect(analytics.getUserId()).toBeNull();
    });

    it('should call gtag config with null user_id', () => {
      analytics.setUserId('user-123');
      vi.clearAllMocks();

      analytics.clearUser();

      expect(mockGtag).toHaveBeenCalledWith(
        'config',
        'G-TEST123',
        expect.objectContaining({
          user_id: null,
        })
      );
    });

    it('should clear user properties', () => {
      analytics.clearUser();

      expect(mockGtag).toHaveBeenCalledWith('set', 'user_properties', {});
    });
  });

  describe('isInitialized', () => {
    it('should return true when gtag is available', () => {
      analytics = createWebAnalyticsAdapter();
      expect(analytics.isInitialized()).toBe(true);
    });

    it('should return false when gtag is not available', () => {
      // Remove gtag from window
      (globalThis as unknown as { window: { gtag?: Mock } }).window = {};

      analytics = createWebAnalyticsAdapter();
      expect(analytics.isInitialized()).toBe(false);
    });
  });

  describe('setEnabled', () => {
    beforeEach(() => {
      analytics = createWebAnalyticsAdapter();
    });

    it('should enable tracking', () => {
      analytics.setEnabled(false);
      analytics.setEnabled(true);
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      expect(mockGtag).toHaveBeenCalled();
    });

    it('should disable tracking', () => {
      analytics.setEnabled(false);
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      expect(mockGtag).not.toHaveBeenCalled();
    });
  });

  describe('NXT1_MEASUREMENT_ID', () => {
    it('should be the correct GA4 measurement ID', () => {
      expect(NXT1_MEASUREMENT_ID).toBe('G-SNZ2T18P5G');
    });
  });

  describe('graceful degradation', () => {
    it('should not throw when gtag is undefined', () => {
      // Mock window without gtag but with location
      (globalThis as unknown as { window: { location: { href: string } } }).window = {
        location: { href: 'https://nxt1.com/test' },
      };
      analytics = createWebAnalyticsAdapter();

      // Should not throw
      expect(() => {
        analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);
        analytics.trackPageView('/home');
        analytics.setUserId('user-123');
        analytics.setUserProperties({ test: 'value' });
        analytics.clearUser();
      }).not.toThrow();
    });
  });
});
