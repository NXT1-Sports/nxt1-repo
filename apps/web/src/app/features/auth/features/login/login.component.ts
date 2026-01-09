/**
 * @fileoverview Login Component
 * @module @nxt1/web
 *
 * Uses shared design token classes from @nxt1/design-tokens
 * for cross-platform visual consistency.
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthFlowService } from '../../services';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="nxt1-auth-page">
      <div class="nxt1-auth-content">
        <div class="nxt1-auth-container">
          <!-- Header -->
          <div class="nxt1-auth-header">
            <div class="nxt1-auth-logo">
              <img src="assets/images/nxt1-logo.svg" alt="NXT1 Sports" width="80" height="80" />
            </div>
            <h1 class="nxt1-auth-title">Welcome Back</h1>
            <p class="nxt1-auth-subtitle">Sign in to continue to NXT1 Sports</p>
          </div>

          <!-- Auth Card -->
          <div class="nxt1-auth-card">
            <!-- Error Message -->
            @if (authFlow.error()) {
              <div class="nxt1-auth-message nxt1-auth-message--error">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{{ authFlow.error() }}</span>
                <button type="button" class="close-btn" (click)="authFlow.clearError()">×</button>
              </div>
            }

            <!-- Login Form -->
            <form class="nxt1-auth-form" (ngSubmit)="onSubmit()">
              <!-- Email Input -->
              <div class="nxt1-form-group">
                <label class="nxt1-form-label" for="email">Email</label>
                <div class="nxt1-input-with-icon">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                    ></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    [(ngModel)]="email"
                    class="nxt1-auth-input"
                    placeholder="Enter your email"
                    required
                    autocomplete="email"
                  />
                </div>
              </div>

              <!-- Password Input -->
              <div class="nxt1-form-group">
                <label class="nxt1-form-label" for="password">Password</label>
                <div class="nxt1-input-with-icon">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input
                    [type]="showPassword ? 'text' : 'password'"
                    id="password"
                    name="password"
                    [(ngModel)]="password"
                    class="nxt1-auth-input"
                    placeholder="Enter your password"
                    required
                    autocomplete="current-password"
                  />
                  <button
                    type="button"
                    class="nxt1-password-toggle"
                    (click)="showPassword = !showPassword"
                  >
                    @if (showPassword) {
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                        ></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    } @else {
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    }
                  </button>
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
                <button
                  type="submit"
                  class="nxt1-auth-button nxt1-auth-button--full"
                  [class.nxt1-auth-button--loading]="authFlow.isLoading()"
                  [disabled]="authFlow.isLoading()"
                >
                  @if (authFlow.isLoading()) {
                    Signing in...
                  } @else {
                    Sign In
                  }
                </button>
              </div>
            </form>

            <!-- Social Divider -->
            <div class="nxt1-social-divider">
              <span>or</span>
            </div>

            <!-- Social Login -->
            <div class="nxt1-social-buttons">
              <button
                type="button"
                class="nxt1-social-button nxt1-social-button--google"
                (click)="onGoogleSignIn()"
                [disabled]="authFlow.isLoading()"
              >
                <img src="assets/icons/google.svg" alt="" width="20" height="20" />
                Continue with Google
              </button>

              <button
                type="button"
                class="nxt1-social-button nxt1-social-button--apple"
                (click)="onAppleSignIn()"
                [disabled]="authFlow.isLoading()"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                  />
                </svg>
                Continue with Apple
              </button>
            </div>
          </div>

          <!-- Footer -->
          <div class="nxt1-auth-switch">
            <span>Don't have an account?</span>
            <a routerLink="/auth/signup">Sign Up</a>
          </div>

          <div class="nxt1-auth-terms">
            By continuing, you agree to our
            <a href="/terms">Terms of Service</a>
            and
            <a href="/privacy">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* Web-specific overrides - base styles from design tokens */

      /* Override for web background (dark theme) */
      .nxt1-auth-page {
        --nxt1-background-primary: var(--app-bg, #121212);
        --nxt1-background-elevated: var(--card-bg, #1e1e1e);
        --nxt1-text-primary: var(--text-primary, #ffffff);
        --nxt1-text-secondary: var(--text-secondary, rgba(255, 255, 255, 0.7));
        --nxt1-border-default: var(--border-color, rgba(255, 255, 255, 0.12));
        min-height: 100vh;
      }

      /* Web uses native inputs (not ion-input) */
      .nxt1-auth-input {
        width: 100%;
        background: var(--nxt1-background-secondary, var(--card-bg-elevated, #2a2a2a));
        border: 1px solid var(--nxt1-border-default);
        border-radius: var(--nxt1-radius-input, 8px);
        padding: var(--nxt1-input-padding-y, 12px) var(--nxt1-input-padding-x, 16px);
        padding-left: 48px;
        font-size: 16px;
        color: var(--nxt1-text-primary);
        outline: none;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease;

        &::placeholder {
          color: var(--nxt1-text-tertiary, rgba(255, 255, 255, 0.5));
        }

        &:focus {
          border-color: var(--ion-color-primary, #3949ab);
          box-shadow: 0 0 0 3px rgba(57, 73, 171, 0.2);
        }
      }

      .nxt1-input-with-icon {
        position: relative;

        > svg {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--nxt1-text-tertiary, rgba(255, 255, 255, 0.5));
          pointer-events: none;
        }
      }

      .nxt1-password-toggle {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        padding: 8px;
        cursor: pointer;
        color: var(--nxt1-text-tertiary, rgba(255, 255, 255, 0.5));
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          color: var(--nxt1-text-secondary);
        }
      }

      .nxt1-auth-button {
        width: 100%;
        background: var(--ion-color-primary, #3949ab);
        color: white;
        border: none;
        border-radius: var(--nxt1-radius-button, 8px);
        padding: 14px 24px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition:
          background-color 0.2s ease,
          transform 0.1s ease;

        &:hover:not(:disabled) {
          background: var(--ion-color-primary-shade, #303f9f);
        }

        &:active:not(:disabled) {
          transform: scale(0.98);
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        &--loading {
          position: relative;
          color: transparent;

          &::after {
            content: '';
            position: absolute;
            width: 20px;
            height: 20px;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            border: 2px solid white;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
        }
      }

      .nxt1-social-button {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        background: var(--nxt1-background-secondary, var(--card-bg, #1e1e1e));
        border: 1px solid var(--nxt1-border-default);
        border-radius: var(--nxt1-radius-button, 8px);
        padding: 12px 24px;
        font-size: 16px;
        font-weight: 500;
        color: var(--nxt1-text-primary);
        cursor: pointer;
        transition:
          background-color 0.2s ease,
          border-color 0.2s ease;

        &:hover:not(:disabled) {
          background: var(--nxt1-state-hover, rgba(255, 255, 255, 0.05));
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        &--apple {
          background: white;
          color: black;

          &:hover:not(:disabled) {
            background: #f5f5f5;
          }
        }
      }

      .close-btn {
        background: none;
        border: none;
        color: inherit;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0;
        margin-left: auto;
      }

      @keyframes spin {
        to {
          transform: translate(-50%, -50%) rotate(360deg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly authFlow = inject(AuthFlowService);

  email = '';
  password = '';
  showPassword = false;

  async onSubmit(): Promise<void> {
    if (!this.email || !this.password) return;

    await this.authFlow.signInWithEmail({
      email: this.email,
      password: this.password,
    });
  }

  async onGoogleSignIn(): Promise<void> {
    await this.authFlow.signInWithGoogle();
  }

  async onAppleSignIn(): Promise<void> {
    // TODO: Implement Apple Sign In
    console.log('Apple Sign In');
  }
}
