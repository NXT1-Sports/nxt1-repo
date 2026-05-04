/**
 * @fileoverview Manage Team Membership Modal Service
 * @module @nxt1/ui/manage-team
 *
 * Adaptive modal service for the shared membership editor.
 * - Native mobile + small-screen mobile web: Ionic bottom sheet
 * - Desktop web: NxtOverlayService
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import type { MembershipEditorMode } from '@nxt1/core';
import { SHEET_PRESETS } from '../components/bottom-sheet';
import { NxtOverlayService } from '../components/overlay';
import { NxtPlatformService } from '../services/platform';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ANALYTICS_ADAPTER } from '../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../services/breadcrumb/breadcrumb.service';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { ManageTeamMembershipEditorComponent } from './membership-editor/manage-team-membership-editor.component';

// ============================================
// TYPES
// ============================================

export interface MembershipEditorModalOptions {
  readonly teamId: string;
  readonly mode?: MembershipEditorMode;
  readonly initialFilter?: 'roster' | 'staff' | 'pending' | null;
}

export interface MembershipEditorModalResult {
  readonly changed: boolean;
}

// ============================================
// SERVICE
// ============================================

@Injectable({ providedIn: 'root' })
export class ManageTeamMembershipModalService {
  private readonly overlay = inject(NxtOverlayService);
  private readonly platform = inject(NxtPlatformService);
  private readonly modalCtrl = inject(ModalController);
  private readonly logger = inject(NxtLoggingService).child('ManageTeamMembershipModalService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  /**
   * Open the membership editor with platform-appropriate presentation.
   */
  async open(options: MembershipEditorModalOptions): Promise<MembershipEditorModalResult> {
    const presentation = this.shouldUseBottomSheet() ? 'bottom-sheet' : 'web-overlay';

    this.logger.info('Opening membership editor', {
      presentation,
      teamId: options.teamId,
      mode: options.mode,
    });
    this.breadcrumb.trackUserAction('membership-editor-open', {
      presentation,
      teamId: options.teamId,
    });
    this.analytics?.trackEvent(APP_EVENTS.TEAM_MANAGED, {
      action: 'membership_editor_opened',
      section: options.mode ?? 'all',
    });

    if (this.shouldUseBottomSheet()) {
      return this.openBottomSheet(options);
    }

    return this.openWebOverlay(options);
  }

  // ── Bottom Sheet (Native + Small-Screen Web) ──────────────────────────────

  private async openBottomSheet(
    options: MembershipEditorModalOptions
  ): Promise<MembershipEditorModalResult> {
    const modal = await this.modalCtrl.create({
      component: ManageTeamMembershipEditorComponent,
      componentProps: {
        teamId: options.teamId,
        mode: options.mode ?? 'all',
        initialFilter: options.initialFilter ?? null,
      },
      breakpoints: SHEET_PRESETS.FULL.breakpoints,
      initialBreakpoint: SHEET_PRESETS.FULL.initialBreakpoint,
      backdropBreakpoint: SHEET_PRESETS.FULL.backdropBreakpoint,
      cssClass: 'nxt1-membership-editor-modal',
      handle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      showBackdrop: true,
    });

    await modal.present();
    const { data } = await modal.onWillDismiss<{ changed: boolean }>();
    return { changed: data?.changed ?? false };
  }

  // ── Web / Mobile-Web (NxtOverlayService) ──────────────────────────────────

  private async openWebOverlay(
    options: MembershipEditorModalOptions
  ): Promise<MembershipEditorModalResult> {
    try {
      const isSmall = this.platform.isBrowser() && this.platform.viewport().width < 768;

      const ref = this.overlay.open<ManageTeamMembershipEditorComponent, { changed: boolean }>({
        component: ManageTeamMembershipEditorComponent,
        inputs: {
          teamId: options.teamId,
          mode: options.mode ?? 'all',
          initialFilter: options.initialFilter ?? null,
        },
        size: isSmall ? 'full' : 'lg',
        backdropDismiss: true,
        escDismiss: true,
        showCloseButton: false,
        ariaLabel: 'Manage Members',
        panelClass: 'nxt1-membership-editor-overlay',
      });

      const result = await ref.closed;
      return { changed: result.data?.changed ?? false };
    } catch (err) {
      this.logger.error('Failed to open membership editor overlay', err);
      return { changed: false };
    }
  }

  /** Native app and small-screen web should use the Ionic bottom sheet presentation. */
  private shouldUseBottomSheet(): boolean {
    return (
      this.platform.isNative() ||
      (this.platform.isBrowser() && this.platform.viewport().width < 768)
    );
  }
}
