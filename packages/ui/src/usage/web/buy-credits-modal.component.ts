/**
 * @fileoverview Buy Credits Modal — Web Overlay Content
 * @module @nxt1/ui/usage/web
 * @version 1.0.0
 *
 * Modal content component for purchasing Agent X credits.
 * Opened via `NxtOverlayService.open()` on the web usage dashboard.
 * Emits the selected amount (in cents) via `close` output so the
 * overlay service auto-dismisses with the value.
 *
 * Packages: $5, $10, $25, $50, $100, $250, $500
 *
 * ⭐ WEB ONLY — For mobile, use UsageBottomSheetService.showBuyCreditsOptions() ⭐
 */

import { Component, ChangeDetectionStrategy, output } from '@angular/core';
import { NxtModalHeaderComponent } from '../../components/overlay';

/** Available credit packages (dollar amounts). */
const CREDIT_PACKAGES = [5, 10, 25, 50, 100, 250, 500] as const;

@Component({
  selector: 'nxt1-buy-credits-modal',
  standalone: true,
  imports: [NxtModalHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="buy-credits-modal">
      <nxt1-modal-header
        title="Add Credits"
        icon="card-outline"
        [showIcon]="true"
        iconShape="circle"
        (closeModal)="close.emit(null)"
      />

      <div class="buy-credits-body">
        <p class="buy-credits-subtitle">Select a credit package to add to your wallet.</p>

        <div class="buy-credits-grid">
          @for (amount of packages; track amount) {
            <button type="button" class="buy-credits-option" (click)="selectPackage(amount)">
              <span class="buy-credits-amount">\${{ amount }}</span>
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .buy-credits-modal {
        display: flex;
        flex-direction: column;
        max-height: 80vh;
      }

      .buy-credits-body {
        padding: 20px 24px 24px;
      }

      .buy-credits-subtitle {
        margin: 0 0 20px;
        font-size: 14px;
        color: var(--nxt1-text-secondary, #94a3b8);
        text-align: center;
      }

      .buy-credits-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }

      .buy-credits-option {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px 12px;
        border: 1px solid var(--nxt1-border-primary, rgba(255, 255, 255, 0.08));
        border-radius: 12px;
        background: var(--nxt1-surface-secondary, rgba(255, 255, 255, 0.04));
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .buy-credits-option:hover {
        border-color: var(--nxt1-accent-primary, #39ff14);
        background: var(--nxt1-surface-tertiary, rgba(255, 255, 255, 0.08));
      }

      .buy-credits-option:active {
        transform: scale(0.97);
      }

      .buy-credits-amount {
        font-size: 18px;
        font-weight: 600;
        color: var(--nxt1-text-primary, #f1f5f9);
      }

      /* Last row single item — center it */
      .buy-credits-option:last-child:nth-child(3n + 1) {
        grid-column: 2;
      }
    `,
  ],
})
export class BuyCreditsModalComponent {
  /** Emits selected amount in cents, or null on dismiss. */
  readonly close = output<number | null>();

  /** Available credit packages. */
  protected readonly packages = CREDIT_PACKAGES;

  protected selectPackage(amount: number): void {
    this.close.emit(amount * 100);
  }
}
