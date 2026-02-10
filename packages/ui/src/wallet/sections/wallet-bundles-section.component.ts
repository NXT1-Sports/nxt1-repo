/**
 * @fileoverview Wallet Bundles Section Component
 * @module @nxt1/ui/wallet/sections
 * @version 1.0.0
 *
 * Displays available credit packs for purchase in a 2-column grid.
 * Follows Fortnite-style design: badges, savings highlights,
 * pre-selected recommended bundle, and one-tap purchase.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cartOutline, checkmarkCircle, flashOutline } from 'ionicons/icons';
import { formatPrice } from '@nxt1/core/constants';
import type { WalletBundle } from '../wallet.mock-data';

addIcons({
  cartOutline,
  checkmarkCircle,
  flashOutline,
});

@Component({
  selector: 'nxt1-wallet-bundles-section',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, IonSpinner],
  template: `
    <div class="bundles-section">
      <!-- Bundle Grid -->
      <div class="bundle-grid">
        @for (bundle of bundles(); track bundle.id) {
          <button
            type="button"
            class="bundle-card"
            [class.bundle-card--selected]="selectedId() === bundle.id"
            [class.bundle-card--recommended]="bundle.recommended"
            (click)="onSelectBundle(bundle.id)"
          >
            <ion-ripple-effect></ion-ripple-effect>

            <!-- Badge -->
            @if (bundle.badge) {
              <span class="bundle-badge" [class.bundle-badge--popular]="bundle.badge === 'POPULAR'">
                {{ bundle.badge }}
              </span>
            }

            <!-- Selected Check -->
            @if (selectedId() === bundle.id) {
              <ion-icon name="checkmark-circle" class="selected-check"></ion-icon>
            }

            <!-- Credits -->
            <div class="bundle-credits">
              <span class="credits-value">{{ bundle.credits }}</span>
              @if (bundle.bonusCredits > 0) {
                <span class="credits-bonus">+{{ bundle.bonusCredits }}</span>
              }
            </div>
            <span class="credits-label">credits</span>

            <!-- Price -->
            <span class="bundle-price">{{ formatBundlePrice(bundle.price) }}</span>

            <!-- Savings -->
            @if (bundle.savings > 0) {
              <span class="bundle-savings">Save {{ bundle.savings }}%</span>
            }
          </button>
        }
      </div>

      <!-- Purchase CTA -->
      @if (selectedBundle()) {
        <button
          type="button"
          class="purchase-btn"
          [disabled]="isPurchasing()"
          (click)="onPurchase()"
        >
          <ion-ripple-effect></ion-ripple-effect>
          @if (isPurchasing()) {
            <ion-spinner name="crescent"></ion-spinner>
            <span>Processing…</span>
          } @else {
            <ion-icon name="flash-outline"></ion-icon>
            <span
              >Buy {{ selectedBundle()!.credits + selectedBundle()!.bonusCredits }} Credits —
              {{ formatBundlePrice(selectedBundle()!.price) }}</span
            >
          }
        </button>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       WALLET BUNDLES SECTION — 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .bundles-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-2) 0;
      }

      /* ============================================
         BUNDLE GRID
         ============================================ */

      .bundle-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-3);
      }

      .bundle-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-5) var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-200);
        border: 2px solid transparent;
        border-radius: var(--nxt1-radius-xl);
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);
        text-align: center;

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-300);
        }

        &:active {
          transform: scale(0.97);
        }
      }

      .bundle-card--selected {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-surface-100);
        box-shadow: 0 0 0 1px var(--nxt1-color-primary);
      }

      .bundle-card--recommended {
        border-color: var(--nxt1-color-secondary);
      }

      .bundle-card--selected.bundle-card--recommended {
        border-color: var(--nxt1-color-secondary);
        box-shadow: 0 0 0 1px var(--nxt1-color-secondary);
      }

      /* ============================================
         BADGE
         ============================================ */

      .bundle-badge {
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%) translateY(-1px);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-radius: 0 0 var(--nxt1-radius-md) var(--nxt1-radius-md);
        white-space: nowrap;
      }

      .bundle-badge--popular {
        background: var(--nxt1-color-primary);
      }

      /* ============================================
         SELECTED CHECK
         ============================================ */

      .selected-check {
        position: absolute;
        top: var(--nxt1-spacing-2);
        right: var(--nxt1-spacing-2);
        font-size: 22px;
        color: var(--nxt1-color-primary);
      }

      .bundle-card--recommended .selected-check {
        color: var(--nxt1-color-secondary);
      }

      /* ============================================
         CREDITS
         ============================================ */

      .bundle-credits {
        display: flex;
        align-items: baseline;
        gap: var(--nxt1-spacing-1);
      }

      .credits-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: 800;
        color: var(--nxt1-color-text-primary);
        line-height: 1;
      }

      .credits-bonus {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 700;
        color: var(--nxt1-color-success);
      }

      .credits-label {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* ============================================
         PRICE & SAVINGS
         ============================================ */

      .bundle-price {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin-top: var(--nxt1-spacing-1);
      }

      .bundle-savings {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 600;
        color: var(--nxt1-color-success);
      }

      /* ============================================
         PURCHASE CTA
         ============================================ */

      .purchase-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        width: 100%;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-xl);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 700;
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 20px;
        }

        ion-spinner {
          width: 20px;
          height: 20px;
          --color: var(--nxt1-color-text-onPrimary);
        }

        &:hover:not(:disabled),
        &:focus-visible:not(:disabled) {
          background: var(--nxt1-color-primaryDark);
        }

        &:active:not(:disabled) {
          transform: scale(0.98);
        }

        &:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletBundlesSectionComponent {
  /** Available bundles */
  readonly bundles = input<readonly WalletBundle[]>([]);

  /** Currently selected bundle ID */
  readonly selectedId = input<string | null>(null);

  /** Whether a purchase is in progress */
  readonly isPurchasing = input(false);

  /** Emitted when a bundle is selected */
  readonly bundleSelected = output<string>();

  /** Emitted when purchase is confirmed */
  readonly purchase = output<string>();

  /** Selected bundle object */
  readonly selectedBundle = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.bundles().find((b) => b.id === id) ?? null;
  });

  /** Format price from cents */
  formatBundlePrice(cents: number): string {
    return formatPrice(cents);
  }

  onSelectBundle(bundleId: string): void {
    this.bundleSelected.emit(bundleId);
  }

  onPurchase(): void {
    const id = this.selectedId();
    if (id) {
      this.purchase.emit(id);
    }
  }
}
