/**
 * @fileoverview Usage Payment Info — Read-Only Summary + Stripe Portal Redirect
 * @module @nxt1/ui/usage
 *
 * Read-only payment information section. Displays current billing address and
 * default payment method on file. All editing (add/remove cards, update billing
 * address, manage invoices) is handled via the Stripe Customer Portal — the
 * frontend never collects raw card data.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import type { UsageBillingInfo, UsagePaymentMethod } from '@nxt1/core';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';

@Component({
  selector: 'nxt1-usage-payment-info',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <section class="payment-info" [attr.data-testid]="testIds.PAYMENT_INFO_SECTION">
      <div class="info-grid">
        <!-- Billing Information Card (read-only) -->
        <div class="info-card">
          <div class="card-header">
            <div class="card-title">
              <nxt1-icon name="location-outline" className="card-icon" />
              <span>Billing information</span>
            </div>
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

        <!-- Payment Method Card (read-only) -->
        <div class="info-card">
          <div class="card-header">
            <div class="card-title">
              <nxt1-icon name="card-outline" className="card-icon" />
              <span>Payment method</span>
            </div>
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
      </div>

      <!-- Stripe Portal CTA -->
      <div class="portal-cta">
        <div class="portal-info">
          <nxt1-icon name="shield-checkmark-outline" className="portal-shield-icon" />
          <p class="portal-text">
            Payment methods, billing address, and invoices are managed securely through Stripe.
          </p>
        </div>
        <button
          class="portal-btn"
          [attr.data-testid]="testIds.PAYMENT_INFO_EDIT_BILLING"
          (click)="manageBilling.emit()"
        >
          Manage billing
        </button>
      </div>
    </section>
  `,
  styles: [
    `
      .payment-info {
        margin-bottom: var(--nxt1-spacing-8);
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

      /* ── Stripe Portal CTA ────────────────────────── */

      .portal-cta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
        margin-top: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      .portal-info {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        flex: 1;
        min-width: 0;
      }

      .portal-shield-icon {
        flex-shrink: 0;
        font-size: var(--nxt1-icon-size-md, 20px);
        color: var(--nxt1-color-success, #22c55e);
      }

      .portal-text {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .portal-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        flex-shrink: 0;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        font-family: var(--nxt1-fontFamily-body);
        color: var(--nxt1-color-text-on-primary, #000);
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: var(--nxt1-radius-md, 8px);
        cursor: pointer;
        transition: opacity var(--nxt1-transition-fast);
        white-space: nowrap;

        &:hover {
          opacity: 0.9;
        }
      }

      .portal-btn-icon {
        width: var(--nxt1-fontSize-sm, 14px);
        height: var(--nxt1-fontSize-sm, 14px);
      }

      @media (max-width: 640px) {
        .info-grid {
          grid-template-columns: 1fr;
        }

        .portal-cta {
          flex-direction: column;
          align-items: stretch;
          text-align: center;
        }

        .portal-info {
          flex-direction: column;
          text-align: center;
        }

        .portal-btn {
          justify-content: center;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsagePaymentInfoComponent {
  protected readonly testIds = USAGE_TEST_IDS;

  readonly billingInfo = input<UsageBillingInfo | null>(null);
  readonly paymentMethods = input<readonly UsagePaymentMethod[]>([]);

  /** Emitted when the user clicks "Manage billing" — opens Stripe Customer Portal */
  readonly manageBilling = output<void>();

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
