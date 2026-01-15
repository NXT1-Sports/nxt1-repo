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
  type AuthEmailFormData,
} from '@nxt1/ui/auth';
import { AuthFlowService } from '../../services';
import { HapticsService } from '@nxt1/ui/services';

type AuthMode = 'login' | 'signup';

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
        <div class="mode-toggle">
          <button
            type="button"
            class="mode-tab"
            [class.active]="mode() === 'login'"
            (click)="setMode('login')"
          >
            Sign In
          </button>
          <button
            type="button"
            class="mode-tab"
            [class.active]="mode() === 'signup'"
            (click)="setMode('signup')"
          >
            Sign Up
          </button>
        </div>

        <nxt1-auth-email-form
          [mode]="mode()"
          [loading]="authFlow.isLoading()"
          [error]="authFlow.error()"
          (submitForm)="onEmailSubmit($event)"
          (forgotPasswordClick)="onForgotPassword()"
        />
      }

      <!-- Terms (only show for signup) -->
      @if (mode() === 'signup') {
        <p authTerms>
          By creating an account, you agree to NXT1's
          <a href="/terms">Terms of Service</a>
          and
          <a href="/privacy">Privacy Policy</a>
        </p>
      }
    </nxt1-auth-shell>
  `,
  styles: [
    `
      .mode-toggle {
        display: flex;
        background: var(--nxt1-color-surface-200, #f5f5f5);
        border-radius: 12px;
        padding: 4px;
        gap: 4px;
        margin-bottom: 12px;
      }

      .mode-tab {
        flex: 1;
        padding: 10px 16px;
        border: none;
        background: transparent;
        border-radius: 8px;
        font-family: var(--nxt1-fontFamily-brand, inherit);
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, #666);
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .mode-tab:hover:not(.active) {
        color: var(--nxt1-color-text-primary, #333);
      }

      .mode-tab.active {
        background: var(--nxt1-color-bg-primary, #fff);
        color: var(--nxt1-color-text-primary, #000);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
    `,
  ],
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

  /**
   * Toggle between login and signup modes (legacy - keeping for compatibility)
   */
  async toggleMode(): Promise<void> {
    await this.haptics.impact('light');
    this.authFlow.clearError();
    this.mode.update((current) => (current === 'login' ? 'signup' : 'login'));
    this.updateUrl();
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
        // Parse displayName into first/last name if provided
        const [firstName = '', lastName = ''] = (data.displayName || '').trim().split(/\s+/, 2);

        const success = await this.authFlow.signUpWithEmail({
          email: data.email,
          password: data.password,
          firstName,
          lastName,
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
