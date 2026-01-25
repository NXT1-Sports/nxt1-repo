/**
 * @fileoverview Onboarding Analytics Service - Professional Funnel Tracking
 * @module @nxt1/mobile/features/auth
 *
 * ⭐ MIRRORS WEB IMPLEMENTATION 100% ⭐
 *
 * Enterprise-grade onboarding analytics with:
 * - Automatic step timing (time spent on each step)
 * - Funnel tracking (drop-off detection)
 * - Session-level metrics (total time, steps completed)
 * - Abandonment detection (app backgrounding)
 * - User segmentation (by role, sport, referral source)
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                  OnboardingPageComponent                    │
 * │               Inject OnboardingAnalyticsService             │
 * ├─────────────────────────────────────────────────────────────┤
 * │          ⭐ OnboardingAnalyticsService (THIS FILE) ⭐        │
 * │         Step timing, funnel tracking, abandonment           │
 * ├─────────────────────────────────────────────────────────────┤
 * │              createOnboardingAnalyticsApi()                 │
 * │               Pure functions from @nxt1/core                │
 * ├─────────────────────────────────────────────────────────────┤
 * │                    AnalyticsService                         │
 * │         Firebase Analytics (Capacitor adapter)              │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Firebase Analytics Events Tracked:
 * - onboarding_started: When user enters onboarding
 * - onboarding_role_selected: When user picks their role
 * - onboarding_step_viewed: Each step render (for funnel)
 * - onboarding_step_completed: Each step completion
 * - onboarding_completed: Successful completion
 * - onboarding_skipped: When user skips a step
 * - onboarding_abandoned: When user leaves mid-flow
 *
 * @author NXT1 Engineering
 * @version 1.0.0
 */

import { Injectable, inject } from '@angular/core';
import { App, type AppState } from '@capacitor/app';
import {
  createOnboardingAnalyticsApi,
  type OnboardingAnalyticsApi,
  type OnboardingUserType,
  type OnboardingStepId,
  type OnboardingStep,
} from '@nxt1/core/api';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AnalyticsService } from '../../../core/services/analytics.service';

/**
 * Step timing data for analytics
 */
interface StepTiming {
  stepId: OnboardingStepId;
  startTime: number;
  viewCount: number;
}

/**
 * Session-level analytics data
 */
interface SessionData {
  sessionId: string;
  startTime: number;
  userId?: string;
  userType?: OnboardingUserType;
  teamCode?: string;
  referralSource?: string;
  stepsViewed: Set<OnboardingStepId>;
  stepsCompleted: Set<OnboardingStepId>;
  stepsSkipped: Set<OnboardingStepId>;
}

