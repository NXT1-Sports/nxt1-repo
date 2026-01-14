/**
 * @fileoverview Forgot Password Page - Platform-Adaptive with Haptic Feedback
 * @module @nxt1/mobile
 *
 * Professional password reset page using shared auth components from @nxt1/ui.
 * Features platform-adaptive Ionic components with native haptic feedback.
 *
 * ⭐ MATCHES WEB'S forgot-password.component.ts INTERFACE ⭐
 */

import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthShellComponent } from '@nxt1/ui/auth';
import {
  IonButton,
  IonIcon,
  IonInput,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mailOutline, arrowBackOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { AuthFlowService } from '../../services';
import { HapticsService } from '@nxt1/ui/services';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    AuthShellComponent,
    IonButton,
    IonIcon,
    IonInput,
    IonSpinner,
  ],
  template: `
    <nxt1-auth-shell variant="card" [showBackButton]="true" (backClick)="onBackClick()">
      <!-- Title & Subtitle -->
      <h1 authTitle>Reset Password</h1>
      <p authSubtitle>Enter your email to receive a reset link</p>

      <!-- Success State -->
      @if (emailSent()) {
        <div class="text-center py-6 w-full">
          <ion-icon
            name="checkmark-circle-outline"
            class="text-[64px] text-success mb-4"
          ></ion-icon>
          <h2 class="text-xl font-semibold mb-2 text-text-primary">Email Sent!</h2>
          <p class="text-text-secondary text-sm mb-6">
            Check your inbox for instructions to reset your password.
          </p>
          <ion-button
            expand="block"
            class="reset-button"
            routerLink="/auth/login"
          >
            Back to Sign In
          </ion-button>
        </div>
      } @else {
        <!-- Reset Form -->
        <form (ngSubmit)="onSubmit()" class="w-full flex flex-col gap-4">
          <!-- Email Input -->
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-text-secondary">Email</label>
            <ion-input
              type="email"
              [(ngModel)]="email"
              name="email"
              placeholder="Enter your email"
              class="auth-input"
              fill="outline"
              autocomplete="email"
            >
              <ion-icon slot="start" name="mail-outline" aria-hidden="true"></ion-icon>
            </ion-input>
          </div>

          <!-- Error Message -->
          @if (authFlow.error()) {
            <div class="bg-error/10 text-error text-sm p-3 rounded-lg">
              {{ authFlow.error() }}
            </div>
          }

          <!-- Submit Button -->
          <ion-button
            type="submit"
            expand="block"
            class="reset-button"
            [disabled]="authFlow.isLoading() || !email"
          >
            @if (authFlow.isLoading()) {
              <ion-spinner name="crescent"></ion-spinner>
            } @else {
              Send Reset Link
            }
          </ion-button>
        </form>
      }

      <!-- Footer -->
      <p authFooter>
        <a
          routerLink="/auth/login"
          class="inline-flex items-center gap-1 text-text-secondary hover:text-primary transition-colors"
        >
          <ion-icon name="arrow-back-outline" class="text-lg"></ion-icon>
          Back to Sign In
        </a>
      </p>
    </nxt1-auth-shell>
  `,
  styles: [
    `
      .auth-input {
        --background: var(--nxt1-color-surface-200);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: 12px;
        --padding-start: 16px;
        --padding-end: 16px;
        --highlight-color-focused: var(--nxt1-color-primary);
      }

      .reset-button {
        --background: var(--nxt1-color-primary);
        --background-hover: var(--nxt1-color-primary-500);
        --color: var(--nxt1-color-bg-primary);
        font-family: var(--nxt1-font-family-brand);
        font-weight: 600;
        height: 48px;
        margin-top: 8px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {
  readonly authFlow = inject(AuthFlowService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);

  email = '';
  emailSent = signal(false);

  constructor() {
    addIcons({ mailOutline, arrowBackOutline, checkmarkCircleOutline });
  }

  async onBackClick(): Promise<void> {
    await this.haptics.impact('light');
    this.router.navigate(['/auth/login']);
  }

  async onSubmit(): Promise<void> {
    if (!this.email) return;

    try {
      await this.haptics.impact('medium');
      const success = await this.authFlow.sendPasswordResetEmail(this.email);

      if (success) {
        await this.haptics.notification('success');
        this.emailSent.set(true);
      } else {
        await this.haptics.notification('error');
      }
    } catch {
      await this.haptics.notification('error');
    }
  }
}
