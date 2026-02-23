/**
 * @fileoverview Forgot Password Component - Professional Password Reset UI
 * @module @nxt1/web
 *
 * Professional password reset page using shared auth components from @nxt1/ui.
 * Uses design tokens for 100% consistency with other auth pages.
 *
 * Route: /auth/forgot-password
 *
 * ⭐ MATCHES MOBILE'S forgot-password.page.ts INTERFACE ⭐
 * ⭐ USES SHARED COMPONENTS FROM @nxt1/ui ⭐
 */

import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthShellComponent } from '@nxt1/ui/auth/auth-shell';
import { AuthEmailFormComponent, type AuthEmailFormData } from '@nxt1/ui/auth/auth-email-form';
import { NxtIconComponent } from '@nxt1/ui/components/icon';
import { AuthNavigationService } from '@nxt1/ui/services';
import { AuthFlowService } from '../../services';
import { SeoService } from '../../../../core/services';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, AuthShellComponent, AuthEmailFormComponent, NxtIconComponent],
  template: `
    <nxt1-auth-shell
      variant="card-glass"
      [showBackButton]="!emailSent()"
      [showLogo]="true"
      [maxWidth]="'440px'"
      (backClick)="onBackClick()"
    >
      <!-- Title -->
      <h1
        authTitle
        class="text-text-primary text-2xl font-bold"
        [attr.data-testid]="emailSent() ? 'forgot-password-success-title' : 'forgot-password-title'"
      >
        {{ emailSent() ? 'Check Your Email' : 'Reset Password' }}
      </h1>

      <!-- Subtitle -->
      <p
        authSubtitle
        class="text-text-secondary mb-2 text-sm"
        [attr.data-testid]="
          emailSent() ? 'forgot-password-success-subtitle' : 'forgot-password-subtitle'
        "
      >
        @if (emailSent()) {
          We've sent reset instructions to
          <strong class="text-text-primary font-semibold">{{ sentEmail() }}</strong>
        } @else {
          Enter your email and we'll send you a link to reset your password
        }
      </p>

      <!-- Main Content -->
      <div authContent>
        @if (emailSent()) {
          <!-- Success State -->
          <div class="success-container" data-testid="forgot-password-success">
            <!-- Success Icon -->
            <div class="success-icon" data-testid="forgot-password-success-icon">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" />
                <path
                  d="M8 12l2.5 2.5L16 9"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>

            <!-- Instructions -->
            <div class="instructions-box">
              <p class="text-text-secondary text-sm">
                Click the link in your email to reset your password.
              </p>
              <p class="text-text-tertiary mt-1 text-xs">
                If you don't see it, check your spam folder.
              </p>
            </div>

            <!-- Try Again Button (Secondary) -->
            <button
              type="button"
              class="action-btn"
              (click)="resetForm()"
              data-testid="forgot-password-try-again"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                />
              </svg>
              <span>Didn't receive it? Try again</span>
            </button>

            <!-- Back to Sign In Button (Primary) -->
            <button
              type="button"
              class="action-btn action-btn--primary"
              (click)="goToSignIn()"
              data-testid="forgot-password-btn-back-to-login"
            >
              <span>Back to Sign In</span>
              <nxt1-icon name="arrowRight" size="18" aria-hidden="true" />
            </button>
          </div>
        } @else {
          <!-- Request State - Form Only (matches auth.component.ts pattern) -->
          <nxt1-auth-email-form
            mode="reset"
            [loading]="authFlow.isLoading()"
            [error]="authFlow.error()"
            [showForgotPassword]="false"
            (submitForm)="onSubmit($event)"
            data-testid="forgot-password-form"
          />
        }
      </div>

      <!-- Footer -->
      <div authFooter class="footer-container" data-testid="forgot-password-footer">
        @if (!emailSent()) {
          <button
            type="button"
            class="back-link"
            (click)="goToSignIn()"
            data-testid="forgot-password-link-back"
          >
            <nxt1-icon name="chevronLeft" size="16" aria-hidden="true" />
            <span>Back to Sign In</span>
          </button>
        }
      </div>
    </nxt1-auth-shell>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      /* ============================================ */
      /* SUCCESS STATE                               */
      /* ============================================ */
      .success-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4) 0;
        width: 100%;
      }

      .success-icon {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-success) 0%,
          var(--nxt1-color-successDark, #059669) 100%
        );
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .success-icon svg {
        width: 40px;
        height: 40px;
      }

      @keyframes scaleIn {
        from {
          transform: scale(0.5);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* Instructions Box */
      .instructions-box {
        background: var(--nxt1-color-state-hover);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-4);
        width: 100%;
        max-width: 320px;
        text-align: center;
      }

      /* ============================================ */
      /* ACTION BUTTONS - Pure HTML + Design Tokens   */
      /* ============================================ */
      .action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        width: 100%;
        max-width: 320px;
        min-height: 52px;
        padding: 0 var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 2px solid var(--nxt1-color-primary);
        background: transparent;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        text-transform: none;
        letter-spacing: normal;
        margin: 0;
        cursor: pointer;
        transition: all var(--nxt1-duration-normal) ease-out;
      }

      .action-btn:hover {
        background: var(--nxt1-color-state-hover);
      }

      .action-btn:active {
        background: var(--nxt1-color-state-pressed);
      }

      /* Primary Button (Filled) */
      .action-btn--primary {
        background: var(--nxt1-color-primary);
        border-color: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
      }

      .action-btn--primary:hover {
        background: var(--nxt1-color-primaryDark);
        border-color: var(--nxt1-color-primaryDark);
        transform: translateY(-1px);
      }

      .action-btn--primary:active {
        background: var(--nxt1-color-primaryDark);
        transform: translateY(0);
      }

      /* ============================================ */
      /* FOOTER                                      */
      /* ============================================ */
      .footer-container {
        display: flex;
        justify-content: center;
        width: 100%;
      }

      /* Back Link - Text Button Style */
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        background: transparent;
        border: none;
        color: var(--nxt1-color-primary);
        padding: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-body);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        transition: opacity var(--nxt1-duration-fast) ease;
      }

      .back-link:hover {
        opacity: 0.8;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent implements OnInit {
  protected readonly authFlow = inject(AuthFlowService);
  private readonly nav = inject(AuthNavigationService);
  private readonly seo = inject(SeoService);

  readonly emailSent = signal(false);
  readonly sentEmail = signal('');

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Reset Password',
      description:
        "Forgot your password? Enter your email address and we'll send you instructions to reset your NXT1 Sports account password.",
      keywords: ['reset password', 'forgot password', 'password recovery', 'account recovery'],
    });
  }

  onBackClick(): void {
    this.nav.navigateBack('/auth');
  }

  goToSignIn(): void {
    this.nav.navigateBack('/auth');
  }

  resetForm(): void {
    this.emailSent.set(false);
    this.sentEmail.set('');
    this.authFlow.clearError();
  }

  async onSubmit(data: AuthEmailFormData): Promise<void> {
    if (!data.email) return;

    try {
      await this.authFlow.sendPasswordResetEmail(data.email);
      this.sentEmail.set(data.email);
      this.emailSent.set(true);
    } catch {
      // Error is handled by AuthFlowService
    }
  }
}
