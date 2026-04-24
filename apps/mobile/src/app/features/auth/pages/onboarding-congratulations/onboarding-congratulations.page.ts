/**
 * @fileoverview OnboardingCongratulationsPage - Mobile Page Wrapper
 * @module @nxt1/mobile/features/auth
 *
 * Thin wrapper page that uses the shared OnboardingWelcomeComponent from @nxt1/ui.
 * This page handles:
 * - Refreshing user profile data
 * - Navigation with NavController (native-feel transitions)
 * - Mobile-specific analytics
 * - Theme restoration after onboarding (clears temporary dark override)
 * - Saving agent goals during onboarding flow
 *
 * Route: /auth/onboarding/congratulations
 *
 * Architecture (2026 Best Practices):
 * ┌─────────────────────────────────────────────────────────────┐
 * │          OnboardingCongratulationsPage (this file)          │
 * │     THIN WRAPPER: Profile refresh, navigation, analytics    │
 * ├─────────────────────────────────────────────────────────────┤
 * │                OnboardingWelcomeComponent (@nxt1/ui)        │
 * │     SHARED UI: Slides, confetti, buttons, animations        │
 * ├─────────────────────────────────────────────────────────────┤
 * │              WelcomeSlidesConfig (@nxt1/core/api)           │
 * │     SHARED DATA: Role-specific messaging, CTA text          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Theme Flow:
 * 1. Onboarding page forces LIGHT theme (better for form readability)
 * 2. On completion, transitions to DARK theme (dramatic reveal)
 * 3. This page displays in DARK theme with confetti celebration
 * 4. On navigation to home, clears override → user's preference restored
 *
 * ⭐ FOLLOWS MONOREPO SHARED INFRASTRUCTURE PATTERNS ⭐
 * ⭐ IDENTICAL PATTERN TO WEB'S OnboardingCongratulationsComponent ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavController } from '@ionic/angular/standalone';

// Shared UI Components
import {
  AuthShellComponent,
  OnboardingWelcomeComponent,
  OnboardingButtonMobileComponent,
  NxtLoggingService,
  NxtThemeService,
  AgentXService,
  ANALYTICS_ADAPTER,
} from '@nxt1/ui';
import type { ILogger } from '@nxt1/core/logging';
import { APP_EVENTS } from '@nxt1/core/analytics';

// Core Constants
import { AUTH_REDIRECTS } from '@nxt1/core/constants';
import { getWelcomeSlidesForRole, type OnboardingUserType } from '@nxt1/core/api';
import type { AgentGoal, AgentDashboardGoal } from '@nxt1/core';

// App Services
import { AuthFlowService } from '../../../../core/services/auth';
import { FcmRegistrationService } from '../../../../core/services/native/fcm-registration.service';

@Component({
  selector: 'app-onboarding-congratulations',
  standalone: true,
  imports: [
    CommonModule,
    AuthShellComponent,
    OnboardingWelcomeComponent,
    OnboardingButtonMobileComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="card-glass"
      [showLogo]="true"
      [showBackButton]="false"
      [maxWidth]="'600px'"
      [mobileFooterPadding]="true"
    >
      <div authContent>
        <nxt1-onboarding-welcome
          #welcomeSlides
          [userRole]="userRole()"
          [firstName]="firstName()"
          [showNavigationButtons]="false"
          [showDotNavigation]="false"
          (complete)="onComplete()"
          (skip)="onSkip()"
          (slideViewed)="onSlideViewed($event)"
          (goalsChanged)="onGoalsChanged($event)"
        />
      </div>
    </nxt1-auth-shell>

    <nxt1-onboarding-button-mobile
      [totalSteps]="totalSlides()"
      [currentStepIndex]="currentSlideIndex()"
      [completedStepIndices]="completedSlideIndices()"
      [showSkip]="!isLastSlide()"
      [isLastStep]="isLastSlide()"
      [loading]="isSaving()"
      [disabled]="isGoalsSlide() && !hasSelectedGoals()"
      [showSignOut]="false"
      (skipClick)="onSkip()"
      (continueClick)="onFooterContinue()"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingCongratulationsPage implements OnInit {
  private readonly navController = inject(NavController);
  private readonly authFlow = inject(AuthFlowService);
  private readonly fcmRegistration = inject(FcmRegistrationService);
  private readonly themeService = inject(NxtThemeService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('CongratulationsPage');
  private readonly agentX = inject(AgentXService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  @ViewChild('welcomeSlides') welcomeSlidesRef?: OnboardingWelcomeComponent;

  /** Current slide index for sticky footer progress */
  readonly currentSlideIndex = signal(0);

  /** Selected goals from the goals slide */
  private readonly selectedGoals = signal<AgentGoal[]>([]);

  /** Whether goals are being saved */
  readonly isSaving = signal(false);

  /** Reused across final-slide prewarm and CTA completion to avoid duplicate work. */
  private initialPreparationPromise: Promise<void> | null = null;

  // ============================================
  // COMPUTED (from AuthFlowService)
  // ============================================

  /** User role from auth state */
  readonly userRole = computed<OnboardingUserType | null>(() => {
    const user = this.authFlow.user();
    return (user?.role as OnboardingUserType) || 'athlete';
  });

  /** User's first name */
  readonly firstName = computed(() => {
    const user = this.authFlow.user();
    return user?.displayName?.split(' ')[0] || null;
  });

  /** Total slides for current role */
  readonly totalSlides = computed(() => {
    const role = this.userRole() ?? 'athlete';
    return getWelcomeSlidesForRole(role).slides.length;
  });

  /** Last slide state for footer button label/behavior */
  readonly isLastSlide = computed(() => {
    return this.currentSlideIndex() >= this.totalSlides() - 1;
  });

  /** Completed indices for progress pills */
  readonly completedSlideIndices = computed(() => {
    const current = this.currentSlideIndex();
    return Array.from({ length: current }, (_, i) => i);
  });

  /** Check if current slide is a goals slide */
  readonly isGoalsSlide = computed(() => {
    const role = this.userRole() ?? 'athlete';
    const slides = getWelcomeSlidesForRole(role).slides;
    const currentSlide = slides[this.currentSlideIndex()];
    return currentSlide?.type === 'goals';
  });

  /** Whether user has selected at least one goal */
  readonly hasSelectedGoals = computed(() => this.selectedGoals().length > 0);

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    this.logger.info('Congratulations page loaded');

    // ⭐ THEME TRANSITION: Switch to dark theme for the celebratory reveal
    // This creates a dramatic, premium feel as user enters congratulations
    this.themeService.setTemporaryOverride('dark');
    this.logger.debug('Set dark theme for congratulations page');

    // Refresh user profile to get updated firstName/lastName from backend
    this.authFlow.refreshUserProfile().catch((err) => {
      this.logger.warn('Failed to refresh user profile', { error: err });
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Handle goals changed from welcome slides */
  onGoalsChanged(goals: AgentGoal[]): void {
    this.selectedGoals.set(goals);
    this.logger.debug('Goals updated', { count: goals.length });
  }

  /** Handle complete (CTA button click) */
  async onComplete(): Promise<void> {
    this.logger.info('User completed welcome slides');
    await this.saveGoalsAndNavigate();
  }

  /** Handle skip — advance to next slide, or finish if on last slide */
  async onSkip(): Promise<void> {
    if (this.isLastSlide()) {
      this.logger.info('User skipped last slide — completing');
      await this.saveGoalsAndNavigate();
    } else {
      this.logger.info('User skipped slide', { index: this.currentSlideIndex() });
      this.welcomeSlidesRef?.nextSlide();
    }
  }

  /** Handle slide viewed (for analytics) */
  onSlideViewed(event: { index: number; slideId: string }): void {
    this.logger.debug('Slide viewed', event);
    this.currentSlideIndex.set(event.index);
    this.analytics?.trackEvent(APP_EVENTS.ONBOARDING_STEP_VIEWED, {
      step: event.index,
      slideId: event.slideId,
    });

    if (event.index === this.totalSlides() - 1) {
      void this.prepareInitialAgentStateIfNeeded();
    }
  }

  /** Footer Continue/Complete action */
  async onFooterContinue(): Promise<void> {
    if (this.isLastSlide()) {
      await this.onComplete();
      return;
    }

    this.welcomeSlidesRef?.nextSlide();
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /**
   * Save goals to backend and navigate to Agent X.
   * Uses navigateRoot to replace the navigation stack (no back to onboarding).
   *
   * Also clears the temporary theme override, restoring user's saved preference.
   */
  private async saveGoalsAndNavigate(): Promise<void> {
    const goals = this.selectedGoals();

    this.isSaving.set(true);
    try {
      await this.prepareInitialAgentStateIfNeeded();
    } finally {
      this.isSaving.set(false);
    }

    this.logger.info('Navigating to Agent X', { target: AUTH_REDIRECTS.AGENT });

    // Track onboarding completion
    this.analytics?.trackEvent(APP_EVENTS.ONBOARDING_COMPLETED, {
      goalsCount: goals.length,
      role: this.userRole(),
    });

    // ⭐ THEME RESTORATION: Clear temporary override, restore user's preference
    // This ensures the app respects user's original theme choice going forward
    this.themeService.clearTemporaryOverride();
    this.logger.debug('Cleared temporary theme override, restored user preference');

    // ⭐ REQUEST PUSH NOTIFICATION PERMISSION: Triggered here at the natural
    // end of onboarding — the ideal moment (user has context, is engaged).
    // For returning users with permission already granted, requestPermissions()
    // returns 'granted' silently with no OS dialog shown.
    void this.fcmRegistration.registerToken();

    await this.navController.navigateRoot(AUTH_REDIRECTS.AGENT, {
      animated: true,
      animationDirection: 'forward',
    });
  }

  private prepareInitialAgentStateIfNeeded(): Promise<void> {
    if (this.initialPreparationPromise) {
      return this.initialPreparationPromise;
    }

    this.initialPreparationPromise = this.prepareInitialAgentState();
    return this.initialPreparationPromise;
  }

  private async prepareInitialAgentState(): Promise<void> {
    const goals = this.selectedGoals();

    if (goals.length > 0) {
      const dashboardGoals: AgentDashboardGoal[] = goals.map((g) => ({
        id: g.id,
        text: g.text,
        category: g.category ?? 'custom',
        createdAt: new Date().toISOString(),
      }));

      try {
        this.logger.info('Saving agent goals before Agent X handoff', { count: goals.length });
        const saved = await this.agentX.setGoals(dashboardGoals);

        if (saved) {
          this.logger.info('Goals saved, generating initial briefing');
          await this.agentX.generateBriefing(true);
          await this.agentX.loadDashboard();
        } else {
          this.logger.warn('Goals failed to save before initial briefing generation');
        }
      } catch (err) {
        this.logger.error('Error preparing Agent X state with goals', err);
      }

      return;
    }

    try {
      this.logger.info('No goals set — generating initial welcome briefing');
      await this.agentX.generateBriefing(false);
      await this.agentX.loadDashboard();
    } catch (err) {
      this.logger.error('Error preparing Agent X state without goals', err);
    }
  }
}
