/**
 * @fileoverview Wallet Settings Section Component
 * @module @nxt1/ui/wallet/sections
 * @version 1.0.0
 *
 * Wallet settings: auto-reload toggle, threshold selector,
 * and payment method reference.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonToggle, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  refreshOutline,
  cardOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import type { WalletAutoReload } from '../wallet.mock-data';

addIcons({
  refreshOutline,
  cardOutline,
  chevronForwardOutline,
});

@Component({
  selector: 'nxt1-wallet-settings-section',
  standalone: true,
  imports: [CommonModule, IonIcon, IonToggle, IonRippleEffect],
  template: `
    <div class="settings-section">
      <!-- Auto-Reload Toggle -->
      <div class="setting-row">
        <div class="setting-icon">
          <ion-icon name="refresh-outline"></ion-icon>
        </div>
        <div class="setting-info">
          <span class="setting-title">Auto-reload</span>
          <span class="setting-description">
            Automatically buy credits when balance drops below {{ autoReload()?.threshold ?? 10 }}
          </span>
        </div>
        <ion-toggle
          [checked]="autoReload()?.enabled ?? false"
          (ionChange)="toggleAutoReload.emit()"
        ></ion-toggle>
      </div>

      <!-- Payment Method -->
      <button type="button" class="setting-row setting-row--interactive" (click)="managePayment.emit()">
        <ion-ripple-effect></ion-ripple-effect>
        <div class="setting-icon">
          <ion-icon name="card-outline"></ion-icon>
        </div>
        <div class="setting-info">
          <span class="setting-title">Payment Method</span>
          <span class="setting-description">Manage your cards and billing</span>
        </div>
        <ion-icon name="chevron-forward-outline" class="setting-chevron"></ion-icon>
      </button>
    </div>
  `,
  styles: [
    `
      /* ============================================
       WALLET SETTINGS SECTION — 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .settings-section {
        display: flex;
        flex-direction: column;
        padding: var(--nxt1-spacing-2) 0;
      }

      /* ============================================
         SETTING ROW
         ============================================ */

      .setting-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4) 0;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);

        &:last-child {
          border-bottom: none;
        }
      }

      .setting-row--interactive {
        position: relative;
        width: 100%;
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        cursor: pointer;
        overflow: hidden;
        text-align: left;
        transition: background var(--nxt1-transition-fast);

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-200);
        }

        &:active {
          transform: scale(0.99);
        }

        &:last-child {
          border-bottom: none;
        }
      }

      .setting-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--nxt1-radius-lg);
        background: var(--nxt1-color-surface-200);
        flex-shrink: 0;

        ion-icon {
          font-size: 20px;
          color: var(--nxt1-color-text-secondary);
        }
      }

      .setting-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }

      .setting-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .setting-description {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
      }

      .setting-chevron {
        font-size: 20px;
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }

      /* ============================================
         ION TOGGLE THEMING
         ============================================ */

      ion-toggle {
        --track-background: var(--nxt1-color-surface-300);
        --track-background-checked: var(--nxt1-color-primary);
        --handle-background: var(--nxt1-color-text-onPrimary);
        --handle-background-checked: var(--nxt1-color-text-onPrimary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletSettingsSectionComponent {
  /** Current auto-reload settings */
  readonly autoReload = input<WalletAutoReload | null>(null);

  /** Emitted when auto-reload is toggled */
  readonly toggleAutoReload = output<void>();

  /** Emitted when user taps manage payment method */
  readonly managePayment = output<void>();
}
