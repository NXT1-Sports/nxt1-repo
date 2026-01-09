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
 * Forgot Password Component
 */
@Component({
  selector: 'app-forgot-password',
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
          <h1>Reset Password</h1>
          <p>Enter your email to receive a reset link</p>
        </div>

        @if (authFlow.error()) {
          <div class="error-alert">
            {{ authFlow.error() }}
            <button type="button" class="close-btn" (click)="authFlow.clearError()">×</button>
          </div>
        }

        @if (emailSent()) {
          <div class="success-alert">
            <p>Password reset email sent!</p>
            <p class="small">Check your inbox for instructions to reset your password.</p>
          </div>
        } @else {
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

            <button
              type="submit"
              class="btn btn-primary w-full"
              [disabled]="authFlow.isLoading() || !email"
            >
              @if (authFlow.isLoading()) {
                <span class="spinner-sm"></span>
                Sending...
              } @else {
                Send Reset Link
              }
            </button>
          </form>
        }

        <div class="auth-footer">
          <p>
            <a routerLink="/auth/login">← Back to Sign In</a>
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

    .error-alert, .success-alert {
      padding: var(--spacing-md, 16px);
      border-radius: var(--radius-md, 8px);
      margin-bottom: var(--spacing-md, 16px);
    }

    .error-alert {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background-color: rgba(244, 67, 54, 0.1);
      border: 1px solid var(--error, #f44336);
      color: var(--error, #f44336);
      font-size: 0.875rem;

      .close-btn {
        background: none;
        border: none;
        color: inherit;
        font-size: 1.25rem;
        cursor: pointer;
      }
    }

    .success-alert {
      background-color: rgba(76, 175, 80, 0.1);
      border: 1px solid var(--success, #4caf50);
      color: var(--success, #4caf50);
      text-align: center;

      p {
        color: inherit;
        margin: 0;
      }

      .small {
        font-size: 0.875rem;
        margin-top: var(--spacing-xs, 4px);
        opacity: 0.8;
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

    .auth-footer {
      margin-top: var(--spacing-lg, 24px);
      text-align: center;

      a {
        color: var(--primary, #ccff00);
        font-size: 0.875rem;
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
export class ForgotPasswordComponent {
  readonly authFlow = inject(AuthFlowService);

  email = '';
  emailSent = signal(false);

  async onSubmit(): Promise<void> {
    if (!this.email) return;

    const success = await this.authFlow.sendPasswordResetEmail(this.email);
    if (success) {
      this.emailSent.set(true);
    }
  }
}
