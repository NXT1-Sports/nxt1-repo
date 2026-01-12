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
  AuthDividerComponent,
  AuthEmailFormComponent,
  type AuthEmailFormData,
} from '@nxt1/ui/auth';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mailOutline, keyOutline } from 'ionicons/icons';
import { AuthFlowService } from '../../services';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AuthShellComponent,
    AuthSocialButtonsComponent,
    AuthDividerComponent,
    AuthEmailFormComponent,
    IonIcon,
  ],
  template: `
    <nxt1-auth-shell
      variant="wide"
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
          <button
            type="button"
            class="action-btn"
            [disabled]="authFlow.isLoading()"
            (click)="showEmailForm.set(true)"
          >
            <ion-icon name="mail-outline"></ion-icon>
            <span>Continue with Email</span>
          </button>

          <button
            type="button"
            class="action-btn action-btn--outline"
            [disabled]="authFlow.isLoading()"
            (click)="onTeamCode()"
          >
            <ion-icon name="key-outline"></ion-icon>
            <span>Have a Team Code?</span>
          </button>
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
        <a routerLink="/auth/signup">Create account</a>
      </p>

      <!-- Terms -->
      <p authTerms>
        By continuing, you agree to NXT1's
        <a href="/terms">Terms of Service</a>
        and
        <a href="/privacy">Privacy Policy</a>
      </p>
    </nxt1-auth-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly authFlow = inject(AuthFlowService);
  private readonly router = inject(Router);

  showEmailForm = signal(false);

  constructor() {
    addIcons({ mailOutline, keyOutline });
  }

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
    // TODO: Implement Apple Sign In
    console.log('Apple Sign In - not yet implemented');
  }

  async onMicrosoftSignIn(): Promise<void> {
    // TODO: Implement Microsoft Sign In
    console.log('Microsoft Sign In - not yet implemented');
  }

  onForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  onTeamCode(): void {
    // TODO: Implement Team Code flow
    console.log('Team Code');
  }
}
