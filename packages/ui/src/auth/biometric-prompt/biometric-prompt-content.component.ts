/**
 * @fileoverview BiometricPromptContentComponent - Native Biometric UI
 * @module @nxt1/ui/auth/biometric-prompt
 * @version 1.0.0
 *
 * The actual content component for the biometric enrollment modal.
 * Designed to look 100% native on iOS and Android.
 *
 * Design Philosophy:
 * - iOS: Follows Apple HIG with SF Pro typography, system blur, and Face ID iconography
 * - Android: Follows Material Design 3 with Roboto, surface elevation, fingerprint icon
 * - Both: Clean, minimal, high-trust UI appropriate for biometric enrollment
 *
 * This component is NOT used directly - it's instantiated by BiometricPromptService.
 */

import { Component, ChangeDetectionStrategy, Input, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonSpinner, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  fingerPrintOutline,
  scanOutline,
  shieldCheckmarkOutline,
  closeOutline,
} from 'ionicons/icons';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NxtPlatformService } from '../../services/platform';
import type { BiometricPromptResult } from './biometric-prompt.service';

// Register icons
@Component({
  selector: 'nxt1-biometric-prompt-content',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner, IonIcon],
  template: `
    <ion-content [fullscreen]="true" class="biometric-content">
      <div class="biometric-sheet" [class.ios]="isIos()" [class.android]="!isIos()">
        <!-- Native drag handle -->
        <div class="sheet-handle" aria-hidden="true"></div>

        <!-- Header with close button -->
        <header class="sheet-header">
          <button
            type="button"
            class="close-btn"
            (click)="onSkip()"
            [disabled]="loading()"
            aria-label="Skip biometric setup"
          >
            <ion-icon name="close-outline" aria-hidden="true" />
          </button>
        </header>

        <!-- Biometric Icon - Platform Native -->
        <div class="icon-section">
          <div class="icon-container" [class.face-id]="biometryType === 'face'">
            @if (biometryType === 'face') {
              <!-- Face ID: Native iOS-style square scanner icon -->
              <svg
                class="face-id-icon"
                viewBox="0 0 96 96"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <!-- Corner brackets -->
                <path
                  d="M24 8H12C9.79086 8 8 9.79086 8 12V24"
                  stroke="currentColor"
                  stroke-width="4"
                  stroke-linecap="round"
                />
                <path
                  d="M72 8H84C86.2091 8 88 9.79086 88 12V24"
                  stroke="currentColor"
                  stroke-width="4"
                  stroke-linecap="round"
                />
                <path
                  d="M24 88H12C9.79086 88 8 86.2091 8 84V72"
                  stroke="currentColor"
                  stroke-width="4"
                  stroke-linecap="round"
                />
                <path
                  d="M72 88H84C86.2091 88 88 86.2091 88 84V72"
                  stroke="currentColor"
                  stroke-width="4"
                  stroke-linecap="round"
                />
                <!-- Face outline -->
                <ellipse cx="48" cy="48" rx="20" ry="24" stroke="currentColor" stroke-width="3" />
                <!-- Eyes -->
                <circle cx="40" cy="42" r="3" fill="currentColor" />
                <circle cx="56" cy="42" r="3" fill="currentColor" />
                <!-- Smile -->
                <path
                  d="M40 56C40 56 44 60 48 60C52 60 56 56 56 56"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />
              </svg>
            } @else {
              <!-- Fingerprint: Native circular fingerprint icon -->
              <ion-icon name="finger-print-outline" class="fingerprint-icon" aria-hidden="true" />
            }
          </div>
        </div>

        <!-- Title & Description -->
        <div class="content-section">
          <h1 class="title" id="biometric-title">Enable {{ biometryName }}</h1>
          <p class="description" id="biometric-description">
            Sign in instantly next time using {{ biometryName }}. Your credentials are stored
            securely on this device.
          </p>

          <!-- Security indicator -->
          <div class="security-badge" role="status">
            <ion-icon name="shield-checkmark-outline" aria-hidden="true" />
            <span>Encrypted & secured on device</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="actions-section">
          <button
            type="button"
            class="enable-btn"
            [class.loading]="loading()"
            [disabled]="loading()"
            (click)="onEnable()"
            aria-describedby="biometric-description"
          >
            @if (loading()) {
              <ion-spinner name="crescent" aria-label="Enabling..." />
            } @else {
              @if (biometryType === 'face') {
                <svg class="btn-icon face-id" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 2H4C2.9 2 2 2.9 2 4V6"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <path
                    d="M18 2H20C21.1 2 22 2.9 22 4V6"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <path
                    d="M6 22H4C2.9 22 2 21.1 2 20V18"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <path
                    d="M18 22H20C21.1 22 22 21.1 22 20V18"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <circle cx="9" cy="10" r="1.5" fill="currentColor" />
                  <circle cx="15" cy="10" r="1.5" fill="currentColor" />
                  <path
                    d="M9 15C9 15 10.5 17 12 17C13.5 17 15 15 15 15"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                </svg>
              } @else {
                <ion-icon name="finger-print-outline" class="btn-icon" aria-hidden="true" />
              }
              <span>Enable {{ biometryName }}</span>
            }
          </button>

          <button type="button" class="skip-btn" [disabled]="loading()" (click)="onSkip()">
            Not Now
          </button>
        </div>

        <!-- Bottom safe area spacer -->
        <div class="safe-area-bottom"></div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
     * Base Layout
     * ============================================ */
      .biometric-content {
        --background: transparent;
      }

      .biometric-sheet {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        background: var(--nxt1-biometric-bg, var(--nxt1-color-surface-100));
        padding: 0 24px;
      }

      /* ============================================
     * Platform-Specific Base Styles
     * ============================================ */
      .biometric-sheet.ios {
        --nxt1-biometric-bg: var(--nxt1-color-glass-bg);
        --nxt1-biometric-text: var(--nxt1-color-text-primary);
        --nxt1-biometric-text-secondary: var(--nxt1-color-text-secondary);
        --nxt1-biometric-accent: var(--nxt1-color-success);
        --nxt1-biometric-btn-bg: var(--nxt1-color-success);
        --nxt1-biometric-btn-text: var(--nxt1-color-text-primary);
        --nxt1-biometric-icon-color: var(--nxt1-color-success);
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif;
      }

      .biometric-sheet.android {
        --nxt1-biometric-bg: var(--nxt1-color-surface-100);
        --nxt1-biometric-text: var(--nxt1-color-text-primary);
        --nxt1-biometric-text-secondary: var(--nxt1-color-text-secondary);
        --nxt1-biometric-accent: var(--nxt1-color-success);
        --nxt1-biometric-btn-bg: var(--nxt1-color-success);
        --nxt1-biometric-btn-text: var(--nxt1-color-text-inverse);
        --nxt1-biometric-icon-color: var(--nxt1-color-success);
        font-family: 'Roboto', 'Google Sans', sans-serif;
      }

      /* Light theme overrides */
      :host-context(html[data-theme='light']) .biometric-sheet.ios {
        --nxt1-biometric-bg: var(--nxt1-color-glass-bg);
        --nxt1-biometric-text: var(--nxt1-color-text-primary);
        --nxt1-biometric-text-secondary: var(--nxt1-color-text-secondary);
        --nxt1-biometric-btn-text: var(--nxt1-color-text-primary);
      }

      :host-context(html[data-theme='light']) .biometric-sheet.android {
        --nxt1-biometric-bg: var(--nxt1-color-bg-primary);
        --nxt1-biometric-text: var(--nxt1-color-text-primary);
        --nxt1-biometric-text-secondary: var(--nxt1-color-text-secondary);
      }

      /* ============================================
     * Drag Handle - Native Style
     * ============================================ */
      .sheet-handle {
        width: 36px;
        height: 5px;
        background: var(--nxt1-biometric-text-secondary);
        border-radius: 2.5px;
        margin: 8px auto 0;
        opacity: 0.4;
      }

      .ios .sheet-handle {
        width: 36px;
        height: 5px;
        opacity: 0.3;
      }

      .android .sheet-handle {
        width: 32px;
        height: 4px;
        opacity: 0.4;
      }

      /* ============================================
     * Header with Close Button
     * ============================================ */
      .sheet-header {
        display: flex;
        justify-content: flex-end;
        padding: 12px 0 8px;
      }

      .close-btn {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: none;
        background: var(--nxt1-biometric-text-secondary);
        opacity: 0.3;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: opacity 0.15s ease;

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-biometric-text);
        }

        &:active:not(:disabled) {
          opacity: 0.5;
        }

        &:disabled {
          opacity: 0.15;
          cursor: not-allowed;
        }
      }

      /* ============================================
     * Icon Section - Native Biometric Icons
     * ============================================ */
      .icon-section {
        display: flex;
        justify-content: center;
        padding: 16px 0 24px;
      }

      .icon-container {
        width: 80px;
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Face ID SVG Icon */
      .face-id-icon {
        width: 80px;
        height: 80px;
        color: var(--nxt1-biometric-icon-color);
      }

      /* Fingerprint Icon */
      .fingerprint-icon {
        font-size: 72px;
        color: var(--nxt1-biometric-icon-color);
      }

      /* ============================================
     * Content Section
     * ============================================ */
      .content-section {
        text-align: center;
        padding: 0 8px;
      }

      .title {
        font-size: 24px;
        font-weight: 600;
        color: var(--nxt1-biometric-text);
        margin: 0 0 12px;
        line-height: 1.2;
      }

      .ios .title {
        font-size: 22px;
        font-weight: 600;
        letter-spacing: -0.4px;
      }

      .android .title {
        font-size: 24px;
        font-weight: 500;
      }

      .description {
        font-size: 15px;
        color: var(--nxt1-biometric-text-secondary);
        margin: 0 0 20px;
        line-height: 1.5;
        max-width: 300px;
        margin-left: auto;
        margin-right: auto;
      }

      .ios .description {
        font-size: 15px;
        line-height: 1.4;
      }

      .android .description {
        font-size: 14px;
        line-height: 1.5;
      }

      /* ============================================
     * Security Badge
     * ============================================ */
      .security-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: color-mix(in srgb, var(--nxt1-color-success) 12%, transparent);
        border-radius: 20px;
        margin-bottom: 32px;

        ion-icon {
          font-size: 16px;
          color: var(--nxt1-biometric-accent);
        }

        span {
          font-size: 13px;
          font-weight: 500;
          color: var(--nxt1-biometric-accent);
        }
      }

      .android .security-badge {
        background: color-mix(in srgb, var(--nxt1-color-success) 12%, transparent);
      }

      /* ============================================
     * Action Buttons - Native Style
     * ============================================ */
      .actions-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-bottom: 8px;
      }

      .enable-btn {
        width: 100%;
        height: 54px;
        border: none;
        border-radius: 14px;
        background: var(--nxt1-biometric-btn-bg);
        color: var(--nxt1-biometric-btn-text);
        font-size: 17px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition:
          transform 0.1s ease,
          opacity 0.15s ease;

        &:active:not(:disabled) {
          transform: scale(0.98);
          opacity: 0.9;
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        &.loading {
          ion-spinner {
            --color: var(--nxt1-biometric-btn-text);
            width: 24px;
            height: 24px;
          }
        }

        .btn-icon {
          width: 22px;
          height: 22px;
        }

        .btn-icon.face-id {
          stroke: currentColor;
        }

        ion-icon.btn-icon {
          font-size: 22px;
        }
      }

      .ios .enable-btn {
        border-radius: 12px;
        height: 50px;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: -0.2px;
      }

      .android .enable-btn {
        border-radius: 28px;
        height: 56px;
        font-size: 16px;
        font-weight: 500;
        text-transform: none;
      }

      .skip-btn {
        width: 100%;
        height: 44px;
        border: none;
        background: transparent;
        color: var(--nxt1-biometric-text-secondary);
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.15s ease;

        &:active:not(:disabled) {
          opacity: 0.6;
        }

        &:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
      }

      .ios .skip-btn {
        font-size: 17px;
        color: var(--nxt1-color-info);
      }

      .android .skip-btn {
        font-size: 14px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* ============================================
     * Safe Area
     * ============================================ */
      .safe-area-bottom {
        height: env(safe-area-inset-bottom, 20px);
        min-height: 20px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BiometricPromptContentComponent {
  constructor() {
    addIcons({
      'finger-print-outline': fingerPrintOutline,
      'scan-outline': scanOutline,
      'shield-checkmark-outline': shieldCheckmarkOutline,
      'close-outline': closeOutline,
    });
  }

  private readonly modalCtrl = inject(ModalController);
  private readonly platform = inject(NxtPlatformService);

  // ============================================
  // INPUTS (from componentProps)
  // Using @Input() decorator for Ionic ModalController compatibility
  // ============================================

  @Input() biometryType: 'face' | 'fingerprint' | 'iris' | 'none' = 'fingerprint';
  @Input() biometryName = 'Biometric';
  @Input() email?: string;

  // ============================================
  // STATE
  // ============================================

  readonly loading = signal(false);

  // ============================================
  // COMPUTED
  // ============================================

  readonly isIos = computed(() => this.platform.isIOS());

  // ============================================
  // EVENT HANDLERS
  // ============================================

  async onEnable(): Promise<void> {
    this.loading.set(true);
    await this.triggerHaptic();

    // Dismiss with enabled result
    await this.modalCtrl.dismiss(
      { enabled: true, reason: 'enabled' } as BiometricPromptResult,
      'confirm'
    );
  }

  async onSkip(): Promise<void> {
    await this.triggerHaptic();
    await this.modalCtrl.dismiss(
      { enabled: false, reason: 'skipped' } as BiometricPromptResult,
      'cancel'
    );
  }

  private async triggerHaptic(): Promise<void> {
    if (!this.platform.isNative()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Haptics not available
    }
  }
}
