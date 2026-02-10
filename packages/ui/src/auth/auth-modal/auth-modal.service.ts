/**
 * @fileoverview AuthModalService - Popup Auth Modal Orchestrator
 * @module @nxt1/ui/auth
 * @version 1.0.0
 *
 * Enterprise-grade service for presenting the authentication modal.
 * Provides a simple API for triggering auth popups anywhere in the app
 * with full customization, callback wiring, and result handling.
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
 * - Platform-adaptive styling (iOS sheet vs Android modal vs Web dialog)
 * - Singleton guard — prevents double-opening
 * - Haptic feedback on native mobile
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
import { ModalController } from '@ionic/angular/standalone';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

import { NxtPlatformService } from '../../services/platform';
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

  /** Whether to show the drag handle on mobile (default: true) */
  showHandle?: boolean;
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
  private readonly platform = inject(NxtPlatformService);
  private readonly modalCtrl = inject(ModalController);

  /** Track active modal to prevent double-opening */
  private activeModal: HTMLIonModalElement | null = null;

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
   *
   * @example
   * ```typescript
   * // Simple — no callbacks, just prompt + dismiss
   * const result = await authModal.present();
   *
   * // With context
   * const result = await authModal.present({
   *   title: 'Sign in to save',
   *   subtitle: 'Bookmark this profile for later.',
   *   initialMode: 'signup',
   * });
   *
   * // With full auth wiring
   * const result = await authModal.present({
   *   title: 'Sign in to continue',
   *   onGoogle: async () => {
   *     await this.authFlow.signInWithGoogle();
   *     return this.authFlow.isAuthenticated();
   *   },
   *   onEmailAuth: async (mode, data) => {
   *     if (mode === 'login') {
   *       await this.authFlow.signInWithEmail(data);
   *     } else {
   *       await this.authFlow.signUpWithEmail(data);
   *     }
   *     return this.authFlow.isAuthenticated();
   *   },
   * });
   *
   * if (result.authenticated) {
   *   await this.performGatedAction();
   * }
   * ```
   */
  async present(config?: AuthModalConfig): Promise<AuthModalResult> {
    // Guard: SSR safety
    if (!isPlatformBrowser(this.platformId)) {
      return { authenticated: false, reason: 'closed' };
    }

    // Guard: Prevent double-opening
    if (this.activeModal) {
      await this.dismiss();
    }

    // Haptic feedback on open
    await this.triggerHaptic();

    // Create the modal
    const modal = await this.modalCtrl.create({
      component: AuthModalComponent,
      componentProps: {
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

      // Presentation style
      showBackdrop: true,
      backdropDismiss: config?.backdropDismiss ?? true,

      // Platform-adaptive styling
      cssClass: this.buildCssClasses(),

      // Handle for dragging (mobile)
      handle: config?.showHandle ?? this.platform.isNative(),
      handleBehavior: 'cycle',

      // Breakpoints for mobile bottom sheet behavior
      ...(this.platform.isNative()
        ? {
            breakpoints: [0, 1],
            initialBreakpoint: 1,
          }
        : {}),
    });

    this.activeModal = modal;

    // Present modal
    await modal.present();

    // Wait for dismissal
    const { data, role } = await modal.onWillDismiss<AuthModalResult>();

    this.activeModal = null;

    // Normalize result
    return this.normalizeResult(data, role);
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
    if (this.activeModal) {
      try {
        await this.activeModal.dismiss({ authenticated: false, reason: 'closed' }, 'cancel');
      } catch {
        // Already dismissed
      }
      this.activeModal = null;
    }
  }

  /**
   * Whether the auth modal is currently open.
   */
  isOpen(): boolean {
    return this.activeModal !== null;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /** Build CSS classes for platform-adaptive styling */
  private buildCssClasses(): string[] {
    const classes = ['nxt1-auth-modal'];

    if (this.platform.isIOS()) {
      classes.push('nxt1-auth-modal--ios');
    } else if (this.platform.isAndroid()) {
      classes.push('nxt1-auth-modal--android');
    } else {
      classes.push('nxt1-auth-modal--web');
    }

    return classes;
  }

  /** Normalize dismiss result to AuthModalResult */
  private normalizeResult(
    data: AuthModalResult | undefined | null,
    role: string | undefined
  ): AuthModalResult {
    if (data?.authenticated) {
      return data;
    }

    // Handle backdrop or programmatic dismiss
    return {
      authenticated: false,
      reason: this.mapRoleToReason(role),
      provider: data?.provider,
      mode: data?.mode,
      emailData: data?.emailData,
    };
  }

  /** Map Ionic role string to our dismiss reason */
  private mapRoleToReason(role: string | undefined): AuthModalDismissReason {
    switch (role) {
      case 'confirm':
        return 'authenticated';
      case 'cancel':
        return 'closed';
      case 'forgot-password':
        return 'forgot-password';
      case 'backdrop':
        return 'backdrop';
      default:
        return 'closed';
    }
  }

  /** Haptic feedback for modal open */
  private async triggerHaptic(): Promise<void> {
    if (!this.platform.isNative()) return;

    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Not available
    }
  }
}
