/**
 * @fileoverview Manage Team Modal Service — Adaptive Presentation
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Unified entry point for Manage Team that auto-selects
 * the best presentation based on platform:
 *
 * - **Native mobile app (Capacitor)**: Ionic bottom sheet via ManageTeamBottomSheetService
 * - **Web browsers (desktop + mobile web)**: Pure Angular overlay via NxtOverlayService
 *
 * Follows the same adaptive pattern as EditProfileModalService.
 *
 * @example
 * ```typescript
 * import { ManageTeamModalService } from '@nxt1/ui/manage-team';
 *
 * @Component({...})
 * export class TeamComponent {
 *   private readonly manageTeam = inject(ManageTeamModalService);
 *
 *   async onManageTeam(): Promise<void> {
 *     const result = await this.manageTeam.open({ teamId: 'abc123' });
 *     if (result.saved) {
 *       // Reload team data
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
import type { ManageTeamSectionId } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { ManageTeamBottomSheetService } from './manage-team-bottom-sheet.service';
import { ManageTeamService } from './manage-team.service';
import { ManageTeamWebModalComponent } from './manage-team-web-modal.component';

/** Options for opening the Manage Team modal. */
export interface ManageTeamModalOptions {
  /** Team ID to manage. */
  readonly teamId?: string | null;
  /** Initial section to expand. */
  readonly initialSection?: ManageTeamSectionId | null;
  /** Custom modal title. */
  readonly title?: string;
}

/** Result returned when the Manage Team modal is dismissed. */
export interface ManageTeamModalResult {
  /** Whether the user saved changes. */
  readonly saved: boolean;
}

@Injectable({ providedIn: 'root' })
export class ManageTeamModalService {
  private readonly bottomSheet = inject(ManageTeamBottomSheetService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly platform = inject(NxtPlatformService);
  private readonly manageTeam = inject(ManageTeamService);
  private readonly modal = inject(NxtModalService);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamModalService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  /**
   * Opens Manage Team with platform-appropriate presentation:
   * - Native mobile app: bottom sheet with drag handle (Ionic)
   * - Web browsers, including mobile web: overlay modal (pure Angular)
   */
  async open(options: ManageTeamModalOptions = {}): Promise<ManageTeamModalResult> {
    const presentation = this.shouldUseBottomSheet() ? 'bottom-sheet' : 'web-overlay';

    this.logger.info('Opening manage team', { presentation, teamId: options.teamId });
    this.breadcrumb.trackUserAction('manage-team-open', { presentation });
    this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
      source: 'manage-team-modal',
      presentation,
    });

    if (this.shouldUseBottomSheet()) {
      return this.openBottomSheet(options);
    }

    return this.openWebOverlay(options);
  }

  // ============================================
  // BOTTOM SHEET (Mobile/Tablet — Ionic)
  // ============================================

  private async openBottomSheet(options: ManageTeamModalOptions): Promise<ManageTeamModalResult> {
    const result = await this.bottomSheet.open({
      teamId: options.teamId,
      initialSection: options.initialSection ?? undefined,
      title: options.title,
    });
    return { saved: result.saved };
  }

  // ============================================
  // WEB OVERLAY (Desktop — Pure Angular)
  // ============================================

  private async openWebOverlay(options: ManageTeamModalOptions): Promise<ManageTeamModalResult> {
    try {
      const ref = this.overlay.open<ManageTeamWebModalComponent, { saved: boolean }>({
        component: ManageTeamWebModalComponent,
        inputs: {
          teamId: options.teamId ?? null,
          initialSection: options.initialSection ?? undefined,
        },
        size: this.platform.isBrowser() && this.platform.viewport().width < 768 ? 'full' : 'xl',
        backdropDismiss: true,
        escDismiss: true,
        showCloseButton: false,
        ariaLabel: 'Manage Team',
        panelClass: 'nxt1-manage-team-overlay',
        canDismiss: async () => {
          if (!this.manageTeam.hasUnsavedChanges()) return true;
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
      this.logger.error('Failed to open manage team overlay', err);
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
