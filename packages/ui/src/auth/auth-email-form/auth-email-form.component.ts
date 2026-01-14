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
        class="bg-error/10 border-error/30 mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-red-400"
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
          <div class="input-wrapper">
            <ion-icon
              name="person-outline"
              class="text-text-tertiary pointer-events-none absolute left-3.5 z-[1] text-xl"
              aria-hidden="true"
            ></ion-icon>
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
              data-testid="auth-input-displayname"
            ></ion-input>
          </div>
        </div>
      }

      <!-- Email Field -->
      <div class="flex flex-col gap-2">
        <label class="text-text-secondary text-sm font-medium" for="email">Email Address</label>
        <div class="input-wrapper" [class.input-wrapper-error]="emailTouched() && !isEmailValid()">
          <ion-icon
            name="mail-outline"
            class="text-text-tertiary pointer-events-none absolute left-3.5 z-[1] text-xl"
            aria-hidden="true"
          ></ion-icon>
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
            data-testid="auth-input-email"
          ></ion-input>
        </div>
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
          <div class="input-wrapper">
            <ion-icon
              name="lock-closed-outline"
              class="text-text-tertiary pointer-events-none absolute left-3.5 z-[1] text-xl"
              aria-hidden="true"
            ></ion-icon>
            <ion-input
              id="password"
              [type]="showPassword() ? 'text' : 'password'"
              class="form-input"
              [placeholder]="mode === 'signup' ? 'Create a password' : 'Enter your password'"
              [(ngModel)]="password"
              name="password"
              [disabled]="loading"
              [autocomplete]="mode === 'signup' ? 'new-password' : 'current-password'"
              data-testid="auth-input-password"
            ></ion-input>
            <button
              type="button"
              class="text-text-tertiary hover:text-text-secondary absolute right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-all duration-200 hover:bg-white/5"
              (click)="showPassword.set(!showPassword())"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
              data-testid="auth-toggle-password"
            >
              <ion-icon
                [name]="showPassword() ? 'eye-off-outline' : 'eye-outline'"
                class="text-xl"
              ></ion-icon>
            </button>
          </div>
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
      /* Input wrapper - needs special handling for focus-within and Ionic integration */
      .input-wrapper {
        @apply bg-surface-200 border-border relative flex items-center rounded-lg border transition-all duration-200;
      }

      .input-wrapper:focus-within {
        @apply border-primary;
        box-shadow: 0 0 0 3px rgba(204, 255, 0, 0.1);
      }

      .input-wrapper-error {
        @apply border-error;
      }

      .input-wrapper-error:focus-within {
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
      }

      /* Ionic Input custom properties */
      .form-input {
        --background: transparent;
        --padding-start: 44px;
        --padding-end: 14px;
        --padding-top: 14px;
        --padding-bottom: 14px;
        --color: var(--nxt1-color-text-primary, #ffffff);
        --placeholder-color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        @apply w-full text-base;
      }

      /* Ionic Button custom properties */
      .submit-btn {
        --background: var(--nxt1-color-primary, #ccff00);
        --background-hover: var(--nxt1-color-primary-500, #b8e600);
        --background-activated: var(--nxt1-color-primary-600, #a3cc00);
        --color: var(--nxt1-color-bg-primary, #0a0a0a);
        --border-radius: 12px;
        --padding-top: 14px;
        --padding-bottom: 14px;
        @apply text-base font-semibold;
      }

      .submit-btn::part(native) {
        min-height: 52px;
      }

      .submit-btn ion-spinner {
        --color: var(--nxt1-color-bg-primary, #0a0a0a);
        @apply mr-2 h-5 w-5;
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
