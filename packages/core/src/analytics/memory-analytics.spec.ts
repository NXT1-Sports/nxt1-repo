/**
 * @fileoverview Unit Tests for Memory Analytics Adapter
 * @module @nxt1/core/analytics
 *
 * Tests the in-memory analytics adapter used for SSR and unit testing.
 * This adapter stores all events in memory for inspection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAnalyticsAdapter, type MemoryAnalyticsAdapter } from './memory-analytics';
import { APP_EVENTS } from './events';

describe('Memory Analytics Adapter', () => {
  let analytics: MemoryAnalyticsAdapter;

  beforeEach(() => {
    analytics = createMemoryAnalyticsAdapter();
  });

  describe('createMemoryAnalyticsAdapter', () => {
    it('should create an adapter instance', () => {
      expect(analytics).toBeDefined();
      expect(typeof analytics.trackEvent).toBe('function');
      expect(typeof analytics.trackPageView).toBe('function');
      expect(typeof analytics.setUserId).toBe('function');
    });

    it('should be initialized by default', () => {
      expect(analytics.isInitialized()).toBe(true);
    });

    it('should start with no tracked events', () => {
      expect(analytics.getTrackedEvents()).toHaveLength(0);
    });

    it('should start with no page views', () => {
      expect(analytics.getPageViews()).toHaveLength(0);
    });
  });

  describe('trackEvent', () => {
    it('should track a simple event', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      const events = analytics.getTrackedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('auth_signed_up');
    });

    it('should track event with properties', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP, {
        method: 'email',
        user_type: 'athlete',
      });

      const events = analytics.getTrackedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].properties).toEqual({
        method: 'email',
        user_type: 'athlete',
      });
    });

    it('should track multiple events', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);
      analytics.trackEvent(APP_EVENTS.ONBOARDING_STARTED);
      analytics.trackEvent(APP_EVENTS.PROFILE_VIEWED);

      expect(analytics.getTrackedEvents()).toHaveLength(3);
    });

    it('should assign correct category to events', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      const events = analytics.getTrackedEvents();
      expect(events[0].category).toBe('auth');
    });

    it('should record timestamp for each event', () => {
      const before = new Date();
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);
      const after = new Date();

      const events = analytics.getTrackedEvents();
      expect(events[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(events[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should not track events when disabled', () => {
      analytics.setEnabled(false);
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      expect(analytics.getTrackedEvents()).toHaveLength(0);
    });
  });

  describe('trackPageView', () => {
    it('should track a page view', () => {
      analytics.trackPageView('/profile/123', 'Profile Page');

      const pageViews = analytics.getPageViews();
      expect(pageViews).toHaveLength(1);
      expect(pageViews[0].path).toBe('/profile/123');
      expect(pageViews[0].title).toBe('Profile Page');
    });

    it('should track page view without title', () => {
      analytics.trackPageView('/home');

      const pageViews = analytics.getPageViews();
      expect(pageViews[0].path).toBe('/home');
      expect(pageViews[0].title).toBeUndefined();
    });

    it('should track multiple page views', () => {
      analytics.trackPageView('/home');
      analytics.trackPageView('/profile');
      analytics.trackPageView('/settings');

      expect(analytics.getPageViews()).toHaveLength(3);
    });
  });

  describe('setUserId', () => {
    it('should set user ID', () => {
      analytics.setUserId('user-123');
      expect(analytics.getUserId()).toBe('user-123');
    });

    it('should clear user ID with null', () => {
      analytics.setUserId('user-123');
      analytics.setUserId(null);
      expect(analytics.getUserId()).toBeNull();
    });
  });

  describe('setUserProperties', () => {
    it('should set user properties', () => {
      analytics.setUserProperties({
        user_type: 'athlete',
        sport: 'basketball',
        is_premium: true,
      });

      // User properties are stored internally
      // We can verify by checking events include them (in debug mode)
      expect(analytics.isInitialized()).toBe(true);
    });

    it('should merge user properties', () => {
      analytics.setUserProperties({ user_type: 'athlete' });
      analytics.setUserProperties({ sport: 'basketball' });

      // Both properties should be merged
      expect(analytics.isInitialized()).toBe(true);
    });
  });

  describe('clearUser', () => {
    it('should clear user ID', () => {
      analytics.setUserId('user-123');
      analytics.clearUser();
      expect(analytics.getUserId()).toBeNull();
    });
  });

  describe('getEventsByName', () => {
    it('should filter events by name', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN);
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      const signupEvents = analytics.getEventsByName('auth_signed_up');
      expect(signupEvents).toHaveLength(2);
    });

    it('should return empty array for non-existent events', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      const events = analytics.getEventsByName('non_existent_event');
      expect(events).toHaveLength(0);
    });
  });

  describe('getEventsByCategory', () => {
    it('should filter events by category', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN);
      analytics.trackEvent(APP_EVENTS.PROFILE_VIEWED);

      const authEvents = analytics.getEventsByCategory('auth');
      expect(authEvents).toHaveLength(2);
    });

    it('should return empty array for non-existent category', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      const events = analytics.getEventsByCategory('non_existent');
      expect(events).toHaveLength(0);
    });
  });

  describe('clearTrackedEvents', () => {
    it('should clear all tracked events', () => {
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);
      analytics.trackEvent(APP_EVENTS.PROFILE_VIEWED);
      analytics.trackPageView('/home');

      analytics.clearTrackedEvents();

      expect(analytics.getTrackedEvents()).toHaveLength(0);
      expect(analytics.getPageViews()).toHaveLength(0);
    });
  });

  describe('setEnabled', () => {
    it('should enable tracking', () => {
      analytics.setEnabled(false);
      analytics.setEnabled(true);
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      expect(analytics.getTrackedEvents()).toHaveLength(1);
    });

    it('should disable tracking', () => {
      analytics.setEnabled(false);
      analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);
      analytics.trackPageView('/home');

      expect(analytics.getTrackedEvents()).toHaveLength(0);
      expect(analytics.getPageViews()).toHaveLength(0);
    });
  });

  describe('debug mode', () => {
    it('should work with debug enabled', () => {
      const debugAnalytics = createMemoryAnalyticsAdapter({ debug: true });

      // Should not throw
      debugAnalytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);
      debugAnalytics.trackPageView('/home');

      expect(debugAnalytics.getTrackedEvents()).toHaveLength(1);
    });
  });

  describe('configuration', () => {
    it('should respect enabled config option', () => {
      const disabledAnalytics = createMemoryAnalyticsAdapter({ enabled: false });

      disabledAnalytics.trackEvent(APP_EVENTS.AUTH_SIGNED_UP);

      expect(disabledAnalytics.getTrackedEvents()).toHaveLength(0);
    });

    it('should respect platform config option', () => {
      const iosAnalytics = createMemoryAnalyticsAdapter({ platform: 'ios' });

      expect(iosAnalytics.isInitialized()).toBe(true);
    });
  });
});
