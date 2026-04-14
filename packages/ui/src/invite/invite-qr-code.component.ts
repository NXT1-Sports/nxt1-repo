/**
 * @fileoverview Invite QR Code Component - Scannable QR Display
 * @module @nxt1/ui/invite
 * @version 1.0.0
 *
 * Displays a QR code for easy invite sharing with save/share options.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect, IonSpinner } from '@ionic/angular/standalone';
import {
  buildInviteShareText,
  buildInviteShareTitle,
  type InviteType,
  type InviteTeam,
  type UserRole,
} from '@nxt1/core';
import { addIcons } from 'ionicons';
import { download, downloadOutline, share, shareOutline, checkmark } from 'ionicons/icons';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtMediaService } from '../services/media/media.service';
import { NxtLoggingService } from '../services/logging/logging.service';

@Component({
  selector: 'nxt1-invite-qr-code',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, IonSpinner],
  template: `
    <div class="qr-container">
      <!-- QR Code Display -->
      <div class="qr-code-wrapper">
        @if (qrDataUrl()) {
          <img [src]="qrDataUrl()" alt="Invite QR Code" class="qr-code-image" />
          <!-- Overlay Logo -->
          <div class="qr-code-logo">
            <span>NXT</span>
          </div>
        } @else {
          <div class="qr-code-placeholder">
            <ion-spinner name="crescent"></ion-spinner>
          </div>
        }
      </div>

      <!-- Referral Code Display -->
      @if (referralCode()) {
        <div class="qr-referral-code">
          <span class="qr-referral-code__label">Your code</span>
          <span class="qr-referral-code__value">{{ referralCode() }}</span>
        </div>
      }

      <!-- Actions -->
      <div class="qr-actions">
        <button type="button" class="qr-action-btn" (click)="onSave()" [disabled]="!qrDataUrl()">
          <ion-ripple-effect></ion-ripple-effect>
          <ion-icon [name]="saved() ? 'checkmark' : 'download-outline'"></ion-icon>
          <span>{{ saved() ? 'Saved!' : 'Save' }}</span>
        </button>

        <button
          type="button"
          class="qr-action-btn qr-action-btn--primary"
          (click)="onShare()"
          [disabled]="!qrDataUrl()"
        >
          <ion-ripple-effect></ion-ripple-effect>
          <ion-icon name="share-outline"></ion-icon>
          <span>Share QR</span>
        </button>
      </div>

      <!-- Hint Text -->
      <p class="qr-hint">Friends can scan this code to join instantly</p>
    </div>
  `,
  styles: [
    `
      /* ============================================
       QR CODE CONTAINER
       ============================================ */

      :host {
        display: block;
      }

      .qr-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      /* ============================================
       QR CODE IMAGE
       ============================================ */

      .qr-code-wrapper {
        position: relative;
        width: 180px;
        height: 180px;
        padding: var(--nxt1-spacing-4);
        background: #ffffff;
        border-radius: var(--nxt1-radius-lg);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .qr-code-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .qr-code-logo {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 36px;
        height: 36px;
        background: var(--nxt1-color-primary);
        border-radius: var(--nxt1-radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-onPrimary);
        font-family: var(--nxt1-fontFamily-brand);
        font-weight: var(--nxt1-fontWeight-bold);
        font-size: 10px;
        letter-spacing: -0.5px;
      }

      .qr-code-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-md);
      }

      /* ============================================
       REFERRAL CODE
       ============================================ */

      .qr-referral-code {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .qr-referral-code__label {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .qr-referral-code__value {
        font-family: var(--nxt1-fontFamily-mono, monospace);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        letter-spacing: 2px;
      }

      /* ============================================
       ACTIONS
       ============================================ */

      .qr-actions {
        display: flex;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        max-width: 280px;
      }

      .qr-action-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg);
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        position: relative;
        overflow: hidden;
        transition: all 0.2s ease;
      }

      .qr-action-btn:hover {
        background: var(--nxt1-color-surface-300);
      }

      .qr-action-btn:active {
        transform: scale(0.97);
      }

      .qr-action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .qr-action-btn--primary {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        border-color: transparent;
      }

      .qr-action-btn--primary:hover {
        background: var(--nxt1-color-primaryHover);
      }

      .qr-action-btn ion-icon {
        font-size: 18px;
      }

      /* ============================================
       HINT
       ============================================ */

      .qr-hint {
        margin: var(--nxt1-spacing-3) 0 0;
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        text-align: center;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteQrCodeComponent {
  constructor() {
    addIcons({
      download,
      downloadOutline,
      share,
      shareOutline,
      checkmark,
    });
  }

  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly media = inject(NxtMediaService);
  private readonly logger = inject(NxtLoggingService).child('InviteQrCodeComponent');

  readonly qrDataUrl = input<string | undefined>();
  readonly referralCode = input<string | undefined>();
  readonly inviteType = input<InviteType>('general');
  readonly senderRole = input<UserRole | null>(null);
  readonly team = input<Pick<InviteTeam, 'name' | 'sport'> | null>(null);

  protected saved = signal(false);

  protected async onSave(): Promise<void> {
    const data = this.qrDataUrl();
    if (!data) return;

    await this.haptics.impact('light');

    const result = await this.media.saveImage({
      data,
      fileName: `nxt1-invite-qr-${this.referralCode() ?? 'code'}`,
      format: 'png',
      album: 'NXT1',
    });

    if (result.success) {
      this.saved.set(true);
      this.toast.success('QR code saved to photos!');
      setTimeout(() => this.saved.set(false), 2000);
    } else {
      this.logger.error('Save QR failed', undefined, { error: result.error });
      this.toast.error(result.error ?? 'Failed to save QR code');
    }
  }

  protected async onShare(): Promise<void> {
    const data = this.qrDataUrl();
    if (!data) return;

    await this.haptics.impact('medium');

    const shareSource = {
      inviteType: this.inviteType(),
      senderRole: this.senderRole(),
      team: this.team(),
    } as const;

    const result = await this.media.shareImage({
      data,
      title: buildInviteShareTitle(shareSource),
      text: buildInviteShareText(shareSource),
      fileName: `nxt1-invite-qr-${this.referralCode() ?? 'code'}`,
      format: 'png',
    });

    if (!result.success) {
      this.logger.error('Share QR failed', undefined, { error: result.error });
      this.toast.error(result.error ?? 'Failed to share QR code');
    }
  }
}
