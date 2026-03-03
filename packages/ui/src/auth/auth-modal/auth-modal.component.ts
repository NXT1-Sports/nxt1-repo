/**
 * @fileoverview AuthModalComponent - Popup Authentication Modal
 * @module @nxt1/ui/auth
 * @version 2.0.0
 *
 * Professional popup modal version of the /auth page, designed for in-app
 * authentication prompts (e.g., "Sign in to continue", gated features,
 * expired sessions). Uses the same shared auth components from @nxt1/ui
 * that power the full /auth page, ensuring 100% visual and functional parity.
 *
 * v2.0 — Removed Ionic ModalController dependency. Now uses Angular output
 * events to communicate dismissal to the shared NxtOverlayService.
 *
 * Pattern: Twitter/X, Instagram, Spotify, LinkedIn, YouTube, Reddit
 *
 * Features:
 * - Same social login buttons, email form, and mode switcher as /auth page
 * - Glassmorphic modal card with backdrop blur (2026 design language)
 * - Smooth CSS transitions between views (social → email, etc.)
 * - Context-aware title/subtitle (configurable via inputs)
 * - Keyboard-aware layout (mobile)
 * - SSR-safe, OnPush change detection
 *
 * Usage (via AuthModalService):
 * ```typescript
 * const result = await this.authModal.present();
 * if (result.authenticated) {
 *   // User signed in successfully
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  Input,
  OnInit,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { NxtLogoComponent } from '../../components/logo';
import { AuthSocialButtonsComponent } from '../auth-social-buttons';
import { AuthActionButtonsComponent } from '../auth-action-buttons';
import { AuthDividerComponent } from '../auth-divider';
import { AuthEmailFormComponent, type AuthEmailFormData } from '../auth-email-form';
import { AuthModeSwitcherComponent, type AuthMode } from '../auth-mode-switcher';
import { AuthTermsDisclaimerComponent } from '../auth-terms-disclaimer';

/** Auth modal result payload — emitted via the `dismiss` output */
export interface AuthModalDismissPayload {
  authenticated: boolean;
  provider?: string;
  mode?: AuthMode;
  emailData?: AuthEmailFormData;
  reason: 'authenticated' | 'closed' | 'forgot-password' | 'provider-selected';
}

/** Supported social auth providers */
type AuthProvider = 'google' | 'apple' | 'microsoft' | 'email';

