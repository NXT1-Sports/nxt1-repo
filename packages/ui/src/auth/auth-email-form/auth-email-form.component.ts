/**
 * @fileoverview AuthEmailFormComponent - Cross-Platform Email/Password Form
 * @module @nxt1/ui/auth
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
import { isValidEmail } from '@nxt1/core/helpers';

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
      <div
        class="bg-error/10 border-error/30 mb-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm text-red-400"
        role="alert"
        data-testid="auth-form-error"
      >
        <ion-icon name="alert-circle" class="shrink-0 text-xl" aria-hidden="true"></ion-icon>
        <span data-testid="auth-form-error-message">{{ error }}</span>
      </div>
    }
    <form class="flex w-full flex-col gap-5" (ngSubmit)="onSubmit()" data-testid="auth-email-form">
      <!-- Display Name (signup only) -->
      @if (mode === 'signup') {
        <div class="flex flex-col gap-2">
          <label class="text-text-secondary text-sm font-medium" for="displayName">Full Name</label>
          <ion-input
            id="displayName"
            type="text"
            class="auth-input"
            fill="outline"
            placeholder="Enter your name"
            [(ngModel)]="displayName"
            name="displayName"
            [disabled]="loading"
            autocomplete="name"
            autocapitalize="words"
            data-testid="auth-input-displayname"
          >
            <ion-icon slot="start" name="person-outline" aria-hidden="true"></ion-icon>
          </ion-input>
        </div>
      }

      <!-- Email Field -->
      <div class="flex flex-col gap-2">
        <label class="text-text-secondary text-sm font-medium" for="email">Email Address</label>
        <ion-input
          id="email"
          type="email"
          class="auth-input"
          [class.auth-input-error]="emailTouched() && !isEmailValid()"
          fill="outline"
          placeholder="Enter your email"
          [(ngModel)]="email"
          name="email"
          [disabled]="loading"
          autocomplete="email"
          inputmode="email"
          (ionBlur)="emailTouched.set(true)"
          data-testid="auth-input-email"
        >
          <ion-icon slot="start" name="mail-outline" aria-hidden="true"></ion-icon>
        </ion-input>
        @if (emailTouched() && !isEmailValid()) {
          <ion-note class="pl-0.5 text-xs text-red-400" data-testid="auth-email-error">
            Please enter a valid email address
          </ion-note>
        }
      </div>

      <!-- Password Field (not shown for reset mode) -->
      @if (mode !== 'reset') {
        <div class="flex flex-col gap-2">
          <label class="text-text-secondary text-sm font-medium" for="password">
            {{ mode === 'signup' ? 'Create Password' : 'Password' }}
          </label>
          <ion-input
            id="password"
            [type]="showPassword() ? 'text' : 'password'"
            class="auth-input"
            fill="outline"
            [placeholder]="mode === 'signup' ? 'Create a password' : 'Enter your password'"
            [(ngModel)]="password"
            name="password"
            [disabled]="loading"
            [autocomplete]="mode === 'signup' ? 'new-password' : 'current-password'"
            data-testid="auth-input-password"
          >
            <ion-icon slot="start" name="lock-closed-outline" aria-hidden="true"></ion-icon>
            <button
              type="button"
              slot="end"
              class="password-toggle"
              (click)="showPassword.set(!showPassword())"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
              data-testid="auth-toggle-password"
            >
              <ion-icon [name]="showPassword() ? 'eye-off-outline' : 'eye-outline'"></ion-icon>
            </button>
          </ion-input>
          @if (mode === 'signup') {
            <ion-note class="text-text-tertiary pl-0.5 text-xs">At least 6 characters</ion-note>
          }
        </div>
      }

      <!-- Forgot Password Link (login only) -->
      @if (mode === 'login' && showForgotPassword) {
        <div class="-mt-2 text-right">
          <a
            class="text-text-secondary hover:text-primary cursor-pointer text-sm no-underline"
            (click)="forgotPasswordClick.emit()"
            tabindex="0"
            role="button"
            data-testid="auth-link-forgot-password"
          >
            Forgot password?
          </a>
        </div>
      }

      <!-- Submit Button -->
      <ion-button
        type="submit"
        expand="block"
        class="submit-btn mt-2"
        [disabled]="loading || !isFormValid()"
        data-testid="auth-submit-button"
      >
        @if (loading) {
          <ion-spinner
            name="crescent"
            slot="start"
            data-testid="auth-loading-spinner"
          ></ion-spinner>
          <span>{{ loadingTextValue }}</span>
        } @else {
          <span>{{ submitTextValue }}</span>
        }
      </ion-button>
    </form>
  `,
  styles: [
    `
      /* Auth Input - Glassmorphic styling matching social buttons */
      .auth-input {
        --background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
        --border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        --border-radius: 12px;
        --border-width: 1px;
        --padding-start: 16px;
        --padding-end: 16px;
        --padding-top: 0;
        --padding-bottom: 0;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --highlight-color-focused: var(--nxt1-color-primary, #ccff00);
        --highlight-color-valid: var(--nxt1-color-primary, #ccff00);
        --highlight-color-invalid: var(--nxt1-color-error, #ef4444);
        font-size: 1rem;
        min-height: 52px;
      }

      .auth-input::part(native) {
        transition: all 200ms ease-out;
      }

      .auth-input:hover {
        --background: var(--nxt1-color-state-pressed, rgba(255, 255, 255, 0.08));
      }

      .auth-input ion-icon[slot='start'] {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 1.25rem;
        margin-inline-end: 8px;
      }

      .auth-input-error {
        --border-color: var(--nxt1-color-error, #ef4444);
        --highlight-color-focused: var(--nxt1-color-error, #ef4444);
      }

      /* Password toggle button */
      .password-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        margin: 0;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .password-toggle:hover {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
      }

      .password-toggle ion-icon {
        font-size: 1.25rem;
      }

      /* Submit Button - professional styling */
      .submit-btn {
        --background: var(--nxt1-color-primary, #ccff00);
        --background-hover: var(--nxt1-color-primaryDark, #a3cc00);
        --background-activated: var(--nxt1-color-primaryDark, #a3cc00);
        --background-focused: var(--nxt1-color-primary, #ccff00);
        --color: var(--nxt1-color-bg-primary, #0a0a0a);
        --border-radius: 12px;
        --padding-top: 14px;
        --padding-bottom: 14px;
        --box-shadow: none;
        font-size: 1rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.025em;
        margin-top: 0.5rem;
      }

      .submit-btn::part(native) {
        min-height: 52px;
        border-radius: 12px;
      }

      .submit-btn ion-spinner {
        --color: var(--nxt1-color-bg-primary, #0a0a0a);
        width: 1.25rem;
        height: 1.25rem;
        margin-right: 0.5rem;
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
