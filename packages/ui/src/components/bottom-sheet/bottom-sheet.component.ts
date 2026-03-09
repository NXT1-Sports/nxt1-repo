/**
 * @fileoverview NxtBottomSheetComponent - Reusable Native Bottom Sheet
 * @module @nxt1/ui/components/bottom-sheet
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

import { Component, ChangeDetectionStrategy, Input, signal, inject } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../icon/icon.component';
import { NxtSheetHeaderComponent } from './sheet-header.component';
import { HapticButtonDirective } from '../../services/haptics';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { NxtPlatformService } from '../../services/platform';
import type { BottomSheetAction, BottomSheetResult } from './bottom-sheet.types';

@Component({
  selector: 'nxt1-bottom-sheet',
  standalone: true,
  imports: [IonContent, NxtIconComponent, NxtSheetHeaderComponent, HapticButtonDirective],
  template: `
    <nxt1-sheet-header
      [title]="title || ''"
      closePosition="right"
      [showClose]="showClose"
      [showBorder]="true"
      (closeSheet)="onClose()"
    />

    <ion-content [fullscreen]="true" class="nxt1-sheet-content">
      <div class="nxt1-sheet-body">
        @if (icon) {
          <div class="icon-section">
            <div class="icon-container" [class.destructive]="destructive">
              <nxt1-icon [name]="icon" [size]="32" aria-hidden="true" />
            </div>
          </div>
        }

        @if (subtitle) {
          <p class="subtitle">{{ subtitle }}</p>
        }

        <div class="custom-content">
          <ng-content></ng-content>
        </div>

        @if (actions.length > 0) {
          <div
            class="actions-section"
            [class.actions-section--horizontal]="actionsLayout === 'horizontal'"
          >
            @for (action of actions; track action.label) {
              <button
                type="button"
                class="sheet-btn"
                [class.sheet-btn--primary]="action.role === 'primary'"
                [class.sheet-btn--cancel]="action.role === 'secondary' || action.role === 'cancel'"
                [class.sheet-btn--destructive]="action.role === 'destructive'"
                [disabled]="action.disabled || action.loading || loading()"
                (click)="onAction(action)"
                [nxtHaptic]="
                  action.role === 'primary' || action.role === 'destructive' ? 'medium' : 'light'
                "
              >
                @if (action.loading) {
                  <div class="sheet-spinner" aria-label="Loading..."></div>
                } @else {
                  @if (action.icon) {
                    <nxt1-icon [name]="action.icon" [size]="20" aria-hidden="true" />
                  }
                  <span>{{ action.label }}</span>
                }
              </button>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .nxt1-sheet-content {
        --background: transparent;
      }

      .nxt1-sheet-body {
        display: flex;
        flex-direction: column;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5) var(--nxt1-spacing-8);
      }

      .icon-section {
        display: flex;
        justify-content: center;
        padding-bottom: var(--nxt1-spacing-4);
      }

      .icon-container {
        width: 64px;
        height: 64px;
        border-radius: 9999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
      }

      .icon-container.destructive {
        background: var(--nxt1-color-errorBg, rgba(239, 68, 68, 0.1));
        color: var(--nxt1-color-error, #ef4444);
      }

      .subtitle {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-6);
        line-height: 1.5;
        text-align: center;
      }

      .custom-content:empty {
        display: none;
      }

      .actions-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .actions-section--horizontal {
        flex-direction: row;
        gap: 12px;
      }

      .actions-section--horizontal .sheet-btn {
        flex: 1;
        min-width: 0;
      }

      /* Base button — matches onboarding/auth button pattern */
      .sheet-btn {
        width: 100%;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: none;
        border-radius: var(--nxt1-borderRadius-xl, 12px);
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        user-select: none;
      }

      .sheet-btn:active:not(:disabled) {
        transform: scale(0.98);
      }

      .sheet-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Primary — lime green, matches .nxt1-continue-btn */
      .sheet-btn--primary {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
      }

      /* Cancel — outline, matches .nxt1-skip-btn / .nxt1-btn-secondary */
      .sheet-btn--cancel {
        background: transparent;
        border: 1px solid var(--nxt1-color-border-subtle);
        color: var(--nxt1-color-text-primary);
      }

      /* Destructive — red background */
      .sheet-btn--destructive {
        background: var(--nxt1-color-error, #ef4444);
        color: #fff;
      }

      .sheet-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid transparent;
        border-top-color: currentColor;
        border-radius: 9999px;
        animation: sheet-spin 0.6s linear infinite;
      }

      @keyframes sheet-spin {
        to {
          transform: rotate(360deg);
        }
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
  @Input() actionsLayout: 'vertical' | 'horizontal' = 'vertical';

  // ============================================
  // STATE
  // ============================================

  readonly loading = signal(false);

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
