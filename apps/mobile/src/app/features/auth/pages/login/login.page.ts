/**
 * @fileoverview Login Page - Native Mobile Authentication
 * @module @nxt1/mobile
 *
 * Professional login page using shared auth components from @nxt1/ui.
 * Demonstrates cross-platform code sharing between web and mobile.
 *
 * Features:
 * - Social sign-in (Google, Apple, Microsoft) via shared AuthSocialButtonsComponent
 * - Email/password sign-in with validation via shared AuthEmailFormComponent
 * - Team code entry for invite flows via shared AuthActionButtonsComponent
 * - Native iOS/Android haptic feedback
 * - Safe area handling for notched devices
 *
 * ⭐ IDENTICAL STRUCTURE TO WEB'S login.component.ts ⭐
 *
 * Architecture:
 *   LoginPage (UI) → AuthFlowService (Domain) → AuthService (Infra)
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
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

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
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
      <!-- Title & Subtitle -->
      <h1 authTitle>Welcome back</h1>
      <p authSubtitle>Sign in to continue to NXT1</p>

      <!-- Social Buttons (default view) -->
      @if (!showEmailForm()) {
        <nxt1-auth-social-buttons
          [loading]="authFlow.isLoading()"
          (googleClick)="onGoogleSignIn()"
          (appleClick)="onAppleSignIn()"
          (microsoftClick)="onMicrosoftSignIn()"
        />

        <nxt1-auth-divider />

        <nxt1-auth-action-buttons
          [loading]="authFlow.isLoading()"
          (emailClick)="onShowEmailForm()"
          (teamCodeClick)="onTeamCode()"
        />
      }

      <!-- Email Form -->
      @if (showEmailForm()) {
        <nxt1-auth-email-form
          mode="login"
          [loading]="authFlow.isLoading()"
          [error]="authFlow.error()"
          (submitForm)="onEmailSubmit($event)"
          (forgotPasswordClick)="onForgotPassword()"
        />
      }

      <!-- Footer -->
      <p authFooter>
        Don't have an account?
        <a routerLink="/auth/signup">Create account</a>
      </p>
    </nxt1-auth-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  // ============================================
  // DEPENDENCIES
  // ============================================
  readonly authFlow = inject(AuthFlowService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);

  // ============================================
  // LOCAL UI STATE
  // ============================================

  /** Whether to show email form vs social buttons */
  readonly showEmailForm = signal(false);

  // ============================================
  // UI ACTIONS (with haptics)
  // ============================================

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
      const success = await this.authFlow.signInWithEmail({
        email: data.email,
        password: data.password,
      });

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
   * Sign in with Google OAuth
   */
  async onGoogleSignIn(): Promise<void> {
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
   * Sign in with Apple ID
   */
  async onAppleSignIn(): Promise<void> {
    await this.haptics.impact('light');
    // Apple Sign-In implementation pending
  }

  /**
   * Sign in with Microsoft Account
   */
  async onMicrosoftSignIn(): Promise<void> {
    await this.haptics.impact('light');
    // Microsoft Sign-In implementation pending
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /** Navigate to forgot password page */
  onForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  /** Navigate to signup with team code flow */
  async onTeamCode(): Promise<void> {
    await this.haptics.impact('light');
    await this.router.navigate(['/auth/signup'], { queryParams: { teamCode: true } });
  }
}
