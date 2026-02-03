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

import { Injectable, inject, Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { NxtBottomSheetService } from '../components/bottom-sheet';
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
 * NOTE: Uses regular class properties (not signal inputs) because Ionic's
 * componentProps sets values directly on the component instance. Signal
 * inputs only work with Angular's template binding system.
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
  inviteType: InviteType = 'team';

  /**
   * Team data when inviteType is 'team'
   * Set via Ionic componentProps (regular property, not signal input)
   */
  team: InviteTeam | null = null;

  /**
   * User info for personalization
   * Set via Ionic componentProps (regular property, not signal input)
   */
  user: InviteUser | null = null;

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

  /**
   * Opens the Invite feature in a native draggable bottom sheet.
   *
   * Uses NxtBottomSheetService.openSheet() with Invite configuration:
   * - Breakpoints: 0 (closed), 0.5 (peek), 0.9 (default), 1 (full)
   * - Native drag handle
   * - Swipe-to-dismiss enabled
   *
   * @param config - Optional configuration for the invite sheet
   * @returns Promise resolving when the sheet is dismissed
   */
  async open(config: InviteBottomSheetConfig = {}): Promise<{ dismissed: boolean }> {
    const result = await this.bottomSheet.openSheet<void>({
      // The component to inject
      component: InviteModalComponent,

      // Component inputs
      componentProps: {
        inviteType: config.inviteType ?? 'team',
        team: config.team ?? null,
        user: config.user ?? null,
      },

      // Breakpoints for draggable resize
      // 0 = closed, 0.5 = peek/half, 0.9 = default (near full), 1 = full
      breakpoints: [0, 0.5, 0.9, 1],
      initialBreakpoint: 0.9,

      // Show native drag handle bar
      showHandle: true,
      handleBehavior: 'cycle',

      // Backdrop behavior
      backdropDismiss: true,
      backdropBreakpoint: 0.5,

      // Allow swipe-to-dismiss
      canDismiss: true,
    });

    return {
      dismissed: result.role === 'cancel' || result.role === 'backdrop',
    };
  }
}
