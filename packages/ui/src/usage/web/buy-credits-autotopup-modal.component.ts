/**
 * @fileoverview Combined Buy Credits + Auto Top-Up Modal — Web Overlay Content
 * @module @nxt1/ui/usage/web
 * @version 1.0.0
 *
 * A single modal that unifies two related billing actions:
 *
 *   1. **Buy Credits** — One-time wallet top-up from a preset package list.
 *   2. **Auto Top-Up** — Configure automatic refills when balance drops below a
 *      threshold. Eliminates the need to navigate to the separate Auto Top-Up
 *      section for the most common configuration flow.
 *
 * The caller receives a typed result indicating which action was taken:
 *
 * ```typescript
 * ref.closed.then(({ data }) => {
 *   if (data?.type === 'buy')        await svc.buyCredits(data.amountCents);
 *   if (data?.type === 'auto-topup') await svc.configureAutoTopUp(data);
 * });
 * ```
 *
 * Initial auto top-up state is injected via the overlay `inputs` record so the
 * form reflects the user's current settings.
 *
 * ⭐ WEB ONLY — For mobile, use `UsageBottomSheetService` ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { NxtModalHeaderComponent } from '../../components/overlay';
import { formatPrice } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';

// ============================================
// TYPES
// ============================================

/** Auto top-up settings payload */
export interface AutoTopupSettings {
  readonly enabled: boolean;
  readonly thresholdCents: number;
  readonly amountCents: number;
}

/** Union result type emitted by the modal's `close` output. */
export type BuyCreditsAutoTopupResult =
  | { readonly type: 'buy'; readonly amountCents: number }
  | ({ readonly type: 'auto-topup' } & AutoTopupSettings)
  | null;

// ============================================
// CONSTANTS
// ============================================

/** Credit package dollar amounts. */
const CREDIT_PACKAGES_USD = [5, 10, 25, 50, 100, 250, 500] as const;

/** Preset threshold values at which auto top-up fires (in cents). */
const THRESHOLD_PRESETS_CENTS = [200, 500, 1_000, 2_500] as const;

/** Preset top-up amounts (in cents). */
const TOPUP_AMOUNT_PRESETS_CENTS = [500, 1_000, 2_500, 5_000, 10_000] as const;

