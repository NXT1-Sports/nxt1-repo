/**
 * @fileoverview Usage Payment Info — Billing, Payment Method, Coupon Cards
 * @module @nxt1/ui/usage
 *
 * Professional payment information section matching GitHub billing style.
 * Cards: Billing information, Payment method, Coupon, Additional information.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cardOutline,
  locationOutline,
  giftOutline,
  informationCircleOutline,
  createOutline,
} from 'ionicons/icons';
import type { UsageBillingInfo, UsagePaymentMethod, UsageCoupon } from '@nxt1/core';

@Component({
  selector: 'nxt1-usage-payment-info',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <section class="payment-info">
      <h2 class="section-heading">Payment information</h2>

      <div class="info-grid">
        <!-- Billing Information Card -->
        <div class="info-card">
          <div class="card-header">
            <div class="card-title">
              <ion-icon name="location-outline" class="card-icon"></ion-icon>
              <span>Billing information</span>
            </div>
            <button class="edit-btn" (click)="editBilling.emit()">
              <ion-icon name="create-outline"></ion-icon>
              Edit
            </button>
          </div>
          <div class="card-body">
            @if (billingInfo()) {
              <div class="billing-details">
                <p class="detail-line">{{ billingInfo()!.name }}</p>
                <p class="detail-line">{{ billingInfo()!.addressLine1 }}</p>
                <p class="detail-line">{{ billingInfo()!.addressLine2 }}</p>
                <p class="detail-line">{{ billingInfo()!.country }}</p>
              </div>
            } @else {
              <p class="empty-text">No billing information on file.</p>
            }
          </div>
        </div>

        <!-- Payment Method Card -->
        <div class="info-card">
          <div class="card-header">
            <div class="card-title">
              <ion-icon name="card-outline" class="card-icon"></ion-icon>
              <span>Payment method</span>
            </div>
            <button class="edit-btn" (click)="editPayment.emit()">
              <ion-icon name="create-outline"></ion-icon>
              Edit
            </button>
          </div>
          <div class="card-body">
            @if (defaultMethod()) {
              <div class="payment-method-detail">
                <div class="method-card-icon">{{ cardBrand() }}</div>
                <div class="method-info">
                  <p class="method-label">
                    {{ defaultMethod()!.brand }} ending in {{ defaultMethod()!.last4 }}
                  </p>
                  @if (defaultMethod()!.expiryMonth && defaultMethod()!.expiryYear) {
                    <p class="method-expiry">
                      Expires {{ defaultMethod()!.expiryMonth }}/{{ defaultMethod()!.expiryYear }}
                    </p>
                  }
                </div>
              </div>
            } @else {
              <p class="empty-text">No payment method on file.</p>
            }
          </div>
        </div>

        <!-- Coupon Card -->
        <div class="info-card">
          <div class="card-header">
            <div class="card-title">
              <ion-icon name="gift-outline" class="card-icon"></ion-icon>
              <span>Coupon</span>
            </div>
          </div>
          <div class="card-body">
            @if (coupon()) {
              <div class="coupon-detail">
                <div class="coupon-badge">{{ coupon()!.code }}</div>
                <p class="coupon-desc">{{ coupon()!.description }}</p>
                @if (coupon()!.expiresAt) {
                  <p class="coupon-expiry">Expires {{ coupon()!.expiresAt }}</p>
                }
              </div>
            } @else {
              <p class="empty-text">No coupon applied.</p>
              <button class="redeem-btn" (click)="redeemCoupon.emit()">Redeem a coupon</button>
            }
          </div>
        </div>

        <!-- Additional Information Card -->
        <div class="info-card">
          <div class="card-header">
            <div class="card-title">
              <ion-icon name="information-circle-outline" class="card-icon"></ion-icon>
              <span>Additional information</span>
            </div>
            <button class="edit-btn" (click)="editAdditional.emit()">
              <ion-icon name="create-outline"></ion-icon>
              Edit
            </button>
          </div>
          <div class="card-body">
            <p class="empty-text">
              Add information for your receipts such as an alternate email, PO numbers, or
              additional notes.
            </p>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .payment-info {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .section-heading {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-4) 0;
      }

      .info-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--nxt1-spacing-4);
      }

      .info-card {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
      }

      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .card-title {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .card-icon {
        font-size: var(--nxt1-icon-size-sm, 16px);
        color: var(--nxt1-color-text-secondary);
      }

      .edit-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-primary);
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-sm, 4px);
        cursor: pointer;
        transition: background var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-200);
        }

        ion-icon {
          font-size: var(--nxt1-fontSize-sm, 14px);
        }
      }

      .card-body {
        padding: var(--nxt1-spacing-4);
      }

      .billing-details {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0-5);
      }

      .detail-line {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .detail-line--muted {
        color: var(--nxt1-color-text-secondary);
        margin-top: var(--nxt1-spacing-1);
      }

      .empty-text {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .payment-method-detail {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .method-card-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-7);
        background: var(--nxt1-color-surface-300);
        border-radius: var(--nxt1-radius-sm, 4px);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
      }

      .method-label {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
      }

      .method-expiry {
        margin: var(--nxt1-spacing-0-5) 0 0;
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .coupon-detail {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .coupon-badge {
        display: inline-flex;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-mono);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-alpha-primary10);
        border-radius: var(--nxt1-radius-sm, 4px);
        width: fit-content;
      }

      .coupon-desc {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-primary);
      }

      .coupon-expiry {
        margin: 0;
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .redeem-btn {
        margin-top: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-primary);
        background: transparent;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md, 8px);
        cursor: pointer;
        transition: background var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-200);
        }
      }

      @media (max-width: 640px) {
        .info-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsagePaymentInfoComponent {
  constructor() {
    addIcons({
      cardOutline,
      locationOutline,
      giftOutline,
      informationCircleOutline,
      createOutline,
    });
  }

  readonly billingInfo = input<UsageBillingInfo | null>(null);
  readonly paymentMethods = input<readonly UsagePaymentMethod[]>([]);
  readonly coupon = input<UsageCoupon | null>(null);

  readonly editBilling = output<void>();
  readonly editPayment = output<void>();
  readonly redeemCoupon = output<void>();
  readonly editAdditional = output<void>();

  protected readonly defaultMethod = computed(() => {
    const methods = this.paymentMethods();
    return methods.find((m) => m.isDefault) ?? methods[0] ?? null;
  });

  protected readonly cardBrand = computed(() => {
    const method = this.defaultMethod();
    if (!method) return '';
    const brands: Record<string, string> = {
      visa: 'VISA',
      mastercard: 'MC',
      amex: 'AMEX',
      discover: 'DISC',
    };
    const brand = method.brand ?? '';
    return brands[brand.toLowerCase()] ?? brand.substring(0, 4).toUpperCase();
  });
}
