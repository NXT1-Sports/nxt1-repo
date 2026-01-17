/**
 * @fileoverview Forgot Password Component - Using Shared Auth Components
 * @module @nxt1/web
 *
 * Professional password reset page using shared auth components from @nxt1/ui.
 * Demonstrates cross-platform code sharing between web and mobile.
 *
 * ⭐ MATCHES MOBILE'S forgot-password.page.ts INTERFACE ⭐
 */

import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthShellComponent, AuthEmailFormComponent, type AuthEmailFormData } from '@nxt1/ui/auth';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { AuthFlowService } from '../../services';
import { SeoService } from '../../../../core/services';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AuthShellComponent,
    AuthEmailFormComponent,
    IonButton,
    IonIcon,
  ],
  template: `
    <div data-testid="forgot-password-page">
      <nxt1-auth-shell variant="card-glass" [showBackButton]="true" (backClick)="onBackClick()">
        <!-- Title - Conditionally rendered -->
        <ng-container authTitle>
          @if (emailSent()) {
            <h1
              class="text-text-primary text-2xl font-bold"
              data-testid="forgot-password-success-title"
            >
              Check Your Email
            </h1>
          } @else {
            <h1 class="text-text-primary text-2xl font-bold" data-testid="forgot-password-title">
              Reset Password
            </h1>
          }
        </ng-container>

        <!-- Subtitle - Conditionally rendered -->
        <ng-container authSubtitle>
          @if (emailSent()) {
            <p
              class="text-text-secondary mb-2 text-sm"
              data-testid="forgot-password-success-subtitle"
            >
              We've sent reset instructions to {{ sentEmail() }}
            </p>
          } @else {
            <p class="text-text-secondary mb-2 text-sm" data-testid="forgot-password-subtitle">
              Enter your email to receive a reset link
            </p>
          }
        </ng-container>

        <!-- Content - Conditionally rendered -->
        <ng-container authContent>
          @if (emailSent()) {
            <div
              class="flex flex-col items-center gap-6 py-4"
              data-testid="forgot-password-success"
            >
              <div
                class="bg-feedback-success/10 flex h-20 w-20 items-center justify-center rounded-full"
                data-testid="forgot-password-success-icon"
              >
                <ion-icon
                  name="checkmark-circle-outline"
                  class="text-feedback-success text-5xl"
                ></ion-icon>
              </div>

              <p
                class="text-text-tertiary text-center text-sm"
                data-testid="forgot-password-success-message"
              >
                Didn't receive the email? Check your spam folder or
                <button type="button" class="text-primary hover:underline" (click)="resetForm()">
                  try again
                </button>
              </p>

              <ion-button
                expand="block"
                class="w-full"
                routerLink="/auth"
                data-testid="forgot-password-btn-back-to-login"
              >
                Back to Sign In
              </ion-button>
            </div>
          } @else {
            <div data-testid="forgot-password-form">
              <nxt1-auth-email-form
                mode="reset"
                [loading]="authFlow.isLoading()"
                [error]="authFlow.error()"
                [showForgotPassword]="false"
                (submitForm)="onSubmit($event)"
              />
            </div>
          }
        </ng-container>

        <!-- Footer -->
        <p authFooter data-testid="forgot-password-footer">
          <a
            routerLink="/auth"
            class="text-primary hover:text-primaryLight inline-flex items-center gap-2 text-sm transition-colors"
            data-testid="forgot-password-link-back"
          >
            <ion-icon name="arrow-back-outline" class="text-lg"></ion-icon>
            Back to Sign In
          </a>
        </p>
      </nxt1-auth-shell>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent implements OnInit {
  protected readonly authFlow = inject(AuthFlowService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  readonly emailSent = signal(false);
  readonly sentEmail = signal('');

  constructor() {
    addIcons({ arrowBackOutline, checkmarkCircleOutline });
  }

  ngOnInit(): void {
    // Set SEO metadata for password reset page
    this.seo.updatePage({
      title: 'Reset Password',
      description:
        "Forgot your password? Enter your email address and we'll send you instructions to reset your NXT1 Sports account password.",
      keywords: ['reset password', 'forgot password', 'password recovery', 'account recovery'],
    });
  }

  onBackClick(): void {
    this.router.navigate(['/auth']);
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
