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

import { Injectable, inject } from '@angular/core';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';
import { EditProfileShellComponent } from './edit-profile-shell.component';
import { EditProfileService } from './edit-profile.service';
import type { InboxEmailProvider } from '@nxt1/core';

/**
 * Edit Profile Sheet Service
 *
 * Thin wrapper around NxtBottomSheetService.openSheet() configured
 * specifically for the Edit Profile feature.
 *
 * Uses native sheet modal pattern with:
 * - Drag handle bar at top
 * - Full-screen presentation
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
   * - Breakpoints: 0 (closed), 1 (full)
   * - Native drag handle
   * - Unsaved changes confirmation on swipe-dismiss
   *
   * @param userId - User ID to edit (current user)
   * @param sportIndex - Optional sport index to load (defaults to activeSportIndex)
   * @returns Promise resolving when the sheet is dismissed
   */
  async open(
    userId?: string,
    sportIndex?: number,
    options?: { onConnectProvider?: (provider: InboxEmailProvider) => void }
  ): Promise<{ saved: boolean }> {
    const result = await this.bottomSheet.openSheet<{
      saved?: boolean;
    }>({
      // The component to inject
      component: EditProfileShellComponent,
      componentProps: { userId, sportIndex, connectProviderCallback: options?.onConnectProvider },

      // Standardized sheet preset
      ...SHEET_PRESETS.FULL,

      // Show native drag handle bar
      showHandle: true,
      handleBehavior: 'cycle',

      // Backdrop behavior
      backdropDismiss: false,

      // Swipe-to-dismiss confirmation for unsaved changes
      canDismiss: async (_data, role) => {
        // Allow explicit save/cancel/connectProvider
        if (role === 'save' || role === 'cancel' || role === 'connectProvider') return true;

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
