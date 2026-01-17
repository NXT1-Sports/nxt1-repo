/**
 * @fileoverview Unified Auth Page - Login & Signup Combined
 * @module @nxt1/mobile
 *
 * Professional unified authentication page using shared auth components from @nxt1/ui.
 * Combines login and signup functionality into a single seamless experience.
 * Features native iOS/Android haptic feedback.
 *
 * Team Code Flow:
 * - /auth?code=ABC123 - Pre-validates team code and shows team info
 * - "Have a team code?" button - Opens team code input
 * - Validated team info persists through signup
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
import { FormsModule } from '@angular/forms';
import {
  AuthShellComponent,
  AuthSocialButtonsComponent,
  AuthActionButtonsComponent,
  AuthDividerComponent,
  AuthEmailFormComponent,
  AuthModeSwitcherComponent,
  AuthTermsDisclaimerComponent,
  AuthTeamCodeComponent,
  AuthTeamCodeBannerComponent,
  type AuthEmailFormData,
  type AuthMode,
  type TeamCodeValidationState,
} from '@nxt1/ui/auth';
import { AuthFlowService, AuthApiService } from '../../services';
import { HapticsService } from '@nxt1/ui/services';
import { isValidTeamCode } from '@nxt1/core';
import type { ValidatedTeamInfo } from '@nxt1/core';
import { AUTH_PAGE_TEST_IDS } from '@nxt1/core/testing';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AuthShellComponent,
    AuthSocialButtonsComponent,
    AuthActionButtonsComponent,
    AuthDividerComponent,
    AuthEmailFormComponent,
    AuthModeSwitcherComponent,
    AuthTermsDisclaimerComponent,
    AuthTeamCodeComponent,
    AuthTeamCodeBannerComponent,
  ],
  template: `
    <div
      [attr.data-testid]="
        mode() === 'login' ? AUTH_PAGE_TEST_IDS.LOGIN_PAGE : AUTH_PAGE_TEST_IDS.SIGNUP_PAGE
      "
    >
      <nxt1-auth-shell
        variant="card-glass"
        [showBackButton]="showEmailForm() || showTeamCodeInput()"
        (backClick)="onBackClick()"
      >
        <!-- Dynamic Title & Subtitle based on mode -->
        <h1
          authTitle
          [attr.data-testid]="
            mode() === 'login' ? AUTH_PAGE_TEST_IDS.LOGIN_TITLE : AUTH_PAGE_TEST_IDS.SIGNUP_TITLE
          "
        >
          {{ title() }}
        </h1>
        <p
          authSubtitle
          [attr.data-testid]="
            mode() === 'login'
              ? AUTH_PAGE_TEST_IDS.LOGIN_SUBTITLE
              : AUTH_PAGE_TEST_IDS.SIGNUP_SUBTITLE
          "
        >
          {{ subtitle() }}
        </p>

        <!-- Team Code Input View -->
        @if (showTeamCodeInput() && !showEmailForm()) {
          <nxt1-auth-team-code
            [state]="teamCodeState()"
            [teamCode]="teamCodeInput"
            [validatedTeam]="validatedTeam()"
            [errorMessage]="teamCodeError()"
            (teamCodeChange)="onTeamCodeInputChange($event)"
            (validate)="onValidateTeamCode()"
            (continue)="onContinueWithTeam()"
          />
        }

        <!-- Social Buttons (default view) -->
        @else if (!showEmailForm()) {
          <!-- Validated Team Banner (if coming from team code) -->
          @if (validatedTeam(); as team) {
            <nxt1-auth-team-code-banner [team]="team" variant="full" (clear)="onClearTeamCode()" />
          }

          <nxt1-auth-social-buttons
            [loading]="authFlow.isLoading()"
            (googleClick)="onGoogleAuth()"
            (appleClick)="onAppleAuth()"
            (microsoftClick)="onMicrosoftAuth()"
          />

          <nxt1-auth-divider />

          <nxt1-auth-action-buttons
            [loading]="authFlow.isLoading()"
            [showTeamCode]="!validatedTeam()"
            (emailClick)="onShowEmailForm()"
            (teamCodeClick)="onTeamCode()"
          />
        }

        <!-- Email Form with Mode Toggle -->
        @if (showEmailForm()) {
          <!-- Validated Team Banner (compact) -->
          @if (validatedTeam(); as team) {
            <nxt1-auth-team-code-banner [team]="team" variant="compact" />
          }

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
    </div>
  `,
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage implements OnInit {
  // ============================================
  // TEST ID CONSTANTS (for template access)
  // ============================================
  readonly AUTH_PAGE_TEST_IDS = AUTH_PAGE_TEST_IDS;

  // ============================================
  // DEPENDENCIES
  // ============================================
  readonly authFlow = inject(AuthFlowService);
  private readonly authApi = inject(AuthApiService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // ============================================
  // AUTH STATE
  // ============================================

  /** Current auth mode: login or signup */
  readonly mode = signal<AuthMode>('login');

  /** Whether to show email form vs social buttons */
  readonly showEmailForm = signal(false);

  // ============================================
  // TEAM CODE STATE
  // ============================================

  /** Whether to show team code input view */
  readonly showTeamCodeInput = signal(false);

  /** Team code input value */
  teamCodeInput = '';

  /** Validated team info (null if not validated) */
  readonly validatedTeam = signal<ValidatedTeamInfo | null>(null);

  /** Team code validation in progress */
  readonly teamCodeValidating = signal(false);

  /** Team code error message */
  readonly teamCodeError = signal<string | null>(null);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Team code validation state for shared component */
  readonly teamCodeState = computed<TeamCodeValidationState>(() => {
    if (this.teamCodeValidating()) return 'validating';
    if (this.teamCodeError()) return 'error';
    if (this.validatedTeam()) return 'success';
    return 'idle';
  });

  /** Dynamic title based on mode and team code state */
  readonly title = computed(() => {
    if (this.showTeamCodeInput() && !this.showEmailForm()) {
      return 'Join Your Team';
    }
    return this.mode() === 'login' ? 'Welcome back' : 'Create Account';
  });

  /** Dynamic subtitle based on mode and team code state */
  readonly subtitle = computed(() => {
    if (this.showTeamCodeInput() && !this.showEmailForm()) {
      return 'Enter your team code to get started';
    }
    if (this.validatedTeam()) {
      return `Sign up to join ${this.validatedTeam()!.teamName}`;
    }
    return this.mode() === 'login'
      ? 'Sign in to continue to NXT1'
      : 'Join NXT1 to start your recruiting journey';
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    // Check for mode query param (e.g., ?mode=signup)
    const queryMode = this.route.snapshot.queryParamMap.get('mode');
    if (queryMode === 'signup') {
      this.mode.set('signup');
    }

    // Check for team code in URL params (e.g., ?code=ABC123)
    const codeParam = this.route.snapshot.queryParamMap.get('code');
    if (codeParam && isValidTeamCode(codeParam)) {
      this.mode.set('signup');
      this.teamCodeInput = codeParam.toUpperCase();
      // Auto-validate the team code from URL
      this.onValidateTeamCode();
    }
  }

  // ============================================
  // MODE & NAVIGATION
  // ============================================

  /**
   * Set auth mode and update URL
   */
  async setMode(newMode: AuthMode): Promise<void> {
    await this.haptics.impact('light');
    this.authFlow.clearError();
    this.mode.set(newMode);

    // Clear team code when switching to login
    if (newMode === 'login') {
      this.onClearTeamCode();
    }

    this.updateUrl();
  }

  /**
   * Update URL query params based on current state
   */
  private updateUrl(): void {
    const queryParams: Record<string, string | null> = {};

    if (this.mode() === 'signup') {
      queryParams['mode'] = 'signup';
    }

    if (this.validatedTeam()) {
      queryParams['code'] = this.validatedTeam()!.code;
    }

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  /**
   * Handle back button click
   */
  async onBackClick(): Promise<void> {
    await this.haptics.impact('light');
    this.authFlow.clearError();

    if (this.showEmailForm()) {
      // Go back to social buttons view (keep team code if validated)
      this.showEmailForm.set(false);
    } else if (this.showTeamCodeInput()) {
      // Go back from team code input to social view
      this.showTeamCodeInput.set(false);
      this.teamCodeInput = '';
      this.teamCodeError.set(null);
      this.validatedTeam.set(null);
      this.mode.set('login');
    } else {
      this.mode.set('login');
    }

    this.updateUrl();
  }

  // ============================================
  // TEAM CODE METHODS
  // ============================================

  /**
   * Show team code input screen
   */
  async onTeamCode(): Promise<void> {
    await this.haptics.impact('light');
    this.mode.set('signup');
    this.showTeamCodeInput.set(true);
    this.showEmailForm.set(false);
  }

  /**
   * Handle team code input changes - clear errors on typing
   */
  onTeamCodeInputChange(code: string): void {
    this.teamCodeInput = code.toUpperCase();
    if (this.teamCodeError()) {
      this.teamCodeError.set(null);
    }
  }

  /**
   * Validate the entered team code via API
   */
  async onValidateTeamCode(): Promise<void> {
    const code = this.teamCodeInput.trim();

    if (!code || !isValidTeamCode(code)) {
      this.teamCodeError.set('Please enter a valid team code (4-10 characters)');
      await this.haptics.notification('warning');
      return;
    }

    this.teamCodeValidating.set(true);
    this.teamCodeError.set(null);

    try {
      const result = await this.authApi.validateTeamCode(code);

      if (result.valid && result.teamCode) {
        this.validatedTeam.set(result.teamCode);
        this.teamCodeError.set(null);
        await this.haptics.notification('success');
        this.updateUrl();
      } else {
        this.validatedTeam.set(null);
        this.teamCodeError.set(result.error || 'Invalid team code. Please check and try again.');
        await this.haptics.notification('error');
      }
    } catch {
      this.validatedTeam.set(null);
      this.teamCodeError.set('Unable to validate team code. Please try again.');
      await this.haptics.notification('error');
    } finally {
      this.teamCodeValidating.set(false);
    }
  }

  /**
   * Continue to signup after team code validation
   */
  async onContinueWithTeam(): Promise<void> {
    await this.haptics.impact('light');
    this.showTeamCodeInput.set(false);
    // Don't show email form yet - show social buttons with team banner
  }

  /**
   * Clear validated team code
   */
  onClearTeamCode(): void {
    this.teamCodeInput = '';
    this.validatedTeam.set(null);
    this.teamCodeError.set(null);
    this.showTeamCodeInput.set(false);
    this.updateUrl();
  }

  // ============================================
  // UI ACTIONS (with haptics)
  // ============================================

  /** Show the email/password form */
  async onShowEmailForm(): Promise<void> {
    await this.haptics.impact('light');
    this.authFlow.clearError();
    this.showEmailForm.set(true);
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
        // Pass team code if validated
        const success = await this.authFlow.signUpWithEmail({
          email: data.email,
          password: data.password,
          teamCode: this.validatedTeam()?.code,
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
      // TODO: Pass team code to Google sign-in flow
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
      // TODO: Pass team code to Apple sign-in flow
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
      // TODO: Pass team code to Microsoft sign-in flow
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
}
