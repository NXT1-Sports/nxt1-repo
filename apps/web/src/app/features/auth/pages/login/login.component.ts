/**
 * @fileoverview Login Component - Professional Auth UI
 * @module @nxt1/web
 *
 * Enterprise-grade login page matching the v2 design exactly.
 * Features two-column layout on desktop with QR codes for app download,
 * single column on mobile with app store buttons.
 *
 * Features:
 * - Social sign-in (Google, Apple, Microsoft)
 * - Email/password sign-in with validation
 * - Team code entry for invite flows
 * - App download promotion (QR codes on desktop, buttons on mobile)
 * - Responsive design (desktop → tablet → mobile)
 * - WCAG 2.1 AA accessible
 * - SSR-safe with hydration support
 *
 * Architecture:
 *   LoginComponent (UI) → AuthFlowService (Domain) → AuthService (Infra)
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import {
  AuthShellComponent,
  AuthDividerComponent,
  AuthEmailFormComponent,
  type AuthEmailFormData,
} from '@nxt1/ui/auth';
import { AuthFlowService } from '../../services';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    AuthShellComponent,
    AuthDividerComponent,
    AuthEmailFormComponent,
  ],
  template: `
    <nxt1-auth-shell
      variant="minimal"
      [showLogo]="true"
      [logoWidth]="140"
      [maxWidth]="'100%'"
      [showBackButton]="showEmailForm()"
      (backClick)="onBackToSocial()"
      data-testid="login-page"
    >
      <!-- Title & Subtitle -->
      <h1 authTitle data-testid="login-title">Welcome back</h1>
      <p authSubtitle data-testid="login-subtitle">Sign in to continue to NXT1</p>

      <!-- Main Content: Two-column layout on desktop -->
      @if (!showEmailForm()) {
        <div class="auth-card">
          <div class="auth-two-column">
            <!-- Left Column: Auth Options -->
            <div class="auth-column auth-column--primary">
            <!-- Google -->
            <button
              type="button"
              class="social-btn"
              [disabled]="isLoading()"
              (click)="onGoogleSignIn()"
              aria-label="Continue with Google"
              data-testid="login-btn-google"
            >
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            <!-- Apple (UI present, functionality commented out) -->
            <button
              type="button"
              class="social-btn"
              [disabled]="isLoading()"
              (click)="onAppleSignIn()"
              aria-label="Continue with Apple"
              data-testid="login-btn-apple"
            >
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              <span>Continue with Apple</span>
            </button>

            <!-- Microsoft (UI present, functionality commented out) -->
            <button
              type="button"
              class="social-btn"
              [disabled]="isLoading()"
              (click)="onMicrosoftSignIn()"
              aria-label="Continue with Microsoft"
              data-testid="login-btn-microsoft"
            >
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F25022"/>
                <path d="M22 11.4h-9.4V2H22v9.4z" fill="#7FBA00"/>
                <path d="M11.4 22H2v-9.4h9.4V22z" fill="#00A4EF"/>
                <path d="M22 22h-9.4v-9.4H22V22z" fill="#FFB900"/>
              </svg>
              <span>Continue with Microsoft</span>
            </button>

            <!-- Divider -->
            <nxt1-auth-divider text="or" />

            <!-- Email -->
            <button
              type="button"
              class="social-btn"
              [disabled]="isLoading()"
              (click)="onShowEmailForm()"
              aria-label="Continue with email"
              data-testid="login-btn-email"
            >
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 8L12 13L4 8V6L12 11L20 6V8Z"/>
              </svg>
              <span>Continue with Email</span>
            </button>

            <!-- Team Code -->
            <button
              type="button"
              class="social-btn social-btn--outline"
              [disabled]="isLoading()"
              (click)="onTeamCode()"
              aria-label="Enter team code"
              data-testid="login-btn-teamcode"
            >
              <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 17C12.5523 17 13 16.5523 13 16C13 15.4477 12.5523 15 12 15C11.4477 15 11 15.4477 11 16C11 16.5523 11.4477 17 12 17Z"/>
                <path d="M18 8H17V6C17 3.24 14.76 1 12 1C9.24 1 7 3.24 7 6V8H6C4.9 8 4 8.9 4 10V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V10C20 8.9 19.1 8 18 8ZM9 6C9 4.34 10.34 3 12 3C13.66 3 15 4.34 15 6V8H9V6ZM18 20H6V10H18V20Z"/>
              </svg>
              <span>Have a Team Code?</span>
            </button>
          </div>

          <!-- Vertical Divider (Desktop Only) -->
          <div class="auth-divider-vertical">
            <div class="divider-line"></div>
            <span class="divider-text">or</span>
            <div class="divider-line"></div>
          </div>

          <!-- Right Column: App Download (Desktop Only) -->
          <div class="auth-column auth-column--secondary">
            <div class="app-promo">
              <svg class="app-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/>
              </svg>
              <h3>Get the NXT1 App</h3>
              <p>Scan with your phone camera</p>

              <div class="qr-codes">
                <div class="qr-item">
                  <img
                    src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://apps.apple.com/us/app/nxt-1/id6446410344&bgcolor=0a0a0a&color=ffffff"
                    alt="App Store QR Code"
                    loading="lazy"
                  />
                  <span class="qr-label">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    App Store
                  </span>
                </div>
                <div class="qr-item">
                  <img
                    src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://play.google.com/store/apps/details?id=com.nxt1sports.app.twa&bgcolor=0a0a0a&color=ffffff"
                    alt="Google Play QR Code"
                    loading="lazy"
                  />
                  <span class="qr-label">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.25-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"/>
                    </svg>
                    Google Play
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Mobile: App Store Buttons -->
        <div class="app-download-mobile">
          <div class="download-divider">
            <span>Get the App</span>
          </div>
          <div class="store-buttons">
            <a
              href="https://apps.apple.com/us/app/nxt-1/id6446410344"
              target="_blank"
              rel="noopener noreferrer"
              class="store-btn"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              <div class="store-btn-text">
                <span class="store-btn-label">Download on the</span>
                <span class="store-btn-name">App Store</span>
              </div>
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.nxt1sports.app.twa"
              target="_blank"
              rel="noopener noreferrer"
              class="store-btn"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.25-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"/>
              </svg>
              <div class="store-btn-text">
                <span class="store-btn-label">Get it on</span>
                <span class="store-btn-name">Google Play</span>
              </div>
            </a>
          </div>
        </div>
        </div>
      }

      <!-- Email Form (shown after clicking "Continue with Email") -->
      @if (showEmailForm()) {
        <div class="w-full max-w-[400px] mx-auto" data-testid="login-email-section">
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
      <p authFooter data-testid="login-footer">
        <span>Don't have an account?</span>
        <a routerLink="/auth/signup" data-testid="login-link-signup">Create account</a>
      </p>
    </nxt1-auth-shell>
  `,
  styles: [`
    /* Card container */
    .auth-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 1.5rem;
      width: 100%;
      max-width: 400px;
      margin: 0 auto;
    }

    @media (min-width: 900px) {
      .auth-card {
        max-width: 720px;
        padding: 2rem 2.5rem;
      }
    }

    /* Two-column layout */
    .auth-two-column {
      display: flex;
      flex-direction: column;
      width: 100%;
      gap: 0;
    }

    @media (min-width: 900px) {
      .auth-two-column {
        flex-direction: row;
        align-items: center;
        justify-content: space-evenly;
        gap: 0;
      }
    }

    /* Primary column (auth options) */
    .auth-column--primary {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
    }

    @media (min-width: 900px) {
      .auth-column--primary {
        flex: 0 0 auto;
        width: 280px;
      }
    }

    /* Secondary column (app promo) - Desktop only */
    .auth-column--secondary {
      display: none;
    }

    @media (min-width: 900px) {
      .auth-column--secondary {
        display: flex;
        flex: 0 0 auto;
        width: 240px;
        align-items: center;
        justify-content: center;
      }
    }

    /* Vertical divider - Desktop only */
    .auth-divider-vertical {
      display: none;
    }

    @media (min-width: 900px) {
      .auth-divider-vertical {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 0 2rem;
        align-self: stretch;
      }

      .auth-divider-vertical .divider-line {
        width: 1px;
        flex: 1;
        background: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        min-height: 40px;
      }

      .auth-divider-vertical .divider-text {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
    }

    /* Social buttons */
    .social-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      width: 100%;
      height: 52px;
      padding: 0 1rem;
      border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
      border-radius: 8px;
      background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      color: var(--nxt1-color-text-primary, #ffffff);
      font-family: var(--nxt1-font-family-brand);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .social-btn:hover:not(:disabled) {
      background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.06));
      border-color: var(--nxt1-color-border-hover, rgba(255, 255, 255, 0.15));
      transform: translateY(-1px);
    }

    .social-btn:active:not(:disabled) {
      transform: scale(0.98);
    }

    .social-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .social-btn .icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    /* Outline variant */
    .social-btn--outline {
      background: transparent;
      border-style: dashed;
      border-color: var(--nxt1-color-border-hover, rgba(255, 255, 255, 0.15));
      color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
    }

    .social-btn--outline:hover:not(:disabled) {
      background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      border-style: solid;
      color: var(--nxt1-color-primary, #ccff00);
    }

    /* App promo section */
    .app-promo {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 0.625rem;
    }

    .app-promo .app-icon {
      width: 48px;
      height: 48px;
      color: var(--nxt1-color-primary, #ccff00);
    }

    .app-promo h3 {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--nxt1-color-text-primary, #ffffff);
      margin: 0;
    }

    .app-promo p {
      font-size: 0.875rem;
      color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      margin: 0;
    }

    /* QR codes */
    .qr-codes {
      display: flex;
      gap: 0.875rem;
      margin-top: 0.625rem;
    }

    .qr-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }

    .qr-item img {
      width: 96px;
      height: 96px;
      border-radius: 8px;
      background: #fff;
      padding: 4px;
    }

    .qr-label {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
    }

    .qr-label svg {
      width: 14px;
      height: 14px;
    }

    /* Mobile app download - Hidden on desktop */
    .app-download-mobile {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
    }

    @media (min-width: 900px) {
      .app-download-mobile {
        display: none;
      }
    }

    .download-divider {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .download-divider span {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .store-buttons {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
    }

    .store-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      border: 1px solid var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.2s ease;
    }

    .store-btn:hover {
      background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.06));
      border-color: var(--nxt1-color-border-hover, rgba(255, 255, 255, 0.15));
    }

    .store-btn svg {
      width: 24px;
      height: 24px;
      color: var(--nxt1-color-text-primary, #ffffff);
    }

    .store-btn-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .store-btn-label {
      font-size: 10px;
      color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      line-height: 1;
    }

    .store-btn-name {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--nxt1-color-text-primary, #ffffff);
      line-height: 1.2;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  // ============================================
  // DEPENDENCIES
  // ============================================
  readonly authFlow = inject(AuthFlowService);
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
    // Icons are rendered inline as SVG
  }

  // ============================================
  // UI ACTIONS
  // ============================================

  /** Show the email/password form */
  onShowEmailForm(): void {
    this.authFlow.clearError();
    this.showEmailForm.set(true);
  }

  /** Return to social buttons view */
  onBackToSocial(): void {
    this.authFlow.clearError();
    this.showEmailForm.set(false);
  }

  // ============================================
  // AUTH ACTIONS
  // ============================================

  /**
   * Submit email/password credentials
   */
  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    this.authFlow.clearError();
    try {
      await this.authFlow.signInWithEmail({
        email: data.email,
        password: data.password,
      });
    } catch {
      // Error is handled by AuthFlowService and displayed via error signal
    }
  }

  /**
   * Sign in with Google OAuth
   */
  async onGoogleSignIn(): Promise<void> {
    try {
      await this.authFlow.signInWithGoogle();
    } catch {
      // Error handled by AuthFlowService
    }
  }

  /**
   * Sign in with Apple ID
   * TODO: Implement Apple Sign-In when backend support is ready
   */
  async onAppleSignIn(): Promise<void> {
    // Apple Sign-In not yet implemented
    // await this.authFlow.signInWithApple();
    console.log('Apple Sign-In coming soon');
  }

  /**
   * Sign in with Microsoft Account
   * TODO: Implement Microsoft Sign-In when backend support is ready
   */
  async onMicrosoftSignIn(): Promise<void> {
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
  onTeamCode(): void {
    this.router.navigate(['/auth/signup'], { queryParams: { teamCode: true } });
  }
}
