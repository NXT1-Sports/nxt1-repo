/**
 * @fileoverview Biometric Enrollment Prompt Component
 * @module @nxt1/ui/auth
 *
 * Professional biometric enrollment prompt displayed after successful authentication.
 * Follows 2026 best practices for native app UX:
 * - Clean, minimal bottom sheet design
 * - Clear value proposition
 * - Easy opt-out (never forced)
 * - Platform-aware iconography (Face ID vs Fingerprint)
 *
 * Usage:
 * ```html
 * <nxt1-auth-biometric-prompt
 *   [isOpen]="showBiometricPrompt()"
 *   [biometryType]="biometryType()"
 *   [biometryName]="biometryName()"
 *   [loading]="isEnrolling()"
 *   (enableClick)="onEnableBiometric()"
 *   (skipClick)="onSkipBiometric()"
 *   (dismiss)="onPromptDismiss()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonModal, IonContent, IonButton, IonSpinner, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  fingerPrintOutline,
  scanOutline,
  shieldCheckmarkOutline,
  closeOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';

// Register icons
export type BiometryDisplayType = 'face' | 'fingerprint' | 'iris' | 'none';

@Component({
  selector: 'nxt1-auth-biometric-prompt',
  standalone: true,
  imports: [CommonModule, IonModal, IonContent, IonButton, IonSpinner, IonIcon],
  template: `
    <ion-modal
      [isOpen]="isOpen()"
      [initialBreakpoint]="0.45"
      [breakpoints]="[0, 0.45]"
      [backdropDismiss]="true"
      [showBackdrop]="true"
      [handle]="true"
      cssClass="nxt1-biometric-prompt-modal"
      (didDismiss)="onDismiss()"
    >
      <ng-template>
        <ion-content class="ion-padding">
          <div class="biometric-prompt">
            <!-- Close button -->
            <button
              class="close-button"
              (click)="onSkip()"
              [disabled]="loading()"
              aria-label="Skip biometric setup"
            >
              <ion-icon name="close-outline" />
            </button>

            <!-- Icon -->
            <div class="icon-container">
              <div class="icon-glow"></div>
              <div class="icon-circle">
                <ion-icon [name]="biometricIcon()" />
              </div>
            </div>

            <!-- Content -->
            <h2 class="title">Enable {{ biometryName() }}</h2>
            <p class="description">
              Sign in instantly next time using {{ biometryName() }}. Your credentials are stored
              securely on this device.
            </p>

            <!-- Security badge -->
            <div class="security-badge">
              <ion-icon name="shield-checkmark-outline" />
              <span>Encrypted & secured on device</span>
            </div>

            <!-- Actions -->
            <div class="actions">
              <ion-button
                expand="block"
                [disabled]="loading()"
                (click)="onEnable()"
                class="enable-button"
              >
                @if (loading()) {
                  <ion-spinner name="crescent" />
                } @else {
                  <ion-icon [name]="biometricIcon()" slot="start" />
                  Enable {{ biometryName() }}
                }
              </ion-button>

              <button class="skip-link" (click)="onSkip()" [disabled]="loading()">
                Maybe later
              </button>
            </div>
          </div>
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: [
    `
      .biometric-prompt {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 8px 16px 24px;
        position: relative;
      }

      .close-button {
        position: absolute;
        top: 0;
        right: 0;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--nxt1-color-background-tertiary, rgba(255, 255, 255, 0.08));
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color 0.2s ease;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));

        &:hover:not(:disabled) {
          background: var(--nxt1-color-background-hover, rgba(255, 255, 255, 0.12));
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        ion-icon {
          font-size: 20px;
        }
      }

      .icon-container {
        position: relative;
        width: 88px;
        height: 88px;
        margin-bottom: 20px;
      }

      .icon-glow {
        position: absolute;
        inset: 0;
        background: var(--nxt1-color-primary, #6366f1);
        border-radius: 50%;
        filter: blur(24px);
        opacity: 0.3;
        animation: pulse-glow 2s ease-in-out infinite;
      }

      @keyframes pulse-glow {
        0%,
        100% {
          opacity: 0.3;
          transform: scale(1);
        }
        50% {
          opacity: 0.5;
          transform: scale(1.1);
        }
      }

      .icon-circle {
        position: relative;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-primary, #6366f1) 0%,
          var(--nxt1-color-primary-dark, #4f46e5) 100%
        );
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;

        ion-icon {
          font-size: 44px;
          color: white;
        }
      }

      .title {
        font-size: 22px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 8px;
        line-height: 1.2;
      }

      .description {
        font-size: 15px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0 0 16px;
        line-height: 1.5;
        max-width: 280px;
      }

      .security-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: var(--nxt1-color-success-bg, rgba(34, 197, 94, 0.12));
        border-radius: 20px;
        margin-bottom: 24px;

        ion-icon {
          font-size: 16px;
          color: var(--nxt1-color-success, #22c55e);
        }

        span {
          font-size: 13px;
          font-weight: 500;
          color: var(--nxt1-color-success, #22c55e);
        }
      }

      .actions {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .enable-button {
        --background: var(--nxt1-color-primary, #6366f1);
        --background-hover: var(--nxt1-color-primary-dark, #4f46e5);
        --background-activated: var(--nxt1-color-primary-dark, #4f46e5);
        --border-radius: 14px;
        --padding-top: 16px;
        --padding-bottom: 16px;
        font-weight: 600;
        font-size: 16px;

        ion-icon {
          font-size: 20px;
          margin-right: 8px;
        }

        ion-spinner {
          width: 20px;
          height: 20px;
        }
      }

      .skip-link {
        background: none;
        border: none;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 15px;
        font-weight: 500;
        padding: 12px;
        cursor: pointer;
        transition: color 0.2s ease;

        &:hover:not(:disabled) {
          color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthBiometricPromptComponent {
  constructor() {
    addIcons({
      'finger-print-outline': fingerPrintOutline,
      'scan-outline': scanOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
      'close-outline': closeOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
    });
  }

  // ============================================
  // INPUTS
  // ============================================

  /** Whether the modal is open */
  readonly isOpen = input.required<boolean>();

  /** Type of biometry available */
  readonly biometryType = input<BiometryDisplayType>('fingerprint');

  /** Human-readable name for the biometry (e.g., "Face ID", "Touch ID") */
  readonly biometryName = input<string>('Biometric');

  /** Whether enrollment is in progress */
  readonly loading = input<boolean>(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when user clicks enable */
  readonly enableClick = output<void>();

  /** Emitted when user clicks skip/maybe later */
  readonly skipClick = output<void>();

  /** Emitted when modal is dismissed (backdrop tap, swipe down) */
  readonly dismiss = output<void>();

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

  // ============================================
  // EVENT HANDLERS
  // ============================================

  onEnable(): void {
    this.enableClick.emit();
  }

  onSkip(): void {
    this.skipClick.emit();
  }

  onDismiss(): void {
    this.dismiss.emit();
  }
}
