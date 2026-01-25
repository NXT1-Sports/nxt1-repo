/**
 * @fileoverview Biometric Login Button Component
 * @module @nxt1/ui/auth
 *
 * Professional biometric login button displayed on the auth page when:
 * - User has previously enrolled biometric authentication
 * - Device supports biometrics
 *
 * Follows 2026 best practices:
 * - Prominent placement for returning users
 * - Platform-aware iconography (Face ID / Touch ID / Fingerprint)
 * - Subtle animation to draw attention
 * - Clear affordance that it's the quick login method
 *
 * Usage:
 * ```html
 * <nxt1-auth-biometric-button
 *   [biometryType]="biometryType()"
 *   [biometryName]="biometryName()"
 *   [email]="lastEmail()"
 *   [loading]="isAuthenticating()"
 *   (click)="onBiometricLogin()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonSpinner, IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { fingerPrintOutline, scanOutline, chevronForward } from 'ionicons/icons';

// Register icons
addIcons({
  'finger-print-outline': fingerPrintOutline,
  'scan-outline': scanOutline,
  'chevron-forward': chevronForward,
});

export type BiometryButtonType = 'face' | 'fingerprint' | 'iris' | 'none';

@Component({
  selector: 'nxt1-auth-biometric-button',
  standalone: true,
  imports: [CommonModule, IonSpinner, IonIcon, IonRippleEffect],
  template: `
    <button
      class="biometric-button"
      [class.loading]="loading()"
      [disabled]="loading()"
      (click)="onClick()"
      type="button"
    >
      <ion-ripple-effect />

      <!-- Biometric Icon -->
      <div class="icon-wrapper">
        @if (loading()) {
          <ion-spinner name="crescent" class="spinner" />
        } @else {
          <ion-icon [name]="biometricIcon()" class="biometric-icon" />
        }
      </div>

      <!-- Content -->
      <div class="content">
        <span class="title">Sign in with {{ biometryName() }}</span>
        @if (email(); as userEmail) {
          <span class="email">{{ maskedEmail() }}</span>
        }
      </div>

      <!-- Chevron -->
      <ion-icon name="chevron-forward" class="chevron" />
    </button>
  `,
  styles: [
    `
      .biometric-button {
        position: relative;
        overflow: hidden;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px 18px;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-background-secondary, rgba(255, 255, 255, 0.06)) 0%,
          var(--nxt1-color-background-tertiary, rgba(255, 255, 255, 0.03)) 100%
        );
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;

        &:hover:not(:disabled) {
          background: linear-gradient(
            135deg,
            var(--nxt1-color-background-tertiary, rgba(255, 255, 255, 0.08)) 0%,
            var(--nxt1-color-background-secondary, rgba(255, 255, 255, 0.05)) 100%
          );
          border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.15));
          transform: translateY(-1px);
        }

        &:active:not(:disabled) {
          transform: translateY(0);
        }

        &:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        &.loading {
          pointer-events: none;
        }
      }

      .icon-wrapper {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-primary, #6366f1) 0%,
          var(--nxt1-color-primary-dark, #4f46e5) 100%
        );
        border-radius: 12px;
        flex-shrink: 0;
      }

      .biometric-icon {
        font-size: 26px;
        color: white;
      }

      .spinner {
        width: 24px;
        height: 24px;
        color: white;
      }

      .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .title {
        font-size: 16px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.3;
      }

      .email {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .chevron {
        font-size: 20px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthBiometricButtonComponent {
  // ============================================
  // INPUTS
  // ============================================

  /** Type of biometry available */
  readonly biometryType = input<BiometryButtonType>('fingerprint');

  /** Human-readable name for the biometry (e.g., "Face ID", "Touch ID") */
  readonly biometryName = input<string>('Biometric');

  /** User's email (optional, for display) */
  readonly email = input<string | null>(null);

  /** Whether authentication is in progress */
  readonly loading = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when button is clicked */
  readonly biometricClick = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Icon to display based on biometry type */
  readonly biometricIcon = computed(() => {
    const type = this.biometryType();
    switch (type) {
      case 'face':
        return 'scan-outline';
      case 'fingerprint':
        return 'finger-print-outline';
      case 'iris':
        return 'scan-outline';
      default:
        return 'finger-print-outline';
    }
  });

  /** Masked email for privacy (show first 3 chars + domain) */
  readonly maskedEmail = computed(() => {
    const email = this.email();
    if (!email) return '';

    const [local, domain] = email.split('@');
    if (!domain) return email;

    const visiblePart = local.slice(0, 3);
    const masked = local.length > 3 ? '•••' : '';
    return `${visiblePart}${masked}@${domain}`;
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onClick(): void {
    if (!this.loading()) {
      this.biometricClick.emit();
    }
  }
}
