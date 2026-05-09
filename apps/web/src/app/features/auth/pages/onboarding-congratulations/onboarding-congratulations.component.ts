/**
 * @fileoverview OnboardingCongratulationsComponent - Web Page Wrapper
 * @module @nxt1/web/features/auth
 *
 * Thin wrapper page that uses the shared OnboardingWelcomeComponent from @nxt1/ui.
 * This page handles:
 * - Refreshing user profile data
 * - SEO meta tags
 * - Navigation with Angular Router
 * - Theme restoration after onboarding (clears temporary dark override)
 * - Saving agent goals during onboarding flow
 *
 * Route: /auth/onboarding/congratulations
 *
 * Architecture (2026 Best Practices):
 * ┌─────────────────────────────────────────────────────────────┐
 * │          OnboardingCongratulationsComponent (this file)     │
 * │     THIN WRAPPER: SEO, profile refresh, navigation          │
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
import { Router } from '@angular/router';

// Shared UI Components
import { AuthShellComponent } from '@nxt1/ui/auth/auth-shell';
import { OnboardingWelcomeComponent } from '@nxt1/ui/onboarding/onboarding-welcome';
import { AgentOnboardingLoadingComponent } from '@nxt1/ui/agent-x/onboarding';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtThemeService } from '@nxt1/ui/services/theme';
import { AgentXService } from '@nxt1/ui/agent-x';

// Core Constants
import { AUTH_REDIRECTS } from '@nxt1/core/constants';
import { getWelcomeSlidesForRole, type OnboardingUserType } from '@nxt1/core/api';
import type { AgentGoal, AgentDashboardGoal } from '@nxt1/core';

// App Services
import { AuthFlowService } from '../../../../core/services/auth';
import { SeoService } from '../../../../core/services';

@Component({
  selector: 'app-onboarding-congratulations',
  standalone: true,
  imports: [
    CommonModule,
    AuthShellComponent,
    OnboardingWelcomeComponent,
    AgentOnboardingLoadingComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="card-glass"
      [showLogo]="true"
      [showBackButton]="false"
      [maxWidth]="'760px'"
    >
      <div authContent class="onboarding-welcome-container">
        @if (isTransitioningToAgent()) {
          <nxt1-agent-onboarding-loading
            [readyToComplete]="initialGenerationReady()"
            (loadingComplete)="onLoadingComplete()"
          />
        } @else {
          <nxt1-onboarding-welcome
            #welcomeSlides
            [userRole]="userRole()"
            [firstName]="firstName()"
            [showDotNavigation]="false"
            (complete)="onComplete()"
            (skip)="onSkip()"
            (slideViewed)="onSlideViewed($event)"
            (goalsChanged)="onGoalsChanged($event)"
          />
        }
      </div>
    </nxt1-auth-shell>
  `,
  styles: [
    `
      .onboarding-welcome-container {
        min-height: 640px; /* Fixed height to prevent container resizing across steps */
        width: 100%;
        display: flex;
        flex-direction: column;
      }

      .onboarding-welcome-container nxt1-onboarding-welcome {
        flex: 1;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
      }

      @media (min-width: 768px) {
        .onboarding-welcome-container {
          height: 640px;
          min-width: 710px; /* Force width so the card doesn't shrink-wrap to the 400px column */
        }
      }

      @media (max-width: 768px) {
        .onboarding-welcome-container {
          min-height: auto; /* Let mobile shrink-wrap or use safe areas */
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingCongratulationsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authFlow = inject(AuthFlowService);
  private readonly seo = inject(SeoService);
  private readonly themeService = inject(NxtThemeService);
  private readonly logger = inject(NxtLoggingService).child('OnboardingCongratulations');
  private readonly agentX = inject(AgentXService);

  @ViewChild('welcomeSlides') welcomeSlidesRef?: OnboardingWelcomeComponent;

  /** Current slide index for tracking */
  readonly currentSlideIndex = signal(0);

  /** True while the handoff animation runs before navigating to Agent X */
  readonly isTransitioningToAgent = signal(false);

  /** Set once the initial briefing work has actually finished. */
  readonly initialGenerationReady = signal(false);

  /** Selected goals from the goals slide */
  private readonly selectedGoals = signal<AgentGoal[]>([]);

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

  /** Whether current slide is the last */
  readonly isLastSlide = computed(() => {
    return this.currentSlideIndex() >= this.totalSlides() - 1;
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // ⭐ THEME TRANSITION: Switch to dark theme for the celebratory reveal
    // This creates a dramatic, premium feel as user enters congratulations
    this.themeService.setTemporaryOverride('dark');
    this.logger.debug('Set dark theme for congratulations page');

    // NOTE: Profile was already refreshed (awaited) in onboarding.component.ts
    // before navigating here. A fire-and-forget call here would invalidate the
    // in-memory cache mid-transition and cause the shell to render with
    // role: 'athlete' while the concurrent fetch is still in-flight.
    // The awaited refresh is instead deferred to onLoadingComplete() just before
    // navigating to /agent so the signal is guaranteed to be fresh.

    // Set SEO
    this.seo.updatePage({
      title: 'Welcome to NXT1! | NXT1 Sports',
      description: 'Your profile is ready. Discover what you can do with NXT1.',
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
    await this.startAgentTransition();
  }

  /** Handle skip — advance to next slide, or finish if on last slide */
  async onSkip(): Promise<void> {
    if (this.isLastSlide()) {
      this.logger.info('User skipped last slide — completing');
      await this.startAgentTransition();
    } else {
      this.logger.info('User skipped slide', { index: this.currentSlideIndex() });
      this.welcomeSlidesRef?.nextSlide();
    }
  }

  /** Handle slide viewed (for analytics) */
  onSlideViewed(event: { index: number; slideId: string }): void {
    this.currentSlideIndex.set(event.index);
    this.logger.debug('Slide viewed', event);

    if (event.index === this.totalSlides() - 1) {
      void this.prepareInitialAgentStateIfNeeded();
    }
  }

  /** Navigate to Agent X after the loading transition completes */
  async onLoadingComplete(): Promise<void> {
    this.logger.info('Agent transition loading complete, navigating to dashboard');

    // Keep the celebratory dark theme through the transition screen, then
    // restore the user's preference once we hand off to the dashboard route.
    this.themeService.clearTemporaryOverride();
    this.logger.debug('Cleared temporary theme override, restored user preference');

    // Mark legacy user as done — prevents congratulations screen on future logins.
    // Fire-and-forget: runs in parallel with the profile refresh below.
    void this.authFlow.completeLegacyOnboarding();

    // Ensure the authFlow signal reflects the latest backend role (e.g. 'director')
    // before the shell renders. Without this await, a newly registered Director
    // would see the Athlete UI on first load because the previous refresh may have
    // raced with navigation and left a stale signal.
    await this.authFlow.refreshUserProfile();
    this.logger.debug('User profile refreshed before dashboard navigation');

    await this.router.navigate([AUTH_REDIRECTS.AGENT], { replaceUrl: true });
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /**
   * Start the Agent X handoff transition and kick off initial generation work
   * before navigation so the dashboard has time to hydrate.
   */
  private async startAgentTransition(): Promise<void> {
    if (this.isTransitioningToAgent()) {
      this.logger.debug('Agent transition already in progress');
      return;
    }

    this.isTransitioningToAgent.set(true);
    this.initialGenerationReady.set(false);
    void this.prepareInitialAgentStateIfNeeded();
  }

  private prepareInitialAgentStateIfNeeded(): Promise<void> {
    if (this.initialPreparationPromise) {
      return this.initialPreparationPromise;
    }

    this.initialPreparationPromise = this.prepareInitialAgentState().finally(() => {
      this.initialGenerationReady.set(true);
    });

    return this.initialPreparationPromise;
  }

  private async prepareInitialAgentState(): Promise<void> {
    const goals = this.selectedGoals();

    // Use the transition animation as the visible window, but keep it open
    // until the first briefing has actually finished so the user lands on
    // a hydrated Agent X shell.
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
