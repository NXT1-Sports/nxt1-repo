/**
 * @fileoverview AuthEmailFormComponent - Cross-Platform Email/Password Form
 * @module @nxt1/core/components
 *
 * Shared email and password authentication form.
 * Uses Ionic components for consistent styling across platforms.
 *
 * Features:
 * - Platform-adaptive input styling
 * - Password visibility toggle
 * - Real-time validation
 * - Loading state management
 * - Error display
 * - Keyboard handling
 *
 * Usage:
 * ```html
 * <nxt1-auth-email-form
 *   mode="login"
 *   [loading]="isLoading"
 *   [error]="errorMessage"
 *   (submitForm)="onSubmit($event)"
 * />
 * ```
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonInput, IonButton, IonSpinner, IonIcon, IonNote } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  mailOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  alertCircle,
  personOutline,
} from 'ionicons/icons';
import { isValidEmail } from '../../helpers';

/** Form submission data */
export interface AuthEmailFormData {
  email: string;
  password: string;
  displayName?: string;
}

/** Form mode */
export type AuthEmailFormMode = 'login' | 'signup' | 'reset';

@Component({
  selector: 'nxt1-auth-email-form',
  standalone: true,
  imports: [CommonModule, FormsModule, IonInput, IonButton, IonSpinner, IonIcon, IonNote],
  template: `
    <!-- Error Display -->
    @if (error) {
      <div class="form-error" role="alert">
        <ion-icon name="alert-circle" aria-hidden="true"></ion-icon>
        <span>{{ error }}</span>
      </div>
    }

    <form class="auth-form" (ngSubmit)="onSubmit()">
      <!-- Display Name (signup only) -->
      @if (mode === 'signup') {
        <div class="form-field">
          <label class="form-label" for="displayName">Full Name</label>
          <div class="input-wrapper">
            <ion-icon name="person-outline" class="input-icon" aria-hidden="true"></ion-icon>
            <ion-input
              id="displayName"
              type="text"
              class="form-input"
              placeholder="Enter your name"
              [(ngModel)]="displayName"
              name="displayName"
              [disabled]="loading"
              autocomplete="name"
              autocapitalize="words"
            ></ion-input>
          </div>
        </div>
      }

      <!-- Email Field -->
      <div class="form-field">
        <label class="form-label" for="email">Email Address</label>
        <div class="input-wrapper" [class.input-wrapper--error]="emailTouched() && !isEmailValid()">
          <ion-icon name="mail-outline" class="input-icon" aria-hidden="true"></ion-icon>
          <ion-input
            id="email"
            type="email"
            class="form-input"
            placeholder="Enter your email"
            [(ngModel)]="email"
            name="email"
            [disabled]="loading"
            autocomplete="email"
            inputmode="email"
            (ionBlur)="emailTouched.set(true)"
          ></ion-input>
        </div>
        @if (emailTouched() && !isEmailValid()) {
          <ion-note class="form-hint form-hint--error">
            Please enter a valid email address
          </ion-note>
        }
      </div>

      <!-- Password Field (not shown for reset mode) -->
      @if (mode !== 'reset') {
        <div class="form-field">
          <label class="form-label" for="password">
            {{ mode === 'signup' ? 'Create Password' : 'Password' }}
          </label>
          <div class="input-wrapper">
            <ion-icon name="lock-closed-outline" class="input-icon" aria-hidden="true"></ion-icon>
            <ion-input
              id="password"
              [type]="showPassword() ? 'text' : 'password'"
              class="form-input"
              [placeholder]="mode === 'signup' ? 'Create a password' : 'Enter your password'"
              [(ngModel)]="password"
              name="password"
              [disabled]="loading"
              [autocomplete]="mode === 'signup' ? 'new-password' : 'current-password'"
            ></ion-input>
            <button
              type="button"
              class="password-toggle"
              (click)="showPassword.set(!showPassword())"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
            >
              <ion-icon [name]="showPassword() ? 'eye-off-outline' : 'eye-outline'"></ion-icon>
            </button>
          </div>
          @if (mode === 'signup') {
            <ion-note class="form-hint"> At least 6 characters </ion-note>
          }
        </div>
      }

      <!-- Forgot Password Link (login only) -->
      @if (mode === 'login' && showForgotPassword) {
        <div class="forgot-password">
          <a (click)="forgotPasswordClick.emit()" tabindex="0" role="button"> Forgot password? </a>
        </div>
      }

      <!-- Submit Button -->
      <ion-button
        type="submit"
        expand="block"
        class="submit-btn"
        [disabled]="loading || !isFormValid()"
      >
        @if (loading) {
          <ion-spinner name="crescent" slot="start"></ion-spinner>
          <span>{{ loadingText }}</span>
        } @else {
          <span>{{ submitText }}</span>
        }
      </ion-button>
    </form>
  `,
  styles: [
    `
      .form-error {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        margin-bottom: 20px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 12px;
        color: #f87171;
        font-size: 14px;

        ion-icon {
          font-size: 20px;
          flex-shrink: 0;
        }
      }

      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 20px;
        width: 100%;
      }

      .form-field {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .form-label {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 14px;
        font-weight: 500;
      }

      .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        border-radius: 12px;
        transition: all 0.2s ease;

        &:focus-within {
          border-color: var(--nxt1-color-primary, #ccff00);
          box-shadow: 0 0 0 3px rgba(204, 255, 0, 0.1);
        }

        &--error {
          border-color: #ef4444;

          &:focus-within {
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
          }
        }
      }

      .input-icon {
        position: absolute;
        left: 14px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 20px;
        pointer-events: none;
        z-index: 1;
      }

      .form-input {
        --background: transparent;
        --padding-start: 44px;
        --padding-end: 14px;
        --padding-top: 14px;
        --padding-bottom: 14px;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 16px;
        width: 100%;
      }

      .password-toggle {
        position: absolute;
        right: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: transparent;
        border: none;
        border-radius: 8px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
          background: rgba(255, 255, 255, 0.05);
        }

        ion-icon {
          font-size: 20px;
        }
      }

      .form-hint {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 12px;
        padding-left: 2px;

        &--error {
          color: #f87171;
        }
      }

      .forgot-password {
        text-align: right;
        margin-top: -8px;

        a {
          color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
          font-size: 14px;
          text-decoration: none;
          cursor: pointer;

          &:hover {
            color: var(--nxt1-color-primary, #ccff00);
          }
        }
      }

      .submit-btn {
        --background: var(--nxt1-color-primary, #ccff00);
        --background-hover: var(--nxt1-color-primary-hover, #b8e600);
        --background-activated: var(--nxt1-color-primary-active, #a3cc00);
        --color: var(--nxt1-color-bg-primary, #0a0a0a);
        --border-radius: 12px;
        --padding-top: 14px;
        --padding-bottom: 14px;
        font-weight: 600;
        font-size: 16px;
        margin-top: 8px;

        &::part(native) {
          min-height: 52px;
        }

        ion-spinner {
          --color: var(--nxt1-color-bg-primary, #0a0a0a);
          width: 20px;
          height: 20px;
          margin-right: 8px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthEmailFormComponent {
  /** Form mode: login, signup, or reset (password reset) */
  @Input() mode: AuthEmailFormMode = 'login';

  /** Whether form is in loading state */
  @Input() loading = false;

  /** Error message to display */
  @Input() error: string | null = null;

  /** Whether to show forgot password link */
  @Input() showForgotPassword = true;

  /** Custom submit button text */
  @Input() submitText?: string;

  /** Custom loading button text */
  @Input() loadingText?: string;

  /** Emitted when form is submitted with valid data */
  @Output() submitForm = new EventEmitter<AuthEmailFormData>();

  /** Emitted when forgot password is clicked */
  @Output() forgotPasswordClick = new EventEmitter<void>();

  // Form state
  email = '';
  password = '';
  displayName = '';

  // UI state
  showPassword = signal(false);
  emailTouched = signal(false);

  constructor() {
    addIcons({
      mailOutline,
      lockClosedOutline,
      eyeOutline,
      eyeOffOutline,
      alertCircle,
      personOutline,
    });
  }

  /** Default submit text based on mode */
  get submitTextValue(): string {
    if (this.submitText) return this.submitText;
    switch (this.mode) {
      case 'login':
        return 'Sign In';
      case 'signup':
        return 'Create Account';
      case 'reset':
        return 'Send Reset Link';
    }
  }

  /** Default loading text based on mode */
  get loadingTextValue(): string {
    if (this.loadingText) return this.loadingText;
    switch (this.mode) {
      case 'login':
        return 'Signing in...';
      case 'signup':
        return 'Creating account...';
      case 'reset':
        return 'Sending...';
    }
  }

  isEmailValid(): boolean {
    return isValidEmail(this.email);
  }

  isFormValid(): boolean {
    if (!this.isEmailValid()) return false;

    if (this.mode === 'reset') {
      return true; // Only email needed for reset
    }

    if (this.password.length < 6) return false;

    if (this.mode === 'signup' && !this.displayName.trim()) {
      return false;
    }

    return true;
  }

  onSubmit(): void {
    if (!this.isFormValid() || this.loading) return;

    this.submitForm.emit({
      email: this.email.trim(),
      password: this.password,
      displayName: this.mode === 'signup' ? this.displayName.trim() : undefined,
    });
  }
}
