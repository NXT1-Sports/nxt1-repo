/**
 * @fileoverview Register Page - Using Shared Auth Components
 * @module @nxt1/mobile
 *
 * Professional registration page using shared auth components from @nxt1/ui.
 * Demonstrates cross-platform code sharing between web and mobile.
 */

import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  AuthShellComponent,
  AuthSocialButtonsComponent,
  AuthDividerComponent,
  AuthEmailFormComponent,
  type AuthEmailFormData,
} from '@nxt1/ui/auth';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { keyOutline } from 'ionicons/icons';
import { MobileAuthService } from '../services/mobile-auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    AuthShellComponent,
    AuthSocialButtonsComponent,
    AuthDividerComponent,
    AuthEmailFormComponent,
    IonIcon,
  ],
  template: `
    <nxt1-auth-shell
      variant="card"
      [showBackButton]="showEmailForm()"
      (backClick)="showEmailForm.set(false)"
    >
      <!-- Title & Subtitle -->
      <h1 authTitle>Create Account</h1>
      <p authSubtitle>Join NXT1 to start your recruiting journey</p>

      <!-- Social Buttons (default view) -->
      @if (!showEmailForm()) {
        <nxt1-auth-social-buttons
          [loading]="authService.isLoading()"
          (googleClick)="googleSignUp()"
          (appleClick)="appleSignUp()"
          (microsoftClick)="microsoftSignUp()"
        />

        <nxt1-auth-divider />

        <div class="flex flex-col gap-3 w-full">
          <button
            type="button"
            class="flex items-center justify-center gap-3 w-full h-12 px-4
                   border border-border rounded-xl
                   bg-surface-200 text-text-primary
                   text-[15px] font-medium
                   transition-all duration-200
                   hover:bg-surface-300 hover:border-white/20
                   active:scale-[0.98]
                   disabled:opacity-50 disabled:cursor-not-allowed"
            [disabled]="authService.isLoading()"
            (click)="showEmailForm.set(true)"
          >
            <span>Continue with Email</span>
          </button>

          <button
            type="button"
            class="flex items-center justify-center gap-3 w-full h-12 px-4
                   border border-border rounded-xl
                   bg-transparent text-text-primary
                   text-[15px] font-medium
                   transition-all duration-200
                   hover:bg-white/5 hover:border-white/20
                   active:scale-[0.98]
                   disabled:opacity-50 disabled:cursor-not-allowed"
            [disabled]="authService.isLoading()"
            (click)="onTeamCode()"
          >
            <ion-icon name="key-outline" class="text-xl text-text-secondary"></ion-icon>
            <span>Have a Team Code?</span>
          </button>
        </div>
      }

      <!-- Email Form -->
      @if (showEmailForm()) {
        <nxt1-auth-email-form
          mode="signup"
          [loading]="authService.isLoading()"
          [error]="authService.error()"
          (submitForm)="onEmailSubmit($event)"
        />
      }

      <!-- Footer -->
      <p authFooter>
        Already have an account?
        <a routerLink="/auth/login" class="text-primary hover:text-primary-600 transition-colors">
          Sign In
        </a>
      </p>

      <!-- Terms -->
      <p authTerms>
        By continuing, you agree to NXT1's
        <a href="/terms" class="text-primary hover:text-primary-600 transition-colors">Terms of Service</a>
        and
        <a href="/privacy" class="text-primary hover:text-primary-600 transition-colors">Privacy Policy</a>
      </p>
    </nxt1-auth-shell>
  `,
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  readonly authService = inject(MobileAuthService);
  private readonly router = inject(Router);

  showEmailForm = signal(false);

  constructor() {
    addIcons({ keyOutline });
  }

  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    this.authService.clearError();
    try {
      // Parse displayName into first/last name if provided
      const [firstName = '', lastName = ''] = (data.displayName || '').trim().split(/\s+/, 2);

      await this.authService.signUp({
        email: data.email,
        password: data.password,
        firstName,
        lastName,
      });
    } catch {
      // Error is handled by auth service
    }
  }

  async googleSignUp(): Promise<void> {
    // TODO: Implement Google Sign Up
    console.log('Google Sign Up');
  }

  async appleSignUp(): Promise<void> {
    // TODO: Implement Apple Sign Up
    console.log('Apple Sign Up');
  }

  async microsoftSignUp(): Promise<void> {
    // TODO: Implement Microsoft Sign Up
    console.log('Microsoft Sign Up');
  }

  onTeamCode(): void {
    // TODO: Implement Team Code flow
    console.log('Team Code');
  }
}
