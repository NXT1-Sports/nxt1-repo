/**
 * @fileoverview BiometricPromptService - Native Biometric Enrollment Modal
 * @module @nxt1/ui/auth/biometric-prompt
 * @version 1.0.0
 *
 * Service for presenting native-looking biometric enrollment prompts.
 * Uses Ionic ModalController for proper bottom sheet presentation.
 *
 * Architecture:
 * ```
 * Consumer Component (calls service)
 *         │
 *         ▼
 *   BiometricPromptService.showEnrollmentPrompt()
 *         │
 *         ▼
 *   ModalController.create()
 *         │
 *         ▼
 *   BiometricPromptContentComponent (native UI)
 * ```
 *
 * Features:
 * - 100% native iOS/Android appearance
 * - Platform-adaptive presentation (Face ID vs Touch ID vs Fingerprint)
 * - Haptic feedback integration
 * - Theme-aware styling (dark/light)
 * - Accessible with VoiceOver/TalkBack support
 *
 * Usage:
 * ```typescript
 * private readonly biometricPrompt = inject(BiometricPromptService);
 *
 * async promptForEnrollment() {
 *   const result = await this.biometricPrompt.showEnrollmentPrompt({
 *     biometryType: 'face',
 *     biometryName: 'Face ID',
 *     email: 'user@example.com',
 *   });
 *
 *   if (result.enabled) {
 *     // User chose to enable biometric
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { NxtPlatformService } from '../../services/platform';
import { SHEET_PRESETS } from '../../components/bottom-sheet';
import { BiometricPromptContentComponent } from './biometric-prompt-content.component';

// ============================================
// TYPES
// ============================================

export type BiometryDisplayType = 'face' | 'fingerprint' | 'iris' | 'none';

export interface BiometricPromptConfig {
  /** Type of biometry available on device */
  biometryType: BiometryDisplayType;
  /** Human-readable name (e.g., "Face ID", "Touch ID", "Fingerprint") */
  biometryName: string;
  /** Email being enrolled (shown masked) */
  email?: string;
}

export interface BiometricPromptResult {
  /** Whether user chose to enable biometric */
  enabled: boolean;
  /** Dismissal reason */
  reason: 'enabled' | 'skipped' | 'dismissed';
}

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class BiometricPromptService {
  private readonly modalCtrl = inject(ModalController);
  private readonly platform = inject(NxtPlatformService);

  /**
   * Show the biometric enrollment prompt.
   *
   * @param config - Biometric configuration
   * @returns Promise resolving to user's choice
   */
  async showEnrollmentPrompt(config: BiometricPromptConfig): Promise<BiometricPromptResult> {
    // Haptic feedback when showing prompt
    await this.triggerHaptic('light');

    const modal = await this.modalCtrl.create({
      component: BiometricPromptContentComponent,
      componentProps: {
        biometryType: config.biometryType,
        biometryName: config.biometryName,
        email: config.email,
      },
      // Native bottom sheet presentation
      ...SHEET_PRESETS.FULL,
      handle: true,
      handleBehavior: 'none' as const,
      backdropDismiss: true,
      showBackdrop: true,
      // Theme-aware styling
      cssClass: [
        'nxt1-biometric-modal',
        this.platform.isIOS() ? 'nxt1-biometric-modal--ios' : 'nxt1-biometric-modal--android',
      ],
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<BiometricPromptResult>();

    // Haptic feedback based on result
    if (data?.enabled) {
      await this.triggerHaptic('success');
    }

    return data ?? { enabled: false, reason: 'dismissed' };
  }

  /**
   * Dismiss any open biometric prompt.
   */
  async dismiss(): Promise<void> {
    const modal = await this.modalCtrl.getTop();
    if (modal) {
      await modal.dismiss({ enabled: false, reason: 'dismissed' });
    }
  }

  /**
   * Trigger haptic feedback (safe for web).
   */
  private async triggerHaptic(type: 'light' | 'medium' | 'success'): Promise<void> {
    if (!this.platform.isNative()) return;

    try {
      if (type === 'success') {
        await Haptics.notification({ type: NotificationType.Success });
      } else {
        await Haptics.impact({
          style: type === 'light' ? ImpactStyle.Light : ImpactStyle.Medium,
        });
      }
    } catch {
      // Haptics not available
    }
  }
}
