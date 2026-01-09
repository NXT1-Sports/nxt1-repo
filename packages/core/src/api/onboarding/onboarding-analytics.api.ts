/**
 * Onboarding Analytics API - Pure TypeScript Functions
 *
 * ⭐ THIS FILE IS 100% PORTABLE TO MOBILE ⭐
 *
 * Contains pure functions for analytics event tracking.
 * These functions have NO framework dependencies and can be used in:
 * - Angular (Web)
 * - React Native (Mobile)
 * - Node.js (Server/Testing)
 * - Any JavaScript environment
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
 * │                   Analytics Adapter                        │
 * │    Platform-specific analytics implementation              │
 * └────────────────────────────────────────────────────────────┘
 *
 * @module @nxt1/core/api/onboarding
 * @version 2.0.0
 */

// ============================================
// ADAPTER INTERFACE
// ============================================

/**
 * Analytics adapter interface - implemented differently per platform
 *
 * @example Angular (Web)
 * ```typescript
 * const adapter: AnalyticsAdapter = {
 *   track: (event, payload) => eventTrackingService.track(event, payload, 'onboarding'),
 *   startOnboarding: (params) => eventTrackingService.startOnboarding(params),
 *   // ...
 * };
 * ```
 *
 * @example React Native (Mobile)
 * ```typescript
 * const adapter: AnalyticsAdapter = {
 *   track: (event, payload) => analytics().logEvent(event, payload),
 *   startOnboarding: (params) => analytics().logEvent('onboarding_started', params),
 *   // ...
 * };
 * ```
 */
export interface AnalyticsAdapter {
  /**
   * Track a generic event
   */
  track(event: string, payload: Record<string, unknown>): void;

  /**
   * Start onboarding tracking with real-time progress
   */
  startOnboarding(params: {
    userId: string;
    userEmail?: string;
    userType: string;
    totalSteps: number;
    firstStepId: string;
    teamCode?: string;
    referralSource?: string;
  }): void;

  /**
   * Track step viewed
   */
  trackStepViewed(params: {
    userId: string;
    step_id: string;
    step_name: string;
    step_number: number;
    total_steps: number;
    user_type: string;
  }): void;

  /**
   * Track step completed
   */
  trackStepCompleted(params: {
    userId: string;
    step_id: string;
    step_name: string;
    step_number: number;
    total_steps: number;
    user_type: string;
  }): void;

  /**
   * Track onboarding completed
   */
  trackOnboardingCompleted(params: {
    userId: string;
    user_type: string;
    steps_completed: number;
    steps_skipped: number;
    sport?: string;
    team_code?: string;
  }): void;

  /**
   * Set user properties
   */
  setUserProperties(props: Record<string, unknown>): void;

  /**
   * Track onboarding step (legacy method)
   */
  trackOnboardingStep?(action: 'viewed' | 'completed', payload: Record<string, unknown>): void;

  /**
   * Track onboarding complete (legacy method)
   */
  trackOnboardingComplete?(payload: Record<string, unknown>): void;
}

// ============================================
// TYPES
// ============================================

/** User type for onboarding */
export type OnboardingUserType =
  | 'athlete'
  | 'coach'
  | 'parent'
  | 'scout'
  | 'media'
  | 'service'
  | 'fan';

/** Strongly typed user_type for analytics */
export type AnalyticsUserType = 'athlete' | 'coach' | 'parent' | 'fan' | 'scout' | 'media' | string;

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

/** Onboarding analytics event types */
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
  user_type: AnalyticsUserType;
  time_on_step_ms?: number;
  [key: string]: string | number | undefined;
}

/** Completion tracking payload - fully typed */
export interface CompletionTrackingPayload {
  user_type: AnalyticsUserType;
  steps_completed: number;
  steps_skipped: number;
  sport?: string;
  team_code?: string;
  [key: string]: string | number | undefined;
}

/** Started tracking params */
export interface StartedTrackingParams {
  userId: string | undefined;
  userEmail?: string;
  userType: OnboardingUserType;
  totalSteps: number;
  firstStepId: string;
  teamCode?: string;
  referralSource?: string;
}

/** Step tracking params */
export interface StepTrackingParams {
  userId: string | undefined;
  userType: OnboardingUserType;
  stepId: OnboardingStepId;
  steps: OnboardingStep[];
  currentIndex: number;
  totalSteps: number;
}

/** Completion tracking params */
export interface CompletionTrackingParams {
  userId: string | undefined;
  userType: OnboardingUserType;
  totalSteps: number;
  sport?: string;
  teamCode?: string;
}

// ============================================
// PURE UTILITY FUNCTIONS
// ============================================

/**
 * Map OnboardingUserType to AnalyticsUserType
 * ⭐ PURE FUNCTION - No dependencies
 */