type Tab = 'buy' | 'auto-topup';

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-buy-credits-autotopup-modal',
  standalone: true,
  imports: [NxtModalHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bc-modal" [attr.data-testid]="testIds.BUY_CREDITS_MODAL">
      <!-- Header -->
      <nxt1-modal-header
        title="Add Credits"
        icon="card-outline"
        [showIcon]="true"
        iconShape="circle"
        (closeModal)="close.emit(null)"
      />

      <!-- Tab switcher -->
      <div class="bc-tabs" role="tablist" aria-label="Modal sections">
        <button
          type="button"
          class="bc-tab"
          [class.bc-tab--active]="activeTab() === 'buy'"
          role="tab"
          [attr.aria-selected]="activeTab() === 'buy'"
          [attr.data-testid]="testIds.BUY_CREDITS_TAB_BUY"
          (click)="activeTab.set('buy')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Auto Top-Up
          @if (initialAutoTopupEnabled()) {
            <span class="bc-tab-badge" aria-label="Auto top-up is enabled">●</span>
          }
        </button>
      </div>

      <!-- ==================== ADD CREDITS TAB ==================== -->
      @if (activeTab() === 'buy') {
        <div class="bc-body" role="tabpanel" aria-label="Add Credits">
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

          <!-- Note about credit rate -->
          <p class="bc-note">100 credits = $1.00 &nbsp;·&nbsp; Credits never expire</p>

          <!-- Buy button -->
          <button
            type="button"
            class="bc-primary-btn"
            [disabled]="selectedPackageUsd() === null"
            [attr.data-testid]="testIds.BUY_CREDITS_BUY_BTN"
            (click)="onBuyNow()"
          >
            @if (selectedPackageUsd() !== null) {
              Buy \${{ selectedPackageUsd() }} of Credits
            } @else {
              Select a package above
            }
          </button>

          <!-- CTA: jump to auto top-up -->
          @if (!initialAutoTopupEnabled()) {
            <button type="button" class="bc-secondary-link" (click)="activeTab.set('auto-topup')">
              Set up Auto Top-Up to refill automatically →
            </button>
          }
        </div>
      }

      <!-- ==================== AUTO TOP-UP TAB ==================== -->
      @if (activeTab() === 'auto-topup') {
        <div class="bc-body" role="tabpanel" aria-label="Auto Top-Up">
          <p class="bc-subtitle">
            Automatically refill your wallet when your balance drops below a threshold. Charges your
            saved payment method.
          </p>

          <!-- Enable toggle -->
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
              (click)="enabledLocal.update((v) => !v)"
            >
              <span class="bc-toggle-thumb"></span>
            </button>
          </div>

          @if (enabledLocal()) {
            <!-- Threshold -->
            <div class="bc-setting-group">
              <label class="bc-setting-label"> Top up when balance drops below </label>
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

            <!-- Amount -->
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

            <!-- Summary -->
            <div class="bc-topup-summary">
              When your balance falls below
              <strong>{{ formatCents(thresholdCentsLocal()) }}</strong
              >, we'll automatically add
              <strong>{{ formatCents(topupAmountCentsLocal()) }}</strong> to your wallet.
            </div>
          }

          <!-- Save button -->
          <button
            type="button"
            class="bc-primary-btn"
            [disabled]="!isAutoTopupDirty()"
            [attr.data-testid]="testIds.BUY_CREDITS_TOPUP_SAVE_BTN"
            (click)="onSaveAutoTopup()"
          >
            @if (enabledLocal()) {
              Save Auto Top-Up Settings
            } @else {
              Disable Auto Top-Up
            }
          </button>

          @if (!enabledLocal() && !initialAutoTopupEnabled()) {
            <p class="bc-note">Auto top-up is currently off.</p>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         BUY CREDITS + AUTO TOP-UP MODAL
         Matches NXT1 overlay design language
         ============================================ */

      .bc-modal {
        display: flex;
        flex-direction: column;
        max-height: 85vh;
        overflow: hidden;
      }

      /* ---- Tabs ---- */
      .bc-tabs {
        display: flex;
        gap: 4px;
        padding: 8px 24px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-50, rgba(255, 255, 255, 0.02));
      }

      .bc-tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 8px;
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-secondary, #94a3b8);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        position: relative;
      }

      .bc-tab:hover {
        color: var(--nxt1-color-text-primary, #f1f5f9);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.05));
      }

      .bc-tab--active {
        color: var(--nxt1-color-text-primary, #f1f5f9);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
      }

      .bc-tab-badge {
        font-size: 8px;
        color: var(--nxt1-color-primary, #39ff14);
        position: absolute;
        top: 4px;
        right: 4px;
      }

      /* ---- Body ---- */
      .bc-body {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 20px 24px 24px;
        overflow-y: auto;
        overscroll-behavior: contain;
        flex: 1;
      }

      .bc-subtitle {
        margin: 0;
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, #94a3b8);
        line-height: 1.5;
      }

      /* ---- Credit Package Grid ---- */
      .bc-packages-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }

      .bc-package {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 14px 8px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 10px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        cursor: pointer;
        transition: all 0.15s;
      }

      .bc-package:hover {
        border-color: var(--nxt1-color-primary-muted, rgba(57, 255, 20, 0.3));
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
      }

      .bc-package:active {
        transform: scale(0.97);
      }

      .bc-package--selected {
        border-color: var(--nxt1-color-primary, #39ff14);
        background: var(--nxt1-color-primary-surface, rgba(57, 255, 20, 0.08));
      }

      .bc-package-amount {
        font-size: 18px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #f1f5f9);
        letter-spacing: -0.02em;
      }

      .bc-package-label {
        font-size: 10px;
        color: var(--nxt1-color-text-tertiary, #64748b);
        font-weight: 500;
      }

      .bc-package--selected .bc-package-label {
        color: var(--nxt1-color-primary, #39ff14);
      }

      /* ---- Shared note ---- */
      .bc-note {
        margin: 0;
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, #64748b);
        text-align: center;
      }

      /* ---- Primary / secondary buttons ---- */
      .bc-primary-btn {
        width: 100%;
        padding: 12px 16px;
        border-radius: 10px;
        border: none;
        background: var(--nxt1-color-primary, #39ff14);
        color: #000;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s;
      }

      .bc-primary-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      .bc-primary-btn:not(:disabled):hover {
        opacity: 0.9;
      }

      .bc-secondary-link {
        background: none;
        border: none;
        color: var(--nxt1-color-primary, #39ff14);
        font-size: 12px;
        cursor: pointer;
        text-align: center;
        padding: 0;
        opacity: 0.8;
        transition: opacity 0.15s;
      }

      .bc-secondary-link:hover {
        opacity: 1;
      }

      /* ---- Auto Top-Up: toggle ---- */
      .bc-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 10px;
      }

      .bc-toggle-meta {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .bc-toggle-label {
        font-size: 14px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #f1f5f9);
      }

      .bc-toggle-status {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
      }

      .bc-toggle-status--on {
        background: rgba(57, 255, 20, 0.15);
        color: var(--nxt1-color-primary, #39ff14);
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
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.12));
        cursor: pointer;
        transition: background 0.2s;
        flex-shrink: 0;
        padding: 0;
      }

      .bc-toggle--on {
        background: var(--nxt1-color-primary, #39ff14);
      }

      .bc-toggle-thumb {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.2s;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }

      .bc-toggle--on .bc-toggle-thumb {
        transform: translateX(18px);
      }

      /* ---- Setting groups (threshold + amount) ---- */
      .bc-setting-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .bc-setting-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-text-secondary, #94a3b8);
      }

      .bc-preset-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .bc-preset-btn {
        padding: 6px 14px;
        border-radius: 8px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-primary, #f1f5f9);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
      }

      .bc-preset-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
      }

      .bc-preset-btn--active {
        background: var(--nxt1-color-primary-surface, rgba(57, 255, 20, 0.1));
        border-color: var(--nxt1-color-primary, #39ff14);
        color: var(--nxt1-color-primary, #39ff14);
      }

      /* ---- Summary blurb ---- */
      .bc-topup-summary {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, #94a3b8);
        background: var(--nxt1-color-surface-50, rgba(255, 255, 255, 0.02));
        border-radius: 8px;
        padding: 10px 14px;
        line-height: 1.5;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }
    `,
  ],
})
export class BuyCreditsAutoTopupModalComponent implements OnInit {
  // ----------------------------------------
  // Inputs (passed via overlay `inputs` record)
  // ----------------------------------------

  /** Current auto top-up enabled state — pre-fills the form. */
  readonly initialAutoTopupEnabled = input(false);
  /** Current threshold in cents — pre-fills the form. */
  readonly initialThresholdCents = input(500);
  /** Current auto top-up amount in cents — pre-fills the form. */
  readonly initialAutoTopupAmountCents = input(1_000);

  // ----------------------------------------
  // Output
  // ----------------------------------------

  /** Emits typed result when user completes an action, or `null` on dismiss. */
  readonly close = output<BuyCreditsAutoTopupResult>();

  // ----------------------------------------
  // Static data
  // ----------------------------------------

  protected readonly testIds = TEST_IDS.USAGE;
  protected readonly packages = CREDIT_PACKAGES_USD;
  protected readonly thresholdPresets = THRESHOLD_PRESETS_CENTS;
  protected readonly amountPresets = TOPUP_AMOUNT_PRESETS_CENTS;

  // ----------------------------------------
  // UI state
  // ----------------------------------------

  protected readonly activeTab = signal<Tab>('buy');

  /** Selected credit package dollar amount (null = nothing picked yet). */
  protected readonly selectedPackageUsd = signal<(typeof CREDIT_PACKAGES_USD)[number] | null>(null);

  /** Auto top-up local editable state */
  protected readonly enabledLocal = signal(false);
  protected readonly thresholdCentsLocal = signal(500);
  protected readonly topupAmountCentsLocal = signal(1_000);

  /** True when auto top-up local state differs from initial props. */
  protected readonly isAutoTopupDirty = computed(
    () =>
      this.enabledLocal() !== this.initialAutoTopupEnabled() ||
      this.thresholdCentsLocal() !== this.initialThresholdCents() ||
      this.topupAmountCentsLocal() !== this.initialAutoTopupAmountCents()
  );

  ngOnInit(): void {
    // Sync local auto top-up state from inputs once on creation.
    // Using ngOnInit rather than effect() ensures the form is only
    // initialized once and user edits are not reset on re-renders.
    this.enabledLocal.set(this.initialAutoTopupEnabled());
    this.thresholdCentsLocal.set(this.initialThresholdCents());
    this.topupAmountCentsLocal.set(this.initialAutoTopupAmountCents());
  }

  // ----------------------------------------
  // Actions
  // ----------------------------------------

  protected selectPackage(usd: (typeof CREDIT_PACKAGES_USD)[number]): void {
    // Toggle: clicking the already-selected package deselects it.
    this.selectedPackageUsd.update((prev) => (prev === usd ? null : usd));
  }

  protected onBuyNow(): void {
    const usd = this.selectedPackageUsd();
    if (usd === null) return;
    this.close.emit({ type: 'buy', amountCents: usd * 100 });
  }

  protected onSaveAutoTopup(): void {
    this.close.emit({
      type: 'auto-topup',
      enabled: this.enabledLocal(),
      thresholdCents: this.thresholdCentsLocal(),
      amountCents: this.topupAmountCentsLocal(),
    });
  }

  // ----------------------------------------
  // Helpers
  // ----------------------------------------

  protected formatCents(cents: number): string {
    return formatPrice(cents);
  }
}
