/**
 * @fileoverview Manage Team Bottom Sheet Service
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * Service for presenting ManageTeamShell in a bottom sheet on mobile.
 * Follows same pattern as EditProfileBottomSheetService.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import type { ManageTeamFormData, ManageTeamSectionId } from '@nxt1/core';
import { SHEET_PRESETS } from '../components/bottom-sheet';
import { ManageTeamShellComponent, type ManageTeamCloseEvent } from './manage-team-shell.component';
import { ManageTeamService } from './manage-team.service';
import { NxtLoggingService } from '../services/logging';

/** Options for presenting the manage team sheet */
export interface ManageTeamSheetOptions {
  /** Team ID to manage (null for new team) */
  teamId?: string | null;

  /** Initial section to expand */
  initialSection?: ManageTeamSectionId;

  /** Custom title */
  title?: string;

  /** Breakpoints for sheet height */
  breakpoints?: number[];

  /** Initial breakpoint */
  initialBreakpoint?: number;

  /** CSS class for the sheet */
  cssClass?: string;
}

/** Result from manage team sheet */
export interface ManageTeamSheetResult {
  /** Whether changes were saved */
  saved: boolean;

  /** Updated form data (if saved) */
  data?: ManageTeamFormData;

  /** Whether sheet was dismissed */
  dismissed: boolean;
}

@Injectable({ providedIn: 'root' })
export class ManageTeamBottomSheetService {
  private readonly modalController = inject(ModalController);
  private readonly manageTeam = inject(ManageTeamService);
  private readonly logger = inject(NxtLoggingService);

  private activeModal: HTMLIonModalElement | null = null;

  /**
   * Open the manage team sheet
   */
  async open(options: ManageTeamSheetOptions = {}): Promise<ManageTeamSheetResult> {
    this.logger.debug('ManageTeamBottomSheet: Opening sheet');

    // Dismiss any existing sheet
    if (this.activeModal) {
      await this.activeModal.dismiss();
    }

    // ManageTeamService is root-scoped; clear any stale editor state before opening.
    this.manageTeam.reset();

    const {
      teamId = null,
      initialSection = null,
      title = teamId ? 'Manage Team' : 'Create Team',
      breakpoints = SHEET_PRESETS.FULL.breakpoints,
      initialBreakpoint = SHEET_PRESETS.FULL.initialBreakpoint,
      cssClass = 'manage-team-sheet',
    } = options;

    this.activeModal = await this.modalController.create({
      component: ManageTeamShellComponent,
      componentProps: {
        teamId,
        title,
        initialSection,
        isModalMode: true,
      },
      breakpoints,
      initialBreakpoint,
      cssClass,
      handle: false,
      backdropDismiss: true,
      showBackdrop: true,
    });

    try {
      await this.activeModal.present();

      // Wait for dismissal
      const { data } = await this.activeModal.onWillDismiss<ManageTeamCloseEvent>();

      this.logger.debug('ManageTeamBottomSheet: Sheet dismissed');

      return {
        saved: data?.saved ?? false,
        data: data?.data,
        dismissed: true,
      };
    } finally {
      this.activeModal = null;
      this.manageTeam.reset();
    }
  }

  /**
   * Dismiss the active sheet
   */
  async dismiss(result?: ManageTeamCloseEvent): Promise<boolean> {
    if (!this.activeModal) return false;

    this.logger.debug('ManageTeamBottomSheet: Dismissing sheet');

    return this.activeModal.dismiss(result);
  }

  /**
   * Check if sheet is currently open
   */
  isOpen(): boolean {
    return this.activeModal !== null;
  }

  /**
   * Open sheet for a specific section
   */
  async openSection(teamId: string, section: ManageTeamSectionId): Promise<ManageTeamSheetResult> {
    return this.open({
      teamId,
      initialSection: section,
      initialBreakpoint: SHEET_PRESETS.TALL.initialBreakpoint,
    });
  }

  /**
   * Open sheet for creating a new team
   */
  async openCreateTeam(): Promise<ManageTeamSheetResult> {
    return this.open({
      teamId: null,
      title: 'Create Team',
      initialSection: 'team-info',
      initialBreakpoint: SHEET_PRESETS.FULL.initialBreakpoint,
    });
  }

  /**
   * Open sheet for managing roster
   */
  async openRoster(teamId: string): Promise<ManageTeamSheetResult> {
    return this.openSection(teamId, 'roster');
  }

  /**
   * Open sheet for managing schedule
   */
  async openSchedule(teamId: string): Promise<ManageTeamSheetResult> {
    return this.openSection(teamId, 'schedule');
  }

  /**
   * Open sheet for managing sponsors
   */
  async openSponsors(teamId: string): Promise<ManageTeamSheetResult> {
    return this.openSection(teamId, 'sponsors');
  }
}
