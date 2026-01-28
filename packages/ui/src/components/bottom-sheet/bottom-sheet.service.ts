/**
 * @fileoverview NxtBottomSheetService - Programmatic Bottom Sheet Opener
 * @module @nxt1/ui/components/bottom-sheet
 * @version 1.0.0
 *
 * Service for programmatically opening the NxtBottomSheetComponent.
 * Follows the same pattern as NxtPickerService for consistency.
 *
 * Features:
 * - Platform-adaptive modal presentation (iOS sheet vs Android modal)
 * - Type-safe configuration
 * - Promise-based result handling
 * - Automatic cleanup
 * - Haptic feedback
 *
 * Usage:
 * ```typescript
 * import { NxtBottomSheetService } from '@nxt1/ui';
 *
 * @Component({...})
 * export class MyComponent {
 *   private readonly bottomSheet = inject(NxtBottomSheetService);
 *
 *   async confirmDelete(): Promise<void> {
 *     const result = await this.bottomSheet.show({
 *       title: 'Delete Item?',
 *       subtitle: 'This action cannot be undone.',
 *       icon: 'trash-outline',
 *       destructive: true,
 *       actions: [
 *         { label: 'Delete', role: 'destructive' },
 *         { label: 'Cancel', role: 'cancel' },
 *       ],
 *     });
 *
 *     if (result.confirmed) {
 *       await this.deleteItem();
 *     }
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NxtPlatformService } from '../../services/platform';
import { NxtBottomSheetComponent } from './bottom-sheet.component';
import type { BottomSheetConfig, BottomSheetResult } from './bottom-sheet.types';

@Injectable({ providedIn: 'root' })
export class NxtBottomSheetService {
  private readonly modalCtrl = inject(ModalController);
  private readonly platform = inject(NxtPlatformService);

  private activeModal: HTMLIonModalElement | null = null;

  /**
   * Opens a bottom sheet with the specified configuration.
   *
   * @param config - Configuration for the bottom sheet
   * @returns Promise resolving to the bottom sheet result
   *
   * @example
   * ```typescript
   * // Confirmation dialog
   * const result = await bottomSheet.show({
   *   title: 'Are you sure?',
   *   subtitle: 'This will log you out of all devices.',
   *   icon: 'log-out-outline',
   *   actions: [
   *     { label: 'Log Out', role: 'primary' },
   *     { label: 'Cancel', role: 'cancel' },
   *   ],
   * });
   *
   * // Destructive confirmation
   * const deleteResult = await bottomSheet.show({
   *   title: 'Delete Account?',
   *   subtitle: 'All your data will be permanently deleted.',
   *   icon: 'trash-outline',
   *   destructive: true,
   *   actions: [
   *     { label: 'Delete Account', role: 'destructive' },
   *     { label: 'Keep Account', role: 'cancel' },
   *   ],
   * });
   *
   * // Info sheet with custom content (use component directly)
   * const settingsResult = await bottomSheet.show({
   *   title: 'Biometric Sign-In',
   *   subtitle: 'Sign in quickly and securely using Face ID.',
   *   icon: 'finger-print-outline',
   *   actions: [
   *     { label: 'Enable', role: 'primary' },
   *     { label: 'Not Now', role: 'cancel' },
   *   ],
   * });
   * ```
   */
  async show<T = void>(config: BottomSheetConfig): Promise<BottomSheetResult<T>> {
    // Dismiss any existing modal
    await this.dismiss();

    // Haptic feedback on open
    await this.triggerHaptic();

    // Create the modal
    const modal = await this.modalCtrl.create({
      component: NxtBottomSheetComponent,
      componentProps: {
        title: config.title,
        subtitle: config.subtitle,
        icon: config.icon,
        showClose: config.showClose ?? true,
        destructive: config.destructive ?? false,
        actions: config.actions ?? [],
      },
      // Platform-adaptive presentation
      presentingElement: config.presentingElement,
      breakpoints: config.breakpoints ?? [0, 1],
      initialBreakpoint: config.initialBreakpoint ?? 1,
      backdropDismiss: config.backdropDismiss ?? true,
      showBackdrop: true,
      canDismiss: config.canDismiss ?? true,
      // iOS-specific: sheet presentation
      ...(this.platform.isIOS() && {
        mode: 'ios',
        cssClass: 'nxt1-bottom-sheet-modal nxt1-bottom-sheet-ios',
      }),
      // Android-specific: full modal
      ...(!this.platform.isIOS() && {
        mode: 'md',
        cssClass: 'nxt1-bottom-sheet-modal nxt1-bottom-sheet-android',
      }),
    });

    this.activeModal = modal;

    // Present the modal
    await modal.present();

    // Wait for dismissal
    const { data, role } = await modal.onWillDismiss();

    this.activeModal = null;

    // Return type-safe result
    return (
      data ?? {
        confirmed: role === 'confirm',
        reason: role === 'confirm' ? 'confirm' : role === 'cancel' ? 'cancel' : 'backdrop',
      }
    );
  }

  /**
   * Opens a simple confirmation bottom sheet.
   * Convenience method for yes/no confirmations.
   *
   * @param title - The confirmation title
   * @param subtitle - Optional subtitle/description
   * @param options - Additional options
   * @returns Promise resolving to boolean (confirmed or not)
   */
  async confirm(
    title: string,
    subtitle?: string,
    options?: {
      confirmLabel?: string;
      cancelLabel?: string;
      destructive?: boolean;
      icon?: string;
    }
  ): Promise<boolean> {
    const result = await this.show({
      title,
      subtitle,
      icon: options?.icon,
      destructive: options?.destructive,
      actions: [
        {
          label: options?.confirmLabel ?? 'Confirm',
          role: options?.destructive ? 'destructive' : 'primary',
        },
        {
          label: options?.cancelLabel ?? 'Cancel',
          role: 'cancel',
        },
      ],
    });

    return result.confirmed;
  }

  /**
   * Opens a simple alert bottom sheet.
   * Single button acknowledgment.
   *
   * @param title - The alert title
   * @param subtitle - Optional subtitle/message
   * @param options - Additional options
   */
  async alert(
    title: string,
    subtitle?: string,
    options?: {
      buttonLabel?: string;
      icon?: string;
    }
  ): Promise<void> {
    await this.show({
      title,
      subtitle,
      icon: options?.icon ?? 'information-circle-outline',
      showClose: false,
      actions: [
        {
          label: options?.buttonLabel ?? 'OK',
          role: 'primary',
        },
      ],
    });
  }

  /**
   * Dismisses the currently active bottom sheet.
   *
   * @param data - Optional data to pass back
   * @param role - Optional role ('confirm' | 'cancel')
   */
  async dismiss(data?: unknown, role?: string): Promise<void> {
    if (this.activeModal) {
      try {
        await this.activeModal.dismiss(data, role);
      } catch {
        // Modal may already be dismissed
      }
      this.activeModal = null;
    }
  }

  /**
   * Checks if a bottom sheet is currently open.
   */
  isOpen(): boolean {
    return this.activeModal !== null;
  }

  /**
   * Triggers haptic feedback when opening the sheet.
   */
  private async triggerHaptic(): Promise<void> {
    if (!this.platform.isNative()) return;

    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Haptics not available
    }
  }
}
