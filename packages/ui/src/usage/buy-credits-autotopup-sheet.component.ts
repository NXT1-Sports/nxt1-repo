/**
 * @fileoverview Mobile Buy Credits + Auto Top-Up Sheet
 * @module @nxt1/ui/usage
 *
 * Native bottom-sheet variant of the web add-credits modal.
 * Keeps the same package grid, custom amount input, and auto top-up editing
 * so the experience feels consistent across platforms.
 */

import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { IonInput, ModalController } from '@ionic/angular/standalone';
import { formatPrice } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtSheetFooterComponent } from '../components/bottom-sheet/sheet-footer.component';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtIconComponent } from '../components/icon/icon.component';
import { NxtFormFieldComponent } from '../components/form-field';
import {
  CREDIT_PACKAGES_USD,
  THRESHOLD_PRESETS_CENTS,
  TOPUP_AMOUNT_PRESETS_CENTS,
  normalizeUsdInput,
  parseUsdToCents,
  type BuyCreditsAutoTopupResult,
  type BuyCreditsTab,
  type CreditPackageUsd,
} from './buy-credits-flow.shared';

@Component({
  selector: 'nxt1-buy-credits-autotopup-sheet',
  standalone: true,
  imports: [
    IonInput,
    NxtSheetHeaderComponent,
    NxtSheetFooterComponent,
    NxtIconComponent,
    NxtFormFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nxt1-sheet-header
      title="Add Credits"
      icon="card"
      [showIcon]="true"
      iconShape="circle"
      (closeSheet)="dismiss(null, 'cancel')"
    />

    <div class="bc-sheet nxt1-form" [attr.data-testid]="testIds.BUY_CREDITS_MODAL">
      <div class="bc-tabs" role="tablist" aria-label="Add credits sections">
        <button
          type="button"
          class="bc-tab"
          [class.bc-tab--active]="activeTab() === 'buy'"
          role="tab"
          [attr.aria-selected]="activeTab() === 'buy'"
          [attr.data-testid]="testIds.BUY_CREDITS_TAB_BUY"
          (click)="activeTab.set('buy')"
        >
          <nxt1-icon name="card" [size]="14" aria-hidden="true" />
          Add Credits
        </button>
        <button
          type="button"
          class="bc-tab"
          [class.bc-tab--active]="activeTab() === 'auto-topup'"
          role="tab"
          [attr.aria-selected]="activeTab() === 'auto-topup'"
          [attr.data-testid]="testIds.BUY_CREDITS_TAB_TOPUP"
          (click)="activeTab.set('auto-topup')"
        >
          <nxt1-icon name="refresh" [size]="14" aria-hidden="true" />
          Auto Top-Up
          @if (initialAutoTopupEnabled) {
            <span class="bc-tab-badge" aria-label="Auto top-up is enabled">●</span>
          }
        </button>
      </div>

      <div class="bc-body">
        @if (activeTab() === 'buy') {
          <section class="bc-panel" role="tabpanel" aria-label="Add Credits">
            <p class="bc-subtitle">
              Add credits to your wallet. Credits are used for AI features across NXT1.
            </p>

            <div class="bc-packages-grid">
              @for (usd of packages; track usd) {
                <button
                  type="button"
                  class="bc-package"
                  [class.bc-package--selected]="selectedPackageUsd() === usd"
                  [attr.data-testid]="testIds.BUY_CREDITS_PACKAGE"
                  (click)="selectPackage(usd)"
                >
                  <span class="bc-package-amount">\${{ usd }}</span>
                  <span class="bc-package-label">{{ usd * 100 }} credits</span>
                </button>
              }
            </div>

            <div class="bc-custom-amount">
              <nxt1-form-field
                label="Custom amount"
                inputId="buy-credits-custom-amount"
                [error]="customAmountError()"
                [hint]="customAmountError() ? null : customAmountHint()"
              >
                <ion-input
                  #customAmountInput
                  id="buy-credits-custom-amount"
                  type="text"
                  fill="outline"
                  inputmode="decimal"
                  class="bc-custom-amount-input"
                  placeholder="Enter amount"
                  [value]="customAmountUsd()"
                  [attr.data-testid]="testIds.BUY_CREDITS_CUSTOM_AMOUNT_INPUT"
                  (ionInput)="onCustomAmountInput((customAmountInput.value ?? '').toString())"
                >
                  <span slot="start" class="bc-custom-input-prefix">$</span>
                </ion-input>
              </nxt1-form-field>
            </div>

            <p class="bc-note">100 credits = $1.00 · Credits never expire</p>

            @if (!initialAutoTopupEnabled) {
              <button type="button" class="bc-secondary-link" (click)="activeTab.set('auto-topup')">
                Set up Auto Top-Up to refill automatically →
              </button>
            }
          </section>
        } @else {
          <section class="bc-panel" role="tabpanel" aria-label="Auto Top-Up">
            <p class="bc-subtitle">
              Automatically refill your wallet when your balance drops below a threshold. Charges
              your saved payment method.
            </p>

            <div class="bc-toggle-row">
              <div class="bc-toggle-meta">
                <span class="bc-toggle-label">Enable Auto Top-Up</span>
                @if (enabledLocal()) {
                  <span class="bc-toggle-status bc-toggle-status--on">On</span>
                } @else {
                  <span class="bc-toggle-status bc-toggle-status--off">Off</span>
                }
              </div>
              <button
                type="button"
                class="bc-toggle"
                [class.bc-toggle--on]="enabledLocal()"
                role="switch"
                [attr.aria-checked]="enabledLocal()"
                aria-label="Enable auto top-up"
                [attr.data-testid]="testIds.BUY_CREDITS_TOPUP_TOGGLE"
                (click)="enabledLocal.update((value) => !value)"
              >
                <span class="bc-toggle-thumb"></span>
              </button>
            </div>

            @if (enabledLocal()) {
              <div class="bc-setting-group">
                <label class="bc-setting-label">Top up when balance drops below</label>
                <div class="bc-preset-row">
                  @for (cents of thresholdPresets; track cents) {
                    <button
                      type="button"
                      class="bc-preset-btn"
                      [class.bc-preset-btn--active]="thresholdCentsLocal() === cents"
                      [attr.data-testid]="testIds.BUY_CREDITS_TOPUP_THRESHOLD"
                      (click)="thresholdCentsLocal.set(cents)"
                    >
                      {{ formatCents(cents) }}
                    </button>
                  }
                </div>
              </div>

              <div class="bc-setting-group">
                <label class="bc-setting-label">Add this much each time</label>
                <div class="bc-preset-row">
                  @for (cents of amountPresets; track cents) {
                    <button
                      type="button"
                      class="bc-preset-btn"
                      [class.bc-preset-btn--active]="topupAmountCentsLocal() === cents"
                      [attr.data-testid]="testIds.BUY_CREDITS_TOPUP_AMOUNT"
                      (click)="topupAmountCentsLocal.set(cents)"
                    >
                      {{ formatCents(cents) }}
                    </button>
                  }
                </div>
              </div>

              <div class="bc-topup-summary">
                When your balance falls below
                <strong>{{ formatCents(thresholdCentsLocal()) }}</strong
                >, we'll automatically add
                <strong>{{ formatCents(topupAmountCentsLocal()) }}</strong> to your wallet.
              </div>
            } @else {
              <p class="bc-note">Auto top-up is currently off.</p>
            }
          </section>
        }
      </div>
    </div>

    @if (activeTab() === 'buy' && showIapPayButton) {
      <div class="bc-footer">
        <button
          type="button"
          class="bc-footer-btn bc-footer-btn--secondary"
          [disabled]="selectedBuyAmountCents() === null"
          [attr.data-testid]="testIds.BUY_CREDITS_BUY_BTN"
          (click)="onBuyWithStripe()"
        >
          Normal Pay
        </button>
        <button
          type="button"
          class="bc-footer-btn bc-footer-btn--primary"
          [attr.data-testid]="testIds.BUY_CREDITS_IAP_BTN"
          (click)="onBuyWithIap()"
        >
          IAP Pay
        </button>
      </div>
    } @else {
      <nxt1-sheet-footer
        [label]="footerLabel()"
        [icon]="footerIcon()"
        [disabled]="footerDisabled()"
        [attr.data-testid]="
          activeTab() === 'buy' ? testIds.BUY_CREDITS_BUY_BTN : testIds.BUY_CREDITS_TOPUP_SAVE_BTN
        "
        (action)="onPrimaryAction()"
      />
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
        background: var(--nxt1-color-bg-primary, #0f172a);
      }

      .bc-sheet {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }

      .bc-tabs {
        display: flex;
        gap: 4px;
        padding: 8px 20px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-50, rgba(255, 255, 255, 0.02));
      }

      .bc-tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 10px;
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-secondary, #94a3b8);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        position: relative;
        transition: all 0.15s ease;
      }

      .bc-tab:hover,
      .bc-tab--active {
        color: var(--nxt1-color-text-primary, #f1f5f9);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
      }

      .bc-tab-badge {
        font-size: 8px;
        color: var(--nxt1-color-primary, currentColor);
        position: absolute;
        top: 4px;
        right: 4px;
      }

      .bc-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 18px 20px 8px;
      }

      .bc-panel {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-bottom: 8px;
      }

      .bc-subtitle {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, #94a3b8);
      }

      .bc-packages-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .bc-package {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-height: 68px;
        padding: 10px 8px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 12px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .bc-package:hover,
      .bc-package--selected {
        border-color: var(--nxt1-color-primary, currentColor);
        background: var(--nxt1-color-alpha-primary20, rgba(255, 255, 255, 0.08));
      }

      .bc-package--selected {
        box-shadow: inset 0 0 0 1px var(--nxt1-color-alpha-primary30, rgba(255, 255, 255, 0.14));
      }

      .bc-package:active,
      .bc-primary-btn:active,
      .bc-preset-btn:active,
      .bc-secondary-link:active,
      .bc-toggle:active {
        transform: scale(0.98);
      }

      .bc-package-amount {
        font-size: 16px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #f1f5f9);
        letter-spacing: -0.02em;
        line-height: 1.1;
      }

      .bc-package-label {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary, #64748b);
        font-weight: 500;
        line-height: 1.2;
      }

      .bc-package--selected .bc-package-label {
        color: var(--nxt1-color-text-primary, #f1f5f9);
      }

      .bc-custom-amount {
        padding: 14px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 12px;
        background: linear-gradient(
          180deg,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04)) 0%,
          var(--nxt1-color-surface-50, rgba(255, 255, 255, 0.02)) 100%
        );
      }

      .bc-note {
        margin: 0;
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, #64748b);
      }

      .bc-custom-input-prefix {
        font-size: 18px;
        font-weight: 700;
        color: var(--nxt1-color-text-secondary, #94a3b8);
        margin-inline-start: 2px;
      }

      .bc-custom-amount-input {
        --background: var(--nxt1-color-surface-base, rgba(255, 255, 255, 0.02));
        --border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        --border-radius: 12px;
        --padding-start: 10px;
        --padding-end: 14px;
        --color: var(--nxt1-color-text-primary, #f1f5f9);
        --placeholder-color: var(--nxt1-color-text-tertiary, #64748b);
        --highlight-color-focused: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        --highlight-color-valid: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.2));
        --highlight-color-invalid: var(--nxt1-color-danger, #ef4444);
        --highlight-height: 1px;
        min-height: 52px;
      }

      .bc-custom-amount-input.has-focus {
        --border-color: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.24));
      }

      .bc-custom-amount-input.ion-invalid {
        --border-color: var(--nxt1-color-danger, #ef4444);
        --highlight-color-focused: var(--nxt1-color-danger, #ef4444);
      }

      .bc-secondary-link {
        background: none;
        border: none;
        padding: 0;
        text-align: left;
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #f1f5f9);
        cursor: pointer;
      }

      .bc-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-radius: 12px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .bc-toggle-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .bc-toggle-label {
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #f1f5f9);
      }

      .bc-toggle-status {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
      }

      .bc-toggle-status--on {
        background: var(--nxt1-color-alpha-primary20, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-primary, #f1f5f9);
      }

      .bc-toggle-status--off {
        background: rgba(255, 255, 255, 0.06);
        color: var(--nxt1-color-text-tertiary, #64748b);
      }

      .bc-toggle {
        position: relative;
        width: 42px;
        height: 24px;
        border-radius: 999px;
        border: none;
        padding: 0;
        cursor: pointer;
        flex-shrink: 0;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.12));
        transition: background 0.2s ease;
      }

      .bc-toggle--on {
        background: var(--nxt1-color-primary, currentColor);
      }

      .bc-toggle-thumb {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.2s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }

      .bc-toggle--on .bc-toggle-thumb {
        transform: translateX(18px);
      }

      .bc-setting-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .bc-setting-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--nxt1-color-text-secondary, #94a3b8);
      }

      .bc-preset-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .bc-preset-btn {
        padding: 8px 14px;
        border-radius: 10px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-primary, #f1f5f9);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .bc-preset-btn--active {
        background: var(--nxt1-color-alpha-primary20, rgba(255, 255, 255, 0.08));
        border-color: var(--nxt1-color-primary, currentColor);
        color: var(--nxt1-color-text-primary, #f1f5f9);
        box-shadow: inset 0 0 0 1px var(--nxt1-color-alpha-primary30, rgba(255, 255, 255, 0.14));
      }

      .bc-topup-summary {
        font-size: 13px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, #94a3b8);
        padding: 12px 14px;
        border-radius: 10px;
        background: var(--nxt1-color-surface-50, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      .bc-footer {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: var(--nxt1-spacing-3, 12px);
        padding: var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-5, 20px);
        padding-bottom: calc(var(--nxt1-spacing-4, 16px) + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-bg-primary, #0f172a);
      }

      .bc-footer-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 52px;
        padding: 0 16px;
        border-radius: var(--nxt1-radius-xl, 16px);
        border: 1px solid transparent;
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        letter-spacing: 0.01em;
        cursor: pointer;
        transition:
          opacity var(--nxt1-motion-duration-fast, 150ms) var(--nxt1-motion-easing-standard, ease),
          transform var(--nxt1-motion-duration-fast, 150ms) var(--nxt1-motion-easing-standard, ease),
          background var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease),
          border-color var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease);
      }

      .bc-footer-btn:active:not(:disabled) {
        transform: scale(0.98);
      }

      .bc-footer-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .bc-footer-btn--secondary {
        color: var(--nxt1-color-text-primary, #f1f5f9);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      .bc-footer-btn--primary {
        color: var(--nxt1-color-text-onPrimary, #000);
        background: var(--nxt1-color-primary, #fff);
      }

      .bc-tab:focus-visible,
      .bc-package:focus-visible,
      .bc-preset-btn:focus-visible,
      .bc-secondary-link:focus-visible,
      .bc-toggle:focus-visible,
      .bc-footer-btn:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px var(--nxt1-color-alpha-primary20, rgba(255, 255, 255, 0.08));
      }

      @media (max-width: 480px) {
        .bc-footer {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class BuyCreditsAutoTopupSheetComponent implements OnInit {
  @Input() initialAutoTopupEnabled = false;
  @Input() initialThresholdCents = 500;
  @Input() initialAutoTopupAmountCents = 1_000;
  @Input() showIapPayButton = false;

  private readonly modalCtrl = inject(ModalController);

  protected readonly testIds = TEST_IDS.USAGE;
  protected readonly packages = CREDIT_PACKAGES_USD;
  protected readonly thresholdPresets = THRESHOLD_PRESETS_CENTS;
  protected readonly amountPresets = TOPUP_AMOUNT_PRESETS_CENTS;

  protected readonly activeTab = signal<BuyCreditsTab>('buy');
  protected readonly selectedPackageUsd = signal<CreditPackageUsd | null>(null);
  protected readonly customAmountUsd = signal('');

  protected readonly enabledLocal = signal(false);
  protected readonly thresholdCentsLocal = signal(500);
  protected readonly topupAmountCentsLocal = signal(1_000);

  protected readonly customAmountCents = computed(() => parseUsdToCents(this.customAmountUsd()));
  protected readonly customAmountError = computed(() => {
    const value = this.customAmountUsd();
    if (value.length === 0) return null;

    const cents = parseUsdToCents(value);
    if (cents === null) return 'Enter a valid dollar amount with up to two decimals.';
    if (cents < 100) return 'Enter at least $1.00.';

    return null;
  });
  protected readonly selectedBuyAmountCents = computed<number | null>(() => {
    const selectedPackageUsd = this.selectedPackageUsd();
    if (selectedPackageUsd !== null) return selectedPackageUsd * 100;

    const cents = this.customAmountCents();
    if (cents === null || cents < 100 || this.customAmountError() !== null) return null;

    return cents;
  });
  protected readonly selectedBuyAmountLabel = computed(() => {
    const cents = this.selectedBuyAmountCents();
    return cents === null ? null : formatPrice(cents);
  });
  protected readonly customAmountHint = computed(() => {
    if (this.selectedPackageUsd() === null && this.selectedBuyAmountCents() !== null) {
      return `${formatPrice(this.selectedBuyAmountCents() ?? 0)} purchase · ${this.selectedBuyAmountCents() ?? 0} credits`;
    }

    return 'Minimum custom purchase is $1.00.';
  });
  protected readonly isAutoTopupDirty = computed(
    () =>
      this.enabledLocal() !== this.initialAutoTopupEnabled ||
      this.thresholdCentsLocal() !== this.initialThresholdCents ||
      this.topupAmountCentsLocal() !== this.initialAutoTopupAmountCents
  );
  protected readonly footerLabel = computed(() => {
    if (this.activeTab() === 'buy') {
      return this.selectedBuyAmountLabel()
        ? `Buy ${this.selectedBuyAmountLabel()} of Credits`
        : 'Select a package or enter an amount';
    }

    return this.enabledLocal() ? 'Save Auto Top-Up Settings' : 'Disable Auto Top-Up';
  });
  protected readonly footerDisabled = computed(() =>
    this.activeTab() === 'buy' ? this.selectedBuyAmountCents() === null : !this.isAutoTopupDirty()
  );
  protected readonly footerIcon = computed(() => {
    if (this.activeTab() === 'buy') return 'card';
    return this.enabledLocal() ? 'refresh' : 'close';
  });

  ngOnInit(): void {
    this.enabledLocal.set(this.initialAutoTopupEnabled);
    this.thresholdCentsLocal.set(this.initialThresholdCents);
    this.topupAmountCentsLocal.set(this.initialAutoTopupAmountCents);
  }

  protected selectPackage(usd: CreditPackageUsd): void {
    this.selectedPackageUsd.update((previous) => {
      const nextValue = previous === usd ? null : usd;
      if (nextValue !== null) {
        this.customAmountUsd.set('');
      }
      return nextValue;
    });
  }

  protected onCustomAmountInput(value: string): void {
    const normalized = normalizeUsdInput(value);
    this.customAmountUsd.set(normalized);
    if (normalized.length > 0) {
      this.selectedPackageUsd.set(null);
    }
  }

  protected async onPrimaryAction(): Promise<void> {
    if (this.activeTab() === 'buy') {
      await this.onBuyWithStripe();
      return;
    }

    await this.dismiss(
      {
        type: 'auto-topup',
        enabled: this.enabledLocal(),
        thresholdCents: this.thresholdCentsLocal(),
        amountCents: this.topupAmountCentsLocal(),
      },
      'auto-topup'
    );
  }

  protected async onBuyWithStripe(): Promise<void> {
    const amountCents = this.selectedBuyAmountCents();
    if (amountCents === null) return;
    await this.dismiss({ type: 'buy', amountCents }, 'buy');
  }

  protected async onBuyWithIap(): Promise<void> {
    if (!this.showIapPayButton) {
      return;
    }

    await this.dismiss({ type: 'buy-iap' }, 'buy-iap');
  }

  protected formatCents(cents: number): string {
    return formatPrice(cents);
  }

  protected async dismiss(data: BuyCreditsAutoTopupResult, role: string): Promise<void> {
    await this.modalCtrl.dismiss(data, role);
  }
}
