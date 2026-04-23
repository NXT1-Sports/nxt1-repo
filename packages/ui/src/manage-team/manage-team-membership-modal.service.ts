/**
 * @fileoverview Manage Team Membership Modal Service
 * @module @nxt1/ui/manage-team
 *
 * Adaptive modal service for the shared membership editor.
 * - Native mobile (Capacitor): Ionic ModalController
 * - Web browsers (desktop + mobile web): NxtOverlayService
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import type { MembershipEditorMode } from '@nxt1/core';
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
    const presentation = this.platform.isNative() ? 'ionic-modal' : 'web-overlay';

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

    if (this.platform.isNative()) {
      return this.openIonicModal(options);
    }

    return this.openWebOverlay(options);
  }

  // ── Native (Ionic Modal) ──────────────────────────────────────────────────

  private async openIonicModal(
    options: MembershipEditorModalOptions
  ): Promise<MembershipEditorModalResult> {
    const modal = await this.modalCtrl.create({
      component: ManageTeamMembershipEditorComponent,
      componentProps: {
        teamId: options.teamId,
        mode: options.mode ?? 'all',
        initialFilter: options.initialFilter ?? null,
      },
      presentingElement: undefined,
      breakpoints: [0, 0.6, 1],
      initialBreakpoint: 1,
      cssClass: 'nxt1-membership-editor-modal',
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
}