export function toAnalyticsUserType(userType: OnboardingUserType): AnalyticsUserType {
  const mapping: Record<OnboardingUserType, AnalyticsUserType> = {
    athlete: 'athlete',
    coach: 'coach',
    parent: 'parent',
    scout: 'scout',
    media: 'media',
    service: 'media', // Map service to media for analytics (closest match)
    fan: 'fan',
  };
  return mapping[userType] ?? userType;
}

/**
 * Build step tracking payload
 * ⭐ PURE FUNCTION - No dependencies
 */
export function buildStepPayload(params: StepTrackingParams): StepTrackingPayload {
  const analyticsUserType = toAnalyticsUserType(params.userType);
  const stepName = params.steps[params.currentIndex]?.title || params.stepId || 'Unknown';

  return {
    step_id: params.stepId || 'unknown',
    step_name: stepName,
    step_number: params.currentIndex + 1,
    total_steps: params.totalSteps,
    user_type: analyticsUserType,
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
    steps_completed: params.totalSteps,
    steps_skipped: 0,
    sport: params.sport,
    team_code: params.teamCode,
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
}): Record<string, unknown> {
  return {
    user_type: toAnalyticsUserType(params.userType),
    sport: params.sport,
    onboarding_completed: params.onboardingCompleted,
  };
}

// ============================================
// API FACTORY
// ============================================

/**
 * Create Onboarding Analytics API with injected analytics adapter
 * ⭐ Works on Web (Angular), Mobile (React Native), or any JS environment
 *
 * @example
 * ```typescript
 * const analyticsApi = createOnboardingAnalyticsApi(analyticsAdapter);
 *
 * // Track onboarding started
 * analyticsApi.trackStarted({
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

      if (params.userId) {
        // Start real-time progress tracking
        adapter.startOnboarding({
          userId: params.userId,
          userEmail: params.userEmail,
          userType: analyticsUserType,
          totalSteps: params.totalSteps,
          firstStepId: params.firstStepId,
          teamCode: params.teamCode,
          referralSource: params.referralSource,
        });
      } else {
        // Fallback to generic event if no userId
        adapter.track('onboarding_started', {
          user_type: analyticsUserType,
        });
      }
    },

    /**
     * Track role selected
     */
    trackRoleSelected(params: {
      userId: string | undefined;
      userType: OnboardingUserType;
      totalSteps: number;
    }): void {
      const analyticsUserType = toAnalyticsUserType(params.userType);
      const payload: StepTrackingPayload = {
        step_id: 'role-select',
        step_name: 'Role Selection',
        step_number: 0,
        total_steps: params.totalSteps,
        user_type: analyticsUserType,
      };

      if (params.userId) {
        adapter.trackStepCompleted({
          userId: params.userId,
          ...payload,
        });
      } else {
        adapter.track('onboarding_step_completed', payload);
      }
    },

    /**
     * Track step viewed
     */
    trackStepViewed(params: StepTrackingParams): void {
      const payload = buildStepPayload(params);

      if (params.userId) {
        adapter.trackStepViewed({
          userId: params.userId,
          ...payload,
        });
      } else if (adapter.trackOnboardingStep) {
        adapter.trackOnboardingStep('viewed', payload);
      } else {
        adapter.track('onboarding_step_viewed', payload);
      }
    },

    /**
     * Track step completed
     */
    trackStepCompleted(params: StepTrackingParams): void {
      const payload = buildStepPayload(params);

      if (params.userId) {
        adapter.trackStepCompleted({
          userId: params.userId,
          ...payload,
        });
      } else if (adapter.trackOnboardingStep) {
        adapter.trackOnboardingStep('completed', payload);
      } else {
        adapter.track('onboarding_step_completed', payload);
      }
    },

    /**
     * Track onboarding completed
     */
    trackCompleted(params: CompletionTrackingParams): void {
      const payload = buildCompletionPayload(params);

      if (params.userId) {
        adapter.trackOnboardingCompleted({
          userId: params.userId,
          ...payload,
        });
      } else if (adapter.trackOnboardingComplete) {
        adapter.trackOnboardingComplete(payload);
      } else {
        adapter.track('onboarding_completed', payload);
      }

      // Update user properties
      adapter.setUserProperties(
        buildUserProperties({
          userType: params.userType,
          sport: params.sport,
          onboardingCompleted: true,
        })
      );
    },

    /**
     * Track generic event
     */
    trackEvent(
      event: string,
      params: {
        userType: OnboardingUserType;
        stepId?: OnboardingStepId;
      }
    ): void {
      const analyticsUserType = toAnalyticsUserType(params.userType);

      adapter.track(event, {
        user_type: analyticsUserType,
        step_id: params.stepId,
      });
    },

    /**
     * Set user properties
     */
    setUserProperties(props: {
      userType: OnboardingUserType;
      sport?: string;
      onboardingCompleted?: boolean;
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
