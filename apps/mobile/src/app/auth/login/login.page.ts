/**
 * @fileoverview Login Page
 * @module @nxt1/mobile
 *
 * Uses shared design token classes from @nxt1/design-tokens
 * for cross-platform visual consistency.
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonButton, IonSpinner, IonIcon, IonInput } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  mailOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  logoGoogle,
  logoApple,
  alertCircleOutline,
} from 'ionicons/icons';
import { RouterLink } from '@angular/router';
import { MobileAuthService } from '../services/mobile-auth.service';
import { isValidEmail } from '@nxt1/core';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonContent,
    IonButton,
    IonSpinner,
    IonIcon,
    IonInput,
  ],
  template: `
    <ion-content class="nxt1-auth-page">
      <div class="nxt1-auth-content">
        <div class="nxt1-auth-container">
          <!-- Header -->
          <div class="nxt1-auth-header">
            <div class="nxt1-auth-logo">
              <img src="assets/images/nxt1-logo.svg" alt="NXT1" />
            </div>
            <h1 class="nxt1-auth-title">Welcome Back</h1>
            <p class="nxt1-auth-subtitle">Sign in to continue to NXT1</p>
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

            <!-- Login Form -->
            <form class="nxt1-auth-form" (ngSubmit)="login()">
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
                    placeholder="Enter your password"
                    [(ngModel)]="password"
                    name="password"
                    [disabled]="authService.isLoading()"
                    autocomplete="current-password"
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
              </div>

              <!-- Forgot Password -->
              <div class="nxt1-form-checkbox-row">
                <span></span>
                <a routerLink="/auth/forgot-password" class="nxt1-forgot-link">
                  Forgot password?
                </a>
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
                    Sign In
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
                (click)="googleSignIn()"
                [disabled]="authService.isLoading()"
              >
                <ion-icon name="logo-google" slot="start"></ion-icon>
                Continue with Google
              </ion-button>

              <ion-button
                expand="block"
                class="nxt1-social-button nxt1-social-button--apple"
                (click)="appleSignIn()"
                [disabled]="authService.isLoading()"
              >
                <ion-icon name="logo-apple" slot="start"></ion-icon>
                Continue with Apple
              </ion-button>
            </div>
          </div>

          <!-- Footer -->
          <div class="nxt1-auth-switch">
            <span>Don't have an account?</span>
            <a routerLink="/auth/register">Sign Up</a>
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
    /* Component-specific overrides only - base styles from design tokens */
    .nxt1-auth-logo img {
      max-width: 100%;
      height: auto;
    }

    ion-spinner {
      --color: var(--ion-color-primary-contrast);
      width: 20px;
      height: 20px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  readonly authService = inject(MobileAuthService);

  email = '';
  password = '';
  showPassword = false;

  constructor() {
    addIcons({
      mailOutline,
      lockClosedOutline,
      eyeOutline,
      eyeOffOutline,
      logoGoogle,
      logoApple,
      alertCircleOutline,
    });
  }

  isValid(): boolean {
    return isValidEmail(this.email) && this.password.length >= 6;
  }

  async login(): Promise<void> {
    this.authService.clearError();
    try {
      await this.authService.signIn({
        email: this.email,
        password: this.password,
      });
    } catch {
      // Error is handled by auth service
    }
  }

  async googleSignIn(): Promise<void> {
    // TODO: Implement Google Sign In
    console.log('Google Sign In');
  }

  async appleSignIn(): Promise<void> {
    // TODO: Implement Apple Sign In
    console.log('Apple Sign In');
  }
}
