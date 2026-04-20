/**
 * @fileoverview Usage Auto Top-Up Configuration Section
 * @module @nxt1/ui/usage
 *
 * Lets individual users configure automatic wallet refills:
 * - Enable/disable auto top-up
 * - Set low-balance threshold (trigger level)
 * - Set top-up amount
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  OnInit,
  effect,
} from '@angular/core';
import { IonToggle } from '@ionic/angular/standalone';
import { formatPrice } from '@nxt1/core';
import { USAGE_TEST_IDS } from '@nxt1/core/testing';

const PRESET_AMOUNTS_CENTS = [500, 1000, 2000, 5000] as const;
const PRESET_THRESHOLDS_CENTS = [200, 500, 1000] as const;

@Component({
  selector: 'nxt1-usage-auto-topup',
  standalone: true,
  imports: [IonToggle],
  template: `
    <section class="auto-topup-section" [attr.data-testid]="testIds.AUTO_TOPUP_SECTION">
      <div class="section-header">
        <div class="section-meta">
          <h2 class="section-title">Auto Top-Up</h2>
          <p class="section-description">
            Automatically refill your wallet when your balance drops below a threshold. Charges your
            saved payment method.
          </p>
        </div>
        <ion-toggle
          [checked]="enabledLocal()"
          [attr.data-testid]="testIds.AUTO_TOPUP_TOGGLE"
          (ionChange)="onToggleEnabled($event)"
        />
      </div>

      @if (enabledLocal()) {
        <div class="settings-card" [attr.data-testid]="testIds.AUTO_TOPUP_SETTINGS">
          <!-- Threshold -->
          <div class="setting-group">
            <label class="setting-label">Top up when balance drops below</label>
            <div class="preset-row">
              @for (cents of thresholdPresets; track cents) {
                <button
                  type="button"
                  class="preset-btn"
                  [class.preset-btn--active]="thresholdCentsLocal() === cents"
                  [attr.data-testid]="testIds.AUTO_TOPUP_THRESHOLD_PRESET"
                  (click)="thresholdCentsLocal.set(cents)"
                >
                  {{ formatCents(cents) }}
                </button>
              }
            </div>
          </div>

          <!-- Amount -->
          <div class="setting-group">
            <label class="setting-label">Top-up amount</label>
            <div class="preset-row">
              @for (cents of amountPresets; track cents) {
                <button
                  type="button"
                  class="preset-btn"
                  [class.preset-btn--active]="amountCentsLocal() === cents"
                  [attr.data-testid]="testIds.AUTO_TOPUP_AMOUNT_PRESET"
                  (click)="amountCentsLocal.set(cents)"
                >
                  {{ formatCents(cents) }}
                </button>
              }
            </div>
          </div>

          <!-- Summary -->
          <p class="topup-summary">
            When your balance falls below <strong>{{ formatCents(thresholdCentsLocal()) }}</strong
            >, we'll automatically add <strong>{{ formatCents(amountCentsLocal()) }}</strong> to
            your wallet.
          </p>

          <!-- Save -->
          <button
            type="button"
            class="save-btn"
            [disabled]="!isDirty()"
            [attr.data-testid]="testIds.AUTO_TOPUP_SAVE_BTN"
            (click)="onSave()"
          >
            Save changes
          </button>
        </div>
      }
    </section>
  `,
  styles: [
    `
      .auto-topup-section {
        margin-bottom: var(--nxt1-spacing-8);
      }

      .section-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-5);
      }

      .section-meta {
        flex: 1;
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2) 0;
      }

      .section-description {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-relaxed);
        max-width: 480px;
      }

      .settings-card {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: var(--nxt1-spacing-5);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-5);
      }

      .setting-group {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .setting-label {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .preset-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
      }

      .preset-btn {
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-radius-md, 8px);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-50);
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        transition: all var(--nxt1-transition-fast);
      }

      .preset-btn:hover {
        background: var(--nxt1-color-surface-200);
      }

      .preset-btn--active {
        background: var(--nxt1-color-primary);
        border-color: var(--nxt1-color-primary);
        color: #fff;
      }

      .topup-summary {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-50);
        border-radius: var(--nxt1-radius-md, 8px);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        margin: 0;
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .save-btn {
        align-self: flex-end;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-6);
        border-radius: var(--nxt1-radius-md, 8px);
        background: var(--nxt1-color-primary);
        color: #fff;
        border: none;
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        transition: opacity var(--nxt1-transition-fast);
      }

      .save-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .save-btn:not(:disabled):hover {
        opacity: 0.9;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageAutoTopupComponent implements OnInit {
  protected readonly testIds = USAGE_TEST_IDS;
  protected readonly thresholdPresets = PRESET_THRESHOLDS_CENTS;
  protected readonly amountPresets = PRESET_AMOUNTS_CENTS;

  readonly enabled = input<boolean>(false);
  readonly thresholdCents = input<number>(500);
  readonly amountCents = input<number>(1000);

  /** Emitted when user clicks Save. Carries the new settings. */
  readonly save = output<{ enabled: boolean; thresholdCents: number; amountCents: number }>();

  // Local editable state — initialised from inputs
  protected readonly enabledLocal = signal(false);
  protected readonly thresholdCentsLocal = signal(500);
  protected readonly amountCentsLocal = signal(1000);

  /** True when local state differs from props — enables Save button */
  protected readonly isDirty = computed(
    () =>
      this.enabledLocal() !== this.enabled() ||
      this.thresholdCentsLocal() !== this.thresholdCents() ||
      this.amountCentsLocal() !== this.amountCents()
  );

  constructor() {
    // Sync local state whenever inputs change (e.g. after a save round-trips)
    effect(() => {
      this.enabledLocal.set(this.enabled());
      this.thresholdCentsLocal.set(this.thresholdCents());
      this.amountCentsLocal.set(this.amountCents());
    });
  }

  ngOnInit(): void {
    this.enabledLocal.set(this.enabled());
    this.thresholdCentsLocal.set(this.thresholdCents());
    this.amountCentsLocal.set(this.amountCents());
  }

  protected onToggleEnabled(event: CustomEvent<{ checked: boolean }>): void {
    this.enabledLocal.set(event.detail.checked);
  }

  protected onSave(): void {
    this.save.emit({
      enabled: this.enabledLocal(),
      thresholdCents: this.thresholdCentsLocal(),
      amountCents: this.amountCentsLocal(),
    });
  }

  protected formatCents(cents: number): string {
    return formatPrice(cents);
  }
}
