/**
 * @fileoverview Register Page
 * @module @nxt1/mobile
 *
 * Uses shared design token classes from @nxt1/design-tokens
 * for cross-platform visual consistency.
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonButton,
  IonBackButton,
  IonButtons,
  IonSpinner,
  IonIcon,
  IonInput,
  IonHeader,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personOutline,
  mailOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  logoGoogle,
  logoApple,
  alertCircleOutline,
  chevronBack,
} from 'ionicons/icons';
import { RouterLink } from '@angular/router';
import { MobileAuthService } from '../services/mobile-auth.service';
import { isValidEmail, validatePassword } from '@nxt1/core';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonContent,
    IonButton,
    IonBackButton,
    IonButtons,
    IonSpinner,
    IonIcon,
    IonInput,
    IonHeader,
    IonToolbar,
  ],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/auth/login"></ion-back-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="nxt1-auth-page" [fullscreen]="true">
      <div class="auth-page-wrapper">
        <div class="nxt1-auth-container">
          <!-- Header -->
          <div class="nxt1-auth-header">
            <div class="nxt1-auth-logo">
              <picture>
                <source srcset="assets/shared/logo/logo.avif" type="image/avif" />
                <img
                  src="assets/shared/logo/logo.png"
                  alt="NXT1"
                  class="nxt1-logo nxt1-logo--auth"
                />
              </picture>
            </div>
            <h1 class="nxt1-auth-title">Create Account</h1>
            <p class="nxt1-auth-subtitle">Join NXT1 to start your recruiting journey</p>
          </div>

          <!-- Auth Card -->
          <div class="nxt1-auth-card">
            <!-- Error Message -->
            @if (authService.error()) {
              <div class="nxt1-auth-message nxt1-auth-message--error">
                <ion-icon name="alert-circle-outline"></ion-icon>
                <span>{{ authService.error() }}</span>
              </div>
            }

            <!-- Register Form -->
            <form class="nxt1-auth-form" (ngSubmit)="register()">
              <!-- Name Row -->
              <div class="nxt1-button-group">
                <!-- First Name -->
                <div class="nxt1-form-group">
                  <label class="nxt1-form-label" for="firstName">First Name</label>
                  <div class="nxt1-input-with-icon">
                    <ion-icon name="person-outline"></ion-icon>
                    <ion-input
                      id="firstName"
                      type="text"
                      class="nxt1-auth-input"
                      placeholder="First name"
                      [(ngModel)]="firstName"
                      name="firstName"
                      [disabled]="authService.isLoading()"
                      autocomplete="given-name"
                    ></ion-input>
                  </div>
                </div>

                <!-- Last Name -->
                <div class="nxt1-form-group">
                  <label class="nxt1-form-label" for="lastName">Last Name</label>
                  <div class="nxt1-input-with-icon">
                    <ion-icon name="person-outline"></ion-icon>
                    <ion-input
                      id="lastName"
                      type="text"
                      class="nxt1-auth-input"
                      placeholder="Last name"
                      [(ngModel)]="lastName"
                      name="lastName"
                      [disabled]="authService.isLoading()"
                      autocomplete="family-name"
                    ></ion-input>
                  </div>
                </div>
              </div>

              <!-- Email Input -->
              <div class="nxt1-form-group">
                <label class="nxt1-form-label" for="email">Email</label>
                <div class="nxt1-input-with-icon">
                  <ion-icon name="mail-outline"></ion-icon>
                  <ion-input
                    id="email"
                    type="email"
                    class="nxt1-auth-input"
                    placeholder="Enter your email"
                    [(ngModel)]="email"
                    name="email"
                    [disabled]="authService.isLoading()"
                    autocomplete="email"
                  ></ion-input>
                </div>
              </div>

              <!-- Password Input -->
              <div class="nxt1-form-group">
                <label class="nxt1-form-label" for="password">Password</label>
                <div class="nxt1-input-with-icon">
                  <ion-icon name="lock-closed-outline"></ion-icon>
                  <ion-input
                    id="password"
                    [type]="showPassword ? 'text' : 'password'"
                    class="nxt1-auth-input"
                    placeholder="Create a password (6+ characters)"
                    [(ngModel)]="password"
                    name="password"
                    [disabled]="authService.isLoading()"
                    autocomplete="new-password"
                  ></ion-input>
                  <ion-button
                    fill="clear"
                    class="nxt1-password-toggle"
                    (click)="showPassword = !showPassword"
                    type="button"
                  >
                    <ion-icon [name]="showPassword ? 'eye-off-outline' : 'eye-outline'"></ion-icon>
                  </ion-button>
                </div>
                @if (password && !validatePassword(password).isValid) {
                  <span class="nxt1-form-error">
                    <ion-icon name="alert-circle-outline"></ion-icon>
                    {{ validatePassword(password).errors[0] }}
                  </span>
                }
              </div>

              <!-- Submit Button -->
              <div class="nxt1-form-actions">
                <ion-button
                  type="submit"
                  expand="block"
                  class="nxt1-auth-button nxt1-auth-button--full"
                  [class.nxt1-auth-button--loading]="authService.isLoading()"
                  [disabled]="authService.isLoading() || !isValid()"
                >
                  @if (authService.isLoading()) {
                    <ion-spinner name="crescent"></ion-spinner>
                  } @else {
                    Create Account
                  }
                </ion-button>
              </div>
            </form>

            <!-- Social Divider -->
            <div class="nxt1-social-divider">
              <span>or</span>
            </div>

            <!-- Social Login -->
            <div class="nxt1-social-buttons">
              <ion-button
                expand="block"
                class="nxt1-social-button nxt1-social-button--google"
                (click)="googleSignUp()"
                [disabled]="authService.isLoading()"
              >
                <ion-icon name="logo-google" slot="start"></ion-icon>
                Continue with Google
              </ion-button>

              <ion-button
                expand="block"
                class="nxt1-social-button nxt1-social-button--apple"
                (click)="appleSignUp()"
                [disabled]="authService.isLoading()"
              >
                <ion-icon name="logo-apple" slot="start"></ion-icon>
                Continue with Apple
              </ion-button>
            </div>
          </div>

          <!-- Footer -->
          <div class="nxt1-auth-switch">
            <span>Already have an account?</span>
            <a routerLink="/auth/login">Sign In</a>
          </div>

          <div class="nxt1-auth-terms">
            By continuing, you agree to our
            <a href="/terms">Terms of Service</a>
            and
            <a href="/privacy">Privacy Policy</a>
          </div>
        </div>
      </div>
    </ion-content>
  `,
  styles: `
    /* Mobile-specific wrapper for proper centering */
    .auth-page-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      min-height: 100%;
      padding: var(--nxt1-spacing-4);
      padding-top: var(--nxt1-spacing-4);
      padding-bottom: max(var(--nxt1-spacing-6), env(safe-area-inset-bottom, 20px));
    }

    .nxt1-auth-container {
      width: 100%;
      max-width: 420px;
    }

    .nxt1-auth-logo svg {
      height: 40px;
      width: auto;
    }

    .nxt1-auth-header {
      text-align: center;
      margin-bottom: var(--nxt1-spacing-6);
    }

    .nxt1-auth-title {
      font-size: var(--nxt1-font-size-2xl);
      font-weight: var(--nxt1-font-weight-bold);
      color: var(--nxt1-color-text-primary);
      margin: var(--nxt1-spacing-4) 0 var(--nxt1-spacing-2);
    }

    .nxt1-auth-subtitle {
      font-size: var(--nxt1-font-size-sm);
      color: var(--nxt1-color-text-secondary);
      margin: 0;
    }

    ion-spinner {
      --color: var(--ion-color-primary-contrast);
      width: 20px;
      height: 20px;
    }

    .nxt1-button-group {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--nxt1-spacing-3, 12px);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  readonly authService = inject(MobileAuthService);

  firstName = '';
  lastName = '';
  email = '';
  password = '';
  showPassword = false;

  // Expose validatePassword to template
  validatePassword = validatePassword;

  constructor() {
    addIcons({
      personOutline,
      mailOutline,
      lockClosedOutline,
      eyeOutline,
      eyeOffOutline,
      logoGoogle,
      logoApple,
      alertCircleOutline,
      chevronBack,
    });
  }

  isValid(): boolean {
    return (
      this.firstName.trim().length > 0 &&
      isValidEmail(this.email) &&
      validatePassword(this.password).isValid
    );
  }

  async register(): Promise<void> {
    this.authService.clearError();
    try {
      await this.authService.signUp({
        email: this.email,
        password: this.password,
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
      });
    } catch {
      // Error is handled by auth service
    }
  }

  async googleSignUp(): Promise<void> {
    // TODO: Implement Google Sign Up
    console.log('Google Sign Up');
  }

  async appleSignUp(): Promise<void> {
    // TODO: Implement Apple Sign Up
    console.log('Apple Sign Up');
  }
}
