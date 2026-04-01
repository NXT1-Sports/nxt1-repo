/**
 * @fileoverview Usage Billing Info Sheet — Editable billing address form
 * @module @nxt1/ui/usage
 *
 * Sheet component for editing billing information:
 * - Full name
 * - Address line 1
 * - Address line 2 (city, state, zip)
 * - Country
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, Input, OnInit, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent, NxtSheetFooterComponent } from '../components/bottom-sheet';
import type { UsageBillingInfo } from '@nxt1/core';

export type BillingInfoSheetMode = 'billing' | 'additional';

export interface BillingInfoSheetResult {
  readonly saved: boolean;
  readonly info?: UsageBillingInfo;
}

@Component({
  selector: 'nxt1-usage-billing-info-sheet',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    NxtSheetHeaderComponent,
    NxtSheetFooterComponent,
  ],
  template: `
    <nxt1-sheet-header
      [title]="mode === 'additional' ? 'Additional information' : 'Billing information'"
      closePosition="right"
      [showBorder]="true"
      (closeSheet)="dismiss()"
    />

    <ion-content class="billing-sheet-content">
      <div class="billing-form">
        @if (mode === 'billing') {
          <div class="form-group">
            <label class="form-label" for="billing-name">Full name</label>
            <input
              id="billing-name"
              class="form-input"
              type="text"
              placeholder="e.g. Jane Smith"
              autocomplete="name"
              [(ngModel)]="draftName"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="billing-address1">Address line 1</label>
            <input
              id="billing-address1"
              class="form-input"
              type="text"
              placeholder="Street address"
              autocomplete="address-line1"
              [(ngModel)]="draftAddressLine1"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="billing-address2">City, state, zip</label>
            <input
              id="billing-address2"
              class="form-input"
              type="text"
              placeholder="e.g. Austin, TX 78701"
              autocomplete="address-line2"
              [(ngModel)]="draftAddressLine2"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="billing-country">Country</label>
            <input
              id="billing-country"
              class="form-input"
              type="text"
              placeholder="e.g. United States"
              autocomplete="country-name"
              [(ngModel)]="draftCountry"
            />
          </div>
        } @else {
          <p class="form-hint">
            Add details that appear on your receipts and invoices, such as a purchase order number
            or an alternate contact email.
          </p>

          <div class="form-group">
            <label class="form-label" for="billing-po">Purchase order number</label>
            <input
              id="billing-po"
              class="form-input"
              type="text"
              placeholder="Optional — e.g. PO-12345"
              [(ngModel)]="draftPoNumber"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="billing-email">Alternate billing email</label>
            <input
              id="billing-email"
              class="form-input"
              type="email"
              placeholder="Optional — receives invoice copies"
              autocomplete="email"
              [(ngModel)]="draftBillingEmail"
            />
          </div>
        }
      </div>
    </ion-content>

    <nxt1-sheet-footer label="Save" [disabled]="!canSave()" (action)="save()" />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary);
      }

      .billing-sheet-content {
        --background: var(--nxt1-color-bg-primary);
      }

      .billing-form {
        padding: var(--nxt1-spacing-5, 20px);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
      }

      .form-hint {
        margin: 0 0 var(--nxt1-spacing-2, 8px) 0;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .form-label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .form-input {
        width: 100%;
        padding: var(--nxt1-spacing-2-5, 10px) var(--nxt1-spacing-3, 12px);
        font-size: var(--nxt1-fontSize-sm);
        font-family: var(--nxt1-fontFamily-body);
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md, 8px);
        outline: none;
        transition: border-color var(--nxt1-duration-fast, 100ms) ease;
        box-sizing: border-box;

        &::placeholder {
          color: var(--nxt1-color-text-tertiary);
        }

        &:focus {
          border-color: var(--nxt1-color-primary);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageBillingInfoSheetComponent implements OnInit {
  private readonly modalController = inject(ModalController);

  @Input() mode: BillingInfoSheetMode = 'billing';
  @Input() current: UsageBillingInfo | null = null;

  /** Emitted when the sheet closes — for NxtOverlayService compatibility on web */
  readonly close = output<BillingInfoSheetResult>();

  // Billing mode fields
  protected draftName = '';
  protected draftAddressLine1 = '';
  protected draftAddressLine2 = '';
  protected draftCountry = '';

  // Additional mode fields (PO number + billing email)
  protected draftPoNumber = '';
  protected draftBillingEmail = '';

  ngOnInit(): void {
    if (this.current) {
      this.draftName = this.current.name ?? '';
      this.draftAddressLine1 = this.current.addressLine1 ?? '';
      this.draftAddressLine2 = this.current.addressLine2 ?? '';
      this.draftCountry = this.current.country ?? '';
    }
  }

  protected canSave(): boolean {
    if (this.mode === 'billing') {
      return this.draftName.trim().length > 0 || this.draftAddressLine1.trim().length > 0;
    }
    return true;
  }

  protected save(): void {
    let info: UsageBillingInfo;
    if (this.mode === 'additional') {
      // Map additional info fields into the billing info structure using addressLine1/2
      info = {
        name: this.current?.name ?? '',
        addressLine1: this.draftPoNumber.trim(),
        addressLine2: this.draftBillingEmail.trim(),
        country: this.current?.country ?? '',
      };
    } else {
      info = {
        name: this.draftName.trim(),
        addressLine1: this.draftAddressLine1.trim(),
        addressLine2: this.draftAddressLine2.trim(),
        country: this.draftCountry.trim(),
      };
    }
    const result: BillingInfoSheetResult = { saved: true, info };
    // Emit for NxtOverlayService (web); ModalController for Ionic (mobile)
    this.close.emit(result);
    void this.modalController.dismiss(result, 'save');
  }

  protected dismiss(): void {
    const result: BillingInfoSheetResult = { saved: false };
    this.close.emit(result);
    void this.modalController.dismiss(result, 'dismiss');
  }
}
