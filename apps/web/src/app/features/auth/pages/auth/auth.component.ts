/**
 * @fileoverview Unified Auth Component - Login & Signup Combined
 * @module @nxt1/web
 *
 * Professional unified authentication page using shared auth components from @nxt1/ui.
 * Combines login and signup functionality into a single seamless experience.
 * Features two-column layout with QR codes for app download on desktop.
 *
 * Team Code Flow:
 * - /auth?code=ABC123 - Pre-validates team code and shows team info
 * - "Have a team code?" button - Opens team code input
 * - Validated team info persists through signup
 *
 * Route: /auth
 *
 * ⭐ MATCHES MOBILE'S auth.page.ts INTERFACE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  AuthShellComponent,
  AuthSocialButtonsComponent,
  AuthActionButtonsComponent,
  AuthDividerComponent,
  AuthEmailFormComponent,
  AuthAppDownloadComponent,
  AuthModeSwitcherComponent,
  AuthTermsDisclaimerComponent,
  AuthTeamCodeComponent,
  AuthTeamCodeBannerComponent,
  type AuthEmailFormData,
  type AuthMode,
  type TeamCodeValidationState,
} from '@nxt1/ui/auth';
import { AuthFlowService, AuthApiService } from '../../services';
import { SeoService } from '../../../../core/services';
import { NxtToastService } from '@nxt1/ui/services';
import { isValidTeamCode } from '@nxt1/core';
import type { ValidatedTeamInfo } from '@nxt1/core';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    AuthShellComponent,
    AuthSocialButtonsComponent,
    AuthActionButtonsComponent,
    AuthDividerComponent,
    AuthEmailFormComponent,
    AuthAppDownloadComponent,
    AuthModeSwitcherComponent,
    AuthTermsDisclaimerComponent,
    AuthTeamCodeComponent,
    AuthTeamCodeBannerComponent,
  ],
  template: `
    <div [attr.data-testid]="mode() === 'login' ? 'login-page' : 'signup-page'">
      <nxt1-auth-shell
        variant="card-glass"
        [showBackButton]="showEmailForm() || showTeamCodeInput()"
        [showSidePanel]="!showEmailForm() && !showTeamCodeInput()"
        (backClick)="onBackClick()"
      >
        <!-- Title & Subtitle -->
        <h1
          authTitle
          class="text-text-primary text-2xl font-bold"
          [attr.data-testid]="mode() === 'login' ? 'login-title' : 'signup-title'"
        >
          {{ title() }}
        </h1>
        <p
          authSubtitle
          class="text-text-secondary mb-2 text-sm"
          [attr.data-testid]="mode() === 'login' ? 'login-subtitle' : 'signup-subtitle'"
        >
          {{ subtitle() }}
        </p>

        <!-- Main Content -->
        <div authContent>
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

          <!-- Social Buttons View (default) -->
          @else if (!showEmailForm()) {
            <!-- Validated Team Banner (if coming from team code) -->
            @if (validatedTeam(); as team) {
              <nxt1-auth-team-code-banner
                [team]="team"
                variant="full"
                (clear)="onClearTeamCode()"
              />
            }

            <!-- Social Login Options -->
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
              [showTeamCode]="!validatedTeam()"
              data-testid="auth-action-buttons-container"
            />
          }

          <!-- Email Form View -->
          @else {
            <!-- Validated Team Banner (compact) -->
            @if (validatedTeam(); as team) {
              <nxt1-auth-team-code-banner [team]="team" variant="compact" />
            }

            <!-- Email Form with Mode Toggle -->
            <nxt1-auth-mode-switcher [mode]="mode()" (modeChange)="setMode($event)" />

            <nxt1-auth-email-form
              [mode]="mode()"
              [loading]="authFlow.isLoading()"
              [error]="authFlow.error()"
              (submitForm)="onEmailSubmit($event)"
              (forgotPasswordClick)="onForgotPassword()"
            />

            <!-- Terms (signup mode only) -->
            @if (mode() === 'signup') {
              <nxt1-auth-terms-disclaimer />
            }
          }
        </div>

        <!-- Side Panel: QR Codes (Desktop) -->
        <ng-container authSidePanel>
          <nxt1-auth-app-download [showMobileButtons]="false" />
        </ng-container>

        <!-- Side Panel: App Buttons (Mobile) -->
        <ng-container authSidePanelMobile>
          <nxt1-auth-app-download [showMobileButtons]="true" />
        </ng-container>
      </nxt1-auth-shell>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthComponent implements OnInit {
  protected readonly authFlow = inject(AuthFlowService);
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NxtToastService);

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
    // Set SEO metadata for auth page
    this.seo.updatePage({
      title: 'Sign In or Sign Up',
      description:
        'Join NXT1 Sports - The ultimate platform for athletes, coaches, and sports fans. Sign in to your account or create a new one to get started.',
      keywords: [
        'sign in',
        'sign up',
        'login',
        'register',
        'create account',
        'sports recruiting',
        'athlete profile',
      ],
    });

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
  setMode(newMode: AuthMode): void {
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
  onBackClick(): void {
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
  onTeamCode(): void {
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
      return;
    }

    this.teamCodeValidating.set(true);
    this.teamCodeError.set(null);

    try {
      const result = await this.authApi.validateTeamCode(code);

      if (result.valid && result.teamCode) {
        this.validatedTeam.set(result.teamCode);
        this.teamCodeError.set(null);
        this.updateUrl();
      } else {
        this.validatedTeam.set(null);
        this.teamCodeError.set(result.error || 'Invalid team code. Please check and try again.');
      }
    } catch {
      this.validatedTeam.set(null);
      this.teamCodeError.set('Unable to validate team code. Please try again.');
    } finally {
      this.teamCodeValidating.set(false);
    }
  }

  /**
   * Continue to signup after team code validation
   */
  onContinueWithTeam(): void {
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
  // AUTH METHODS
  // ============================================

  /**
   * Show email form (defaults to current mode)
   */
  onShowEmailForm(): void {
    this.showEmailForm.set(true);
  }

  /**
   * Submit email/password credentials
   *
   * The AuthFlowService handles:
   * - Loading state management
   * - Error state management
   * - Firebase authentication
   * - Analytics tracking
   *
   * This component just calls the service - no try/catch needed
   * as errors are handled and displayed via authFlow.error() signal
   */
  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    // Note: Don't call clearError() here - the service clears it at the start of auth
    if (this.mode() === 'login') {
      await this.authFlow.signInWithEmail({
        email: data.email,
        password: data.password,
      });
    } else {
      // Pass team code if validated
      await this.authFlow.signUpWithEmail({
        email: data.email,
        password: data.password,
        teamCode: this.validatedTeam()?.code,
      });
    }
  }

  /**
   * Sign in/up with Google OAuth
   */
  async onGoogleAuth(): Promise<void> {
    try {
      const teamCode = this.validatedTeam()?.code;
      await this.authFlow.signInWithGoogle(teamCode);
    } catch {
      // Error handled by service
    }
  }

  /**
   * Sign in/up with Apple ID
   */
  async onAppleAuth(): Promise<void> {
    this.authFlow.clearError();

    const teamCode = this.validatedTeam()?.code;
    await this.authFlow.signInWithApple(teamCode);

    // Success/error handling and navigation managed by AuthFlowService
    // Analytics tracking is handled within AuthFlowService
  }

  /**
   * Sign in/up with Microsoft Account
   */
  async onMicrosoftAuth(): Promise<void> {
    try {
      const teamCode = this.validatedTeam()?.code;
      await this.authFlow.signInWithMicrosoft(teamCode);
    } catch {
      // Error handled by service
    }
  }

  /**
   * Navigate to forgot password page
   */
  onForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }
}