/**
 * Onboarding Analytics Service for Mobile
 *
 * Provides comprehensive funnel analytics for the onboarding flow.
 * Automatically tracks step timing, completion rates, and abandonment.
 * Uses Capacitor App plugin for app state change detection.
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class OnboardingPage implements OnInit, OnDestroy {
 *   private readonly onboardingAnalytics = inject(OnboardingAnalyticsService);
 *
 *   ngOnInit() {
 *     this.onboardingAnalytics.startSession(userId);
 *   }
 *
 *   onStepChange(step: OnboardingStep) {
 *     this.onboardingAnalytics.trackStepViewed(step, steps, currentIndex);
 *   }
 *
 *   ngOnDestroy() {
 *     this.onboardingAnalytics.endSession();
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class OnboardingAnalyticsService {
  private readonly analytics = inject(AnalyticsService);

  /** Pure API from @nxt1/core */
  private readonly api: OnboardingAnalyticsApi;

  /** Current step timing */
  private currentStepTiming: StepTiming | null = null;

  /** Session-level data */
  private session: SessionData | null = null;

  /** App state listener handle for cleanup */
  private appStateListener: { remove: () => Promise<void> } | null = null;

  /** Track if abandonment listener is set up */
  private isListenerSetup = false;

  constructor() {
    // Create the onboarding analytics API with our analytics adapter
    this.api = createOnboardingAnalyticsApi(this.analytics);
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Start a new onboarding analytics session.
   * Call this when user enters the onboarding flow.
   *
   * @param userId - User's Firebase UID
   * @param options - Optional session data (team code, referral)
   */
  startSession(
    userId: string,
    options?: {
      teamCode?: string;
      referralSource?: string;
    }
  ): void {
    // Generate session ID for correlation
    const sessionId = this.generateSessionId();

    this.session = {
      sessionId,
      startTime: Date.now(),
      userId,
      teamCode: options?.teamCode,
      referralSource: options?.referralSource,
      stepsViewed: new Set(),
      stepsCompleted: new Set(),
      stepsSkipped: new Set(),
    };

    // Set user ID in analytics
    this.analytics.setUserId(userId);
  }

  /**
   * Track onboarding started event.
   * Call this when the onboarding wizard first renders.
   *
   * @param params - Starting parameters
   */
  trackStarted(params: {
    userId: string;
    userType?: OnboardingUserType;
    totalSteps: number;
    firstStepId: string;
    teamCode?: string;
    referralSource?: string;
  }): void {
    // Ensure session exists
    if (!this.session) {
      this.startSession(params.userId, {
        teamCode: params.teamCode,
        referralSource: params.referralSource,
      });
    }

    this.api.trackStarted({
      userId: params.userId,
      userType: params.userType || 'athlete',
      totalSteps: params.totalSteps,
      firstStepId: params.firstStepId,
      teamCode: params.teamCode,
      referralSource: params.referralSource,
    });
  }

  /**
   * Track role selection.
   * Call this when user selects their role (athlete, coach, etc.)
   *
   * @param userType - Selected role
   * @param totalSteps - Total steps after role selection
   */
  trackRoleSelected(userType: OnboardingUserType, totalSteps: number): void {
    // Update session
    if (this.session) {
      this.session.userType = userType;
    }

    this.api.trackRoleSelected({
      userId: this.session?.userId,
      userType,
      totalSteps,
    });

    // Set user property for segmentation
    this.analytics.setUserProperties({
      user_type: userType,
    });
  }

  /**
   * Track step viewed.
   * Call this when a step is rendered/visible to user.
   * Automatically handles step timing.
   *
   * @param step - Current step
   * @param steps - All steps in the flow
   * @param currentIndex - Current step index
   */
  trackStepViewed(step: OnboardingStep, steps: OnboardingStep[], currentIndex: number): void {
    // Start timing for new step
    this.currentStepTiming = {
      stepId: step.id,
      startTime: Date.now(),
      viewCount: 1,
    };

    // Track in session
    if (this.session) {
      this.session.stepsViewed.add(step.id);
    }

    // Track event
    this.api.trackStepViewed({
      userId: this.session?.userId,
      userType: this.session?.userType || 'athlete',
      stepId: step.id,
      steps,
      currentIndex,
      totalSteps: steps.length,
    });
  }

  /**
   * Track step completed.
   * Call this when user successfully completes a step and moves forward.
   * Includes time spent on the step.
   *
   * @param step - Completed step
   * @param steps - All steps
   * @param currentIndex - Step index
   */
  trackStepCompleted(step: OnboardingStep, steps: OnboardingStep[], currentIndex: number): void {
    // Calculate time on step
    const timeOnStepMs = this.getTimeOnCurrentStep();

    // Track in session
    if (this.session) {
      this.session.stepsCompleted.add(step.id);
    }

    // Track event with timing
    this.api.trackStepCompleted({
      userId: this.session?.userId,
      userType: this.session?.userType || 'athlete',
      stepId: step.id,
      steps,
      currentIndex,
      totalSteps: steps.length,
      timeOnStepMs,
    });

    // Reset timing
    this.currentStepTiming = null;
  }

  /**
   * Track step skipped.
   * Call this when user skips an optional step.
   *
   * @param step - Skipped step
   * @param steps - All steps
   * @param currentIndex - Step index
   */
  trackStepSkipped(step: OnboardingStep, steps: OnboardingStep[], currentIndex: number): void {
    // Track in session
    if (this.session) {
      this.session.stepsSkipped.add(step.id);
    }

    // Track as skipped
    this.api.trackSkipped({
      userId: this.session?.userId,
      userType: this.session?.userType || 'athlete',
      lastStepId: step.id,
      stepNumber: currentIndex,
      totalSteps: steps.length,
    });
  }

  /**
   * Track onboarding completed successfully.
   * Call this when user finishes all required steps.
   *
   * @param params - Completion parameters
   */
  trackCompleted(params: {
    userType: OnboardingUserType;
    totalSteps: number;
    sport?: string;
    teamCode?: string;
  }): void {
    // Calculate session metrics
    const totalTimeMs = this.session ? Date.now() - this.session.startTime : 0;
    const stepsSkipped = this.session?.stepsSkipped.size ?? 0;

    this.api.trackCompleted({
      userType: params.userType,
      totalSteps: params.totalSteps,
      stepsSkipped,
      sport: params.sport,
      teamCode: params.teamCode,
      totalTimeMs,
    });

    // Set user properties
    this.analytics.setUserProperties({
      user_type: params.userType,
      sport: params.sport,
      team_code: params.teamCode,
      onboarding_completed: 'true',
    });

    // Clear session - onboarding complete
    this.session = null;
    this.currentStepTiming = null;
  }

  /**
   * Track error during onboarding.
   *
   * @param errorMessage - Error message
   * @param stepId - Step where error occurred
   */
  trackError(errorMessage: string, stepId?: OnboardingStepId): void {
    this.analytics.trackEvent(APP_EVENTS.ERROR_OCCURRED, {
      error_type: 'onboarding_error',
      error_message: errorMessage,
      step_id: stepId,
      user_type: this.session?.userType,
      session_id: this.session?.sessionId,
    });
  }

  /**
   * Track referral source submission (GA4 analytics).
   * Call this when user submits how they heard about NXT1.
   *
   * @param params - Referral source parameters
   */
  trackReferralSourceSubmitted(params: {
    source: string;
    details?: string;
    clubName?: string;
    otherSpecify?: string;
  }): void {
    // Update session with referral source
    if (this.session) {
      this.session.referralSource = params.source;
    }

    // Track event to GA4
    this.analytics.trackEvent(APP_EVENTS.ONBOARDING_REFERRAL_SUBMITTED, {
      referral_source: params.source,
      referral_details: params.details,
      referral_club_name: params.clubName,
      referral_other: params.otherSpecify,
      user_type: this.session?.userType,
      session_id: this.session?.sessionId,
    });

    // Set user property for segmentation
    this.analytics.setUserProperties({
      acquisition_source: params.source,
    });
  }

  /**
   * End analytics session.
   * Call this in ngOnDestroy if onboarding wasn't completed.
   */
  endSession(): void {
    if (!this.session) return;

    this.trackAbandonmentIfNeeded();
    this.session = null;
    this.currentStepTiming = null;
  }

  /**
   * Initialize the analytics service.
   * Sets up app state listeners for abandonment tracking.
   * Call this in ngOnInit of the onboarding page.
   */
  initialize(): void {
    // Only set up listener once
    if (!this.isListenerSetup) {
      this.setupAbandonmentTracking();
      this.isListenerSetup = true;
    }
  }

  /**
   * Clean up analytics listeners.
   * Call this in ngOnDestroy of the onboarding page.
   */
  async cleanup(): Promise<void> {
    // Clean up app state listener
    if (this.appStateListener) {
      try {
        await this.appStateListener.remove();
      } catch {
        // Silently handle cleanup errors
      }
      this.appStateListener = null;
      this.isListenerSetup = false;
    }
    // Track abandonment if session is active
    this.trackAbandonmentIfNeeded();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /** Generate unique session ID */
  private generateSessionId(): string {
    return `ob_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /** Get time spent on current step in milliseconds */
  private getTimeOnCurrentStep(): number {
    if (!this.currentStepTiming) return 0;
    return Date.now() - this.currentStepTiming.startTime;
  }

  /**
   * Set up app state handler for abandonment tracking.
   * Uses Capacitor App plugin to detect when app goes to background.
   */
  private setupAbandonmentTracking(): void {
    App.addListener('appStateChange', (state: AppState) => {
      // When app goes to background during active session, track abandonment
      if (!state.isActive && this.session) {
        this.trackAbandonmentIfNeeded();
      }
    })
      .then((listener) => {
        this.appStateListener = listener;
      })
      .catch(() => {
        // Silently fail - analytics shouldn't break the app
      });
  }

  /**
   * Track abandonment if session is active and onboarding not complete.
   */
  private trackAbandonmentIfNeeded(): void {
    if (!this.session) return;

    const lastViewedStep = Array.from(this.session.stepsViewed).pop() || 'unknown';
    const totalTimeMs = Date.now() - this.session.startTime;

    // Only track if they got past first step
    if (this.session.stepsViewed.size <= 1) {
      return;
    }

    // Track abandonment event
    this.analytics.trackEvent(APP_EVENTS.ONBOARDING_ABANDONED, {
      user_type: this.session.userType,
      last_step_id: lastViewedStep,
      steps_viewed: this.session.stepsViewed.size,
      steps_completed: this.session.stepsCompleted.size,
      total_time_ms: totalTimeMs,
      session_id: this.session.sessionId,
    });

    // Clear session after tracking
    this.session = null;
  }
}
