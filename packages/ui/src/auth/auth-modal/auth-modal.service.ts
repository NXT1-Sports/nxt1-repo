/**
 * @fileoverview AuthModalService - Popup Auth Modal Orchestrator
 * @module @nxt1/ui/auth
 * @version 2.0.0
 *
 * Enterprise-grade service for presenting the authentication modal.
 * Provides a simple API for triggering auth popups anywhere in the app
 * with full customization, callback wiring, and result handling.
 *
 * v2.0 — Web modal migrated from Ionic ModalController to the shared
 * NxtOverlayService (pure Angular, no Ionic on web).
 *
 * Pattern: Professional apps (Twitter/X, Instagram, Spotify, Reddit)
 * use this pattern for "Sign in to continue" flows where the user
 * encounters a gated feature and can authenticate without leaving
 * their current context.
 *
 * Features:
 * - One-line modal presentation: `await authModal.present()`
 * - Full callback wiring for auth providers
 * - Configurable title/subtitle for context-aware prompts
 * - Singleton guard — prevents double-opening
 * - Promise-based result with typed interface
 * - SSR-safe
 *
 * @example
 * ```typescript
 * import { AuthModalService } from '@nxt1/ui';
 *
 * @Component({...})
 * export class FeatureComponent {
 *   private readonly authModal = inject(AuthModalService);
 *   private readonly authFlow = inject(AuthFlowService);
 *
 *   async onLikePost(): Promise<void> {
 *     if (!this.authFlow.isAuthenticated()) {
 *       const result = await this.authModal.present({
 *         title: 'Sign in to like',
 *         subtitle: 'Create an account or sign in to engage with content.',
 *         onGoogle: () => this.authFlow.signInWithGoogle(),
 *         onApple: () => this.authFlow.signInWithApple(),
 *         onEmailAuth: (mode, data) => mode === 'login'
 *           ? this.authFlow.signInWithEmail(data)
 *           : this.authFlow.signUpWithEmail(data),
 *       });
 *
 *       if (!result.authenticated) return;
 *     }
 *
 *     await this.likePost();
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { NxtOverlayService, type OverlayRef } from '../../components/overlay';
import { AuthModalComponent } from './auth-modal.component';
import type { AuthMode } from '../auth-mode-switcher';
import type { AuthEmailFormData } from '../auth-email-form';

// ============================================
// TYPES
// ============================================

/** Configuration for presenting the auth modal */
export interface AuthModalConfig {
  /** Title text (e.g., "Sign in to continue") */
  title?: string;

  /** Subtitle text (e.g., "You need an account to save posts") */
  subtitle?: string;

  /** Initial mode: 'login' or 'signup' (default: 'login') */
  initialMode?: AuthMode;

  /** Whether to show the NXT1 logo (default: true) */
  showLogo?: boolean;

  /** Callback for Google auth — return true if auth succeeded */
  onGoogle?: () => Promise<boolean>;

  /** Callback for Apple auth — return true if auth succeeded */
  onApple?: () => Promise<boolean>;

  /** Callback for Microsoft auth — return true if auth succeeded */
  onMicrosoft?: () => Promise<boolean>;

  /** Callback for email auth — return true if auth succeeded */
  onEmailAuth?: (mode: AuthMode, data: AuthEmailFormData) => Promise<boolean>;

  /** Callback for forgot password — modal will dismiss automatically */
  onForgotPassword?: () => void;

  /** Whether backdrop click should dismiss (default: true) */
  backdropDismiss?: boolean;
}

/** Reason the modal was dismissed */
export type AuthModalDismissReason =
  | 'authenticated'
  | 'closed'
  | 'backdrop'
  | 'forgot-password'
  | 'provider-selected';

/** Result returned when the modal is dismissed */
export interface AuthModalResult {
  /** Whether the user successfully authenticated */
  authenticated: boolean;

  /** Auth provider used (if any) */
  provider?: string;

  /** Auth mode at time of dismissal */
  mode?: AuthMode;

  /** Email form data (if provider-selected without callback) */
  emailData?: AuthEmailFormData;

