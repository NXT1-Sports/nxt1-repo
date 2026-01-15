/**
 * @fileoverview Unified Auth Page - Login & Signup Combined
 * @module @nxt1/mobile
 *
 * Professional unified authentication page using shared auth components from @nxt1/ui.
 * Combines login and signup functionality into a single seamless experience.
 * Features native iOS/Android haptic feedback.
 *
 * Route: /auth
 *
 * ⭐ IDENTICAL STRUCTURE TO WEB'S auth.component.ts ⭐
 *
 * Architecture:
 *   AuthPage (UI) → AuthFlowService (Domain) → AuthService (Infra)
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
  AuthShellComponent,
  AuthSocialButtonsComponent,
  AuthActionButtonsComponent,
  AuthDividerComponent,
  AuthEmailFormComponent,
  AuthModeSwitcherComponent,
  AuthTermsDisclaimerComponent,
  type AuthEmailFormData,
  type AuthMode,
} from '@nxt1/ui/auth';
import { AuthFlowService } from '../../services';
import { HapticsService } from '@nxt1/ui/services';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    CommonModule,
    AuthShellComponent,
    AuthSocialButtonsComponent,
    AuthActionButtonsComponent,
    AuthDividerComponent,
    AuthEmailFormComponent,
    AuthModeSwitcherComponent,
    AuthTermsDisclaimerComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="card-glass"
      [showBackButton]="showEmailForm()"
      (backClick)="onBackToSocial()"
    >
      <!-- Dynamic Title & Subtitle based on mode -->
      <h1 authTitle>{{ title() }}</h1>
      <p authSubtitle>{{ subtitle() }}</p>

      <!-- Social Buttons (default view) -->
      @if (!showEmailForm()) {
        <nxt1-auth-social-buttons
          [loading]="authFlow.isLoading()"
          (googleClick)="onGoogleAuth()"
          (appleClick)="onAppleAuth()"
          (microsoftClick)="onMicrosoftAuth()"
        />

        <nxt1-auth-divider />

        <nxt1-auth-action-buttons
          [loading]="authFlow.isLoading()"
          (emailClick)="onShowEmailForm()"
          (teamCodeClick)="onTeamCode()"
        />
      }

      <!-- Email Form with Mode Toggle -->
      @if (showEmailForm()) {
        <!-- Mode Toggle Tabs -->
        <nxt1-auth-mode-switcher [mode]="mode()" (modeChange)="setMode($event)" />

        <nxt1-auth-email-form
          [mode]="mode()"
          [loading]="authFlow.isLoading()"
          [error]="authFlow.error()"
          (submitForm)="onEmailSubmit($event)"
          (forgotPasswordClick)="onForgotPassword()"
        />

        <!-- Terms (only show for signup) -->
        @if (mode() === 'signup') {
          <nxt1-auth-terms-disclaimer />
        }
      }
    </nxt1-auth-shell>
  `,
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage implements OnInit {
  // ============================================
  // DEPENDENCIES
  // ============================================
  readonly authFlow = inject(AuthFlowService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // ============================================
  // LOCAL UI STATE
  // ============================================

  /** Current auth mode: login or signup */
  readonly mode = signal<AuthMode>('login');

  /** Whether to show email form vs social buttons */
  readonly showEmailForm = signal(false);

  /** Dynamic title based on mode */
  readonly title = computed(() => (this.mode() === 'login' ? 'Welcome back' : 'Create Account'));

  /** Dynamic subtitle based on mode */
  readonly subtitle = computed(() =>
    this.mode() === 'login'
      ? 'Sign in to continue to NXT1'
      : 'Join NXT1 to start your recruiting journey'
  );

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Check for mode query param (e.g., ?mode=signup)
    const queryMode = this.route.snapshot.queryParamMap.get('mode');
    if (queryMode === 'signup') {
      this.mode.set('signup');
    }

    // Check for team code query param
    if (this.route.snapshot.queryParamMap.get('teamCode')) {
      this.mode.set('signup');
      this.showEmailForm.set(true);
    }
  }

  // ============================================
  // UI ACTIONS (with haptics)
  // ============================================

  /**
   * Set auth mode and update URL
   */
  async setMode(newMode: AuthMode): Promise<void> {
    await this.haptics.impact('light');
    this.authFlow.clearError();
    this.mode.set(newMode);
    this.updateUrl();
  }

  /**
   * Update URL query params based on current mode
   */
  private updateUrl(): void {
    const queryParams = this.mode() === 'signup' ? { mode: 'signup' } : {};
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  /** Show the email/password form */
  async onShowEmailForm(): Promise<void> {
    await this.haptics.impact('light');
    this.authFlow.clearError();
    this.showEmailForm.set(true);
  }

  /** Return to social buttons view */
  async onBackToSocial(): Promise<void> {
    await this.haptics.impact('light');
    this.authFlow.clearError();
    this.showEmailForm.set(false);
    this.mode.set('login');
    this.updateUrl();
  }

  // ============================================
  // AUTH ACTIONS (with haptics)
  // ============================================

  /**
   * Submit email/password credentials
   */
  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    this.authFlow.clearError();
    try {
      await this.haptics.impact('medium');

      if (this.mode() === 'login') {
        const success = await this.authFlow.signInWithEmail({
          email: data.email,
          password: data.password,
        });

        if (success) {
          await this.haptics.notification('success');
        } else {
          await this.haptics.notification('error');
        }
      } else {
        const success = await this.authFlow.signUpWithEmail({
          email: data.email,
          password: data.password,
        });

        if (success) {
          await this.haptics.notification('success');
        } else {
          await this.haptics.notification('error');
        }
      }
    } catch {
      await this.haptics.notification('error');
    }
  }

  /**
   * Sign in/up with Google OAuth
   */
  async onGoogleAuth(): Promise<void> {
    try {
      await this.haptics.impact('medium');
      const success = await this.authFlow.signInWithGoogle();
      if (success) {
        await this.haptics.notification('success');
      } else {
        await this.haptics.notification('error');
      }
    } catch {
      await this.haptics.notification('error');
    }
  }

  /**
   * Sign in/up with Apple ID
   */
  async onAppleAuth(): Promise<void> {
    try {
      await this.haptics.impact('medium');
      const success = await this.authFlow.signInWithApple();
      if (success) {
        await this.haptics.notification('success');
      } else {
        await this.haptics.notification('error');
      }
    } catch {
      await this.haptics.notification('error');
    }
  }

  /**
   * Sign in/up with Microsoft Account
   */
  async onMicrosoftAuth(): Promise<void> {
    try {
      await this.haptics.impact('medium');
      const success = await this.authFlow.signInWithMicrosoft();
      if (success) {
        await this.haptics.notification('success');
      } else {
        await this.haptics.notification('error');
      }
    } catch {
      await this.haptics.notification('error');
    }
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /** Navigate to forgot password page */
  onForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  /** Handle team code flow */
  async onTeamCode(): Promise<void> {
    await this.haptics.impact('light');
    this.mode.set('signup');
    this.showEmailForm.set(true);
    // Add teamCode query param for tracking
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { teamCode: true },
      queryParamsHandling: 'merge',
    });
  }
}