@Component({
  selector: 'nxt1-auth-modal',
  standalone: true,
  imports: [
    CommonModule,
    NxtLogoComponent,
    AuthSocialButtonsComponent,
    AuthActionButtonsComponent,
    AuthDividerComponent,
    AuthEmailFormComponent,
    AuthModeSwitcherComponent,
    AuthTermsDisclaimerComponent,
  ],
  template: `
    <div class="auth-modal-container" data-testid="auth-modal">
      <!-- Scrollable Content -->
      <div class="auth-modal-scroll">
        <!-- Logo -->
        @if (showLogo) {
          <div class="auth-modal-logo">
            <nxt1-logo size="md" variant="auth" />
          </div>
        }

        <!-- Title -->
        <h2 class="auth-modal-title" data-testid="auth-modal-title">
          {{ currentTitle() }}
        </h2>

        <!-- Subtitle -->
        <p class="auth-modal-subtitle" data-testid="auth-modal-subtitle">
          {{ currentSubtitle() }}
        </p>

        <!-- Content Area with View Transitions -->
        <div class="auth-modal-content">
          <!-- ========================================== -->
          <!-- VIEW 1: Social Buttons (Default)          -->
          <!-- ========================================== -->
          @if (!showEmailForm()) {
            <div class="auth-modal-view" data-testid="auth-modal-social-view">
              <nxt1-auth-social-buttons
                [loading]="loading()"
                (googleClick)="onSocialAuth('google')"
                (appleClick)="onSocialAuth('apple')"
                (microsoftClick)="onSocialAuth('microsoft')"
              />

              <nxt1-auth-divider />

              <nxt1-auth-action-buttons
                [loading]="loading()"
                [showTeamCode]="false"
                (emailClick)="onShowEmailForm()"
              />
            </div>
          }

          <!-- ========================================== -->
          <!-- VIEW 2: Email Form                        -->
          <!-- ========================================== -->
          @if (showEmailForm()) {
            <div class="auth-modal-view" data-testid="auth-modal-email-view">
              <!-- Back to Social -->
              <button
                type="button"
                class="auth-modal-back"
                (click)="onBackToSocial()"
                aria-label="Back to sign-in options"
                data-testid="auth-modal-back"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span>Back</span>
              </button>

              <!-- Mode Switcher (Sign In / Sign Up) -->
              <nxt1-auth-mode-switcher [mode]="mode()" (modeChange)="setMode($event)" />

              <!-- Email Form -->
              <nxt1-auth-email-form
                [mode]="mode()"
                [loading]="loading()"
                [error]="error()"
                (submitForm)="onEmailSubmit($event)"
                (forgotPasswordClick)="onForgotPassword()"
              />

              <!-- Terms (signup only) -->
              @if (mode() === 'signup') {
                <nxt1-auth-terms-disclaimer />
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================ */
      /* MODAL CONTAINER — Pure content, no chrome   */
      /* (Overlay shell provides bg, border-radius,  */
      /*  shadow, close button)                      */
      /* ============================================ */
      .auth-modal-container {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      /* ============================================ */
      /* SCROLLABLE CONTENT                          */
      /* ============================================ */
      .auth-modal-scroll {
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-6, 24px);
        padding-top: var(--nxt1-spacing-6, 24px);
      }

      /* ============================================ */
      /* LOGO                                        */
      /* ============================================ */
      .auth-modal-logo {
        display: flex;
        justify-content: center;
        margin-bottom: var(--nxt1-spacing-5, 20px);
      }

      /* ============================================ */
      /* TITLE & SUBTITLE                            */
      /* ============================================ */
      .auth-modal-title {
        text-align: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl, 1.5rem);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-1_5, 6px) 0;
        line-height: 1.3;
      }

      .auth-modal-subtitle {
        text-align: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-6, 24px) 0;
        line-height: 1.5;
      }

      /* ============================================ */
      /* CONTENT AREA                                */
      /* ============================================ */
      .auth-modal-content {
        width: 100%;
      }

      .auth-modal-view {
        animation: authModalFadeIn var(--nxt1-duration-normal, 200ms) ease-out;
      }

      @keyframes authModalFadeIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ============================================ */
      /* BACK BUTTON (Email view)                    */
      /* ============================================ */
      .auth-modal-back {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
        padding: var(--nxt1-spacing-1, 4px) var(--nxt1-spacing-2, 8px);
        margin-bottom: var(--nxt1-spacing-4, 16px);
        border: none;
        border-radius: var(--nxt1-borderRadius-md, 8px);
        background: transparent;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) ease;
      }

      .auth-modal-back:hover {
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
      }

      .auth-modal-back:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      /* ============================================ */
      /* RESPONSIVE                                  */
      /* ============================================ */
      @media (max-width: 480px) {
        .auth-modal-scroll {
          padding: var(--nxt1-spacing-5, 20px) var(--nxt1-spacing-4, 16px);
          padding-top: var(--nxt1-spacing-5, 20px);
        }

        .auth-modal-title {
          font-size: var(--nxt1-fontSize-xl, 1.25rem);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthModalComponent implements OnInit {
  // ============================================
  // OUTPUTS — communicate with NxtOverlayService
  // The overlay service listens for 'dismiss' output
  // ============================================

  /**
   * Emitted when the modal should close with a result.
   * The NxtOverlayService listens for this output and
   * automatically animates out + resolves the closed promise.
   */
  readonly dismiss = output<AuthModalDismissPayload>();

  // ============================================
  // INPUTS (set via overlay service setInput())
  // Using @Input() for compatibility
  // ============================================

  /** Title override (e.g., "Sign in to continue") */
  @Input() title?: string;

  /** Subtitle override (e.g., "You need an account to like posts") */
  @Input() subtitle?: string;

  /** Initial mode: login or signup */
  @Input() initialMode: AuthMode = 'login';

  /** Whether to show the NXT1 logo */
  @Input() showLogo = true;

  /** Callback: Google auth — return true if auth succeeded */
  @Input() googleHandler?: () => Promise<boolean>;

  /** Callback: Apple auth — return true if auth succeeded */
  @Input() appleHandler?: () => Promise<boolean>;

  /** Callback: Microsoft auth — return true if auth succeeded */
  @Input() microsoftHandler?: () => Promise<boolean>;

  /** Callback: Email auth — return true if auth succeeded */
  @Input() emailAuthHandler?: (mode: AuthMode, data: AuthEmailFormData) => Promise<boolean>;

  /** Callback: Forgot password clicked */
  @Input() forgotPasswordHandler?: () => void;

  // ============================================
  // INTERNAL STATE
  // ============================================

  /** Current auth mode */
  readonly mode = signal<AuthMode>('login');

  /** Whether to show email form */
  readonly showEmailForm = signal(false);

  /** Loading state */
  readonly loading = signal(false);

  /** Error message */
  readonly error = signal<string | null>(null);

  // ============================================
  // COMPUTED SIGNALS
  // ============================================

  /** Dynamic title based on state */
  readonly currentTitle = computed(() => {
    if (this.title) return this.title;
    return this.mode() === 'login' ? 'Welcome back' : 'Create Account';
  });

  /** Dynamic subtitle based on state */
  readonly currentSubtitle = computed(() => {
    if (this.subtitle) return this.subtitle;
    return this.mode() === 'login'
      ? 'Sign in to continue to NXT1'
      : 'Join NXT1 to start your journey';
  });

  /** Map provider name to its handler */
  private readonly providerHandlers: Record<string, (() => Promise<boolean>) | undefined> = {};

  ngOnInit(): void {
    this.mode.set(this.initialMode);

    // Build handler map after inputs are set
    this.providerHandlers['google'] = this.googleHandler;
    this.providerHandlers['apple'] = this.appleHandler;
    this.providerHandlers['microsoft'] = this.microsoftHandler;
  }

  // ============================================
  // VIEW NAVIGATION
  // ============================================

  /** Switch to email form view */
  onShowEmailForm(): void {
    this.error.set(null);
    this.showEmailForm.set(true);
  }

  /** Switch back to social buttons view */
  onBackToSocial(): void {
    this.error.set(null);
    this.showEmailForm.set(false);
  }

  /** Set auth mode (login/signup) */
  setMode(newMode: AuthMode): void {
    this.error.set(null);
    this.mode.set(newMode);
  }

  // ============================================
  // AUTH ACTIONS
  // ============================================

  /** Handle social auth (Google, Apple, Microsoft) — DRY pattern */
  async onSocialAuth(provider: AuthProvider): Promise<void> {
    const handler = this.providerHandlers[provider];

    if (!handler) {
      this.dismissWithProvider(provider);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const success = await handler();
      if (success) {
        this.dismissAuthenticated(provider);
      }
    } catch (err) {
      const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
      this.error.set(err instanceof Error ? err.message : `${providerName} sign-in failed`);
    } finally {
      this.loading.set(false);
    }
  }

  /** Handle email form submission */
  async onEmailSubmit(data: AuthEmailFormData): Promise<void> {
    if (!this.emailAuthHandler) {
      this.dismissWithProvider('email', data);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const success = await this.emailAuthHandler(this.mode(), data);
      if (success) {
        this.dismissAuthenticated('email');
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      this.loading.set(false);
    }
  }

  /** Handle forgot password click — dismiss modal for parent to navigate */
  onForgotPassword(): void {
    this.forgotPasswordHandler?.();
    this.dismiss.emit({ authenticated: false, reason: 'forgot-password' });
  }

  /** Close modal without authenticating */
  onClose(): void {
    this.dismiss.emit({ authenticated: false, reason: 'closed' });
  }

  // ============================================
  // PRIVATE DISMISS HELPERS
  // ============================================

  /** Dismiss with successful authentication */
  private dismissAuthenticated(provider: string): void {
    this.dismiss.emit({ authenticated: true, provider, reason: 'authenticated' });
  }

  /** Dismiss with provider selection (when no callback provided) */
  private dismissWithProvider(provider: string, data?: AuthEmailFormData): void {
    this.dismiss.emit({
      authenticated: false,
      provider,
      mode: this.mode(),
      emailData: data,
      reason: 'provider-selected',
    });
  }
}
