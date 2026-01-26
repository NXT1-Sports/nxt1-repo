/**
 * @fileoverview NxtBottomSheetComponent - Reusable Native Bottom Sheet
 * @module @nxt1/ui/shared/bottom-sheet
 * @version 1.0.0
 *
 * A reusable bottom sheet component that provides native iOS/Android appearance
 * using NXT1's design token system. This is the content component that gets
 * rendered inside an Ionic modal.
 *
 * Design Philosophy:
 * - iOS: Follows Apple HIG with system blur, SF Pro typography, rounded corners
 * - Android: Follows Material Design 3 with surface elevation, Roboto typography
 * - Both: Uses NXT1 design tokens for colors, spacing, and typography
 *
 * Features:
 * - Platform-adaptive styling (iOS vs Android)
 * - Theme-aware (dark/light mode via design tokens)
 * - Native drag handle
 * - Customizable icon, title, subtitle
 * - Flexible action buttons
 * - Haptic feedback
 * - Safe area handling
 * - ng-content slot for custom content
 *
 * Usage (via NxtBottomSheetService):
 * ```typescript
 * const result = await this.bottomSheet.show({
 *   title: 'Delete Item?',
 *   subtitle: 'This action cannot be undone.',
 *   icon: 'trash-outline',
 *   destructive: true,
 *   actions: [
 *     { label: 'Delete', role: 'destructive' },
 *     { label: 'Cancel', role: 'cancel' },
 *   ],
 * });
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, Input, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonSpinner, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  informationCircleOutline,
  warningOutline,
} from 'ionicons/icons';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { NxtPlatformService } from '../../services/platform';
import type { BottomSheetAction, BottomSheetResult } from './bottom-sheet.types';

// Register icons
addIcons({
  'close-outline': closeOutline,
  'checkmark-circle-outline': checkmarkCircleOutline,
  'alert-circle-outline': alertCircleOutline,
  'information-circle-outline': informationCircleOutline,
  'warning-outline': warningOutline,
});

@Component({
  selector: 'nxt1-bottom-sheet',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner, IonIcon],
  template: `
    <ion-content [fullscreen]="true" class="nxt1-bottom-sheet-content">
      <div
        class="nxt1-bottom-sheet"
        [class.ios]="isIos()"
        [class.android]="!isIos()"
        [class.destructive]="destructive"
      >
        <!-- Native drag handle -->
        <div class="sheet-handle" aria-hidden="true"></div>

        <!-- Header with optional close button -->
        <header class="sheet-header" [class.has-close]="showClose">
          @if (showClose) {
            <button
              type="button"
              class="close-btn"
              (click)="onClose()"
              [disabled]="loading()"
              aria-label="Close"
            >
              <ion-icon name="close-outline" aria-hidden="true" />
            </button>
          }
        </header>

        <!-- Icon Section (optional) -->
        @if (icon) {
          <div class="icon-section">
            <div class="icon-container" [class.destructive]="destructive">
              <ion-icon [name]="icon" aria-hidden="true" />
            </div>
          </div>
        }

        <!-- Content Section -->
        <div class="content-section">
          @if (title) {
            <h1 class="title">{{ title }}</h1>
          }
          @if (subtitle) {
            <p class="subtitle">{{ subtitle }}</p>
          }

          <!-- Custom content slot -->
          <div class="custom-content">
            <ng-content></ng-content>
          </div>
        </div>

        <!-- Actions Section -->
        @if (actions.length > 0) {
          <div class="actions-section">
            @for (action of actions; track action.label) {
              <button
                type="button"
                class="action-btn"
                [class.primary]="action.role === 'primary'"
                [class.secondary]="action.role === 'secondary'"
                [class.cancel]="action.role === 'cancel'"
                [class.destructive]="action.role === 'destructive'"
                [class.loading]="action.loading"
                [disabled]="action.disabled || action.loading || loading()"
                (click)="onAction(action)"
              >
                @if (action.loading) {
                  <ion-spinner name="crescent" aria-label="Loading..." />
                } @else {
                  @if (action.icon) {
                    <ion-icon [name]="action.icon" aria-hidden="true" />
                  }
                  <span>{{ action.label }}</span>
                }
              </button>
            }
          </div>
        }

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
      .nxt1-bottom-sheet-content {
        --background: transparent;
      }

      .nxt1-bottom-sheet {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: 0 var(--nxt1-spacing-6);

        /* Theme-aware tokens - adapts to dark/light/sport themes */
        --sheet-bg: var(--nxt1-color-surface-200);
        --sheet-text: var(--nxt1-color-text-primary);
        --sheet-text-secondary: var(--nxt1-color-text-secondary);
        --sheet-text-tertiary: var(--nxt1-color-text-tertiary);
        --sheet-border: var(--nxt1-color-border-subtle);
        --sheet-accent: var(--nxt1-color-primary);
        --sheet-accent-bg: var(--nxt1-color-alpha-primary10);
        --sheet-error: var(--nxt1-color-feedback-error);
        --sheet-error-bg: var(--nxt1-color-feedback-errorBg);
        --sheet-text-on-primary: var(--nxt1-color-text-onPrimary);
        --sheet-text-on-error: var(--nxt1-color-text-onError, #ffffff);

        background: var(--sheet-bg);
        font-family: var(--nxt1-fontFamily-brand);
      }

      /* ============================================
     * Platform-Specific Styles
     * ============================================ */
      .nxt1-bottom-sheet.ios {
        /* iOS: Slightly tighter letter spacing for native feel */
        letter-spacing: var(--nxt1-letterSpacing-tight, -0.2px);
      }

      .nxt1-bottom-sheet.android {
        /* Android: Standard letter spacing */
        letter-spacing: normal;
      }

      /* Destructive variant - Override accent with error color */
      .nxt1-bottom-sheet.destructive {
        --sheet-accent: var(--sheet-error);
        --sheet-accent-bg: var(--sheet-error-bg);
      }

      /* ============================================
     * Drag Handle
     * ============================================ */
      .sheet-handle {
        width: var(--nxt1-spacing-9, 36px);
        height: var(--nxt1-spacing-1, 5px);
        background: var(--sheet-text-tertiary);
        border-radius: var(--nxt1-radius-full);
        margin: var(--nxt1-spacing-2) auto 0;
        opacity: 0.4;
      }

      /* ============================================
     * Header
     * ============================================ */
      .sheet-header {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        min-height: var(--nxt1-touch-target-min, 44px);
        padding: var(--nxt1-spacing-2) 0;
      }

      .close-btn {
        width: var(--nxt1-spacing-8, 32px);
        height: var(--nxt1-spacing-8, 32px);
        border-radius: var(--nxt1-radius-full);
        border: none;
        background: var(--sheet-border);
        color: var(--sheet-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: var(--nxt1-transition-fast);

        ion-icon {
          font-size: var(--nxt1-fontSize-lg);
        }

        &:active:not(:disabled) {
          transform: scale(0.95);
          opacity: var(--nxt1-opacity-hover);
        }

        &:disabled {
          opacity: var(--nxt1-opacity-disabled);
          cursor: not-allowed;
        }
      }

      /* ============================================
     * Icon Section
     * ============================================ */
      .icon-section {
        display: flex;
        justify-content: center;
        padding: var(--nxt1-spacing-4) 0;
      }

      .icon-container {
        width: var(--nxt1-spacing-16, 64px);
        height: var(--nxt1-spacing-16, 64px);
        border-radius: var(--nxt1-radius-full);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--sheet-accent-bg);
        color: var(--sheet-accent);

        ion-icon {
          font-size: var(--nxt1-fontSize-3xl, 32px);
        }

        &.destructive {
          background: var(--sheet-error-bg);
          color: var(--sheet-error);
        }
      }

      /* ============================================
     * Content Section
     * ============================================ */
      .content-section {
        flex: 1;
        text-align: center;
        padding: var(--nxt1-spacing-2) 0 var(--nxt1-spacing-6);
      }

      .title {
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--sheet-text);
        margin: 0 0 var(--nxt1-spacing-2);
        line-height: 1.3;
      }

      .ios .title {
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-tight, -0.3px);
      }

      .android .title {
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .subtitle {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--sheet-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-relaxed, 1.5);
        max-width: var(--nxt1-spacing-70, 280px);
        margin-left: auto;
        margin-right: auto;
      }

      .custom-content {
        margin-top: var(--nxt1-spacing-4);

        &:empty {
          display: none;
        }
      }

      /* ============================================
     * Actions Section
     * ============================================ */
      .actions-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding-bottom: var(--nxt1-spacing-4);
      }

      .action-btn {
        width: 100%;
        height: var(--nxt1-button-height, 48px);
        border-radius: var(--nxt1-radius-lg);
        border: none;
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        transition: var(--nxt1-transition-fast);

        ion-icon {
          font-size: var(--nxt1-fontSize-lg);
        }

        ion-spinner {
          width: var(--nxt1-fontSize-lg);
          height: var(--nxt1-fontSize-lg);
        }

        &:active:not(:disabled) {
          transform: scale(0.98);
        }

        &:disabled {
          opacity: var(--nxt1-opacity-disabled);
          cursor: not-allowed;
        }

        /* Primary button - Uses theme accent color */
        &.primary {
          background: var(--sheet-accent);
          color: var(--sheet-text-on-primary);
        }

        &.primary:active:not(:disabled) {
          background: var(--nxt1-color-primaryDark);
        }

        /* Secondary button */
        &.secondary {
          background: var(--nxt1-color-surface-300);
          color: var(--sheet-text);
          border: 1px solid var(--nxt1-color-border-default);
        }

        /* Cancel button */
        &.cancel {
          background: transparent;
          color: var(--sheet-text-secondary);
        }

        /* Destructive button */
        &.destructive {
          background: var(--sheet-error);
          color: var(--sheet-text-on-error);
        }

        &.destructive:active:not(:disabled) {
          background: var(--nxt1-color-feedback-errorDark, var(--sheet-error));
        }
      }

      .ios .action-btn {
        border-radius: var(--nxt1-radius-xl, 14px);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-tight);
      }

      .ios .action-btn.cancel {
        color: var(--sheet-accent);
      }

      .android .action-btn {
        border-radius: var(--nxt1-radius-full);
        font-weight: var(--nxt1-fontWeight-medium);
        text-transform: none;
      }

      /* ============================================
     * Safe Area
     * ============================================ */
      .safe-area-bottom {
        height: env(safe-area-inset-bottom, var(--nxt1-spacing-5));
        min-height: var(--nxt1-spacing-5);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtBottomSheetComponent {
  private readonly modalCtrl = inject(ModalController);
  private readonly platform = inject(NxtPlatformService);

  // ============================================
  // INPUTS
  // ============================================

  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() icon?: string;
  @Input() showClose = true;
  @Input() destructive = false;
  @Input() actions: BottomSheetAction[] = [];

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

  async onClose(): Promise<void> {
    await this.triggerHaptic('light');
    await this.modalCtrl.dismiss(
      { confirmed: false, reason: 'close' } as BottomSheetResult,
      'cancel'
    );
  }

  async onAction(action: BottomSheetAction): Promise<void> {
    await this.triggerHaptic(
      action.role === 'primary' || action.role === 'destructive' ? 'medium' : 'light'
    );

    // Call the handler if provided
    if (action.handler) {
      try {
        await action.handler();
      } catch (error) {
        console.error('[BottomSheet] Action handler error:', error);
      }
    }

    // Determine result based on action role
    const confirmed = action.role === 'primary' || action.role === 'destructive';
    const reason = action.role === 'cancel' ? 'cancel' : 'confirm';

    await this.modalCtrl.dismiss(
      { confirmed, reason, data: action } as BottomSheetResult<BottomSheetAction>,
      confirmed ? 'confirm' : 'cancel'
    );
  }

  // ============================================
  // HELPERS
  // ============================================

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
