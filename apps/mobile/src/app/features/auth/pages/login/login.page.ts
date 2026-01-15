/**
 * @fileoverview Login Page - Native Mobile Authentication
 * @module @nxt1/mobile
 *
 * Enterprise-grade login page matching the v2 design exactly.
 * Features platform-adaptive Ionic components with native haptic feedback.
 *
 * Features:
 * - Social sign-in (Google, Apple, Microsoft)
 * - Email/password sign-in with validation
 * - Team code entry for invite flows
 * - Native iOS/Android feel with Ionic buttons + ripple effects
 * - Safe area handling for notched devices
 *
 * Design System:
 * - Ionic: Native behavior (buttons, ripples, gestures)
 * - Tailwind: Layout (flex, spacing, responsive)
 * - CSS Variables: Theming (--nxt1-* tokens)
 *
 * ⭐ MATCHES WEB'S login.component.ts INTERFACE ⭐
 *
 * Architecture:
 *   LoginPage (UI) → AuthFlowService (Domain) → AuthService (Infra)
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mailOutline, keyOutline } from 'ionicons/icons';
import {
  AuthShellComponent,
  AuthDividerComponent,
  AuthEmailFormComponent,
  type AuthEmailFormData,
} from '@nxt1/ui/auth';
import { AuthFlowService } from '../../services';
import { HapticsService } from '@nxt1/ui/services';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonButton,
    IonIcon,
    AuthShellComponent,
    AuthDividerComponent,
    AuthEmailFormComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="card"
      [showLogo]="true"
      [logoWidth]="120"
      [showBackButton]="showEmailForm()"
      (backClick)="onBackToSocial()"
    >
      <!-- Title & Subtitle -->
      <h1 authTitle>Welcome back</h1>
      <p authSubtitle>Sign in to continue to NXT1</p>

      <!-- Auth Options (default view) -->
      @if (!showEmailForm()) {
        <div class="flex flex-col gap-3 w-full">
          <!-- Google -->
          <ion-button
            expand="block"
            fill="outline"
            class="social-btn"
            [disabled]="isLoading()"
            (click)="onGoogleSignIn()"
          >
            <span slot="start" class="social-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </span>
            Continue with Google
          </ion-button>

          <!-- Apple -->
          <ion-button
            expand="block"
            fill="outline"
            class="social-btn"
            [disabled]="isLoading()"
            (click)="onAppleSignIn()"
          >
            <span slot="start" class="social-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
            </span>
            Continue with Apple
          </ion-button>

          <!-- Microsoft -->
          <ion-button
            expand="block"
            fill="outline"
            class="social-btn"
            [disabled]="isLoading()"
            (click)="onMicrosoftSignIn()"
          >
            <span slot="start" class="social-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F25022"/>
                <path d="M22 11.4h-9.4V2H22v9.4z" fill="#7FBA00"/>
                <path d="M11.4 22H2v-9.4h9.4V22z" fill="#00A4EF"/>
                <path d="M22 22h-9.4v-9.4H22V22z" fill="#FFB900"/>
              </svg>
            </span>
            Continue with Microsoft
          </ion-button>

          <!-- Divider -->
          <nxt1-auth-divider text="or" />

          <!-- Email -->
          <ion-button
            expand="block"
            fill="outline"
            class="social-btn"
            [disabled]="isLoading()"
            (click)="onShowEmailForm()"
          >
            <ion-icon slot="start" name="mail-outline" aria-hidden="true"></ion-icon>
            Continue with Email
          </ion-button>

          <!-- Team Code -->
          <ion-button
            expand="block"
            fill="clear"
            class="team-code-btn"
            [disabled]="isLoading()"
            (click)="onTeamCode()"
          >
            <ion-icon slot="start" name="key-outline" aria-hidden="true"></ion-icon>
            Have a Team Code?
          </ion-button>
        </div>
      }

      <!-- Email Form (shown after clicking "Continue with Email") -->
      @if (showEmailForm()) {
        <div class="w-full max-w-[400px] mx-auto">
          <nxt1-auth-email-form
            mode="login"
            [loading]="isLoading()"
            [error]="authFlow.error()"
            (submitForm)="onEmailSubmit($event)"
            (forgotPasswordClick)="onForgotPassword()"
          />
        </div>
      }

      <!-- Footer - Create Account Link -->
      <p authFooter>
        <span>Don't have an account?</span>
        <a routerLink="/auth/signup">Create account</a>
      </p>
    </nxt1-auth-shell>
  `,
  styles: [
    `
      /* ============================================
       * Social Auth Buttons - Native Ionic styling
       * Uses design system tokens for theming
       * ============================================ */

      .social-btn {
        /* Ionic CSS variables for native feel */
        --background: var(--nxt1-color-surface-200);
        --background-hover: var(--nxt1-color-surface-300);
        --background-activated: var(--nxt1-color-surface-300);
        --background-focused: var(--nxt1-color-surface-300);
        --border-color: var(--nxt1-color-border-default);
        --border-width: 1px;
        --border-radius: 12px;
        --color: var(--nxt1-color-text-primary);
        --color-hover: var(--nxt1-color-text-primary);
        --ripple-color: var(--nxt1-color-primary);

        /* Typography */
        font-family: var(--nxt1-font-family-brand);
        font-weight: 600;
        font-size: 1rem;
        text-transform: none;
        letter-spacing: 0;

        /* Sizing */
        height: 52px;
        margin: 0;

        /* Native touch behavior */
        --padding-start: 16px;
        --padding-end: 16px;
      }

      .social-btn::part(native) {
        justify-content: center;
        gap: 12px;
      }

      .social-btn:hover {
        --border-color: var(--nxt1-color-border-hover);
      }

      /* Social provider icons */
      .social-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      .social-icon svg {
        width: 100%;
        height: 100%;
      }

      /* Ionic icon sizing */
      .social-btn ion-icon {
        font-size: 20px;
      }

      /* ============================================
       * Team Code Button - Outline/dashed variant
       * ============================================ */

      .team-code-btn {
        --background: transparent;
        --background-hover: var(--nxt1-color-surface-200);
        --background-activated: var(--nxt1-color-surface-200);
        --color: var(--nxt1-color-text-secondary);
        --color-hover: var(--nxt1-color-primary);
        --ripple-color: var(--nxt1-color-primary);

        /* Typography */
        font-family: var(--nxt1-font-family-brand);
        font-weight: 600;
        font-size: 1rem;
        text-transform: none;
        letter-spacing: 0;

        /* Sizing */
        height: 52px;
        margin: 0;

        /* Dashed border effect via box-shadow since Ionic doesn't support dashed borders */
        --border-width: 0;
        border: 1px dashed var(--nxt1-color-border-hover);
        border-radius: 12px;
      }

      .team-code-btn:hover {
        border-style: solid;
        --color: var(--nxt1-color-primary);
      }

      .team-code-btn ion-icon {
        font-size: 20px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  // ============================================
  // DEPENDENCIES
  // ============================================
  readonly authFlow = inject(AuthFlowService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);

  // ============================================
  // LOCAL UI STATE
  // ============================================

  /** Whether to show email form vs social buttons */
  readonly showEmailForm = signal(false);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Unified loading state from auth flow service */
  readonly isLoading = computed(() => this.authFlow.isLoading());

  // ============================================
  // CONSTRUCTOR
  // ============================================

  constructor() {
    // Register Ionicons for use in template
    addIcons({ mailOutline, keyOutline });
  }

  // ============================================
  // UI ACTIONS (with haptics)
  // ============================================

  /** Show the email/password form */
  async onShowEmailForm(): Promise<void> {
    await this.haptics.impact('light');
    this.authFlow.clearError();
    this.showEmailForm.set(true);
  }

  /** Return to social buttons view */
  async onBackToSocial(): Promise<void> {
    await this.haptics.impact('light');
    this.authFlow.clearError();
    this.showEmailForm.set(false);
  }

  // ============================================
  // AUTH ACTIONS (with haptics)
  // ============================================

  /**
   * Submit email/password credentials
   */
  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    this.authFlow.clearError();
    try {
      await this.haptics.impact('medium');
      const success = await this.authFlow.signInWithEmail({
        email: data.email,
        password: data.password,
      });

      if (success) {
        await this.haptics.notification('success');
      } else {
        await this.haptics.notification('error');
      }
    } catch {
      await this.haptics.notification('error');
    }
  }

  /**
   * Sign in with Google OAuth
   */
  async onGoogleSignIn(): Promise<void> {
    try {
      await this.haptics.impact('medium');
      const success = await this.authFlow.signInWithGoogle();
      if (success) {
        await this.haptics.notification('success');
      } else {
        await this.haptics.notification('error');
      }
    } catch {
      await this.haptics.notification('error');
    }
  }

  /**
   * Sign in with Apple ID
   * TODO: Implement Apple Sign-In when backend support is ready
   */
  async onAppleSignIn(): Promise<void> {
    await this.haptics.impact('light');
    // Apple Sign-In not yet implemented
    // await this.authFlow.signInWithApple();
    console.log('Apple Sign-In coming soon');
  }

  /**
   * Sign in with Microsoft Account
   * TODO: Implement Microsoft Sign-In when backend support is ready
   */
  async onMicrosoftSignIn(): Promise<void> {
    await this.haptics.impact('light');
    // Microsoft Sign-In not yet implemented
    // await this.authFlow.signInWithMicrosoft();
    console.log('Microsoft Sign-In coming soon');
  }

  // ============================================
  // NAVIGATION
  // ============================================

  /** Navigate to forgot password page */
  onForgotPassword(): void {
    this.router.navigate(['/auth/forgot-password']);
  }

  /** Navigate to signup with team code flow */
  async onTeamCode(): Promise<void> {
    await this.haptics.impact('light');
    await this.router.navigate(['/auth/signup'], { queryParams: { teamCode: true } });
  }
}
