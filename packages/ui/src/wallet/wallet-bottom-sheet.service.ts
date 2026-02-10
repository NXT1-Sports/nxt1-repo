/**
 * @fileoverview Wallet Bottom Sheet Service
 * @module @nxt1/ui/wallet
 * @version 1.0.0
 *
 * Feature-specific service that uses the shared NxtBottomSheetService
 * to open the Credit Wallet in a native draggable bottom sheet.
 *
 * Architecture:
 * - NxtBottomSheetService.openSheet() = Unified service for ALL content sheets
 * - WalletBottomSheetService.open()   = Thin wrapper configured for Wallet
 *
 * Follows exact same pattern as:
 * - EditProfileBottomSheetService
 * - ManageTeamBottomSheetService
 *
 * USES SHARED NxtBottomSheetService — NOT HARDCODED
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { NxtLoggingService } from '../services/logging';
import { WalletShellComponent, type WalletCloseEvent } from './wallet-shell.component';
import type { WalletSectionId } from './wallet.mock-data';

// ============================================
// MODAL WRAPPER COMPONENT
// ============================================

/**
 * Wrapper component for Wallet in a sheet modal context.
 * Handles dismiss coordination with the modal controller.
 */
@Component({
  selector: 'nxt1-wallet-modal',
  standalone: true,
  imports: [CommonModule, WalletShellComponent],
  template: `
    <nxt1-wallet-shell
      [showHeader]="false"
      [initialSection]="initialSection()"
      (close)="onClose($event)"
      (sectionAction)="onSectionAction($event)"
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
export class WalletModalComponent {
  private readonly modalCtrl = inject(ModalController);

  /** Optional initial section to expand */
  readonly initialSection = input<WalletSectionId | null>(null);

  /** Dismiss the modal with the close event data */
  async onClose(event: WalletCloseEvent): Promise<void> {
    await this.modalCtrl.dismiss(event, event.purchased ? 'purchased' : 'cancel');
  }

  /** Forward section actions to modal result (for external handling) */
  async onSectionAction(event: {
    section: WalletSectionId;
    action: string;
    data?: unknown;
  }): Promise<void> {
    // Close sheet and propagate the action outward
    if (event.action === 'managePayment') {
      await this.modalCtrl.dismiss(event, 'navigate');
    }
  }
}

// ============================================
// BOTTOM SHEET SERVICE OPTIONS / RESULT
// ============================================

/** Options for presenting the wallet sheet */
export interface WalletSheetOptions {
  /** Initial section to expand */
  initialSection?: WalletSectionId;

  /** Breakpoints for sheet height */
  breakpoints?: number[];

  /** Initial breakpoint */
  initialBreakpoint?: number;

  /** CSS class for the sheet */
  cssClass?: string;
}

/** Result from wallet sheet */
export interface WalletSheetResult {
  /** Whether credits were purchased during this session */
  purchased: boolean;

  /** Whether sheet was dismissed */
  dismissed: boolean;

  /** Role of dismissal */
  role?: string;
}

// ============================================
// WALLET BOTTOM SHEET SERVICE
// ============================================

/**
 * Wallet Sheet Service
 *
 * Thin wrapper around ModalController configured specifically
 * for the Credit Wallet feature.
 *
 * Uses native sheet modal pattern with:
 * - Drag handle bar at top
 * - Multiple breakpoints (50% / 75% / 100%)
 * - Swipe-to-dismiss
 *
 * Follows the same architecture as ManageTeamBottomSheetService.
 */
@Injectable({ providedIn: 'root' })
export class WalletBottomSheetService {
  private readonly modalController = inject(ModalController);
  private readonly logger = inject(NxtLoggingService);

  private activeModal: HTMLIonModalElement | null = null;

  /**
   * Open the wallet in a native draggable bottom sheet.
   */
  async open(options: WalletSheetOptions = {}): Promise<WalletSheetResult> {
    this.logger.debug('WalletBottomSheet: Opening sheet');

    // Dismiss any existing sheet
    if (this.activeModal) {
      await this.activeModal.dismiss();
    }

    const {
      initialSection,
      breakpoints = [0, 0.5, 0.75, 1],
      initialBreakpoint = 0.75,
      cssClass = 'wallet-sheet',
    } = options;

    this.activeModal = await this.modalController.create({
      component: WalletModalComponent,
      componentProps: initialSection ? { initialSection } : undefined,
      breakpoints,
      initialBreakpoint,
      cssClass,
      handle: true,
      handleBehavior: 'cycle',
      backdropDismiss: true,
      showBackdrop: true,
    });

    await this.activeModal.present();

    // Wait for dismissal
    const { data, role } = await this.activeModal.onWillDismiss<WalletCloseEvent>();

    this.activeModal = null;

    this.logger.debug('WalletBottomSheet: Sheet dismissed', { role });

    return {
      purchased: data?.purchased ?? false,
      dismissed: true,
      role: role ?? undefined,
    };
  }

  /**
   * Dismiss the active sheet.
   */
  async dismiss(result?: WalletCloseEvent): Promise<boolean> {
    if (!this.activeModal) return false;

    this.logger.debug('WalletBottomSheet: Dismissing sheet');
    return this.activeModal.dismiss(result);
  }

  /**
   * Check if sheet is currently open.
   */
  isOpen(): boolean {
    return this.activeModal !== null;
  }

  /**
   * Open sheet directly to the bundles section (for low-balance prompts).
   */
  async openBundles(): Promise<WalletSheetResult> {
    return this.open({
      initialSection: 'bundles',
      initialBreakpoint: 0.75,
    });
  }

  /**
   * Open sheet directly to history section.
   */
  async openHistory(): Promise<WalletSheetResult> {
    return this.open({
      initialSection: 'history',
      initialBreakpoint: 0.75,
    });
  }

  /**
   * Open sheet in full-screen mode (for payment management nav).
   */
  async openFullScreen(): Promise<WalletSheetResult> {
    return this.open({
      initialBreakpoint: 1,
    });
  }
}
