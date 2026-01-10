/**
 * @fileoverview Login Page - NXT1 V2 Design
 * @module @nxt1/mobile
 *
 * Professional login page matching NXT1 V2 design.
 * Uses shared design tokens from @nxt1/design-tokens.
 * Uses inline SVGs for consistent icons across web/mobile.
 */

import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonSpinner, IonInput } from '@ionic/angular/standalone';
import { RouterLink } from '@angular/router';
import { MobileAuthService } from '../services/mobile-auth.service';
import { isValidEmail } from '@nxt1/core';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IonContent, IonSpinner, IonInput],
  template: `
    <ion-content class="nxt1-auth-page">
      <!-- Logo -->
      <div class="nxt1-auth-logo">
        <picture>
          <source srcset="assets/shared/logo/logo.avif" type="image/avif" />
          <img src="assets/shared/logo/logo.png" alt="NXT1" class="nxt1-logo nxt1-logo--auth" />
        </picture>
      </div>

      <!-- Main Card -->
      <div class="nxt1-auth-card">
        <div class="nxt1-auth-main">
          <div class="nxt1-auth-header">
            <h1>Welcome back</h1>
            <p>Sign in to continue to NXT1</p>
          </div>

          <!-- Social Buttons (default view) -->
          @if (!showEmailForm()) {
            <div class="nxt1-social-buttons">
              <button
                type="button"
                class="nxt1-social-btn nxt1-social-btn--google"
                (click)="googleSignIn()"
                [disabled]="authService.isLoading()"
              >
                <svg class="icon" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                class="nxt1-social-btn nxt1-social-btn--apple"
                (click)="appleSignIn()"
                [disabled]="authService.isLoading()"
              >
                <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                  />
                </svg>
                <span>Continue with Apple</span>
              </button>

              <button
                type="button"
                class="nxt1-social-btn nxt1-social-btn--microsoft"
                (click)="microsoftSignIn()"
                [disabled]="authService.isLoading()"
              >
                <svg class="icon" viewBox="0 0 24 24">
                  <path fill="#F25022" d="M1 1h10v10H1z" />
                  <path fill="#00A4EF" d="M1 13h10v10H1z" />
                  <path fill="#7FBA00" d="M13 1h10v10H13z" />
                  <path fill="#FFB900" d="M13 13h10v10H13z" />
                </svg>
                <span>Continue with Microsoft</span>
              </button>

              <div class="nxt1-auth-divider">
                <span>OR</span>
              </div>

              <button
                type="button"
                class="nxt1-social-btn nxt1-social-btn--email"
                (click)="showEmailForm.set(true)"
                [disabled]="authService.isLoading()"
              >
                <svg
                  class="icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 6-10 7L2 6" />
                </svg>
                <span>Continue with Email</span>
              </button>

              <button
                type="button"
                class="nxt1-social-btn nxt1-social-btn--team-code"
                (click)="onTeamCode()"
                [disabled]="authService.isLoading()"
              >
                <svg
                  class="icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Have a Team Code?</span>
              </button>
            </div>
          }

          <!-- Email Form -->
          @if (showEmailForm()) {
            <button type="button" class="nxt1-back-btn" (click)="showEmailForm.set(false)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </button>

            <form class="nxt1-auth-form" (ngSubmit)="login()">
              @if (authService.error()) {
                <div class="nxt1-api-error">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                    />
                  </svg>
                  <span>{{ authService.error() }}</span>
                </div>
              }

              <div class="nxt1-form-field">
                <label class="nxt1-form-label" for="email">Email Address</label>
                <div class="nxt1-input-wrapper">
                  <svg
                    class="nxt1-input-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 6-10 7L2 6" />
                  </svg>
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

              <div class="nxt1-form-field">
                <label class="nxt1-form-label" for="password">Password</label>
                <div class="nxt1-input-wrapper">
                  <svg
                    class="nxt1-input-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <ion-input
                    id="password"
                    [type]="showPassword() ? 'text' : 'password'"
                    class="nxt1-auth-input"
                    placeholder="Enter your password"
                    [(ngModel)]="password"
                    name="password"
                    [disabled]="authService.isLoading()"
                    autocomplete="current-password"
                  ></ion-input>
                  <button
                    type="button"
                    class="nxt1-password-toggle"
                    (click)="showPassword.set(!showPassword())"
                  >
                    @if (showPassword()) {
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path
                          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                        />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    } @else {
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    }
                  </button>
                </div>
              </div>

              <button
                type="submit"
                class="nxt1-submit-btn"
                [disabled]="authService.isLoading() || !isValid()"
              >
                @if (authService.isLoading()) {
                  <ion-spinner name="crescent"></ion-spinner>
                  <span>Signing in...</span>
                } @else {
                  <span>Sign In</span>
                }
              </button>

              <a routerLink="/auth/forgot-password" class="nxt1-forgot-link"> Forgot password? </a>
            </form>
          }

          <div class="nxt1-auth-footer">
            <span>Don't have an account?</span>
            <a routerLink="/auth/register" class="nxt1-auth-link">Create account</a>
          </div>
        </div>
      </div>

      <!-- Terms -->
      <div class="nxt1-auth-terms">
        <p>
          By continuing, you agree to NXT1's
          <a href="/terms" class="nxt1-terms-link">Terms of Service</a>
          and
          <a href="/privacy" class="nxt1-terms-link">Privacy Policy</a>
        </p>
      </div>
    </ion-content>
  `,
  styles: `
    /* Mobile-specific overrides - base styles from design tokens */
    ion-spinner {
      --color: var(--nxt1-color-background);
      width: 20px;
      height: 20px;
      margin-right: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  readonly authService = inject(MobileAuthService);

  email = '';
  password = '';
  showPassword = signal(false);
  showEmailForm = signal(false);

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

  async microsoftSignIn(): Promise<void> {
    // TODO: Implement Microsoft Sign In
    console.log('Microsoft Sign In');
  }

  onTeamCode(): void {
    // TODO: Implement Team Code flow
    console.log('Team Code');
  }
}
