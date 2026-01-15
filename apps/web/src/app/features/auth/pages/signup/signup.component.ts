/**
 * @fileoverview Signup Component - Using Shared Auth Components
 * @module @nxt1/web
 *
 * Professional signup page using shared auth components from @nxt1/ui.
 * Demonstrates cross-platform code sharing between web and mobile.
 *
 * ⭐ MATCHES MOBILE'S signup.page.ts INTERFACE ⭐
 */

import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  AuthShellComponent,
  AuthSocialButtonsComponent,
  AuthActionButtonsComponent,
  AuthDividerComponent,
  AuthEmailFormComponent,
  type AuthEmailFormData,
} from '@nxt1/ui/auth';
import { AuthFlowService } from '../../services';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AuthShellComponent,
    AuthSocialButtonsComponent,
    AuthActionButtonsComponent,
    AuthDividerComponent,
    AuthEmailFormComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="card"
      [showBackButton]="showEmailForm()"
      (backClick)="showEmailForm.set(false)"
    >
      <!-- Title & Subtitle -->
      <h1 authTitle>Create Account</h1>
      <p authSubtitle>Join NXT1 to start your recruiting journey</p>

      <!-- Social Buttons (default view) -->
      @if (!showEmailForm()) {
        <nxt1-auth-social-buttons
          [loading]="authFlow.isLoading()"
          (googleClick)="onGoogleSignUp()"
          (appleClick)="onAppleSignUp()"
          (microsoftClick)="onMicrosoftSignUp()"
        />

        <nxt1-auth-divider />

        <nxt1-auth-action-buttons
          [loading]="authFlow.isLoading()"
          (emailClick)="showEmailForm.set(true)"
          (teamCodeClick)="onTeamCode()"
        />
      }

      <!-- Email Form -->
      @if (showEmailForm()) {
        <nxt1-auth-email-form
          mode="signup"
          [loading]="authFlow.isLoading()"
          [error]="authFlow.error()"
          (submitForm)="onEmailSubmit($event)"
        />
      }

      <!-- Footer -->
      <p authFooter>
        Already have an account?
        <a routerLink="/auth/login">Sign In</a>
      </p>

      <!-- Terms -->
      <p authTerms>
        By creating an account, you agree to NXT1's
        <a href="/terms">Terms of Service</a>
        and
        <a href="/privacy">Privacy Policy</a>
      </p>
    </nxt1-auth-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  readonly authFlow = inject(AuthFlowService);
  private readonly router = inject(Router);

  showEmailForm = signal(false);

  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    this.authFlow.clearError();
    try {
      // Parse displayName into first/last name if provided
      const [firstName = '', lastName = ''] = (data.displayName || '').trim().split(/\s+/, 2);

      await this.authFlow.signUpWithEmail({
        email: data.email,
        password: data.password,
        firstName,
        lastName,
      });
    } catch {
      // Error is handled by auth flow service
    }
  }

  async onGoogleSignUp(): Promise<void> {
    try {
      await this.authFlow.signInWithGoogle();
    } catch {
      // Error handled by service
    }
  }

  async onAppleSignUp(): Promise<void> {
    // Apple Sign In - placeholder for future integration
  }

  async onMicrosoftSignUp(): Promise<void> {
    // Microsoft Sign In - placeholder for future integration
  }

  onTeamCode(): void {
    // Navigate to signup with team code flow
    this.router.navigate(['/auth/signup'], { queryParams: { teamCode: true } });
  }
}
