/**
 * Onboarding Analytics API - Pure TypeScript Functions
 *
 * ⭐ THIS FILE IS 100% PORTABLE TO MOBILE ⭐
 *
 * High-level onboarding analytics functions that use the platform-agnostic
 * AnalyticsAdapter from @nxt1/core/analytics.
 *
 * Architecture Position:
 * ┌────────────────────────────────────────────────────────────┐
 * │                   Components (UI Layer)                    │
 * │                  OnboardingWizardComponent                 │
 * ├────────────────────────────────────────────────────────────┤
 * │              OnboardingAnalyticsService (Domain)           │
 * │              Wraps this API with Angular DI                │
 * ├────────────────────────────────────────────────────────────┤
 * │              ⭐ Analytics API (THIS FILE) ⭐                │
 * │        Pure functions - 100% portable to mobile            │
 * ├────────────────────────────────────────────────────────────┤
 * │              AnalyticsAdapter (from analytics/)            │
 * │    Platform-specific: gtag.js (web), Firebase (mobile)    │
 * └────────────────────────────────────────────────────────────┘
 *
 * @module @nxt1/core/api/onboarding
 * @version 3.0.0
 */

import type { AnalyticsAdapter, UserProperties } from '../../analytics/analytics-adapter';
import { APP_EVENTS, type ViewerType } from '../../analytics/events';

// ============================================
// TYPES
// ============================================

/** User type for onboarding - maps to ViewerType */
export type OnboardingUserType =
  | 'athlete'
  | 'coach'
  | 'parent'
  | 'scout'
  | 'media'
  | 'service'
  | 'fan';

/** Step IDs */
export type OnboardingStepId =
  | 'role'
  | 'profile'
  | 'school'
  | 'organization'
  | 'sport'
  | 'positions'
  | 'contact'
  | 'social'
  | 'referral-source'
  | 'complete';

/** Step configuration */
export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  subtitle: string;
  required: boolean;
  order: number;
}

/** Onboarding analytics event types (for type checking) */
export type OnboardingAnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_role_selected'
  | 'onboarding_step_viewed'
  | 'onboarding_step_completed'
  | 'onboarding_completed';

/** Step tracking payload - fully typed */
export interface StepTrackingPayload {
  step_id: string;
  step_name: string;
  step_number: number;
  total_steps: number;
  user_type: string;
  time_on_step_ms?: number;
  [key: string]: unknown;
}

/** Completion tracking payload - fully typed */
export interface CompletionTrackingPayload {
  user_type: string;
  steps_completed: number;
  steps_skipped: number;
  sport?: string;
  team_code?: string;
  total_time_ms?: number;
  [key: string]: unknown;
}

/** Started tracking params */
export interface StartedTrackingParams {
  userId?: string;
  userEmail?: string;
  userType: OnboardingUserType;
  totalSteps: number;
  firstStepId: string;
  teamCode?: string;
  referralSource?: string;
}

/** Step tracking params */
export interface StepTrackingParams {
  userId?: string;
  userType: OnboardingUserType;
  stepId: OnboardingStepId;
  steps: OnboardingStep[];
  currentIndex: number;
  totalSteps: number;
  timeOnStepMs?: number;
}

/** Completion tracking params */
export interface CompletionTrackingParams {
  userId?: string;
  userType: OnboardingUserType;
  totalSteps: number;
  stepsSkipped?: number;
  sport?: string;
  teamCode?: string;
  totalTimeMs?: number;
}

// ============================================
// PURE UTILITY FUNCTIONS
// ============================================

/**
 * Map OnboardingUserType to ViewerType for analytics
 * ⭐ PURE FUNCTION - No dependencies
 */
export function toAnalyticsUserType(userType: OnboardingUserType): ViewerType {
  const mapping: Record<OnboardingUserType, ViewerType> = {
    athlete: 'athlete',
    coach: 'coach',
    parent: 'parent',
    scout: 'scout',
    media: 'media',
    service: 'media', // Map service to media (closest match)
    fan: 'fan',
  };
  return mapping[userType] ?? 'anonymous';
}

/**
 * Build step tracking payload
 * ⭐ PURE FUNCTION - No dependencies
 */
export function buildStepPayload(params: StepTrackingParams): StepTrackingPayload {
  const analyticsUserType = toAnalyticsUserType(params.userType);
  const step = params.steps[params.currentIndex];
  const stepName = step?.title || params.stepId || 'Unknown';

  return {
    step_id: params.stepId || 'unknown',
    step_name: stepName,
    step_number: params.currentIndex + 1,
    total_steps: params.totalSteps,
    user_type: analyticsUserType,
    time_on_step_ms: params.timeOnStepMs,
  };
}

/**
 * Build completion tracking payload
 * ⭐ PURE FUNCTION - No dependencies
 */
export function buildCompletionPayload(
  params: CompletionTrackingParams
): CompletionTrackingPayload {
  const analyticsUserType = toAnalyticsUserType(params.userType);

  return {
    user_type: analyticsUserType,
    steps_completed: params.totalSteps - (params.stepsSkipped ?? 0),
    steps_skipped: params.stepsSkipped ?? 0,
    sport: params.sport,
    team_code: params.teamCode,
    total_time_ms: params.totalTimeMs,
  };
}

/**
 * Build user properties for analytics
 * ⭐ PURE FUNCTION - No dependencies
 */
