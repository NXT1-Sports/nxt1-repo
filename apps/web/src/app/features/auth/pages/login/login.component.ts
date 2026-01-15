/**
 * @fileoverview Login Component - Using Shared Auth Components
 * @module @nxt1/web
 *
 * Professional login page using shared auth components from @nxt1/ui.
 * Demonstrates cross-platform code sharing between web and mobile.
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
  selector: 'app-login',
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
      variant="card-glass"
      [showBackButton]="showEmailForm()"
      (backClick)="showEmailForm.set(false)"
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
          (emailClick)="showEmailForm.set(true)"
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
export class LoginComponent {
  readonly authFlow = inject(AuthFlowService);
  private readonly router = inject(Router);

  showEmailForm = signal(false);

  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    try {
      await this.authFlow.signInWithEmail({
        email: data.email,
        password: data.password,
      });
    } catch {
      // Error is handled by auth flow service
    }
  }

  async onGoogleSignIn(): Promise<void> {
    try {
      await this.authFlow.signInWithGoogle();
    } catch {
      // Error handled by service
    }
  }

  async onAppleSignIn(): Promise<void> {
    // Apple Sign In requires native SDK on mobile, web uses redirect
    // Currently not implemented - placeholder for future integration
  }

  async onMicrosoftSignIn(): Promise<void> {
    // Microsoft Sign In requires Azure AD configuration
    // Currently not implemented - placeholder for future integration
  }

  onForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  onTeamCode(): void {
    // Navigate to signup with team code flow
    this.router.navigate(['/auth/signup'], { queryParams: { teamCode: true } });
  }
}
