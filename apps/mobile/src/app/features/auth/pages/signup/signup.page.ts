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
  selector: 'app-signup',
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
export class SignupPage {
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
