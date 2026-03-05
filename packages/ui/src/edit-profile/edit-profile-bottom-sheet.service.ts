/**
 * @fileoverview Edit Profile Bottom Sheet Service
 * @module @nxt1/ui/edit-profile
 * @version 2.0.0
 *
 * Feature-specific service that uses the shared NxtBottomSheetService
 * to open Edit Profile in a native draggable bottom sheet.
 *
 * Architecture:
 * - NxtBottomSheetService.openSheet() = Unified service for ALL content sheets
 * - EditProfileBottomSheetService.open() = Thin wrapper configured for Edit Profile
 *
 * This is a thin wrapper that:
 * 1. Uses the generic NxtBottomSheetService.openSheet() method
 * 2. Configures it specifically for Edit Profile
 * 3. Handles unsaved changes confirmation
 *
 * USES SHARED NxtBottomSheetService - NOT HARDCODED
 *
 * Other features can follow this same pattern:
 * - SettingsBottomSheetService
 * - FilterBottomSheetService
 * - DetailViewBottomSheetService
 */

import { Injectable, inject, Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';
import { EditProfileShellComponent } from './edit-profile-shell.component';
import { EditProfileService } from './edit-profile.service';

/**
 * Wrapper component for Edit Profile in a sheet modal context.
 * Handles save/close with unsaved changes confirmation.
 */
@Component({
  selector: 'nxt1-edit-profile-modal',
  standalone: true,
  imports: [CommonModule, EditProfileShellComponent],
  template: `
    <nxt1-edit-profile-shell [showHeader]="false" (close)="onClose()" (save)="onSave()" />
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
        overflow: hidden;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProfileModalComponent {
  private readonly modalCtrl = inject(ModalController);
  private readonly profileService = inject(EditProfileService);
  private readonly bottomSheet = inject(NxtBottomSheetService);

  /**
   * Handle close request - confirms if unsaved changes exist.
   */
  async onClose(): Promise<void> {
    if (this.profileService.hasUnsavedChanges()) {
      const shouldDiscard = await this.bottomSheet.confirm(
        'Discard Changes?',
        'You have unsaved changes that will be lost.',
        {
          confirmLabel: 'Discard',
          cancelLabel: 'Keep Editing',
          destructive: true,
          icon: 'alert-circle-outline',
        }
      );

      if (!shouldDiscard) return;
    }

    await this.modalCtrl.dismiss(null, 'cancel');
  }

  /**
   * Handle save - dismisses with saved flag.
   */
  async onSave(): Promise<void> {
    await this.modalCtrl.dismiss({ saved: true }, 'save');
  }
}

/**
 * Edit Profile Sheet Service
 *
 * Thin wrapper around NxtBottomSheetService.openSheet() configured
 * specifically for the Edit Profile feature.
 *
 * Uses native sheet modal pattern with:
 * - Drag handle bar at top
 * - Multiple breakpoints (50% to 75% to 100%)
 * - Swipe-to-dismiss with confirmation
 */
@Injectable({ providedIn: 'root' })
export class EditProfileBottomSheetService {
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly profileService = inject(EditProfileService);

  /**
   * Opens the Edit Profile in a native draggable bottom sheet.
   *
   * Uses NxtBottomSheetService.openSheet() with Edit Profile configuration:
   * - Breakpoints: 0 (closed), 0.5 (peek), 0.75 (default), 1 (full)
   * - Native drag handle
   * - Unsaved changes confirmation on swipe-dismiss
   *
   * @returns Promise resolving when the sheet is dismissed
   */
  async open(): Promise<{ saved: boolean }> {
    const result = await this.bottomSheet.openSheet<{ saved?: boolean }>({
      // The component to inject
      component: EditProfileModalComponent,

      // Standardized sheet preset
      ...SHEET_PRESETS.TALL,

      // Show native drag handle bar
      showHandle: true,
      handleBehavior: 'cycle',

      // Backdrop behavior
      backdropDismiss: false,

      // Swipe-to-dismiss confirmation for unsaved changes
      canDismiss: async (_data, role) => {
        // Allow explicit save/cancel
        if (role === 'save' || role === 'cancel') return true;

        // Check for unsaved changes on gesture dismiss
        if (this.profileService.hasUnsavedChanges()) {
          return await this.bottomSheet.confirm(
            'Discard Changes?',
            'You have unsaved changes that will be lost.',
            {
              confirmLabel: 'Discard',
              cancelLabel: 'Keep Editing',
              destructive: true,
              icon: 'alert-circle-outline',
            }
          );
        }

        return true;
      },
    });

    return {
      saved: result.role === 'save',
      ...result.data,
    };
  }
}
