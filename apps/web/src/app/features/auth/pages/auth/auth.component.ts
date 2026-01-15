/**
 * @fileoverview Unified Auth Component - Login & Signup Combined
 * @module @nxt1/web
 *
 * Professional unified authentication page using shared auth components from @nxt1/ui.
 * Combines login and signup functionality into a single seamless experience.
 * Features two-column layout with QR codes for app download on desktop.
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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import {
  AuthShellComponent,
  AuthSocialButtonsComponent,
  AuthActionButtonsComponent,
  AuthDividerComponent,
  AuthEmailFormComponent,
  AuthAppDownloadComponent,
  AuthModeSwitcherComponent,
  AuthTermsDisclaimerComponent,
  type AuthEmailFormData,
  type AuthMode,
} from '@nxt1/ui/auth';
import { AuthFlowService } from '../../services';
import { SeoService } from '../../../../core/services';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AuthShellComponent,
    AuthSocialButtonsComponent,
    AuthActionButtonsComponent,
    AuthDividerComponent,
    AuthEmailFormComponent,
    AuthAppDownloadComponent,
    AuthModeSwitcherComponent,
    AuthTermsDisclaimerComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="card-glass"
      [showBackButton]="showEmailForm()"
      [showSidePanel]="!showEmailForm()"
      (backClick)="onBackClick()"
    >
      <!-- Title & Subtitle -->
      <h1 authTitle class="text-text-primary text-2xl font-bold">{{ title() }}</h1>
      <p authSubtitle class="text-text-secondary mb-2 text-sm">{{ subtitle() }}</p>

      <!-- Main Content: Social Buttons OR Email Form -->
      <div authContent>
        @if (!showEmailForm()) {
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
          />
        } @else {
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);

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

    // Check for team code query param - auto-show email form in signup mode
    if (this.route.snapshot.queryParamMap.get('teamCode')) {
      this.mode.set('signup');
      this.showEmailForm.set(true);
    }
  }

  /**
   * Set auth mode and update URL
   */
  setMode(newMode: AuthMode): void {
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
   * Handle back button click - reset to social view and clear mode
   */
  onBackClick(): void {
    this.authFlow.clearError();
    this.showEmailForm.set(false);
    this.mode.set('login');
    this.updateUrl();
  }

  /**
   * Submit email/password credentials
   */
  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    this.authFlow.clearError();
    try {
      if (this.mode() === 'login') {
        await this.authFlow.signInWithEmail({
          email: data.email,
          password: data.password,
        });
      } else {
        await this.authFlow.signUpWithEmail({
          email: data.email,
          password: data.password,
        });
      }
    } catch {
      // Error is handled by auth flow service
    }
  }

  /**
   * Sign in/up with Google OAuth
   */
  async onGoogleAuth(): Promise<void> {
    try {
      await this.authFlow.signInWithGoogle();
    } catch {
      // Error handled by service
    }
  }

  /**
   * Sign in/up with Apple ID
   */
  async onAppleAuth(): Promise<void> {
    // Apple Sign In - placeholder for future integration
  }

  /**
   * Sign in/up with Microsoft Account
   */
  async onMicrosoftAuth(): Promise<void> {
    // Microsoft Sign In - placeholder for future integration
  }

  /**
   * Navigate to forgot password page
   */
  onForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  /**
   * Handle team code flow - show email form in signup mode
   */
  onTeamCode(): void {
    this.mode.set('signup');
    this.showEmailForm.set(true);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mode: 'signup', teamCode: true },
      queryParamsHandling: '',
      replaceUrl: true,
    });
  }

  /**
   * Show email form (defaults to current mode)
   */
  onShowEmailForm(): void {
    this.showEmailForm.set(true);
  }
}