export function buildUserProperties(params: {
  userType: OnboardingUserType;
  sport?: string;
  onboardingCompleted?: boolean;
  teamCode?: string;
}): UserProperties {
  return {
    user_type: toAnalyticsUserType(params.userType),
    sport: params.sport,
    team_code: params.teamCode,
  };
}

// ============================================
// API FACTORY
// ============================================

/**
 * Create Onboarding Analytics API with injected analytics adapter
 *
 * Uses the standard AnalyticsAdapter from @nxt1/core/analytics,
 * which works with gtag.js (web), Firebase Analytics (mobile), or memory (SSR).
 *
 * @example
 * ```typescript
 * import { createOnboardingAnalyticsApi } from '@nxt1/core/api';
 * import { createWebAnalyticsAdapter } from '@nxt1/core/analytics';
 *
 * const adapter = createWebAnalyticsAdapter({ measurementId: 'G-XXX' });
 * const onboardingAnalytics = createOnboardingAnalyticsApi(adapter);
 *
 * onboardingAnalytics.trackStarted({
 *   userId: 'user123',
 *   userType: 'athlete',
 *   totalSteps: 5,
 *   firstStepId: 'profile',
 * });
 * ```
 */
export function createOnboardingAnalyticsApi(adapter: AnalyticsAdapter) {
  return {
    /**
     * Track onboarding started
     */
    trackStarted(params: StartedTrackingParams): void {
      const analyticsUserType = toAnalyticsUserType(params.userType);

      // Set user ID if available
      if (params.userId) {
        adapter.setUserId(params.userId);
      }

      // Track event
      adapter.trackEvent(APP_EVENTS.ONBOARDING_STARTED, {
        user_type: analyticsUserType,
        total_steps: params.totalSteps,
        first_step_id: params.firstStepId,
        team_code: params.teamCode,
        referral_source: params.referralSource,
      });
    },

    /**
     * Track role selected
     */
    trackRoleSelected(params: {
      userId?: string;
      userType: OnboardingUserType;
      totalSteps: number;
    }): void {
      const analyticsUserType = toAnalyticsUserType(params.userType);

      adapter.trackEvent(APP_EVENTS.ONBOARDING_ROLE_SELECTED, {
        step_id: 'role-select',
        step_name: 'Role Selection',
        step_number: 0,
        total_steps: params.totalSteps,
        user_type: analyticsUserType,
      });

      // Set user type property for segmentation
      adapter.setUserProperties({
        user_type: analyticsUserType,
      });
    },

    /**
     * Track step viewed
     */
    trackStepViewed(params: StepTrackingParams): void {
      const payload = buildStepPayload(params);

      adapter.trackEvent(APP_EVENTS.ONBOARDING_STEP_VIEWED, payload);
    },

    /**
     * Track step completed
     */
    trackStepCompleted(params: StepTrackingParams): void {
      const payload = buildStepPayload(params);

      adapter.trackEvent(APP_EVENTS.ONBOARDING_STEP_COMPLETED, payload);
    },

    /**
     * Track onboarding completed
     */
    trackCompleted(params: CompletionTrackingParams): void {
      const payload = buildCompletionPayload(params);

      adapter.trackEvent(APP_EVENTS.ONBOARDING_COMPLETED, payload);

      // Update user properties with final data
      adapter.setUserProperties(
        buildUserProperties({
          userType: params.userType,
          sport: params.sport,
          onboardingCompleted: true,
          teamCode: params.teamCode,
        })
      );
    },

    /**
     * Track onboarding skipped/abandoned
     */
    trackSkipped(params: {
      userId?: string;
      userType: OnboardingUserType;
      lastStepId: OnboardingStepId;
      stepNumber: number;
      totalSteps: number;
    }): void {
      const analyticsUserType = toAnalyticsUserType(params.userType);

      adapter.trackEvent(APP_EVENTS.ONBOARDING_SKIPPED, {
        user_type: analyticsUserType,
        last_step_id: params.lastStepId,
        step_number: params.stepNumber,
        total_steps: params.totalSteps,
      });
    },

    /**
     * Track generic onboarding event
     */
    trackEvent(
      event: OnboardingAnalyticsEvent,
      params: {
        userType: OnboardingUserType;
        stepId?: OnboardingStepId;
        [key: string]: unknown;
      }
    ): void {
      const { userType, stepId, ...rest } = params;
      const analyticsUserType = toAnalyticsUserType(userType);

      adapter.trackEvent(event, {
        user_type: analyticsUserType,
        step_id: stepId,
        ...rest,
      });
    },

    /**
     * Set user properties
     */
    setUserProperties(props: {
      userType: OnboardingUserType;
      sport?: string;
      onboardingCompleted?: boolean;
      teamCode?: string;
    }): void {
      adapter.setUserProperties(buildUserProperties(props));
    },

    // ============================================
    // UTILITY EXPORTS
    // ============================================

    /** Convert user type */
    toAnalyticsUserType,

    /** Build step payload */
    buildStepPayload,

    /** Build completion payload */
    buildCompletionPayload,

    /** Build user properties */
    buildUserProperties,
  };
}

// Type export for the API
export type OnboardingAnalyticsApi = ReturnType<typeof createOnboardingAnalyticsApi>;

// Re-export types from analytics for convenience
export type { AnalyticsAdapter, UserProperties } from '../../analytics/analytics-adapter';
