/**
 * @fileoverview QR Code Modal Component - Mobile Bottom Sheet Wrapper
 * @module @nxt1/ui/qr-code
 * @version 2.0.0
 *
 * Wrapper for the mobile-specific QR code content inside an Ionic bottom sheet.
 * Handles dismiss via ModalController for proper Ionic integration.
 *
 * NOTE: Uses @Input() decorated properties so Angular's setInput() API
 * (called by Ionic when useSetInputAPI:true) can properly bind componentProps.
 *
 * ⭐ MOBILE ONLY — Desktop uses NxtQrCodeContentComponent via NxtOverlayService ⭐
 */

import { Component, ChangeDetectionStrategy, inject, Input } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { NxtQrCodeMobileComponent } from './qr-code-mobile.component';

@Component({
  selector: 'nxt1-qr-code-modal',
  standalone: true,
  imports: [NxtQrCodeMobileComponent],
  template: `
    <nxt1-qr-code-mobile
      [url]="url"
      [displayName]="displayName"
      (close)="onClose()"
      (action)="onAction($event)"
    />
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
        overflow: hidden;
        background: var(--nxt1-color-bg-primary, #0d0d0d);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtQrCodeModalComponent {
  private readonly modalCtrl = inject(ModalController);

  /**
   * Full URL to encode in the QR code.
   * Set via Ionic componentProps (regular property, not signal input).
   */
  @Input() url = '';

  /**
   * Display name shown above the QR code.
   * Set via Ionic componentProps.
   */
  @Input() displayName = '';

  /**
   * Handle close request — dismisses the modal.
   */
  async onClose(): Promise<void> {
    await this.modalCtrl.dismiss({ dismissed: true, shared: false, action: 'dismiss' }, 'cancel');
  }

  /**
   * Handle action (share/download) — track but keep modal open.
   */
  onAction(_action: 'share' | 'download'): void {
    // Actions don't auto-dismiss; user may want to do multiple things
  }
}
