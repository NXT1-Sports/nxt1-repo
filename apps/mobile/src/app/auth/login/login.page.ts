/**
 * @fileoverview Login Page - Platform-Adaptive with Haptic Feedback
 * @module @nxt1/mobile
 *
 * Professional login page using shared auth components from @nxt1/ui.
 * Features platform-adaptive Ionic buttons with native haptic feedback.
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
import { MobileAuthService } from '../services/mobile-auth.service';
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
          [loading]="authService.isLoading()"
          (googleClick)="googleSignIn()"
          (appleClick)="appleSignIn()"
          (microsoftClick)="microsoftSignIn()"
        />

        <nxt1-auth-divider />

        <div class="flex flex-col gap-3 w-full">
          <ion-button
            expand="block"
            fill="outline"
            [disabled]="authService.isLoading()"
            (click)="onEmailClick()"
            class="email-button"
          >
            <ion-icon slot="start" name="mail-outline"></ion-icon>
            <span>Continue with Email</span>
          </ion-button>

          <ion-button
            expand="block"
            fill="clear"
            [disabled]="authService.isLoading()"
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
          [loading]="authService.isLoading()"
          [error]="authService.error()"
          (submitForm)="onEmailSubmit($event)"
          (forgotPasswordClick)="onForgotPassword()"
        />
      }

      <!-- Footer -->
      <p authFooter>
        Don't have an account?
        <a routerLink="/auth/register" class="text-primary hover:text-primary-600 transition-colors">
          Create account
        </a>
      </p>

      <!-- Terms -->
      <p authTerms>
        By continuing, you agree to NXT1's
        <a href="/terms" class="text-primary hover:text-primary-600 transition-colors">Terms of Service</a>
        and
        <a href="/privacy" class="text-primary-600 transition-colors">Privacy Policy</a>
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
  readonly authService = inject(MobileAuthService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);

  showEmailForm = signal(false);

  constructor() {
    addIcons({ mailOutline, keyOutline });
  }

  async onEmailClick(): Promise<void> {
    await this.haptics.impact('light');
    this.showEmailForm.set(true);
  }

  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    this.authService.clearError();
    try {
      await this.haptics.impact('medium');
      await this.authService.signIn({
        email: data.email,
        password: data.password,
      });
      await this.haptics.notification('success');
    } catch {
      await this.haptics.notification('error');
      // Error is handled by auth service
    }
  }

  async googleSignIn(): Promise<void> {
    // Haptics handled by social buttons component
    // TODO: Implement Google Sign In
    console.log('Google Sign In');
  }

  async appleSignIn(): Promise<void> {
    // Haptics handled by social buttons component
    // TODO: Implement Apple Sign In
    console.log('Apple Sign In');
  }

  async microsoftSignIn(): Promise<void> {
    // Haptics handled by social buttons component
    // TODO: Implement Microsoft Sign In
    console.log('Microsoft Sign In');
  }

  onForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  async onTeamCode(): Promise<void> {
    await this.haptics.impact('light');
    // TODO: Implement Team Code flow
    console.log('Team Code');
  }
}
