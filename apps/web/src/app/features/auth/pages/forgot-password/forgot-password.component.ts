/**
 * @fileoverview Forgot Password Component - Using Shared Auth Components
 * @module @nxt1/web
 *
 * Professional password reset page using shared auth components from @nxt1/ui.
 * Demonstrates cross-platform code sharing between web and mobile.
 *
 * ⭐ MATCHES MOBILE'S forgot-password.page.ts INTERFACE ⭐
 */

import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthShellComponent } from '@nxt1/ui/auth';
import { IonButton, IonIcon, IonInput, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mailOutline, arrowBackOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { AuthFlowService } from '../../services';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  readonly authFlow = inject(AuthFlowService);
  private readonly router = inject(Router);

  email = '';
  emailSent = signal(false);

  constructor() {
    addIcons({ mailOutline, arrowBackOutline, checkmarkCircleOutline });
  }

  onBackClick(): void {
    this.router.navigate(['/auth/login']);
  }

  async onSubmit(): Promise<void> {
    if (!this.email) return;

    try {
      await this.authFlow.sendPasswordResetEmail(this.email);
      this.emailSent.set(true);
    } catch {
      // Error is handled by auth flow service
    }
  }
}
