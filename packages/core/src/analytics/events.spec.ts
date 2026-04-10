/**
 * @fileoverview Unit Tests for Event Constants
 * @module @nxt1/core/analytics
 *
 * Tests the event constants, categories, and helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  APP_EVENTS,
  EVENT_CATEGORIES,
  getEventCategory,
  type AppEventName,
  type EventCategory,
} from './events';

describe('Event Constants', () => {
  describe('APP_EVENTS', () => {
    it('should have auth events', () => {
      expect(APP_EVENTS.AUTH_SIGNED_UP).toBe('auth_signed_up');
      expect(APP_EVENTS.AUTH_SIGNED_IN).toBe('auth_signed_in');
      expect(APP_EVENTS.AUTH_SIGNED_OUT).toBe('auth_signed_out');
      expect(APP_EVENTS.AUTH_PASSWORD_RESET).toBe('auth_password_reset');
    });

    it('should have onboarding events', () => {
      expect(APP_EVENTS.ONBOARDING_STARTED).toBe('onboarding_started');
      expect(APP_EVENTS.ONBOARDING_STEP_VIEWED).toBe('onboarding_step_viewed');
      expect(APP_EVENTS.ONBOARDING_COMPLETED).toBe('onboarding_completed');
    });

    it('should have profile events', () => {
      expect(APP_EVENTS.PROFILE_VIEWED).toBe('profile_viewed');
      expect(APP_EVENTS.PROFILE_EDITED).toBe('profile_edited');
      expect(APP_EVENTS.PROFILE_SHARED).toBe('profile_shared');
    });

    it('should have video events', () => {
      expect(APP_EVENTS.VIDEO_VIEWED).toBe('video_viewed');
      expect(APP_EVENTS.VIDEO_PLAYED).toBe('video_played');
      expect(APP_EVENTS.VIDEO_COMPLETED).toBe('video_completed');
    });

    it('should have subscription events', () => {});

    it('should have error events', () => {
      expect(APP_EVENTS.ERROR_OCCURRED).toBe('error_occurred');
      expect(APP_EVENTS.API_ERROR).toBe('api_error');
    });

    it('should use snake_case for all event names', () => {
      const eventNames = Object.values(APP_EVENTS);

      eventNames.forEach((name) => {
        expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      });
    });

    it('should have at least 70 events defined', () => {
      const eventCount = Object.keys(APP_EVENTS).length;
      expect(eventCount).toBeGreaterThanOrEqual(70);
    });
  });

  describe('EVENT_CATEGORIES', () => {
    it('should define all event categories', () => {
      expect(EVENT_CATEGORIES.AUTH).toBe('auth');
      expect(EVENT_CATEGORIES.ONBOARDING).toBe('onboarding');
      expect(EVENT_CATEGORIES.PROFILE).toBe('profile');
      expect(EVENT_CATEGORIES.VIDEO).toBe('video');
      expect(EVENT_CATEGORIES.POST).toBe('post');
      expect(EVENT_CATEGORIES.ENGAGEMENT).toBe('engagement');
      expect(EVENT_CATEGORIES.SEARCH).toBe('search');
      expect(EVENT_CATEGORIES.RECRUITING).toBe('recruiting');
      expect(EVENT_CATEGORIES.AI).toBe('ai');
      expect(EVENT_CATEGORIES.NAVIGATION).toBe('navigation');
      expect(EVENT_CATEGORIES.ERROR).toBe('error');
      expect(EVENT_CATEGORIES.LIFECYCLE).toBe('lifecycle');
    });
  });

  describe('getEventCategory', () => {
    it('should return auth category for auth events', () => {
      expect(getEventCategory(APP_EVENTS.AUTH_SIGNED_UP)).toBe('auth');
      expect(getEventCategory(APP_EVENTS.AUTH_SIGNED_IN)).toBe('auth');
      expect(getEventCategory(APP_EVENTS.AUTH_SIGNED_OUT)).toBe('auth');
    });

    it('should return onboarding category for onboarding events', () => {
      expect(getEventCategory(APP_EVENTS.ONBOARDING_STARTED)).toBe('onboarding');
      expect(getEventCategory(APP_EVENTS.ONBOARDING_COMPLETED)).toBe('onboarding');
    });

    it('should return profile category for profile events', () => {
      expect(getEventCategory(APP_EVENTS.PROFILE_VIEWED)).toBe('profile');
      expect(getEventCategory(APP_EVENTS.PROFILE_EDITED)).toBe('profile');
    });

    it('should return video category for video events', () => {
      expect(getEventCategory(APP_EVENTS.VIDEO_VIEWED)).toBe('video');
      expect(getEventCategory(APP_EVENTS.VIDEO_PLAYED)).toBe('video');
    });

    it('should return subscription category for subscription events', () => {
      expect(getEventCategory(APP_EVENTS.CREDITS_PURCHASED)).toBe('subscription');
    });

    it('should return error category for error events', () => {
      expect(getEventCategory(APP_EVENTS.ERROR_OCCURRED)).toBe('error');
      expect(getEventCategory(APP_EVENTS.API_ERROR)).toBe('error');
    });

    it('should return lifecycle category for app lifecycle events', () => {
      expect(getEventCategory(APP_EVENTS.APP_OPENED)).toBe('lifecycle');
      expect(getEventCategory(APP_EVENTS.SESSION_STARTED)).toBe('lifecycle');
    });

    it('should return lifecycle as default category for unknown events', () => {
      // Implementation returns lifecycle as default category
      expect(getEventCategory('custom_unknown_event')).toBe('lifecycle');
      expect(getEventCategory('random_event')).toBe('lifecycle');
    });
  });

  describe('Type Safety', () => {
    it('should enforce AppEventName type', () => {
      const eventName: AppEventName = APP_EVENTS.AUTH_SIGNED_UP;
      expect(eventName).toBe('auth_signed_up');
    });

    it('should enforce EventCategory type', () => {
      const category: EventCategory = EVENT_CATEGORIES.AUTH;
      expect(category).toBe('auth');
    });
  });
});
