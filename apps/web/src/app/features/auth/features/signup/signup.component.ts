import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthFlowService } from '../../services';

/**
 * Signup Component
 *
 * Handles new user registration.
 */
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <img
            src="assets/images/nxt1-logo.svg"
            alt="NXT1 Sports"
            class="logo"
            width="120"
            height="40"
          />
          <h1>Create Account</h1>
          <p>Join the NXT1 Sports community</p>
        </div>

        @if (authFlow.error()) {
          <div class="error-alert">
            {{ authFlow.error() }}
            <button type="button" class="close-btn" (click)="authFlow.clearError()">×</button>
          </div>
        }

        <form (ngSubmit)="onSubmit()" class="auth-form">
          <div class="form-group">
            <label for="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              [(ngModel)]="email"
              class="form-control"
              placeholder="Enter your email"
              required
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              [(ngModel)]="password"
              class="form-control"
              placeholder="Create a password (min 6 characters)"
              required
              minlength="6"
              autocomplete="new-password"
            />
          </div>

          <div class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              [(ngModel)]="confirmPassword"
              class="form-control"
              placeholder="Confirm your password"
              required
              autocomplete="new-password"
            />
          </div>

          @if (teamCodeEnabled()) {
            <div class="form-group">
              <label for="teamCode">Team Code (Optional)</label>
              <input
                type="text"
                id="teamCode"
                name="teamCode"
                [(ngModel)]="teamCode"
                class="form-control"
                placeholder="Enter team code if you have one"
              />
            </div>
          }

          <button
            type="submit"
            class="btn btn-primary w-full"
            [disabled]="authFlow.isLoading() || !isFormValid()"
          >
            @if (authFlow.isLoading()) {
              <span class="spinner-sm"></span>
              Creating account...
            } @else {
              Create Account
            }
          </button>
        </form>

        <div class="divider">
          <span>or continue with</span>
        </div>

        <div class="social-buttons">
          <button
            type="button"
            class="btn btn-secondary w-full"
            (click)="onGoogleSignUp()"
            [disabled]="authFlow.isLoading()"
          >
            <img src="assets/icons/google.svg" alt="" width="20" height="20" />
            Google
          </button>
        </div>

        <p class="terms-text">
          By creating an account, you agree to our
          <a href="/terms" target="_blank">Terms of Service</a>
          and
          <a href="/privacy" target="_blank">Privacy Policy</a>
        </p>

        <div class="auth-footer">
          <p>
            Already have an account?
            <a routerLink="/auth/login">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .auth-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--spacing-lg, 24px);
        background-color: var(--app-bg, #121212);
      }

      .auth-card {
        width: 100%;
        max-width: 400px;
        background-color: var(--card-bg, #1e1e1e);
        border-radius: var(--radius-xl, 16px);
        padding: var(--spacing-xl, 32px);
      }

      .auth-header {
        text-align: center;
        margin-bottom: var(--spacing-lg, 24px);

        .logo {
          margin-bottom: var(--spacing-md, 16px);
        }

        h1 {
          font-size: 1.5rem;
          margin-bottom: var(--spacing-xs, 4px);
        }

        p {
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
          font-size: 0.875rem;
        }
      }

      .error-alert {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
        background-color: rgba(244, 67, 54, 0.1);
        border: 1px solid var(--error, #f44336);
        border-radius: var(--radius-md, 8px);
        color: var(--error, #f44336);
        margin-bottom: var(--spacing-md, 16px);
        font-size: 0.875rem;

        .close-btn {
          background: none;
          border: none;
          color: inherit;
          font-size: 1.25rem;
          cursor: pointer;
        }
      }

      .auth-form {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md, 16px);
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs, 4px);

        label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
        }
      }

      .divider {
        display: flex;
        align-items: center;
        gap: var(--spacing-md, 16px);
        margin: var(--spacing-lg, 24px) 0;

        &::before,
        &::after {
          content: '';
          flex: 1;
          height: 1px;
          background-color: var(--border-color, rgba(255, 255, 255, 0.12));
        }

        span {
          font-size: 0.75rem;
          color: var(--text-tertiary, rgba(255, 255, 255, 0.5));
          text-transform: uppercase;
          letter-spacing: 1px;
        }
      }

      .social-buttons {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm, 8px);

        .btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-sm, 8px);
        }
      }

      .terms-text {
        margin-top: var(--spacing-md, 16px);
        font-size: 0.75rem;
        color: var(--text-tertiary, rgba(255, 255, 255, 0.5));
        text-align: center;

        a {
          color: var(--primary, #ccff00);
        }
      }

      .auth-footer {
        margin-top: var(--spacing-lg, 24px);
        text-align: center;

        p {
          font-size: 0.875rem;
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));

          a {
            color: var(--primary, #ccff00);
            font-weight: 600;
          }
        }
      }

      .spinner-sm {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(0, 0, 0, 0.3);
        border-top-color: #000;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-right: var(--spacing-xs, 4px);
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  readonly authFlow = inject(AuthFlowService);

  email = '';
  password = '';
  confirmPassword = '';
  teamCode = '';

  teamCodeEnabled = () => true; // Could be feature flag

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
}
