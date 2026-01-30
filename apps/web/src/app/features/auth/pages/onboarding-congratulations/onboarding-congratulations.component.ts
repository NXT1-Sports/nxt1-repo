/**
 * @fileoverview OnboardingCongratulationsComponent - Web Page Wrapper
 * @module @nxt1/web/features/auth
 *
 * Thin wrapper page that uses the shared OnboardingWelcomeComponent from @nxt1/ui.
 * This page handles:
 * - Refreshing user profile data
 * - SEO meta tags
 * - Navigation with NavController
 * - Theme restoration after onboarding (clears temporary dark override)
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

import { Component, ChangeDetectionStrategy, inject, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavController } from '@ionic/angular/standalone';

// Shared UI Components
import {
  AuthShellComponent,
  OnboardingWelcomeComponent,
  NxtLoggingService,
  NxtThemeService,
} from '@nxt1/ui';

// Core Constants
import { AUTH_REDIRECTS } from '@nxt1/core/constants';
import type { OnboardingUserType } from '@nxt1/core/api';

// App Services
import { AuthFlowService } from '../../services';
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
      [maxWidth]="'560px'"
    >
      <div authContent>
        <nxt1-onboarding-welcome
          [userRole]="userRole()"
          [firstName]="firstName()"
          (complete)="onComplete()"
          (skip)="onSkip()"
          (slideViewed)="onSlideViewed($event)"
        />
      </div>
    </nxt1-auth-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingCongratulationsComponent implements OnInit {
  private readonly navController = inject(NavController);
  private readonly authFlow = inject(AuthFlowService);
  private readonly seo = inject(SeoService);
  private readonly themeService = inject(NxtThemeService);
  private readonly logger = inject(NxtLoggingService).child('OnboardingCongratulations');

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

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
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

  /** Handle complete (CTA button click) */
  async onComplete(): Promise<void> {
    await this.navigateToHome();
  }

  /** Handle skip */
  async onSkip(): Promise<void> {
    await this.navigateToHome();
  }

  /** Handle slide viewed (for analytics) */
  onSlideViewed(event: { index: number; slideId: string }): void {
    // TODO: Track with analytics service
    this.logger.debug('Slide viewed', event);
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /**
   * Navigate to home/feed using NavController
   * Uses navigateRoot to replace the navigation stack (no back to onboarding)
   *
   * Also clears the temporary theme override, restoring user's saved preference.
   */
  private async navigateToHome(): Promise<void> {
    // ⭐ THEME RESTORATION: Clear temporary override, restore user's preference
    // This ensures the app respects user's original theme choice going forward
    this.themeService.clearTemporaryOverride();
    this.logger.debug('Cleared temporary theme override, restored user preference');

    await this.navController.navigateRoot(AUTH_REDIRECTS.DEFAULT, {
      animated: true,
      animationDirection: 'forward',
    });
  }
}
