/**
 * @fileoverview Invite Bottom Sheet Service
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Feature-specific service that uses the shared NxtBottomSheetService
 * to open the Invite feature in a native draggable bottom sheet.
 *
 * Architecture:
 * - NxtBottomSheetService.openSheet() = Unified service for ALL content sheets
 * - InviteBottomSheetService.open() = Thin wrapper configured for Invite
 *
 * This is a thin wrapper that:
 * 1. Uses the generic NxtBottomSheetService.openSheet() method
 * 2. Configures it specifically for the Invite feature
 * 3. Provides native iOS/Android sheet UX
 *
 * USES SHARED NxtBottomSheetService - NOT HARDCODED
 *
 * Following same pattern as EditProfileBottomSheetService.
 */

import { Injectable, inject, Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';
import { NxtOverlayService } from '../components/overlay';
import { NxtPlatformService } from '../services/platform';
import { InviteShellComponent, type InviteUser } from './invite-shell.component';
import type { InviteType, InviteTeam } from '@nxt1/core';

/**
 * Input configuration for the Invite Bottom Sheet
 */
export interface InviteBottomSheetConfig {
  /** Type of invite: 'team', 'profile', or 'general' */
  readonly inviteType?: InviteType;
  /** Team data when inviteType is 'team' */
  readonly team?: InviteTeam;
  /** User info for personalization */
  readonly user?: InviteUser;
}

/**
 * Wrapper component for Invite in a sheet modal context.
 * Handles close with proper dismissal.
 *
 * NOTE: Uses @Input() decorated properties so Angular's setInput() API
 * (called by Ionic when useSetInputAPI:true) can properly bind componentProps.
 */
@Component({
  selector: 'nxt1-invite-modal',
  standalone: true,
  imports: [CommonModule, InviteShellComponent],
  template: `
    <nxt1-invite-shell
      [inviteType]="inviteType"
      [team]="team"
      [user]="user"
      [isModal]="true"
      (close)="onClose()"
    />
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
export class InviteModalComponent {
  private readonly modalCtrl = inject(ModalController);

  /**
   * Type of invite: 'team', 'profile', or 'general'
   * Set via Ionic componentProps (regular property, not signal input)
   */
  @Input() inviteType: InviteType = 'team';

  /**
   * Team data when inviteType is 'team'
   * Set via Ionic componentProps (regular property, not signal input)
   */
  @Input() team: InviteTeam | null = null;

  /**
   * User info for personalization
   * Set via Ionic componentProps (regular property, not signal input)
   */
  @Input() user: InviteUser | null = null;

  /**
   * Handle close request - dismisses the modal.
   */
  async onClose(): Promise<void> {
    await this.modalCtrl.dismiss(null, 'cancel');
  }
}

/**
 * Invite Bottom Sheet Service
 *
 * Thin wrapper around NxtBottomSheetService.openSheet() configured
 * specifically for the Invite feature.
 *
 * Uses native sheet modal pattern with:
 * - Drag handle bar at top
 * - Multiple breakpoints (0%, 50%, 90%, 100%)
 * - Swipe-to-dismiss
 * - Native iOS/Android sheet behavior
 *
 * @example
 * ```typescript
 * // In a component or service
 * private readonly inviteSheet = inject(InviteBottomSheetService);
 *
 * async openInvite(): Promise<void> {
 *   await this.inviteSheet.open({
 *     inviteType: 'team',
 *     team: { id: '123', name: 'Elite FC', sport: 'Soccer' },
 *   });
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class InviteBottomSheetService {
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly platform = inject(NxtPlatformService);

  /**
   * Opens the Invite feature with platform-appropriate presentation.
   * - Native app: draggable Ionic sheet
   * - Browser: Angular web overlay modal
   */
  async open(config: InviteBottomSheetConfig = {}): Promise<{ dismissed: boolean }> {
    if (this.shouldUseBottomSheet()) {
      return this.openNativeSheet(config);
    }

    const ref = this.overlay.open<InviteShellComponent, { dismissed: boolean }>({
      component: InviteShellComponent,
      inputs: {
        inviteType: config.inviteType ?? 'team',
        team: config.team ?? null,
        user: config.user ?? null,
        isModal: true,
      },
      size: this.platform.isBrowser() && this.platform.viewport().width < 768 ? 'full' : 'xl',
      backdropDismiss: true,
      escDismiss: true,
      showCloseButton: false,
      ariaLabel: 'Invite teammates',
      panelClass: 'nxt1-invite-overlay',
    });

    await ref.closed;
    return { dismissed: true };
  }

  private async openNativeSheet(config: InviteBottomSheetConfig): Promise<{ dismissed: boolean }> {
    const result = await this.bottomSheet.openSheet<void>({
      component: InviteModalComponent,
      componentProps: {
        inviteType: config.inviteType ?? 'team',
        team: config.team ?? null,
        user: config.user ?? null,
      },
      ...SHEET_PRESETS.FULL,
      showHandle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      canDismiss: true,
    });

    return {
      dismissed: result.role === 'cancel' || result.role === 'backdrop',
    };
  }

  private shouldUseBottomSheet(): boolean {
    return this.platform.isNative();
  }
}
