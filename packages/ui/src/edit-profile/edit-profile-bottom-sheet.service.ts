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
import type { InboxEmailProvider } from '@nxt1/core';
import type { SearchTeamsFn } from '../onboarding';

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
    options?: {
      onConnectProvider?: (provider: InboxEmailProvider) => void;
      searchTeams?: SearchTeamsFn;
    }
  ): Promise<{ saved: boolean }> {
    const result = await this.bottomSheet.openSheet<{
      saved?: boolean;
    }>({
      // The component to inject
      component: EditProfileShellComponent,
      componentProps: {
        userId,
        sportIndex,
        connectProviderCallback: options?.onConnectProvider,
        searchTeams: options?.searchTeams,
      },

      // Standardized sheet preset (full-screen like Agent X)
      ...SHEET_PRESETS.FULL,

      // Show native drag handle bar
      showHandle: true,
      handleBehavior: 'cycle',

      // Backdrop & gesture dismiss: always allow (no canDismiss function).
      // Using a canDismiss function — even one that returns true — causes Ionic
      // to pause the drag animation while it awaits the result, creating a
      // visible bounce. Unsaved-changes confirmation is handled in the
      // component's onClose() method instead.
      backdropDismiss: true,
    });

    return {
      saved: result.role === 'save',
      ...result.data,
    };
  }
}
