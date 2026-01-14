import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
  IonInputPasswordToggle,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  mailOutline,
  lockClosedOutline,
  personOutline,
  logoGoogle,
  logoApple,
} from 'ionicons/icons';
import { NxtPlatformService } from '@nxt1/ui/services';
import { AuthFlowService } from '../../services';

/**
 * Signup Component
 *
 * Handles new user registration with design token styling.
 */
@Component({
  selector: 'app-signup',
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
    IonInputPasswordToggle,
  ],
  template: `
    <ion-content class="auth-page h-screen" [fullscreen]="true" data-testid="signup-page">
      <div class="auth-page__container">
        <!-- Logo -->
        <div class="auth-page__logo" data-testid="signup-logo">
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
          <h1 class="auth-page__title" data-testid="signup-title">Create Account</h1>
          <p class="auth-page__subtitle" data-testid="signup-subtitle">Join the NXT1 Sports community</p>
        </div>

        <!-- Error Message -->
        @if (authFlow.error()) {
          <div class="auth-error" data-testid="signup-error">
            <span data-testid="signup-error-message">{{ authFlow.error() }}</span>
            <button type="button" class="auth-error__close" (click)="authFlow.clearError()" data-testid="signup-error-close">
              ×
            </button>
          </div>
        }

        <!-- Signup Form -->
        <div class="auth-card">
          <form (ngSubmit)="onSubmit()" class="auth-form" data-testid="signup-form">
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
                data-testid="signup-input-email"
              >
                <ion-icon slot="start" name="mail-outline" aria-hidden="true"></ion-icon>
              </ion-input>
            </div>

            <!-- Password -->
            <div class="auth-form__group">
              <label class="auth-form__label">Password</label>
              <ion-input
                [type]="showPassword() ? 'text' : 'password'"
                [(ngModel)]="password"
                name="password"
                placeholder="Create a password (min 6 characters)"
                class="auth-input"
                fill="outline"
                autocomplete="new-password"
                data-testid="signup-input-password"
              >
                <ion-icon slot="start" name="lock-closed-outline" aria-hidden="true"></ion-icon>
                <ion-input-password-toggle slot="end" data-testid="signup-toggle-password"></ion-input-password-toggle>
              </ion-input>
            </div>

            <!-- Confirm Password -->
            <div class="auth-form__group">
              <label class="auth-form__label">Confirm Password</label>
              <ion-input
                [type]="showConfirmPassword() ? 'text' : 'password'"
                [(ngModel)]="confirmPassword"
                name="confirmPassword"
                placeholder="Confirm your password"
                class="auth-input"
                fill="outline"
                autocomplete="new-password"
                data-testid="signup-input-confirm-password"
              >
                <ion-icon slot="start" name="lock-closed-outline" aria-hidden="true"></ion-icon>
                <ion-input-password-toggle slot="end" data-testid="signup-toggle-confirm-password"></ion-input-password-toggle>
              </ion-input>
            </div>

            <!-- Team Code (Optional) -->
            @if (teamCodeEnabled()) {
              <div class="auth-form__group">
                <label class="auth-form__label">Team Code (Optional)</label>
                <ion-input
                  type="text"
                  [(ngModel)]="teamCode"
                  name="teamCode"
                  placeholder="Enter team code if you have one"
                  class="auth-input"
                  fill="outline"
                  data-testid="signup-input-teamcode"
                >
                  <ion-icon slot="start" name="person-outline" aria-hidden="true"></ion-icon>
                </ion-input>
              </div>
            }

            <!-- Submit Button -->
            <ion-button
              type="submit"
              expand="block"
              class="auth-button auth-button--primary"
              [disabled]="authFlow.isLoading() || !isFormValid()"
              data-testid="signup-submit-button"
            >
              @if (authFlow.isLoading()) {
                <ion-spinner name="crescent" data-testid="signup-loading-spinner"></ion-spinner>
              } @else {
                Create Account
              }
            </ion-button>
          </form>

          <!-- Divider -->
          <div class="auth-divider">
            <span class="auth-divider__text">OR</span>
          </div>

          <!-- Social Buttons -->
          <div class="auth-social" data-testid="signup-social-buttons">
            <ion-button
              expand="block"
              class="auth-button auth-button--google"
              (click)="onGoogleSignUp()"
              [disabled]="authFlow.isLoading()"
              data-testid="signup-btn-google"
            >
              <ion-icon slot="start" name="logo-google"></ion-icon>
              Continue with Google
            </ion-button>

            <ion-button
              expand="block"
              class="auth-button auth-button--apple"
              (click)="onAppleSignUp()"
              [disabled]="authFlow.isLoading()"
              data-testid="signup-btn-apple"
            >
              <ion-icon slot="start" name="logo-apple"></ion-icon>
              Continue with Apple
            </ion-button>
          </div>
        </div>

        <!-- Footer -->
        <div class="auth-footer" data-testid="signup-footer">
          <p class="auth-footer__text">
            Already have an account?
            <a routerLink="/auth/login" class="auth-link" data-testid="signup-link-login">Sign In</a>
          </p>
          <p class="auth-footer__legal">
            By continuing, you agree to our
            <a href="/terms" class="auth-link auth-link--subtle" data-testid="signup-link-terms">Terms of Service</a>
            and
            <a href="/privacy" class="auth-link auth-link--subtle" data-testid="signup-link-privacy">Privacy Policy</a>
          </p>
        </div>
      </div>
    </ion-content>
  `,
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  readonly authFlow = inject(AuthFlowService);
  private readonly platform = inject(NxtPlatformService);

  email = '';
  password = '';
  confirmPassword = '';
  teamCode = '';

  showPassword = signal(false);
  showConfirmPassword = signal(false);

  teamCodeEnabled = () => true; // Could be feature flag

  constructor() {
    // Only register icons in browser (SSR-safe)
    if (this.platform.isBrowser()) {
      addIcons({ mailOutline, lockClosedOutline, personOutline, logoGoogle, logoApple });
    }
  }

  isFormValid(): boolean {
    return (
      this.email.length > 0 && this.password.length >= 6 && this.password === this.confirmPassword
    );
  }

  async onSubmit(): Promise<void> {
    if (!this.isFormValid()) return;

    await this.authFlow.signUpWithEmail({
      email: this.email,
      password: this.password,
      teamCode: this.teamCode || undefined,
    });
  }

  async onGoogleSignUp(): Promise<void> {
    await this.authFlow.signInWithGoogle();
  }

  async onAppleSignUp(): Promise<void> {
    // Apple sign in - to be implemented
    console.log('Apple sign up clicked');
  }
}
