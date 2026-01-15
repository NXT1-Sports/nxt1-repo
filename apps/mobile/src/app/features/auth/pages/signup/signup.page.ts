/**
 * @fileoverview Signup Page - Platform-Adaptive with Haptic Feedback
 * @module @nxt1/mobile
 *
 * Professional signup page using shared auth components from @nxt1/ui.
 * Features platform-adaptive Ionic buttons with native haptic feedback.
 *
 * ⭐ MATCHES WEB'S signup.component.ts INTERFACE ⭐
 */

import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
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
  selector: 'app-signup',
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
      variant="card"
      [showBackButton]="showEmailForm()"
      (backClick)="onBackClick()"
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
          (emailClick)="onEmailClick()"
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
        <a routerLink="/auth/login" class="text-primary hover:text-primary-600 transition-colors">
          Sign In
        </a>
      </p>
    </nxt1-auth-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupPage {
  readonly authFlow = inject(AuthFlowService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);

  showEmailForm = signal(false);

  async onBackClick(): Promise<void> {
    await this.haptics.impact('light');
    this.showEmailForm.set(false);
  }

  async onEmailClick(): Promise<void> {
    await this.haptics.impact('light');
    this.showEmailForm.set(true);
  }

  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    this.authFlow.clearError();
    try {
      await this.haptics.impact('medium');

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
    } catch {
      await this.haptics.notification('error');
    }
  }

  async onGoogleSignUp(): Promise<void> {
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

  async onAppleSignUp(): Promise<void> {
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

  async onMicrosoftSignUp(): Promise<void> {
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

  async onTeamCode(): Promise<void> {
    await this.haptics.impact('light');
    // Navigate to team code entry flow
    await this.router.navigate(['/auth/signup'], { queryParams: { teamCode: true } });
  }
}
