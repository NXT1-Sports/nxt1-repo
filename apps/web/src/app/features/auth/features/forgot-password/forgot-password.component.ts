import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonContent, IonInput, IonButton, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mailOutline, arrowBackOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { NxtPlatformService } from '@nxt1/ui/services';
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
          <picture>
            <source srcset="assets/shared/logo/logo.avif" type="image/avif" />
            <img
              src="assets/shared/logo/logo.png"
              alt="NXT1 Sports"
              class="nxt1-logo nxt1-logo--auth"
            />
          </picture>
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
            <div class="text-center py-6">
              <ion-icon
                name="checkmark-circle-outline"
                class="text-[64px] text-success mb-4"
              ></ion-icon>
              <h2 class="text-xl font-semibold mb-2">Email Sent!</h2>
              <p class="text-text-secondary text-sm mb-6">
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
          <a routerLink="/auth/login" class="inline-flex items-center gap-1 text-text-secondary hover:text-primary transition-colors">
            <ion-icon name="arrow-back-outline" class="text-lg"></ion-icon>
            Back to Sign In
          </a>
        </div>
      </div>
    </ion-content>
  `,
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  readonly authFlow = inject(AuthFlowService);
  private readonly platform = inject(NxtPlatformService);

  email = '';
  emailSent = signal(false);

  constructor() {
    // Only register icons in browser (SSR-safe)
    if (this.platform.isBrowser()) {
      addIcons({ mailOutline, arrowBackOutline, checkmarkCircleOutline });
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.email) return;

    const success = await this.authFlow.sendPasswordResetEmail(this.email);
    if (success) {
      this.emailSent.set(true);
    }
  }
}
