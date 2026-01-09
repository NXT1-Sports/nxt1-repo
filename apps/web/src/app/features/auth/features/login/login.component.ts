import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthFlowService } from '../../services';

/**
 * Login Component
 *
 * Handles user sign-in with email/password or social providers.
 */
@Component({
  selector: 'app-login',
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
          <h1>Welcome Back</h1>
          <p>Sign in to continue to NXT1 Sports</p>
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
              placeholder="Enter your password"
              required
              autocomplete="current-password"
            />
          </div>

          <div class="form-actions">
            <a routerLink="/auth/forgot-password" class="forgot-link">
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            class="btn btn-primary w-full"
            [disabled]="authFlow.isLoading()"
          >
            @if (authFlow.isLoading()) {
              <span class="spinner-sm"></span>
              Signing in...
            } @else {
              Sign In
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
            (click)="onGoogleSignIn()"
            [disabled]="authFlow.isLoading()"
          >
            <img src="assets/icons/google.svg" alt="" width="20" height="20" />
            Google
          </button>
        </div>

        <div class="auth-footer">
          <p>
            Don't have an account?
            <a routerLink="/auth/signup">Sign up</a>
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [`
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
        padding: 0;
        margin-left: var(--spacing-sm, 8px);
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

    .form-actions {
      display: flex;
      justify-content: flex-end;

      .forgot-link {
        font-size: 0.875rem;
        color: var(--primary, #ccff00);
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
      to { transform: rotate(360deg); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly authFlow = inject(AuthFlowService);

  email = '';
  password = '';

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
}
