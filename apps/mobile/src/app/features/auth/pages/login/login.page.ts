/**
 * @fileoverview Login Page - Platform-Adaptive with Haptic Feedback
 * @module @nxt1/mobile
 *
 * Professional login page using shared auth components from @nxt1/ui.
 * Features platform-adaptive Ionic buttons with native haptic feedback.
 *
 * ⭐ MATCHES WEB'S login.component.ts INTERFACE ⭐
 */

import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  AuthShellComponent,
  AuthSocialButtonsComponent,
  AuthDividerComponent,
  AuthEmailFormComponent,
  type AuthEmailFormData,
} from '@nxt1/ui/auth';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mailOutline, keyOutline } from 'ionicons/icons';
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
    AuthDividerComponent,
    AuthEmailFormComponent,
    IonButton,
    IonIcon,
  ],
  template: `
    <nxt1-auth-shell
      variant="card"
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

        <div class="flex flex-col gap-3 w-full">
          <ion-button
            expand="block"
            fill="outline"
            [disabled]="authFlow.isLoading()"
            (click)="onEmailClick()"
            class="email-button"
          >
            <ion-icon slot="start" name="mail-outline"></ion-icon>
            <span>Continue with Email</span>
          </ion-button>

          <ion-button
            expand="block"
            fill="clear"
            [disabled]="authFlow.isLoading()"
            (click)="onTeamCode()"
            class="team-button"
          >
            <ion-icon slot="start" name="key-outline"></ion-icon>
            <span>Have a Team Code?</span>
          </ion-button>
        </div>
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
        <a routerLink="/auth/signup" class="text-primary hover:text-primary-600 transition-colors">
          Create account
        </a>
      </p>

      <!-- Terms -->
      <p authTerms>
        By continuing, you agree to NXT1's
        <a href="/terms" class="text-primary hover:text-primary-600 transition-colors">Terms of Service</a>
        and
        <a href="/privacy" class="text-primary hover:text-primary-600 transition-colors">Privacy Policy</a>
      </p>
    </nxt1-auth-shell>
  `,
  styles: [
    `
      .email-button {
        --border-color: var(--nxt1-color-border-default);
        --background: var(--nxt1-color-surface-200);
        --color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-font-family-brand);
        height: 48px;
      }

      .email-button:hover {
        --background: var(--nxt1-color-surface-300);
      }

      .team-button {
        --color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-font-family-brand);
        height: 48px;
      }

      .team-button:hover {
        --background: rgba(255, 255, 255, 0.05);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  readonly authFlow = inject(AuthFlowService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);

  showEmailForm = signal(false);

  constructor() {
    addIcons({ mailOutline, keyOutline });
  }

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

  async onAppleSignIn(): Promise<void> {
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

  async onMicrosoftSignIn(): Promise<void> {
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

  onForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  async onTeamCode(): Promise<void> {
    await this.haptics.impact('light');
    // Navigate to signup with team code flow
    await this.router.navigate(['/auth/signup'], { queryParams: { teamCode: true } });
  }
}
