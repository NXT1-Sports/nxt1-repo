import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonContent, IonInput, IonButton, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mailOutline, arrowBackOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { AuthFlowService } from '../../services';

/**
 * Forgot Password Component
 *
 * Handles password reset flow with design token styling.
 */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    IonContent,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner,
  ],
  template: `
    <ion-content class="auth-page" [fullscreen]="true">
      <div class="auth-page__container">
        <!-- Logo -->
        <div class="auth-page__logo">
          <img src="assets/images/nxt1-logo.svg" alt="NXT1 Sports" />
        </div>

        <!-- Header -->
        <div class="auth-page__header">
          <h1 class="auth-page__title">Reset Password</h1>
          <p class="auth-page__subtitle">Enter your email to receive a reset link</p>
        </div>

        <!-- Error Message -->
        @if (authFlow.error()) {
          <div class="auth-error">
            <span>{{ authFlow.error() }}</span>
            <button type="button" class="auth-error__close" (click)="authFlow.clearError()">
              ×
            </button>
          </div>
        }

        <!-- Success Message -->
        @if (emailSent()) {
          <div class="auth-card">
            <div class="auth-success">
              <ion-icon name="checkmark-circle-outline" class="auth-success__icon"></ion-icon>
              <h2 class="auth-success__title">Email Sent!</h2>
              <p class="auth-success__text">
                Check your inbox for instructions to reset your password.
              </p>
              <ion-button
                expand="block"
                class="auth-button auth-button--primary"
                routerLink="/auth/login"
              >
                Back to Sign In
              </ion-button>
            </div>
          </div>
        } @else {
          <!-- Reset Form -->
          <div class="auth-card">
            <form (ngSubmit)="onSubmit()" class="auth-form">
              <!-- Email -->
              <div class="auth-form__group">
                <label class="auth-form__label">Email</label>
                <ion-input
                  type="email"
                  [(ngModel)]="email"
                  name="email"
                  placeholder="Enter your email"
                  class="auth-input"
                  fill="outline"
                  autocomplete="email"
                >
                  <ion-icon slot="start" name="mail-outline" aria-hidden="true"></ion-icon>
                </ion-input>
              </div>

              <!-- Submit Button -->
              <ion-button
                type="submit"
                expand="block"
                class="auth-button auth-button--primary"
                [disabled]="authFlow.isLoading() || !email"
              >
                @if (authFlow.isLoading()) {
                  <ion-spinner name="crescent"></ion-spinner>
                } @else {
                  Send Reset Link
                }
              </ion-button>
            </form>
          </div>
        }

        <!-- Footer -->
        <div class="auth-footer">
          <a routerLink="/auth/login" class="auth-link">
            <ion-icon name="arrow-back-outline"></ion-icon>
            Back to Sign In
          </a>
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .auth-success {
        text-align: center;
        padding: var(--spacing-lg, 24px) 0;

        &__icon {
          font-size: 64px;
          color: var(--ion-color-success, #4caf50);
          margin-bottom: var(--spacing-md, 16px);
        }

        &__title {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: var(--spacing-sm, 8px);
        }

        &__text {
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
          font-size: 0.875rem;
          margin-bottom: var(--spacing-lg, 24px);
        }
      }

      .auth-footer .auth-link {
        display: inline-flex;
        align-items: center;
        gap: var(--spacing-xs, 4px);

        ion-icon {
          font-size: 18px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  readonly authFlow = inject(AuthFlowService);

  email = '';
  emailSent = signal(false);

  constructor() {
    addIcons({ mailOutline, arrowBackOutline, checkmarkCircleOutline });
  }

  async onSubmit(): Promise<void> {
    if (!this.email) return;

    const success = await this.authFlow.sendPasswordResetEmail(this.email);
    if (success) {
      this.emailSent.set(true);
    }
  }
}
