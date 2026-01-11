/**
 * @fileoverview Login Component - Using Shared Auth Components
 * @module @nxt1/web
 *
 * Professional login page using shared auth components from @nxt1/core.
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
} from '@nxt1/core';
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

        <div class="secondary-buttons">
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
  styles: [
    `
      .secondary-buttons {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
      }

      .action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        width: 100%;
        height: 48px;
        padding: 0 16px;
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        border-radius: 12px;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        color: var(--nxt1-color-text-primary, #ffffff);
        font-family: var(--nxt1-font-family-brand, system-ui);
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;

        ion-icon {
          font-size: 20px;
          color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        }

        &:hover:not(:disabled) {
          background: var(--nxt1-color-surface-300, #222222);
          border-color: var(--nxt1-color-border-hover, rgba(255, 255, 255, 0.2));
        }

        &:active:not(:disabled) {
          transform: scale(0.98);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .action-btn--outline {
        background: transparent;
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));

        &:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.05);
        }
      }
    `,
  ],
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
