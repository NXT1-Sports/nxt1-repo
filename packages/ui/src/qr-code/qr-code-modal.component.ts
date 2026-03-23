/**
 * @fileoverview QR Code Modal Component - Sheet/Modal Wrapper
 * @module @nxt1/ui/qr-code
 * @version 1.0.0
 *
 * Wrapper component for the QR Code content inside a modal or bottom sheet.
 * Handles dismiss via ModalController for proper Ionic integration.
 *
 * NOTE: Uses @Input() decorated properties so Angular's setInput() API
 * (called by Ionic when useSetInputAPI:true) can properly bind componentProps.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, inject, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { NxtQrCodeContentComponent } from './qr-code-content.component';

@Component({
  selector: 'nxt1-qr-code-modal',
  standalone: true,
  imports: [CommonModule, NxtQrCodeContentComponent],
  template: `
    <nxt1-qr-code-content
      [url]="url"
      [displayName]="displayName"
      [profileImg]="profileImg"
      [sport]="sport"
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
        background: var(--nxt1-color-bg-primary, #ffffff);
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
   * Profile image URL.
   * Set via Ionic componentProps.
   */
  @Input() profileImg = '';

  /**
   * Primary sport name.
   * Set via Ionic componentProps.
   */
  @Input() sport = '';

  /**
   * Handle close request — dismisses the modal.
   */
  async onClose(): Promise<void> {
    await this.modalCtrl.dismiss({ dismissed: true, shared: false, action: 'dismiss' }, 'cancel');
  }

  /**
   * Handle action (copy/share/download) — track but keep modal open.
   */
  onAction(_action: 'copy' | 'share' | 'download'): void {
    // Actions don't auto-dismiss; user may want to do multiple things
  }
}
