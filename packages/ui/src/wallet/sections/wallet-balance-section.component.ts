/**
 * @fileoverview Wallet Balance Section Component
 * @module @nxt1/ui/wallet/sections
 * @version 1.0.0
 *
 * Displays credit balance breakdown by type (AI, College, Email).
 * Shows total balance with a prominent hero number and per-type cards.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sparklesOutline,
  schoolOutline,
  mailOutline,
  addCircleOutline,
} from 'ionicons/icons';
import type { WalletBalance } from '../wallet.mock-data';

addIcons({
  sparklesOutline,
  schoolOutline,
  mailOutline,
  addCircleOutline,
});

@Component({
  selector: 'nxt1-wallet-balance-section',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div class="balance-section">
      <!-- Hero Balance -->
      <div class="hero-balance" [class.hero-balance--low]="isLow()" [class.hero-balance--critical]="isCritical()">
        <span class="hero-value">{{ balance()?.total ?? 0 }}</span>
        <span class="hero-label">credits available</span>
      </div>

      <!-- Per-Type Breakdown -->
      <div class="type-grid">
        <!-- AI Credits -->
        <div class="type-card">
          <div class="type-icon type-icon--ai">
            <ion-icon name="sparkles-outline"></ion-icon>
          </div>
          <div class="type-info">
            <span class="type-value">{{ balance()?.ai ?? 0 }}</span>
            <span class="type-label">AI</span>
          </div>
        </div>

        <!-- College Credits -->
        <div class="type-card">
          <div class="type-icon type-icon--college">
            <ion-icon name="school-outline"></ion-icon>
          </div>
          <div class="type-info">
            <span class="type-value">{{ balance()?.college ?? 0 }}</span>
            <span class="type-label">College</span>
          </div>
        </div>

        <!-- Email Credits -->
        <div class="type-card">
          <div class="type-icon type-icon--email">
            <ion-icon name="mail-outline"></ion-icon>
          </div>
          <div class="type-info">
            <span class="type-value">{{ balance()?.email ?? 0 }}</span>
            <span class="type-label">Email</span>
          </div>
        </div>
      </div>

      <!-- Quick Add CTA (contextual) -->
      @if (isLow()) {
        <button type="button" class="quick-add-btn" (click)="addCredits.emit()">
          <ion-ripple-effect></ion-ripple-effect>
          <ion-icon name="add-circle-outline"></ion-icon>
          <span>{{ isCritical() ? 'Top up now' : 'Add more credits' }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       WALLET BALANCE SECTION — 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .balance-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-2) 0;
      }

      /* ============================================
         HERO BALANCE
         ============================================ */

      .hero-balance {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-4) 0;
      }

      .hero-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-4xl);
        font-weight: 800;
        color: var(--nxt1-color-primary);
        line-height: 1;
        letter-spacing: -0.02em;
        transition: color var(--nxt1-transition-fast);
      }

      .hero-balance--low .hero-value {
        color: var(--nxt1-color-warning);
      }

      .hero-balance--critical .hero-value {
        color: var(--nxt1-color-error);
      }

      .hero-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* ============================================
         TYPE GRID
         ============================================ */

      .type-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      .type-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-xl);
        transition: background var(--nxt1-transition-fast);
      }

      .type-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-lg);

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-color-text-onPrimary);
        }
      }

      .type-icon--ai {
        background: var(--nxt1-color-primary);
      }

      .type-icon--college {
        background: var(--nxt1-color-secondary);
      }

      .type-icon--email {
        background: var(--nxt1-color-tertiary);
      }

      .type-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .type-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        line-height: 1;
      }

      .type-label {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* ============================================
         QUICK ADD CTA
         ============================================ */

      .quick-add-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        width: 100%;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-200);
        border: 1px dashed var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-lg);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 20px;
        }

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-300);
          border-color: var(--nxt1-color-primary);
        }

        &:active {
          transform: scale(0.98);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletBalanceSectionComponent {
  /** Current credit balance */
  readonly balance = input<WalletBalance | null>(null);

  /** Low-balance threshold */
  readonly lowThreshold = input(25);

  /** Critical-balance threshold */
  readonly criticalThreshold = input(10);

  /** Emitted when user wants to add credits */
  readonly addCredits = output<void>();

  /** Whether balance is below low threshold */
  readonly isLow = computed(() => (this.balance()?.total ?? 0) < this.lowThreshold());

  /** Whether balance is below critical threshold */
  readonly isCritical = computed(() => (this.balance()?.total ?? 0) < this.criticalThreshold());
}
