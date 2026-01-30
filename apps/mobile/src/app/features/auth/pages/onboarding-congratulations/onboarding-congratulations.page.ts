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
import type { ILogger } from '@nxt1/core/logging';

// Core Constants
import { AUTH_REDIRECTS } from '@nxt1/core/constants';
import type { OnboardingUserType } from '@nxt1/core/api';

// App Services
import { AuthFlowService } from '../../services';

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
export class OnboardingCongratulationsPage implements OnInit {
  private readonly navController = inject(NavController);
  private readonly authFlow = inject(AuthFlowService);
  private readonly themeService = inject(NxtThemeService);
  private readonly logger: ILogger = inject(NxtLoggingService).child('CongratulationsPage');

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
    this.logger.info('Congratulations page loaded');

    // Refresh user profile to get updated firstName/lastName from backend
    this.authFlow.refreshUserProfile().catch((err) => {
      this.logger.warn('Failed to refresh user profile', { error: err });
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Handle complete (CTA button click) */
  async onComplete(): Promise<void> {
    this.logger.info('User completed welcome slides');
    await this.navigateToHome();
  }

  /** Handle skip */
  async onSkip(): Promise<void> {
    this.logger.info('User skipped welcome slides');
    await this.navigateToHome();
  }

  /** Handle slide viewed (for analytics) */
  onSlideViewed(event: { index: number; slideId: string }): void {
    this.logger.debug('Slide viewed', event);
    // TODO: Track with mobile analytics service
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
    this.logger.info('Navigating to home', { target: AUTH_REDIRECTS.DEFAULT });

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