  /** Why the modal was dismissed */
  reason: AuthModalDismissReason;
}

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class AuthModalService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly overlay = inject(NxtOverlayService);

  /** Track whether a modal is currently open */
  private activeRef: OverlayRef<AuthModalResult> | null = null;

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Present the authentication modal.
   *
   * Returns a promise that resolves when the modal is dismissed,
   * with the authentication result.
   *
   * @param config - Optional configuration for the modal
   * @returns Promise resolving to AuthModalResult
   */
  async present(config?: AuthModalConfig): Promise<AuthModalResult> {
    // Guard: SSR safety
    if (!isPlatformBrowser(this.platformId)) {
      return { authenticated: false, reason: 'closed' };
    }

    // Guard: Prevent double-opening
    if (this.activeRef) {
      await this.dismiss();
    }

    const ref = this.overlay.open<AuthModalComponent, AuthModalResult>({
      component: AuthModalComponent,
      inputs: {
        title: config?.title,
        subtitle: config?.subtitle,
        initialMode: config?.initialMode ?? 'login',
        showLogo: config?.showLogo ?? true,
        googleHandler: config?.onGoogle,
        appleHandler: config?.onApple,
        microsoftHandler: config?.onMicrosoft,
        emailAuthHandler: config?.onEmailAuth,
        forgotPasswordHandler: config?.onForgotPassword,
      },
      size: 'sm',
      showCloseButton: true,
      backdropDismiss: config?.backdropDismiss ?? true,
      ariaLabel: config?.title ?? 'Sign in to NXT1',
      panelClass: 'nxt1-auth-overlay',
    });

    this.activeRef = ref;

    const result = await ref.closed;

    this.activeRef = null;

    return this.normalizeResult(result.data, result.reason);
  }

  /**
   * Present with a "sign in to continue" preset.
   * Convenience method for gated features.
   *
   * @param featureDescription - What the user is trying to do (e.g., "like posts")
   * @param config - Additional configuration overrides
   */
  async presentSignInToContinue(
    featureDescription: string,
    config?: Omit<AuthModalConfig, 'title' | 'subtitle'>
  ): Promise<AuthModalResult> {
    return this.present({
      ...config,
      title: 'Sign in to continue',
      subtitle: `Create an account or sign in to ${featureDescription}.`,
    });
  }

  /**
   * Present with a "create account" preset.
   * Convenience method for signup-focused flows.
   *
   * @param config - Additional configuration overrides
   */
  async presentCreateAccount(
    config?: Omit<AuthModalConfig, 'initialMode'>
  ): Promise<AuthModalResult> {
    return this.present({
      ...config,
      initialMode: 'signup',
      title: config?.title ?? 'Join NXT1',
      subtitle: config?.subtitle ?? 'Create your free account to get started.',
    });
  }

  /**
   * Dismiss the currently active auth modal.
   */
  async dismiss(): Promise<void> {
    if (this.activeRef) {
      this.activeRef.dismiss({ authenticated: false, reason: 'closed' });
      this.activeRef = null;
    }
  }

  /**
   * Whether the auth modal is currently open.
   */
  isOpen(): boolean {
    return this.activeRef !== null;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /** Normalize the overlay result to AuthModalResult */
  private normalizeResult(
    data: AuthModalResult | undefined | null,
    reason: string
  ): AuthModalResult {
    // Content component provided a full result via close/dismiss output
    if (data?.authenticated) {
      return data;
    }

    // Map overlay dismiss reasons to auth reasons
    const authReason = this.mapReasonToAuthReason(reason, data?.reason);

    return {
      authenticated: false,
      reason: authReason,
      provider: data?.provider,
      mode: data?.mode,
      emailData: data?.emailData,
    };
  }

  /** Map overlay/content reason to AuthModalDismissReason */
  private mapReasonToAuthReason(
    overlayReason: string,
    contentReason?: AuthModalDismissReason
  ): AuthModalDismissReason {
    // If content component provided a specific reason, use it
    if (contentReason) return contentReason;

    // Map overlay reasons
    switch (overlayReason) {
      case 'backdrop':
        return 'backdrop';
      case 'escape':
      case 'close':
      case 'programmatic':
      default:
        return 'closed';
    }
  }
}
