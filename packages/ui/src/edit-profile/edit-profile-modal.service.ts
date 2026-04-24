/**
 * @fileoverview Edit Profile Modal Service — Adaptive Presentation
 * @module @nxt1/ui/edit-profile
 * @version 1.0.0
 *
 * Unified entry point for Edit Profile that auto-selects
 * the best presentation based on platform:
 *
 * - **Native mobile app (Capacitor)**: Ionic bottom sheet via EditProfileBottomSheetService
 * - **Web browsers (desktop + mobile web)**: Pure Angular overlay via NxtOverlayService
 *
 * Follows the same adaptive pattern as QrCodeService.
 *
 * @example
 * ```typescript
 * import { EditProfileModalService } from '@nxt1/ui/edit-profile';
 *
 * @Component({...})
 * export class ProfileComponent {
 *   private readonly editProfile = inject(EditProfileModalService);
 *
 *   async onEditProfile(): Promise<void> {
 *     const result = await this.editProfile.open({ userId: 'abc123' });
 *     if (result.saved) {
 *       // Reload profile data
 *     }
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { NxtPlatformService } from '../services/platform';
import { NxtOverlayService } from '../components/overlay';
import { NxtLoggingService } from '../services/logging';
import { NxtModalService } from '../services/modal';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { EditProfileBottomSheetService } from './edit-profile-bottom-sheet.service';
import { EditProfileService } from './edit-profile.service';
import { EditProfileWebModalComponent } from './edit-profile-web-modal.component';
import type { InboxEmailProvider } from '@nxt1/core';
import type { SearchTeamsFn } from '../onboarding';

/** Options for opening the Edit Profile modal. */
export interface EditProfileModalOptions {
  /** User ID to edit (current user). */
  readonly userId?: string;
  /** Sport index to load (defaults to active sport). */
  readonly sportIndex?: number;
  /** Callback when user connects an email provider (Gmail, Yahoo, etc.). */
  readonly onConnectProvider?: (provider: InboxEmailProvider) => void;
  /** Custom team/program search function. */
  readonly searchTeams?: SearchTeamsFn;
  /**
   * Platform-specific API service adapter.
   * Must provide getProfile, updateSection, updateActiveSportIndex, uploadPhoto.
   * Required — edit profile will error without it.
   */
  readonly apiService?: Parameters<EditProfileService['setApiService']>[0];
}

/** Result returned when the Edit Profile modal is dismissed. */
export interface EditProfileModalResult {
  /** Whether the user saved changes. */
  readonly saved: boolean;
}

@Injectable({ providedIn: 'root' })
export class EditProfileModalService {
  private readonly bottomSheet = inject(EditProfileBottomSheetService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly platform = inject(NxtPlatformService);
  private readonly editProfile = inject(EditProfileService);
  private readonly modal = inject(NxtModalService);
  private readonly logger = inject(NxtLoggingService).child('EditProfileModalService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  /**
   * Opens Edit Profile with platform-appropriate presentation:
   * - Native mobile app: bottom sheet with drag handle (Ionic)
   * - Web browsers, including mobile web: overlay modal (pure Angular)
   */
  async open(options: EditProfileModalOptions = {}): Promise<EditProfileModalResult> {
    const presentation = this.shouldUseBottomSheet() ? 'bottom-sheet' : 'web-overlay';

    this.logger.info('Opening edit profile', { presentation });
    this.breadcrumb.trackUserAction('edit-profile-open', { presentation });
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'edit-profile-modal',
      presentation,
    });

    if (options.apiService) {
      this.editProfile.setApiService(options.apiService);
    }

    if (this.shouldUseBottomSheet()) {
      return this.openBottomSheet(options);
    }

    return this.openWebOverlay(options);
  }

  // ============================================
  // BOTTOM SHEET (Mobile/Tablet — Ionic)
  // ============================================

  private async openBottomSheet(options: EditProfileModalOptions): Promise<EditProfileModalResult> {
    const result = await this.bottomSheet.open(options.userId, options.sportIndex, {
      onConnectProvider: options.onConnectProvider,
      searchTeams: options.searchTeams,
    });
    return { saved: result.saved };
  }

  // ============================================
  // WEB OVERLAY (Desktop — Pure Angular)
  // ============================================

  private async openWebOverlay(options: EditProfileModalOptions): Promise<EditProfileModalResult> {
    try {
      const ref = this.overlay.open<EditProfileWebModalComponent, { saved: boolean }>({
        component: EditProfileWebModalComponent,
        inputs: {
          userId: options.userId,
          sportIndex: options.sportIndex,
          connectProviderCallback: options.onConnectProvider,
          searchTeams: options.searchTeams,
        },
        size: this.platform.isBrowser() && this.platform.viewport().width < 768 ? 'full' : 'xl',
        backdropDismiss: true,
        escDismiss: true,
        showCloseButton: false,
        ariaLabel: 'Edit Profile',
        panelClass: 'nxt1-edit-profile-overlay',
        canDismiss: async () => {
          if (!this.editProfile.hasUnsavedChanges()) return true;
          return this.modal.confirm({
            title: 'Discard Changes?',
            message: 'You have unsaved changes that will be lost.',
            confirmText: 'Discard',
            cancelText: 'Keep Editing',
            destructive: true,
          });
        },
      });

      const result = await ref.closed;
      return { saved: result.data?.saved ?? false };
    } catch (err) {
      this.logger.error('Failed to open edit profile overlay', err);
      return { saved: false };
    }
  }

  // ============================================
  // PLATFORM DETECTION
  // ============================================

  /** Only native mobile apps should use the Ionic bottom sheet presentation. */
  private shouldUseBottomSheet(): boolean {
    return this.platform.isNative();
  }
}
