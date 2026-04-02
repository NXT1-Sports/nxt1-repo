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
 * Follows the signal-first pattern of the NXT1 UI library:
 * - `signal()` for reactive draft state
 * - `computed()` for derived state
 * - `[value]="signal()"` + `(input)="handler($event)"` for form inputs
 * - `NxtFormFieldComponent` for consistent field labelling
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  Input,
  OnInit,
  inject,
  output,
  signal,
  computed,
} from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent, NxtSheetFooterComponent } from '../components/bottom-sheet';
import { NxtFormFieldComponent } from '../components/form-field';
import type { UsageBillingInfo } from '@nxt1/core';

export type BillingInfoSheetMode = 'billing' | 'additional';

export interface BillingInfoSheetResult {
  readonly saved: boolean;
  readonly info?: UsageBillingInfo;
}

@Component({
  selector: 'nxt1-usage-billing-info-sheet',
  standalone: true,
  imports: [IonContent, NxtSheetHeaderComponent, NxtSheetFooterComponent, NxtFormFieldComponent],
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
          <nxt1-form-field label="Full name" inputId="billing-name">
            <input
              id="billing-name"
              class="nxt1-input"
              type="text"
              placeholder="e.g. Jane Smith"
              autocomplete="name"
              [value]="draftName()"
              (input)="onNameInput($event)"
            />
          </nxt1-form-field>

          <nxt1-form-field label="Address line 1" inputId="billing-address1">
            <input
              id="billing-address1"
              class="nxt1-input"
              type="text"
              placeholder="Street address"
              autocomplete="address-line1"
              [value]="draftAddressLine1()"
              (input)="onAddress1Input($event)"
            />
          </nxt1-form-field>

          <nxt1-form-field label="City, state, zip" inputId="billing-address2">
            <input
              id="billing-address2"
              class="nxt1-input"
              type="text"
              placeholder="e.g. Austin, TX 78701"
              autocomplete="address-level2"
              [value]="draftAddressLine2()"
              (input)="onAddress2Input($event)"
            />
          </nxt1-form-field>

          <nxt1-form-field label="Country" inputId="billing-country">
            <input
              id="billing-country"
              class="nxt1-input"
              type="text"
              placeholder="e.g. United States"
              autocomplete="country-name"
              [value]="draftCountry()"
              (input)="onCountryInput($event)"
            />
          </nxt1-form-field>
        } @else {
          <p class="billing-hint">
            Add details that appear on your receipts and invoices, such as a purchase order number
            or an alternate contact email.
          </p>

          <nxt1-form-field label="Purchase order number" inputId="billing-po" [optional]="true">
            <input
              id="billing-po"
              class="nxt1-input"
              type="text"
              placeholder="e.g. PO-12345"
              [value]="draftPoNumber()"
              (input)="onPoNumberInput($event)"
            />
          </nxt1-form-field>

          <nxt1-form-field
            label="Alternate billing email"
            inputId="billing-email"
            [optional]="true"
            hint="Receives copies of invoices"
          >
            <input
              id="billing-email"
              class="nxt1-input"
              type="email"
              placeholder="billing@example.com"
              autocomplete="email"
              [value]="draftBillingEmail()"
              (input)="onBillingEmailInput($event)"
            />
          </nxt1-form-field>
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

      .billing-hint {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .nxt1-input {
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

  // ── Billing mode signals ──────────────────────────────────────────────────
  protected readonly draftName = signal('');
  protected readonly draftAddressLine1 = signal('');
  protected readonly draftAddressLine2 = signal('');
  protected readonly draftCountry = signal('');

  // ── Additional mode signals ───────────────────────────────────────────────
  protected readonly draftPoNumber = signal('');
  protected readonly draftBillingEmail = signal('');

  /** Whether the current draft has enough data to save */
  protected readonly canSave = computed(() => {
    if (this.mode === 'billing') {
      return this.draftName().trim().length > 0 || this.draftAddressLine1().trim().length > 0;
    }
    return true;
  });

  ngOnInit(): void {
    if (this.current) {
      this.draftName.set(this.current.name ?? '');
      this.draftAddressLine1.set(this.current.addressLine1 ?? '');
      this.draftAddressLine2.set(this.current.addressLine2 ?? '');
      this.draftCountry.set(this.current.country ?? '');
    }
  }

  // ── Input event handlers ──────────────────────────────────────────────────

  protected onNameInput(event: Event): void {
    this.draftName.set((event.target as HTMLInputElement).value);
  }

  protected onAddress1Input(event: Event): void {
    this.draftAddressLine1.set((event.target as HTMLInputElement).value);
  }

  protected onAddress2Input(event: Event): void {
    this.draftAddressLine2.set((event.target as HTMLInputElement).value);
  }

  protected onCountryInput(event: Event): void {
    this.draftCountry.set((event.target as HTMLInputElement).value);
  }

  protected onPoNumberInput(event: Event): void {
    this.draftPoNumber.set((event.target as HTMLInputElement).value);
  }

  protected onBillingEmailInput(event: Event): void {
    this.draftBillingEmail.set((event.target as HTMLInputElement).value);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  protected save(): void {
    const info: UsageBillingInfo =
      this.mode === 'additional'
        ? {
            name: this.current?.name ?? '',
            addressLine1: this.draftPoNumber().trim(),
            addressLine2: this.draftBillingEmail().trim(),
            country: this.current?.country ?? '',
          }
        : {
            name: this.draftName().trim(),
            addressLine1: this.draftAddressLine1().trim(),
            addressLine2: this.draftAddressLine2().trim(),
            country: this.draftCountry().trim(),
          };

    const result: BillingInfoSheetResult = { saved: true, info };
    // Emit for NxtOverlayService (web); ModalController handles dismiss on mobile
    this.close.emit(result);
    void this.modalController.dismiss(result, 'save');
  }

  protected dismiss(): void {
    const result: BillingInfoSheetResult = { saved: false };
    this.close.emit(result);
    void this.modalController.dismiss(result, 'dismiss');
  }
}
