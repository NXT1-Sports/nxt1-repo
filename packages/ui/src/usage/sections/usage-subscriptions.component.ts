/**
 * @fileoverview Usage Subscriptions Section
 * @module @nxt1/ui/usage
 *
 * Subscription cards row: plan name + monthly cost.
 * GitHub-style layout with "Manage subscriptions" link.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonRippleEffect } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../../components/icon';
import type { UsageSubscription } from '@nxt1/core';
import { formatPrice } from '@nxt1/core';

@Component({
  selector: 'nxt1-usage-subscriptions',
  standalone: true,
  imports: [CommonModule, IonRippleEffect, NxtIconComponent],
  template: `
    <section class="usage-subscriptions">
      <div class="section-header">
        <h2 class="section-heading">Subscriptions</h2>
        <button type="button" class="manage-link" (click)="manage.emit()">
          Manage subscriptions
        </button>
      </div>

      <div class="subscription-cards">
        @for (sub of subscriptions(); track sub.id) {
          <div class="subscription-card">
            <ion-ripple-effect></ion-ripple-effect>
            <span class="sub-name">{{ sub.name }}</span>
            <div class="sub-price">
              <span class="price-value">{{ formatSubPrice(sub.monthlyCost) }}</span>
              <span class="price-period">per month</span>
            </div>
          </div>
        }
      </div>

      <p class="tax-note">
        <nxt1-icon name="infoCircle" className="note-icon" size="14" />
        U.S. Sales tax is not included in the amounts shown above.
      </p>
    </section>
  `,
  styles: [
    `
      .usage-subscriptions {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .section-heading {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .manage-link {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-primary);
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-radius-sm, 4px);
        transition: background var(--nxt1-transition-fast);
        white-space: nowrap;
      }

      .manage-link:hover {
        background: var(--nxt1-color-surface-200);
        text-decoration: underline;
      }

      .subscription-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--nxt1-spacing-4);
      }

      .subscription-card {
        position: relative;
        overflow: hidden;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: var(--nxt1-spacing-5);
        cursor: pointer;
        transition: background var(--nxt1-transition-fast);
      }

      .subscription-card:hover {
        background: var(--nxt1-color-surface-200);
      }

      .sub-name {
        display: block;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin-bottom: var(--nxt1-spacing-2);
      }

      .sub-price {
        display: flex;
        align-items: baseline;
        gap: var(--nxt1-spacing-1);
      }

      .price-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
      }

      .price-period {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
      }

      .tax-note {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        margin-top: var(--nxt1-spacing-3);
      }

      .note-icon {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageSubscriptionsComponent {
  readonly subscriptions = input.required<readonly UsageSubscription[]>();
  readonly manage = output<void>();

  protected formatSubPrice(cents: number): string {
    return formatPrice(cents);
  }
}
