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
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonInput, IonButton, IonSpinner, IonNote } from '@ionic/angular/standalone';
import {
  isValidEmail,
  isValidName,
  validatePassword,
  type PasswordValidationResult,
} from '@nxt1/core/helpers';
import { AUTH_VALIDATION } from '@nxt1/core/constants';
import { NxtIconComponent } from '../../components/icon';

/** Form submission data */
export interface AuthEmailFormData {
  email: string;
  password: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

/** Form mode */
export type AuthEmailFormMode = 'login' | 'signup' | 'reset';

/** Password strength level */
export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

@Component({
  selector: 'nxt1-auth-email-form',
  standalone: true,
  imports: [CommonModule, FormsModule, IonInput, IonButton, IonSpinner, IonNote, NxtIconComponent],
  template: `
    <!-- Error Display -->
    @if (error) {
      <div
        class="bg-error/10 border-error/30 mb-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm text-red-400"
        role="alert"
        data-testid="auth-form-error"
      >
        <nxt1-icon name="alertCircle" size="20" class="shrink-0" aria-hidden="true" />
        <span data-testid="auth-form-error-message">{{ error }}</span>
      </div>
    }
    <form class="flex w-full flex-col gap-5" (ngSubmit)="onSubmit()" data-testid="auth-email-form">
      <!-- Hidden username field for accessibility and password managers -->
      <input
        type="text"
        name="username"
        autocomplete="username"
        [value]="email"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
      />

      <!-- Name Fields (signup only) -->
      @if (mode === 'signup' && showNameFields) {
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-2">
            <label class="text-text-secondary text-sm font-medium" for="firstName"
              >First Name</label
            >
            <ion-input
              id="firstName"
              type="text"
              class="auth-input"
              [class.auth-input-error]="firstNameTouched() && firstName && !isFirstNameValid()"
              fill="outline"
              placeholder="First name"
              [(ngModel)]="firstName"
              name="firstName"
              [disabled]="loading"
              autocomplete="given-name"
              (ionBlur)="firstNameTouched.set(true)"
              data-testid="auth-input-first-name"
            >
            </ion-input>
            @if (firstNameTouched() && firstName && !isFirstNameValid()) {
              <ion-note class="pl-0.5 text-xs text-red-400" data-testid="auth-firstname-error">
                2-50 letters only
              </ion-note>
            }
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-text-secondary text-sm font-medium" for="lastName">Last Name</label>
            <ion-input
              id="lastName"
              type="text"
              class="auth-input"
              [class.auth-input-error]="lastNameTouched() && lastName && !isLastNameValid()"
              fill="outline"
              placeholder="Last name"
              [(ngModel)]="lastName"
              name="lastName"
              [disabled]="loading"
              autocomplete="family-name"
              (ionBlur)="lastNameTouched.set(true)"
              data-testid="auth-input-last-name"
            >
            </ion-input>
            @if (lastNameTouched() && lastName && !isLastNameValid()) {
              <ion-note class="pl-0.5 text-xs text-red-400" data-testid="auth-lastname-error">
                2-50 letters only
              </ion-note>
            }
          </div>
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
          <nxt1-icon slot="start" name="mail" size="20" class="input-icon" aria-hidden="true" />
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
            [class.auth-input-error]="
              passwordTouched() && mode === 'signup' && !isPasswordStrongEnough()
            "
            fill="outline"
            [placeholder]="mode === 'signup' ? 'Create a strong password' : 'Enter your password'"
            [(ngModel)]="password"
            name="password"
            [disabled]="loading"
            [autocomplete]="mode === 'signup' ? 'new-password' : 'current-password'"
            (ionInput)="onPasswordInput()"
            (ionBlur)="passwordTouched.set(true)"
            data-testid="auth-input-password"
          >
            <nxt1-icon slot="start" name="lock" size="20" class="input-icon" aria-hidden="true" />
            <button
              type="button"
              slot="end"
              class="password-toggle"
              (click)="showPassword.set(!showPassword())"
              [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
              data-testid="auth-toggle-password"
            >
              <nxt1-icon [name]="showPassword() ? 'eyeOff' : 'eye'" size="20" />
            </button>
          </ion-input>

          <!-- Password Strength Indicator (signup only) -->
          @if (mode === 'signup' && password.length > 0) {
            <div class="password-strength">
              <div class="strength-bars">
                <div
                  class="strength-bar"
                  [class.active]="passwordStrengthLevel() >= 1"
                  [class]="'strength-' + passwordStrength()"
                ></div>
                <div
                  class="strength-bar"
                  [class.active]="passwordStrengthLevel() >= 2"
                  [class]="'strength-' + passwordStrength()"
                ></div>
                <div
                  class="strength-bar"
                  [class.active]="passwordStrengthLevel() >= 3"
                  [class]="'strength-' + passwordStrength()"
                ></div>
                <div
                  class="strength-bar"
                  [class.active]="passwordStrengthLevel() >= 4"
                  [class]="'strength-' + passwordStrength()"
                ></div>
              </div>
              <span class="strength-text" [class]="'text-' + passwordStrength()">
                {{ passwordStrengthText() }}
              </span>
            </div>

            <!-- Password Requirements -->
            @if (passwordValidation() && !passwordValidation()!.isValid) {
              <div class="password-requirements">
                @for (error of passwordValidation()!.errors; track error) {
                  <ion-note class="requirement-text">• {{ error }}</ion-note>
                }
              </div>
            }
          }

          @if (mode === 'signup' && password.length === 0) {
            <ion-note class="text-text-tertiary pl-0.5 text-xs">
              At least {{ minPasswordLength }} characters with uppercase, lowercase & number
            </ion-note>
          }
        </div>
      }

      <!-- Forgot Password Link (login only) -->
      @if (mode === 'login' && showForgotPassword) {
        <div class="mt-3 text-center">
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
        class="submit-btn mt-4"
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
      /* Auth Input - White base with gray hover to match footer */
      .auth-input {
        --background: var(--nxt1-color-surface-100);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: var(--nxt1-borderRadius-lg);
        --border-width: 1px;
        --padding-start: var(--nxt1-spacing-4);
        --padding-end: var(--nxt1-spacing-4);
        --padding-top: 0;
        --padding-bottom: 0;
        --color: var(--nxt1-color-text-primary);
        --placeholder-color: var(--nxt1-color-text-tertiary);
        /* Subtle highlight - not bright primary color */
        --highlight-color-focused: var(--nxt1-color-border-strong);
        --highlight-color-valid: var(--nxt1-color-border-strong);
        --highlight-color-invalid: var(--nxt1-color-error);
        --highlight-height: 1px;
        font-size: var(--nxt1-fontSize-md);
        min-height: 52px;
        transition:
          border-color var(--nxt1-duration-fast) ease-out,
          background var(--nxt1-duration-fast) ease-out;
      }

      .auth-input::part(native) {
        transition: all var(--nxt1-duration-fast) ease-out;
      }

      /* Hover - subtle surface change for feedback */
      .auth-input:hover {
        --background: var(--nxt1-color-surface-200);
        --border-color: var(--nxt1-color-border-strong);
      }

      /* Input icon styling - matching button icons */
      .auth-input .input-icon,
      .auth-input nxt1-icon[slot='start'],
      .auth-input ::ng-deep nxt1-icon[slot='start'] {
        color: var(--nxt1-color-text-primary);
        flex-shrink: 0;
        margin-inline-end: 8px;
      }

      .auth-input-error {
        --border-color: var(--nxt1-color-error);
        --highlight-color-focused: var(--nxt1-color-error);
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
        border-radius: var(--nxt1-borderRadius-lg);
        background: transparent;
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast) ease;
      }

      .password-toggle:hover {
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-surface-200);
      }

      /* Submit Button - professional styling */
      .submit-btn {
        --background: var(--nxt1-color-primary);
        --background-hover: var(--nxt1-color-primaryDark);
        --background-activated: var(--nxt1-color-primaryDark);
        --background-focused: var(--nxt1-color-primary);
        --color: var(--nxt1-color-text-onPrimary);
        --border-radius: var(--nxt1-borderRadius-lg);
        --padding-top: var(--nxt1-spacing-3_5);
        --padding-bottom: var(--nxt1-spacing-3_5);
        --box-shadow: none;
        font-size: var(--nxt1-fontSize-md);
        font-weight: 600;
        text-transform: none;
        letter-spacing: var(--nxt1-letterSpacing-wide);
        margin-top: var(--nxt1-spacing-2);
      }

      .submit-btn::part(native) {
        min-height: 52px;
        border-radius: var(--nxt1-borderRadius-lg);
      }

      .submit-btn ion-spinner {
        --color: var(--nxt1-color-text-onPrimary);
        width: 1.25rem;
        height: 1.25rem;
        margin-right: 0.5rem;
      }

      /* Password Strength Indicator */
      .password-strength {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        margin-top: var(--nxt1-spacing-1);
      }

      .strength-bars {
        display: flex;
        gap: var(--nxt1-spacing-1);
        flex: 1;
      }

      .strength-bar {
        height: 4px;
        flex: 1;
        border-radius: var(--nxt1-borderRadius-xs);
        background: var(--nxt1-color-surface-300);
        transition: background var(--nxt1-duration-normal) ease;
      }

      .strength-bar.active.strength-weak {
        background: var(--nxt1-color-error);
      }

      .strength-bar.active.strength-fair {
        background: var(--nxt1-color-warning);
      }

      .strength-bar.active.strength-good {
        background: var(--nxt1-color-success);
      }

      .strength-bar.active.strength-strong {
        background: var(--nxt1-color-successDark, #10b981);
      }

      .strength-text {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        min-width: 50px;
        text-align: right;
      }

      .text-weak {
        color: var(--nxt1-color-error);
      }
      .text-fair {
        color: var(--nxt1-color-warning);
      }
      .text-good {
        color: var(--nxt1-color-success);
      }
      .text-strong {
        color: var(--nxt1-color-successDark, #10b981);
      }

      .password-requirements {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
        margin-top: var(--nxt1-spacing-1);
      }

      .requirement-text {
        padding-left: 0.125rem;
        font-size: 0.75rem;
        line-height: 1rem;
        color: var(--nxt1-color-warning, #f59e0b);
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

  /** Whether to show name fields in signup mode (collected during onboarding instead) */
  @Input() showNameFields = false;

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
  firstName = '';
  lastName = '';

  // UI state
  showPassword = signal(false);
  emailTouched = signal(false);
  passwordTouched = signal(false);
  firstNameTouched = signal(false);
  lastNameTouched = signal(false);

  // Password validation result (computed from password)
  private _passwordValidation = signal<PasswordValidationResult | null>(null);
  readonly passwordValidation = computed(() => this._passwordValidation());

  /** Minimum password length from auth validation constants */
  readonly minPasswordLength = AUTH_VALIDATION.PASSWORD_MIN_LENGTH;

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

  /** Update password validation on input */
  onPasswordInput(): void {
    if (this.password.length > 0) {
      this._passwordValidation.set(validatePassword(this.password));
    } else {
      this._passwordValidation.set(null);
    }
  }

  /** Get password strength level (1-4) */
  passwordStrengthLevel(): number {
    const strength = this._passwordValidation()?.strength;
    switch (strength) {
      case 'weak':
        return 1;
      case 'fair':
        return 2;
      case 'good':
        return 3;
      case 'strong':
        return 4;
      default:
        return 0;
    }
  }

  /** Get password strength text */
  passwordStrengthText(): string {
    const strength = this._passwordValidation()?.strength;
    switch (strength) {
      case 'weak':
        return 'Weak';
      case 'fair':
        return 'Fair';
      case 'good':
        return 'Good';
      case 'strong':
        return 'Strong';
      default:
        return '';
    }
  }

  /** Get password strength class */
  passwordStrength(): PasswordStrength {
    return this._passwordValidation()?.strength ?? 'weak';
  }

  isEmailValid(): boolean {
    return isValidEmail(this.email);
  }

  isFirstNameValid(): boolean {
    return !this.firstName || isValidName(this.firstName);
  }

  isLastNameValid(): boolean {
    return !this.lastName || isValidName(this.lastName);
  }

  /** Check if password meets minimum requirements for signup */
  isPasswordStrongEnough(): boolean {
    const validation = this._passwordValidation();
    if (!validation) return false;
    // Accept fair or better for signup (not just weak)
    return validation.strength !== 'weak' || validation.isValid;
  }

  isFormValid(): boolean {
    if (!this.isEmailValid()) return false;

    if (this.mode === 'reset') {
      return true; // Only email needed for reset
    }

    // For login, just check password exists
    if (this.mode === 'login') {
      return this.password.length >= 1;
    }

    // For signup, validate password strength
    if (this.mode === 'signup') {
      // Password must be at least "fair" strength or pass all validation
      const validation = this._passwordValidation();
      if (!validation || (validation.strength === 'weak' && !validation.isValid)) {
        return false;
      }

      // Validate name fields if shown and filled
      if (this.showNameFields) {
        if (this.firstName && !isValidName(this.firstName)) return false;
        if (this.lastName && !isValidName(this.lastName)) return false;
      }
    }

    return true;
  }

  onSubmit(): void {
    console.log('[AuthEmailForm] onSubmit called', {
      isFormValid: this.isFormValid(),
      loading: this.loading,
      mode: this.mode,
      email: this.email,
      passwordLength: this.password.length,
    });
    if (!this.isFormValid() || this.loading) {
      console.log('[AuthEmailForm] Form invalid or loading, not submitting');
      return;
    }

    // Build display name from first/last if available
    const displayName =
      [this.firstName, this.lastName].filter(Boolean).join(' ').trim() || undefined;

    console.log('[AuthEmailForm] Emitting submitForm event');
    this.submitForm.emit({
      email: this.email.trim(),
      password: this.password,
      displayName,
      firstName: this.firstName.trim() || undefined,
      lastName: this.lastName.trim() || undefined,
    });
  }
}
