/**
 * @fileoverview NxtBottomSheetService - Unified Bottom Sheet System
 * @module @nxt1/ui/components/bottom-sheet
 * @version 2.0.0
 *
 * Unified service for all bottom sheet patterns:
 *
 * 1. ACTION SHEETS (show/confirm/alert):
 *    - Confirmations, alerts, action menus
 *    - Uses NxtBottomSheetComponent internally
 *
 * 2. CONTENT SHEETS (openSheet):
 *    - Full component injection
 *    - Native draggable sheet with breakpoints
 *    - Used for: Edit Profile, Settings, Filters, etc.
 *
 * Features:
 * - Platform-adaptive (iOS sheet vs Android modal)
 * - Native drag handle with breakpoints
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
 *   // Action sheet (confirmation)
 *   async confirmDelete(): Promise<void> {
 *     const confirmed = await this.bottomSheet.confirm(
 *       'Delete Item?',
 *       'This action cannot be undone.',
 *       { destructive: true }
 *     );
 *     if (confirmed) await this.deleteItem();
 *   }
 *
 *   // Content sheet (inject component)
 *   async openEditProfile(): Promise<void> {
 *     const result = await this.bottomSheet.openSheet({
 *       component: EditProfileModalComponent,
 *       breakpoints: [0, 0.5, 0.75, 1],
 *       initialBreakpoint: 0.75,
 *     });
 *     if (result.role === 'save') this.refresh();
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, Type } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { NxtPlatformService } from '../../services/platform';
import { NxtBottomSheetComponent } from './bottom-sheet.component';
import { SHEET_PRESETS } from './sheet-presets';
import type {
  BottomSheetConfig,
  BottomSheetResult,
  ContentSheetConfig,
  ContentSheetResult,
} from './bottom-sheet.types';

@Injectable({ providedIn: 'root' })
export class NxtBottomSheetService {
  private readonly modalCtrl = inject(ModalController);
  private readonly platform = inject(NxtPlatformService);

  private activeModal: HTMLIonModalElement | null = null;

  // ============================================
  // CONTENT SHEET (Full Component Injection)
  // ============================================

  /**
   * Opens a draggable content sheet with an injected component.
   * Use this for full-feature sheets like Edit Profile, Settings, Filters.
   *
   * @param config - Configuration including the component to inject
   * @returns Promise resolving to the sheet result
   *
   * @example
   * ```typescript
   * // Open Edit Profile in a draggable sheet
   * const result = await bottomSheet.openSheet({
   *   component: EditProfileModalComponent,
   *   ...SHEET_PRESETS.TALL,
   *   canDismiss: async () => {
   *     return await this.confirmDiscard();
   *   },
   * });
   *
   * if (result.role === 'save') {
   *   // Handle save
   * }
   * ```
   */
  async openSheet<T = unknown>(config: ContentSheetConfig<T>): Promise<ContentSheetResult<T>> {
    // Dismiss any existing modal
    await this.dismiss();

    // Haptic feedback on open
    await this.triggerHaptic();

    // Build CSS classes
    const cssClasses = this.buildSheetCssClasses(config.cssClass);

    // Create the modal with injected component
    const modal = await this.modalCtrl.create({
      component: config.component as Type<unknown>,
      componentProps: config.componentProps,

      // Breakpoints for draggable resize
      breakpoints: config.breakpoints ?? SHEET_PRESETS.FULL.breakpoints,
      initialBreakpoint: config.initialBreakpoint ?? SHEET_PRESETS.FULL.initialBreakpoint,

      // Native drag handle
      handle: config.showHandle ?? true,
      handleBehavior: config.handleBehavior ?? 'cycle',

      // Backdrop behavior
      showBackdrop: true,
      backdropBreakpoint: config.backdropBreakpoint ?? 0.5,
      backdropDismiss: config.backdropDismiss ?? false,

      // Dismiss guard (for unsaved changes)
      canDismiss: config.canDismiss ?? true,

      // Platform-specific styling
      cssClass: cssClasses,
    });

    this.activeModal = modal;

    // Present the modal
    await modal.present();

    // Wait for dismissal
    const { data, role } = await modal.onWillDismiss<T>();

    this.activeModal = null;

    return { data, role };
  }

  /**
   * Builds the CSS class array for a content sheet.
   * Includes base class + platform-specific class + any custom classes.
   */
  private buildSheetCssClasses(customClass?: string | string[]): string[] {
    const classes = ['nxt1-sheet-modal'];

    // Add platform-specific class
    if (this.platform.isIOS()) {
      classes.push('nxt1-sheet-modal--ios');
    } else {
      classes.push('nxt1-sheet-modal--android');
    }

    // Add custom classes
    if (customClass) {
      if (Array.isArray(customClass)) {
        classes.push(...customClass);
      } else {
        classes.push(customClass);
      }
    }

    return classes;
  }

  // ============================================
  // ACTION SHEETS (Confirmations, Alerts, Menus)
  // ============================================

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
        actionsLayout: config.actionsLayout ?? 'vertical',
      },
      // Platform-adaptive presentation
      presentingElement: config.presentingElement,
      breakpoints: config.breakpoints ?? SHEET_PRESETS.FULL.breakpoints,
      initialBreakpoint: config.initialBreakpoint ?? SHEET_PRESETS.FULL.initialBreakpoint,
      backdropBreakpoint: config.backdropBreakpoint ?? 0,
      backdropDismiss: config.backdropDismiss ?? true,
      showBackdrop: true,
      handle: true,
      handleBehavior: 'cycle',
      canDismiss: config.canDismiss ?? true,
      // Use the same CSS classes as openSheet() for consistent appearance
      cssClass: this.buildSheetCssClasses(config.cssClass),
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
