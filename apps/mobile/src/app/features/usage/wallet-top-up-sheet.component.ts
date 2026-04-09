/**
 * @fileoverview WalletTopUpSheetComponent — Apple IAP Top-Up Bottom Sheet
 * @module @nxt1/mobile/features/usage
 * @version 1.0.0
 *
 * Presents a list of consumable in-app purchase products (100–5000 credits).
 * On tap, triggers the StoreKit purchase sheet via IapService.
 *
 * Opened from mobile usage.component.ts via NxtBottomSheetService.
 * Not shared with web — IAP is iOS-only.
 */

import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '@nxt1/ui';
import { NxtIconComponent } from '@nxt1/ui';
import {
  IapService,
  type IapProductDisplay,
  type IapProductId,
} from '../../core/services/native/iap.service';

@Component({
  selector: 'app-wallet-top-up-sheet',
  standalone: true,
  imports: [NxtSheetHeaderComponent, NxtIconComponent, DecimalPipe],
  template: `
    <nxt1-sheet-header
      title="Add Credits"
      closePosition="right"
      [centerTitle]="true"
      [showBorder]="true"
      (closeSheet)="dismiss()"
    />

    <div class="top-up-sheet__scroll">
      <!-- Balance hint -->
      <p class="top-up-sheet__hint">Credits are used for AI features. They never expire.</p>

      <!-- Product list -->
      <div class="top-up-sheet__products">
        @if (iap.loading()) {
          @for (i of skeletonItems; track i) {
            <div class="top-up-card top-up-card--skeleton"></div>
          }
        } @else {
          @for (product of iap.products(); track product.productId) {
            <button
              type="button"
              class="top-up-card"
              [class.top-up-card--popular]="product.productId === 'nxt1.wallet.1000'"
              [class.top-up-card--loading]="purchasingId() === product.productId"
              [disabled]="iap.purchasing()"
              (click)="onPurchase(product)"
            >
              @if (product.productId === 'nxt1.wallet.1000') {
                <span class="top-up-card__badge">Most Popular</span>
              }

              <div class="top-up-card__left">
                <nxt1-icon name="wallet" size="20" class="top-up-card__icon" />
                <div class="top-up-card__info">
                  <span class="top-up-card__credits">{{ product.credits | number }} Credits</span>
                  <span class="top-up-card__label">{{ product.title }}</span>
                </div>
              </div>

              <div class="top-up-card__right">
                @if (purchasingId() === product.productId) {
                  <span class="top-up-card__spinner"></span>
                } @else {
                  <span class="top-up-card__price">{{ product.priceString }}</span>
                }
              </div>
            </button>
          }
        }
      </div>

      <!-- Footer note -->
      <p class="top-up-sheet__footer">Payments processed by Apple. Credits are non-refundable.</p>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .top-up-sheet__scroll {
        flex: 1;
        overflow-y: auto;
        padding: 16px 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
      }

      .top-up-sheet__hint {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, #888);
        text-align: center;
        margin: 0 0 20px;
      }

      .top-up-sheet__products {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .top-up-card {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 14px 16px;
        border-radius: 12px;
        border: 1.5px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-bg-secondary, #111);
        cursor: pointer;
        transition:
          opacity 0.15s ease,
          border-color 0.15s ease;
        text-align: left;
        -webkit-tap-highlight-color: transparent;
      }

      .top-up-card:active:not(:disabled) {
        opacity: 0.75;
      }

      .top-up-card:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .top-up-card--popular {
        border-color: var(--nxt1-color-brand, #a78bfa);
        background: rgba(167, 139, 250, 0.06);
      }

      .top-up-card--loading {
        opacity: 0.8;
      }

      .top-up-card--skeleton {
        height: 64px;
        animation: top-up-skeleton-pulse 1.4s ease-in-out infinite;
        cursor: default;
        border-color: transparent;
      }

      @keyframes top-up-skeleton-pulse {
        0%,
        100% {
          opacity: 0.3;
        }
        50% {
          opacity: 0.6;
        }
      }

      .top-up-card__badge {
        position: absolute;
        top: -10px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--nxt1-color-brand, #a78bfa);
        color: #fff;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.5px;
        padding: 2px 10px;
        border-radius: 20px;
        white-space: nowrap;
      }

      .top-up-card__left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .top-up-card__icon {
        color: var(--nxt1-color-brand, #a78bfa);
        flex-shrink: 0;
      }

      .top-up-card__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .top-up-card__credits {
        font-size: 16px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #f5f5f5);
      }

      .top-up-card__label {
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, #888);
      }

      .top-up-card__right {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 60px;
      }

      .top-up-card__price {
        font-size: 16px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #f5f5f5);
      }

      .top-up-card__spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(167, 139, 250, 0.3);
        border-top-color: var(--nxt1-color-brand, #a78bfa);
        border-radius: 50%;
        animation: top-up-spin 0.7s linear infinite;
        display: inline-block;
      }

      @keyframes top-up-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .top-up-sheet__footer {
        margin-top: 20px;
        font-size: 11px;
        color: var(--nxt1-color-text-disabled, #555);
        text-align: center;
        line-height: 1.5;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletTopUpSheetComponent implements OnInit {
  private readonly modal = inject(ModalController);
  protected readonly iap = inject(IapService);

  protected readonly purchasingId = signal<IapProductId | null>(null);

  protected readonly skeletonItems = [1, 2, 3, 4, 5];

  ngOnInit(): void {
    void this.iap.fetchProducts();
  }

  protected async onPurchase(product: IapProductDisplay): Promise<void> {
    if (this.iap.purchasing()) return;

    this.purchasingId.set(product.productId);
    try {
      const newBalance = await this.iap.purchase(product.productId);
      if (newBalance !== null) {
        // Dismiss sheet after successful purchase — always pass purchased:true
        // so usage overview refreshes even if newBalanceCents is unavailable
        await this.modal.dismiss({ purchased: true, newBalanceCents: newBalance });
        return;
      }
    } finally {
      this.purchasingId.set(null);
    }
  }

  protected async dismiss(): Promise<void> {
    await this.modal.dismiss();
  }
}
