/**
 * @fileoverview Unified Auth Page - Login & Signup Combined
 * @module @nxt1/mobile
 *
 * Professional unified authentication page using shared auth components from @nxt1/ui.
 * Combines login and signup functionality into a single seamless experience.
 * Features native iOS/Android haptic feedback and biometric authentication.
 *
 * Team Code Flow:
 * - /auth?code=ABC123 - Pre-validates team code and shows team info
 * - "Have a team code?" button - Opens team code input
 * - Validated team info persists through signup
 *
 * Biometric Flow (2026 Professional Standard):
 * - AUTO-TRIGGERS Face ID/Touch ID on page load if enrolled (like Instagram, banking apps)
 * - No visible biometric button - seamless automatic experience
 * - After successful signup/login, prompts to enable biometric
 * - User can toggle biometric on/off in settings
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
import { CommonModule, Location } from '@angular/common';
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
  NxtLoggingService,
  type AuthEmailFormData,
  type AuthMode,
  type TeamCodeValidationState,
} from '@nxt1/ui';
import { AuthFlowService, AuthApiService, BiometricService } from '../../../../core/services/auth';
import { AuthNavigationService } from '@nxt1/ui/services';
import { HapticsService } from '@nxt1/ui';
import { InviteApiService } from '@nxt1/ui/invite';
import { isValidTeamCode } from '@nxt1/core';
import type { ValidatedTeamInfo } from '@nxt1/core';
import { AUTH_PAGE_TEST_IDS } from '@nxt1/core/testing';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../../../../environments/environment';
import {
  PENDING_REFERRAL_KEY,
  INVITE_SPORT_KEY,
  type PendingReferral,
} from '../../../join/join.component';

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
    <!-- DEV ONLY: Triple-tap area to reset onboarding state -->
    @if (!environment.production) {
      <div
        class="dev-reset-area"
        (click)="onDevTap()"
        style="position: absolute; top: 0; left: 0; width: 100px; height: 50px; z-index: 9999;"
      ></div>
    }

    <nxt1-auth-shell
      variant="card-glass"
      [showBackButton]="showEmailForm() || showTeamCodeInput()"
      (backClick)="onBackClick()"
      [attr.data-testid]="
        mode() === 'login' ? AUTH_PAGE_TEST_IDS.LOGIN_PAGE : AUTH_PAGE_TEST_IDS.SIGNUP_PAGE
      "
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
          [showTeamCode]="false"
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
  `,
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage implements OnInit {
  // ============================================
  // DEV CONSTANTS
  // ============================================
  readonly environment = environment;

  // ============================================
  // TEST ID CONSTANTS (for template access)
  // ============================================
  readonly AUTH_PAGE_TEST_IDS = AUTH_PAGE_TEST_IDS;

  // ============================================
  // DEV RESET STATE (triple-tap detection)
  // ============================================
  private devTapCount = 0;
  private devTapTimer: ReturnType<typeof setTimeout> | null = null;

  // ============================================
  // DEPENDENCIES
  // ============================================
  readonly authFlow = inject(AuthFlowService);
  private readonly authApi = inject(AuthApiService);
  private readonly inviteApi = inject(InviteApiService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly nav = inject(AuthNavigationService);
  private readonly route = inject(ActivatedRoute);
  readonly biometricService = inject(BiometricService);
  private readonly logger = inject(NxtLoggingService).child('AuthPage');

  // ============================================
  // AUTH STATE
  // ============================================

  /** Current auth mode: login or signup */
  readonly mode = signal<AuthMode>('login');

  /** Whether to show email form vs social buttons */
  readonly showEmailForm = signal(false);

  // ============================================
  // BIOMETRIC STATE
  // ============================================

  /** Whether biometric authentication is in progress */
  readonly biometricAuthenticating = signal(false);

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

  async ngOnInit(): Promise<void> {
    // Initialize biometric and auto-trigger if enrolled (professional UX like Instagram/banking)
    await this.initializeBiometricAndAutoTrigger();

    // Restore invite data from URL params to sessionStorage (for cross-device/session persistence)
    await this.restoreInviteDataFromUrl();

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

  /**
   * @remarks Supports both deep links (minimal URL) and full URLs with params
   */
  private async restoreInviteDataFromUrl(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;

    try {
      const storedData = await Preferences.get({ key: PENDING_REFERRAL_KEY });
      if (storedData.value) {
        const referral = JSON.parse(storedData.value) as PendingReferral;
        const maxAge = 24 * 60 * 60 * 1000;
        if (Date.now() - referral.timestamp < maxAge) {
          sessionStorage.setItem(PENDING_REFERRAL_KEY, storedData.value);

          this.logger.info('Restored invite data from native storage', {
            code: referral.code,
            teamName: referral.teamName,
            sport: referral.sport,
          });

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
          return;
        } else {
          await Preferences.remove({ key: PENDING_REFERRAL_KEY });
        }
      }

      // Support ?invite=NXT-CPEKC0 (new format from join page) or legacy ?ref=
      const inviteCode = params.get('invite') || params.get('ref');
      if (!inviteCode) return;
      this.logger.info('Processing invite from URL param', { inviteCode });

      // Use /invite/validate to resolve full metadata (type, inviterUid, teamCode, etc.)
      let resolvedTeamCode: string | undefined;
      let inviterUid = '';
      let inviteType = 'general';
      let resolvedTeamName: string | undefined;
      let resolvedSport: string | undefined;
      try {
        const validateResult = await this.inviteApi.validateCode(inviteCode);
        if (!validateResult.valid) {
          this.logger.warn('Invalid invite code from URL param', { inviteCode });
          return;
        }
        inviterUid = validateResult.inviterUid ?? '';
        inviteType = validateResult.type ?? 'general';
        resolvedTeamCode = validateResult.teamCode;
        resolvedTeamName = validateResult.teamName;
        resolvedSport = validateResult.sport;
      } catch (err) {
        this.logger.warn('Failed to validate invite code from URL param', { error: err });
        return;
      }

      let teamData: ValidatedTeamInfo | undefined;
      if (inviteType === 'team' && resolvedTeamCode) {
        try {
          const result = await this.authApi.validateTeamCode(resolvedTeamCode);
          if (result.valid && result.teamCode) {
            teamData = result.teamCode;
            resolvedTeamName = teamData.teamName;
            resolvedSport = teamData.sport;
            this.validatedTeam.set(teamData);
            this.logger.info('Fetched team data from invite code', {
              teamId: teamData.id,
              teamName: teamData.teamName,
              sport: teamData.sport,
            });
          }
        } catch (err) {
          this.logger.warn('Failed to fetch team data from invite code', { error: err });
        }
      }

      const pendingReferral: PendingReferral = {
        code: inviteCode,
        inviterUid,
        type: inviteType,
        teamId: teamData?.id,
        teamCode: resolvedTeamCode,
        teamName: resolvedTeamName,
        sport: resolvedSport,
        teamType: teamData?.teamType,
        role: params.get('role') || undefined,
        timestamp: Date.now(),
      };
      const jsonData = JSON.stringify(pendingReferral);
      await Preferences.set({ key: PENDING_REFERRAL_KEY, value: jsonData });
      sessionStorage.setItem(PENDING_REFERRAL_KEY, jsonData);
      if (teamData?.sport) {
        await Preferences.set({ key: INVITE_SPORT_KEY, value: teamData.sport });
        sessionStorage.setItem(INVITE_SPORT_KEY, teamData.sport);
      }

      this.logger.info('Restored and stored invite data from URL', {
        code: inviteCode,
        teamName: teamData?.teamName,
        sport: teamData?.sport,
      });
    } catch (err) {
      this.logger.error('Failed to restore invite data', { error: err });
    }
  }

  /**
   * Initialize biometric and AUTO-TRIGGER if enrolled
   *
   * Professional UX (like Instagram, Chase, 1Password):
   * - Immediately attempts Face ID/Touch ID on page load
   * - If user cancels, they can use other auth methods
   * - No visible button - seamless automatic experience
   */
  private async initializeBiometricAndAutoTrigger(): Promise<void> {
    try {
      const _availability = await this.biometricService.initialize();
      await this.biometricService.loadEnrollmentStatus();

      this.logger.debug('Biometric initialized', {
        available: this.biometricService.isAvailable(),
        enrolled: this.biometricService.isEnrolled(),
        type: this.biometricService.biometryType(),
        name: this.biometricService.biometryName(),
      });

      // AUTO-TRIGGER: If enrolled, immediately attempt biometric login
      if (this.biometricService.isReadyForLogin() && this.mode() === 'login') {
        this.logger.debug('Auto-triggering biometric authentication');

        // Small delay for page to render first
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Trigger biometric authentication automatically
        await this.performBiometricLogin();
      }
    } catch (error) {
      this.logger.error('Biometric initialization failed', error);
    }
  }

  /**
   * Perform biometric authentication (used by auto-trigger)
   * Silently handles cancellation - user can still use other auth methods
   */
  private async performBiometricLogin(): Promise<void> {
    this.biometricAuthenticating.set(true);

    try {
      const credentials = await this.biometricService.authenticateAndGetCredentials();

      if (credentials) {
        // Success - authenticate with stored credentials
        await this.haptics.notification('success');

        const success = await this.authFlow.signInWithEmail({
          email: credentials.email,
          password: credentials.password,
        });

        if (!success) {
          // Credentials might be outdated
          this.logger.warn('Biometric login failed - credentials may be outdated');
          await this.haptics.notification('error');
        }
      } else {
        // User cancelled - that's fine, they can use other methods
        this.logger.debug('Biometric cancelled, showing normal auth options');
      }
    } catch (error) {
      this.logger.error('Biometric login error', error);
    } finally {
      this.biometricAuthenticating.set(false);
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
   * Update URL query params based on current state.
   * Uses Location.replaceState() instead of Router.navigate() to avoid
   * triggering Ionic's page lifecycle which causes a visible reload.
   */
  private updateUrl(): void {
    const params = new URLSearchParams();

    if (this.mode() === 'signup') {
      params.set('mode', 'signup');
    }

    if (this.validatedTeam()) {
      params.set('code', this.validatedTeam()!.code);
    }

    const query = params.toString();
    const path = query ? `/auth?${query}` : '/auth';
    this.location.replaceState(path);
  }

  /**
   * Handle back button click.
   * Only updates signals — no URL manipulation to avoid Ionic page reload.
   * Matches onboarding's onBack() pattern (signal-only state transitions).
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

      // Always skip navigation for email auth - we'll handle it after biometric check
      if (this.mode() === 'login') {
        const success = await this.authFlow.signInWithEmail({
          email: data.email,
          password: data.password,
          skipNavigation: true, // Always skip - we'll navigate after biometric check
        });

        if (success) {
          await this.haptics.notification('success');
          // Check if we should offer biometric enrollment
          await this.handlePostAuthBiometric(data.email, data.password);
        } else {
          await this.haptics.notification('error');
        }
      } else {
        const success = await this.authFlow.signUpWithEmail({
          email: data.email,
          password: data.password,
          teamCode: this.validatedTeam()?.code,
          skipNavigation: true, // Always skip - we'll navigate after biometric check
        });

        if (success) {
          await this.haptics.notification('success');
          // Check if we should offer biometric enrollment
          await this.handlePostAuthBiometric(data.email, data.password);
        } else {
          await this.haptics.notification('error');
        }
      }
    } catch {
      await this.haptics.notification('error');
    }
  }

  /**
   * Handle biometric enrollment check after successful authentication
   * This is called AFTER auth succeeds, BEFORE navigation
   *
   * Uses NATIVE biometric prompt only (no custom UI) for a clean,
   * trusted experience that users recognize from other apps.
   */
  private async handlePostAuthBiometric(email: string, password: string): Promise<void> {
    // Re-initialize biometric to get fresh status
    const availability = await this.biometricService.initialize();
    await this.biometricService.loadEnrollmentStatus();

    this.logger.debug('Post-auth biometric check', {
      available: availability.available,
      enrolled: this.biometricService.isEnrolled(),
      biometryType: availability.biometryType,
    });

    // Check if we should offer biometric enrollment
    if (availability.available && !this.biometricService.isEnrolled()) {
      // Small delay for better UX (let auth animation finish)
      await new Promise((resolve) => setTimeout(resolve, 300));

      await this.haptics.impact('light');

      // Use NATIVE biometric prompt (Face ID / Touch ID / Fingerprint dialog)
      // No custom modal - shows the real system dialog
      const result = await this.biometricService.promptNativeEnrollment(email, password);

      this.logger.debug('Native biometric enrollment result', result);

      if (result.enrolled) {
        await this.haptics.notification('success');
        this.logger.debug('Biometric enrollment successful');
      } else if (result.reason === 'cancelled') {
        // User tapped "Not Now" - that's fine, continue
        this.logger.debug('User skipped biometric enrollment');
      } else {
        this.logger.warn('Biometric enrollment failed');
      }
    }

    // Navigate after prompt is handled (or skipped)
    await this.authFlow.navigateToPostAuthDestination();
  }

  // ============================================
  // SOCIAL AUTH ACTIONS
  // ============================================

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

  /** Navigate to forgot password page with Ionic slide animation */
  onForgotPassword(): void {
    this.nav.navigateForward('/auth/forgot-password');
  }

  // ============================================
  // DEV RESET (Triple-tap to clear all auth/onboarding state)
  // ============================================

  /**
   * DEV ONLY: Reset biometric enrollment to test the prompt again
   */
  async onResetBiometric(): Promise<void> {
    if (environment.production) return;

    await this.biometricService.clearEnrollment();
    await this.haptics.notification('success');
    this.logger.debug('[DEV] Biometric enrollment cleared! Sign in again to see the prompt.');
  }

  /**
   * Handle dev area tap - triggers reset after 3 rapid taps
   * Only available in non-production builds
   */
  async onDevTap(): Promise<void> {
    if (environment.production) return;

    this.devTapCount++;

    // Reset counter after 1 second of no taps
    if (this.devTapTimer) {
      clearTimeout(this.devTapTimer);
    }
    this.devTapTimer = setTimeout(() => {
      this.devTapCount = 0;
    }, 1000);

    // Trigger reset on 3rd tap
    if (this.devTapCount >= 3) {
      this.devTapCount = 0;
      await this.performDevReset();
    }
  }

  /**
   * Clear all auth and onboarding state for development
   */
  private async performDevReset(): Promise<void> {
    try {
      await this.haptics.notification('warning');

      // Clear all onboarding-related keys
      const keysToRemove = [
        'nxt1_onboarding_session',
        'nxt1_onboarding_step',
        'nxt1_onboarding_form_data',
        'nxt1_onboarding_selected_role',
        'nxt1_onboarding_completed',
        'nxt1_user_profile',
        'nxt1_auth_token',
        'nxt1_refresh_token',
        'nxt1_user_id',
        'nxt1_biometric_enrolled',
        'nxt1_biometric_last_email',
      ];

      for (const key of keysToRemove) {
        await Preferences.remove({ key });
        localStorage.removeItem(key);
      }

      // Clear biometric enrollment
      await this.biometricService.clearEnrollment();

      // Sign out from Firebase
      await this.authFlow.signOut();

      await this.haptics.notification('success');

      this.logger.debug('[DEV] Auth, onboarding & biometric state cleared!');

      // Force reload the app
      window.location.reload();
    } catch (error) {
      this.logger.error('[DEV] Reset failed', error);
      await this.haptics.notification('error');
    }
  }
}
