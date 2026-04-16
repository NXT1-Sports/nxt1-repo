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
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthShellComponent } from '@nxt1/ui/auth/auth-shell';
import { AuthSocialButtonsComponent } from '@nxt1/ui/auth/auth-social-buttons';
import { AuthActionButtonsComponent } from '@nxt1/ui/auth/auth-action-buttons';
import { AuthDividerComponent } from '@nxt1/ui/auth/auth-divider';
import { AuthEmailFormComponent, type AuthEmailFormData } from '@nxt1/ui/auth/auth-email-form';
import { AuthAppDownloadComponent } from '@nxt1/ui/auth/auth-app-download';
import { AuthModeSwitcherComponent, type AuthMode } from '@nxt1/ui/auth/auth-mode-switcher';
import { AuthTermsDisclaimerComponent } from '@nxt1/ui/auth/auth-terms-disclaimer';
import {
  AuthTeamCodeComponent,
  AuthTeamCodeBannerComponent,
  type TeamCodeValidationState,
} from '@nxt1/ui/auth/auth-team-code';
import { AuthFlowService, AuthApiService } from '../../../../core/services/auth';
import { AuthNavigationService, NxtLoggingService } from '@nxt1/ui/services';
import { SeoService } from '../../../../core/services';
import { NxtToastService } from '@nxt1/ui/services';
import { isValidTeamCode } from '@nxt1/core';
import type { ValidatedTeamInfo } from '@nxt1/core';
import { PENDING_REFERRAL_KEY, type PendingReferral } from '../../../join/join.component';
import { ILogger } from '@nxt1/core/logging';

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
          class="text-2xl font-bold text-text-primary"
          [attr.data-testid]="mode() === 'login' ? 'login-title' : 'signup-title'"
        >
          {{ title() }}
        </h1>
        <p
          authSubtitle
          class="mb-2 text-sm text-text-secondary"
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
              [showTeamCode]="false"
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
  private readonly nav = inject(AuthNavigationService);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NxtToastService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly logger: ILogger = inject(NxtLoggingService).child('AuthComponent');

  /** Pending referral from an invite link (/join/:code) */
  private pendingReferral: PendingReferral | null = null;

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
      : 'Join NXT1 to start your journey';
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
        'sports intelligence',
        'athlete profile',
      ],
    });
    if (isPlatformBrowser(this.platformId)) {
      this.restoreInviteDataFromUrl();
    }

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

    // Read pending referral from sessionStorage (set by /join/:code route)
    if (isPlatformBrowser(this.platformId)) {
      try {
        const raw = sessionStorage.getItem(PENDING_REFERRAL_KEY);
        if (raw) {
          const referral = JSON.parse(raw) as PendingReferral;
          // Only use if less than 24 hours old
          const maxAge = 24 * 60 * 60 * 1000;
          if (Date.now() - referral.timestamp < maxAge && referral.code) {
            this.pendingReferral = referral;
            // If this is a team invite, populate validatedTeam so the UI shows
            // the team banner and teamCode is passed to signUp correctly.
            if (referral.teamCode && !this.validatedTeam()) {
              this.authApi
                .validateTeamCode(referral.teamCode)
                .then((result) => {
                  if (result.valid && result.teamCode) {
                    this.validatedTeam.set(result.teamCode);
                  }
                })
                .catch(() => {
                  // Non-fatal — UI just won't show the team banner
                });
            }
          } else {
            sessionStorage.removeItem(PENDING_REFERRAL_KEY);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  private restoreInviteDataFromUrl(): void {
    const params = this.route.snapshot.queryParamMap;
    const ref = params.get('ref');
    const teamCode = params.get('teamCode');
    const urlSport = params.get('sport');
    const role = params.get('role');
    const inviteType = params.get('inviteType');
    if (!ref || !teamCode) return;

    try {
      const existing = sessionStorage.getItem(PENDING_REFERRAL_KEY);
      if (existing) {
        this.logger.debug('Invite data already in sessionStorage, skipping URL restore');
        return;
      }

      this.authApi
        .validateTeamCode(teamCode)
        .then((result) => {
          let teamData: ValidatedTeamInfo | undefined;

          if (result.valid && result.teamCode) {
            teamData = result.teamCode;
            this.logger.info('Fetched team data from teamCode', {
              teamId: teamData.id,
              teamName: teamData.teamName,
              sport: teamData.sport,
            });
          }
          const pendingReferral: PendingReferral = {
            code: ref,
            inviterUid: '',
            type: inviteType || 'team',
            teamId: teamData?.id,
            teamCode,
            teamName: teamData?.teamName,
            sport: teamData?.sport || urlSport || undefined,
            teamType: teamData?.teamType,
            role: role || undefined,
            timestamp: Date.now(),
          };

          sessionStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(pendingReferral));
          const sport = teamData?.sport || urlSport;
          if (sport) {
            sessionStorage.setItem('nxt1:invite_sport', sport);
          }

          this.logger.info('Restored invite data with full team info', {
            ref,
            teamCode,
            teamName: teamData?.teamName,
            sport,
            role,
          });
        })
        .catch((err) => {
          this.logger.warn('Failed to fetch team data, using URL params only', { error: err });
          const pendingReferral: PendingReferral = {
            code: ref,
            inviterUid: '',
            type: inviteType || 'team',
            teamCode,
            sport: urlSport || undefined,
            role: role || undefined,
            timestamp: Date.now(),
          };
          sessionStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(pendingReferral));
        });
    } catch (err) {
      this.logger.warn('Failed to restore invite data from URL', { error: err });
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
      // Pass team code if validated, and referral code if present
      await this.authFlow.signUpWithEmail({
        email: data.email,
        password: data.password,
        teamCode: this.validatedTeam()?.code,
        referralId: this.pendingReferral?.code,
      });
    }
  }

  /**
   * Sign in/up with Google OAuth
   */
  async onGoogleAuth(): Promise<void> {
    try {
      const teamCode = this.validatedTeam()?.code;
      const referralId = this.pendingReferral?.code;
      await this.authFlow.signInWithGoogle(
        teamCode || referralId ? { teamCode, referralId } : undefined
      );
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
    const referralId = this.pendingReferral?.code;
    await this.authFlow.signInWithApple(
      teamCode || referralId ? { teamCode, referralId } : undefined
    );

    // Success/error handling and navigation managed by AuthFlowService
    // Analytics tracking is handled within AuthFlowService
  }

  /**
   * Sign in/up with Microsoft Account
   */
  async onMicrosoftAuth(): Promise<void> {
    try {
      const teamCode = this.validatedTeam()?.code;
      const referralId = this.pendingReferral?.code;
      await this.authFlow.signInWithMicrosoft(
        teamCode || referralId ? { teamCode, referralId } : undefined
      );
    } catch {
      // Error handled by service
    }
  }

  /**
   * Navigate to forgot password page with Ionic slide animation
   */
  onForgotPassword(): void {
    this.nav.navigateForward('/auth/forgot-password');
  }
}
