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
  imports: [CommonModule, AuthShellComponent, OnboardingWelcomeComponent],
  template: `
    <nxt1-auth-shell
      variant="card-glass"
      [showLogo]="true"
      [showBackButton]="false"
      [maxWidth]="'760px'"
    >
      <div authContent>
        <nxt1-onboarding-welcome
          #welcomeSlides
          [userRole]="userRole()"
          [firstName]="firstName()"
          (complete)="onComplete()"
          (skip)="onSkip()"
          (slideViewed)="onSlideViewed($event)"
          (goalsChanged)="onGoalsChanged($event)"
        />
      </div>
    </nxt1-auth-shell>
  `,
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

  /** Selected goals from the goals slide */
  private readonly selectedGoals = signal<AgentGoal[]>([]);

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

    // Refresh user profile to get updated firstName/lastName from backend
    this.authFlow.refreshUserProfile();

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
    this.currentSlideIndex.set(event.index);
    this.logger.debug('Slide viewed', event);
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /**
   * Save goals to backend and navigate to Agent X.
   * Uses replaceUrl to replace the navigation stack (no back to onboarding).
   *
   * Also clears the temporary theme override, restoring user's saved preference.
   */
  private async saveGoalsAndNavigate(): Promise<void> {
    const goals = this.selectedGoals();

    // Fire-and-forget: save goals in background, navigate immediately.
    // The /agent page has its own loading state for playbook generation.
    if (goals.length > 0) {
      const dashboardGoals: AgentDashboardGoal[] = goals.map((g) => ({
        id: g.id,
        text: g.text,
        category: g.category ?? 'custom',
        createdAt: new Date().toISOString(),
      }));

      this.logger.info('Saving agent goals in background', { count: goals.length });
      this.agentX.setGoals(dashboardGoals).catch((err) => {
        this.logger.error('Error saving goals (non-blocking)', err);
      });
    }

    // ⭐ THEME RESTORATION: Clear temporary override, restore user's preference
    // This ensures the app respects user's original theme choice going forward
    this.themeService.clearTemporaryOverride();
    this.logger.debug('Cleared temporary theme override, restored user preference');

    await this.router.navigate([AUTH_REDIRECTS.AGENT], { replaceUrl: true });
  }
}
