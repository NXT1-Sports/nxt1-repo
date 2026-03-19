/**
 * @fileoverview Forgot Password Page - Professional Password Reset UI
 * @module @nxt1/mobile
 *
 * Professional password reset page using shared auth components from @nxt1/ui.
 * Uses Ionic components and design tokens for 100% consistency with web.
 * Includes platform-adaptive haptic feedback.
 *
 * ⭐ MATCHES WEB'S forgot-password.component.ts INTERFACE ⭐
 * ⭐ USES SHARED IONIC COMPONENTS FROM @nxt1/ui ⭐
 */

import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton } from '@ionic/angular/standalone';
import { AuthShellComponent, AuthEmailFormComponent, type AuthEmailFormData } from '@nxt1/ui';
import { NxtIconComponent, HapticsService } from '@nxt1/ui';
import { AuthNavigationService } from '@nxt1/ui/services';
import { AuthFlowService } from '../../services';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, IonButton, AuthShellComponent, AuthEmailFormComponent, NxtIconComponent],
  template: `
    <nxt1-auth-shell
      variant="card-glass"
      [showBackButton]="!emailSent()"
      [showLogo]="true"
      [maxWidth]="'440px'"
      (backClick)="onBackClick()"
    >
      <!-- Title -->
      <h1 authTitle class="text-2xl font-bold text-text-primary">
        {{ emailSent() ? 'Check Your Email' : 'Reset Password' }}
      </h1>

      <!-- Subtitle -->
      <p authSubtitle class="mb-2 text-sm text-text-secondary">
        @if (emailSent()) {
          We've sent reset instructions to
          <strong class="font-semibold text-text-primary">{{ sentEmail() }}</strong>
        } @else {
          Enter your email and we'll send you a link to reset your password
        }
      </p>

      <!-- Main Content -->
      <div authContent>
        @if (emailSent()) {
          <!-- Success State -->
          <div class="success-container">
            <!-- Success Icon -->
            <div class="success-icon">
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
              <p class="text-sm text-text-secondary">
                Click the link in your email to reset your password.
              </p>
              <p class="mt-1 text-xs text-text-tertiary">
                If you don't see it, check your spam folder.
              </p>
            </div>

            <!-- Try Again Button (Secondary) -->
            <ion-button fill="outline" expand="block" class="action-btn" (click)="resetForm()">
              <svg
                slot="start"
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
            </ion-button>

            <!-- Back to Sign In Button (Primary) -->
            <ion-button
              expand="block"
              class="action-btn action-btn--primary"
              (click)="goToSignIn()"
            >
              <span>Back to Sign In</span>
              <nxt1-icon name="arrowRight" size="18" slot="end" aria-hidden="true" />
            </ion-button>
          </div>
        } @else {
          <!-- Request State - Form Only (matches auth.page.ts pattern) -->
          <nxt1-auth-email-form
            mode="reset"
            [loading]="authFlow.isLoading()"
            [error]="authFlow.error()"
            [showForgotPassword]="false"
            (submitForm)="onSubmit($event)"
          />
        }
      </div>

      <!-- Footer -->
      <div authFooter class="footer-container">
        @if (!emailSent()) {
          <ion-button fill="clear" class="back-link" (click)="goToSignIn()">
            <nxt1-icon name="chevronLeft" size="16" slot="start" aria-hidden="true" />
            <span>Back to Sign In</span>
          </ion-button>
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
      /* ACTION BUTTONS - Using Ionic + Design Tokens */
      /* ============================================ */
      .action-btn {
        --border-radius: var(--nxt1-borderRadius-lg);
        --padding-start: var(--nxt1-spacing-4);
        --padding-end: var(--nxt1-spacing-4);
        --box-shadow: none;
        --background: transparent;
        --background-hover: var(--nxt1-color-state-hover);
        --background-activated: var(--nxt1-color-state-pressed);
        --border-color: var(--nxt1-color-primary);
        --border-width: 2px;
        --color: var(--nxt1-color-primary);
        width: 100%;
        max-width: 320px;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        text-transform: none;
        letter-spacing: normal;
        margin: 0;
      }

      .action-btn::part(native) {
        min-height: 52px;
        transition: all var(--nxt1-duration-normal) ease-out;
      }

      /* Primary Button (Filled) */
      .action-btn--primary {
        --background: var(--nxt1-color-primary);
        --background-hover: var(--nxt1-color-primaryDark);
        --background-activated: var(--nxt1-color-primaryDark);
        --border-width: 0;
        --color: var(--nxt1-color-text-onPrimary);
      }

      /* ============================================ */
      /* FOOTER                                      */
      /* ============================================ */
      .footer-container {
        display: flex;
        justify-content: center;
        width: 100%;
      }

      /* Back Link - Clear Button Style */
      .back-link {
        --background: transparent;
        --background-hover: transparent;
        --background-activated: transparent;
        --color: var(--nxt1-color-primary);
        --padding-start: var(--nxt1-spacing-2);
        --padding-end: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-body);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        text-transform: none;
        letter-spacing: normal;
        margin: 0;
      }

      .back-link::part(native) {
        padding: var(--nxt1-spacing-2);
        min-height: auto;
        transition: opacity var(--nxt1-duration-fast) ease;
      }

      .back-link:hover::part(native),
      .back-link:active::part(native) {
        opacity: 0.8;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {
  readonly authFlow = inject(AuthFlowService);
  private readonly nav = inject(AuthNavigationService);
  private readonly haptics = inject(HapticsService);

  readonly emailSent = signal(false);
  readonly sentEmail = signal('');

  onBackClick(): void {
    this.nav.navigateBack('/auth');
  }

  goToSignIn(): void {
    this.nav.navigateBack('/auth');
  }

  resetForm(): void {
    this.haptics.impact('light');
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
      this.haptics.notification('success');
    } catch {
      this.haptics.notification('error');
    }
  }
}
