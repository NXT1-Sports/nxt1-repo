/**
 * @fileoverview Agent X Billing Action Card — Inline Billing CTA
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Renders an inline billing action card in the Agent X chat timeline
 * when an operation cannot proceed due to insufficient credits (B2C),
 * a missing payment method (B2B), or a budget limit breach.
 *
 * Adapts automatically to billing entity context:
 * - **B2C (Individual)**: "Top Up Wallet" → opens Buy Credits bottom sheet.
 * - **B2B (Org/Team)**: "Manage Billing" → opens Stripe Customer Portal.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
  output,
  inject,
  afterNextRender,
} from '@angular/core';
import type {
  AgentXRichCard,
  AgentXBillingActionPayload,
  AgentXBillingActionReason,
} from '@nxt1/core/ai';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtLoggingService } from '../services/logging';
import { ANALYTICS_ADAPTER } from '../services/analytics';
import { NxtBreadcrumbService } from '../services/breadcrumb';
import { HapticsService } from '../services/haptics';
import { UsageService } from '../usage/usage.service';
import { UsageBottomSheetService } from '../usage/usage-bottom-sheet.service';

/** Emitted when the user triggers a billing action from the card. */
export interface BillingActionResolvedEvent {
  /** The reason this card was surfaced. */
  readonly reason: AgentXBillingActionReason;
  /** Whether the user completed the top-up / billing action flow. */
  readonly completed: boolean;
}

/** Display config resolved from the billing reason. */
interface BillingCardDisplay {
  readonly icon: string;
  readonly iconViewBox: string;
  readonly iconPath: string;
  readonly headline: string;
  readonly badgeLabel: string;
  readonly badgeClass: string;
}

/** SVG path constants to avoid inline noise. */
const ICON_WALLET =
  'M19 7h-1V6a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2ZM5 5h10a1 1 0 0 1 1 1v1H5a1 1 0 0 1 0-2Zm14 12H5a1 1 0 0 1-1-1V8.82A3 3 0 0 0 5 9h14v8Zm-3-4a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z';
const ICON_CARD =
  'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM4 6h16v2H4V6Zm16 12H4v-6h16v6Z';
const ICON_ALERT =
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 15a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-4a1 1 0 0 1-2 0V8a1 1 0 0 1 2 0v5Z';

/** Map from reason → display configuration. */
const REASON_DISPLAY: Record<AgentXBillingActionReason, BillingCardDisplay> = {
  insufficient_funds: {
    icon: 'wallet',
    iconViewBox: '0 0 24 24',
    iconPath: ICON_WALLET,
    headline: 'Insufficient credits',
    badgeLabel: 'Low Balance',
    badgeClass: 'badge--warning',
  },
  payment_method_required: {
    icon: 'card',
    iconViewBox: '0 0 24 24',
    iconPath: ICON_CARD,
    headline: 'Payment method required',
    badgeLabel: 'Action Required',
    badgeClass: 'badge--error',
  },
  limit_reached: {
    icon: 'alert',
    iconViewBox: '0 0 24 24',
    iconPath: ICON_ALERT,
    headline: 'Budget limit reached',
    badgeLabel: 'Limit Hit',
    badgeClass: 'badge--warning',
  },
};

@Component({
  selector: 'nxt1-agent-x-billing-action-card',
  standalone: true,
  template: `
    <div
      class="billing-card"
      role="region"
      aria-label="Billing action required"
      [attr.data-testid]="testIds.CARD"
    >
      <!-- Header -->
      <div class="billing-card__header" [attr.data-testid]="testIds.HEADER">
        <svg class="billing-card__icon" [attr.viewBox]="display().iconViewBox" fill="currentColor">
          <path [attr.d]="display().iconPath" />
        </svg>
        <span class="billing-card__title">{{ display().headline }}</span>
        <span
          class="billing-card__badge"
          [class]="display().badgeClass"
          [attr.data-testid]="testIds.REASON_BADGE"
        >
          {{ display().badgeLabel }}
        </span>
      </div>

      <!-- Body -->
      <div class="billing-card__body">
        @if (description()) {
          <p class="billing-card__desc" [attr.data-testid]="testIds.DESCRIPTION">
            {{ description() }}
          </p>
        }

        <!-- Balance & Amount Needed (B2C only) -->
        @if (showBalanceInfo()) {
          <div class="billing-card__metrics">
            @if (currentBalanceCents() !== null) {
              <div class="metric" [attr.data-testid]="testIds.BALANCE_DISPLAY">
                <span class="metric__label">Current balance</span>
                <span class="metric__value">{{ formatCents(currentBalanceCents()!) }}</span>
              </div>
            }
            @if (amountNeededCents() !== null) {
              <div class="metric metric--needed" [attr.data-testid]="testIds.AMOUNT_NEEDED">
                <span class="metric__label">Amount needed</span>
                <span class="metric__value metric__value--accent">
                  {{ formatCents(amountNeededCents()!) }}
                </span>
              </div>
            }
          </div>
        }
      </div>

      <!-- Actions -->
      <div class="billing-card__actions">
        <button
          type="button"
          class="billing-card__cta billing-card__cta--primary"
          [attr.data-testid]="testIds.CTA_PRIMARY"
          (click)="onPrimaryAction()"
        >
          {{ primaryLabel() }}
        </button>
        <button
          type="button"
          class="billing-card__cta billing-card__cta--secondary"
          [attr.data-testid]="testIds.CTA_SECONDARY"
          (click)="onDismiss()"
        >
          Dismiss
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .billing-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      .billing-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .billing-card__icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: var(--nxt1-color-warning, #fbbf24);
      }

      .billing-card__title {
        flex: 1;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .billing-card__badge {
        font-size: 0.6875rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        padding: 2px 8px;
        border-radius: 999px;
        text-transform: uppercase;
      }

      .badge--warning {
        background: rgba(251, 191, 36, 0.15);
        color: var(--nxt1-color-warning, #fbbf24);
      }

      .badge--error {
        background: rgba(239, 68, 68, 0.15);
        color: var(--nxt1-color-error, #ef4444);
      }

      .billing-card__body {
        padding: 12px;
      }

      .billing-card__desc {
        margin: 0 0 12px;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .billing-card__metrics {
        display: flex;
        gap: 16px;
      }

      .metric {
        flex: 1;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.06));
      }

      .metric__label {
        display: block;
        font-size: 0.6875rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        margin-bottom: 4px;
      }

      .metric__value {
        display: block;
        font-size: 1.125rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .metric__value--accent {
        color: var(--nxt1-color-warning, #fbbf24);
      }

      .billing-card__actions {
        display: flex;
        gap: 8px;
        padding: 0 12px 12px;
      }

      .billing-card__cta {
        flex: 1;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        transition:
          background 0.15s ease,
          opacity 0.15s ease;
        border: none;
        outline: none;
      }

      .billing-card__cta:active {
        opacity: 0.85;
      }

      .billing-card__cta:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .billing-card__cta--primary {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-on-primary, #000000);
      }

      .billing-card__cta--primary:hover {
        filter: brightness(1.1);
      }

      .billing-card__cta--secondary {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      .billing-card__cta--secondary:hover {
        background: var(--nxt1-color-surface-400, rgba(255, 255, 255, 0.12));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXBillingActionCardComponent {
  // ── Observability ──

  private readonly logger = inject(NxtLoggingService).child('AgentXBillingActionCard');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly haptics = inject(HapticsService);

  // ── Dependencies ──

  private readonly usageService = inject(UsageService);
  private readonly usageBottomSheet = inject(UsageBottomSheetService);

  // ── Inputs / Outputs ──

  /** The rich card data (type, title, payload). */
  readonly card = input.required<AgentXRichCard>();

  /** Emitted when the user resolves or dismisses the billing action. */
  readonly actionResolved = output<BillingActionResolvedEvent>();

  // ── Test IDs ──

  protected readonly testIds = TEST_IDS.AGENT_X_BILLING_CARD;

  // ── Computed Signals ──

  /** Extract the billing-action payload from the card. */
  protected readonly payload = computed<AgentXBillingActionPayload>(() => {
    return this.card().payload as AgentXBillingActionPayload;
  });

  /** Display configuration driven by the billing reason. */
  protected readonly display = computed<BillingCardDisplay>(() => {
    return REASON_DISPLAY[this.payload().reason] ?? REASON_DISPLAY.insufficient_funds;
  });

  /** Human-readable card description. */
  protected readonly description = computed<string | null>(() => {
    return this.payload().description ?? null;
  });

  /** Current balance (cents) — null if not provided. */
  protected readonly currentBalanceCents = computed<number | null>(() => {
    return this.payload().currentBalanceCents ?? null;
  });

  /** Amount needed (cents) — null if not provided. */
  protected readonly amountNeededCents = computed<number | null>(() => {
    return this.payload().amountNeededCents ?? null;
  });

  /** Whether to show the balance/amount metrics section. */
  protected readonly showBalanceInfo = computed<boolean>(() => {
    return this.currentBalanceCents() !== null || this.amountNeededCents() !== null;
  });

  /** Whether the user is on a personal (B2C) billing entity. */
  protected readonly isPersonal = computed<boolean>(() => this.usageService.isPersonal());

  /** Primary CTA label — adapts to B2C vs B2B context. */
  protected readonly primaryLabel = computed<string>(() => {
    const reason = this.payload().reason;
    if (reason === 'payment_method_required') return 'Add Payment Method';
    return this.isPersonal() ? 'Top Up Wallet' : 'Manage Billing';
  });

  // ── Lifecycle ──

  constructor() {
    // Track card impression only in the browser (SSR-safe)
    afterNextRender(() => {
      const { reason, amountNeededCents, currentBalanceCents } = this.payload();
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_BILLING_CARD_VIEWED, {
        reason,
        amountNeededCents,
        currentBalanceCents,
        billingEntity: this.isPersonal() ? 'individual' : 'organization',
      });
      this.breadcrumb.trackStateChange('agent-x-billing-card:viewed', { reason });
    });
  }

  // ── Actions ──

  /** Handle the primary CTA click (top-up wallet or open billing portal). */
  protected async onPrimaryAction(): Promise<void> {
    const reason = this.payload().reason;
    await this.haptics.impact('light');
    this.logger.info('Billing card CTA clicked', {
      reason,
      isPersonal: this.isPersonal(),
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_BILLING_CARD_CTA_CLICKED, {
      reason,
      action: this.isPersonal() ? 'top_up_wallet' : 'manage_billing',
    });
    this.breadcrumb.trackUserAction('agent-x-billing-card:cta-clicked', { reason });

    try {
      if (this.isPersonal()) {
        const { amountCents, autoTopup } = await this.usageBottomSheet.showBuyCreditsWithAutoTopup({
          autoTopupEnabled: this.usageService.autoTopUpEnabled(),
          autoTopupThresholdCents: this.usageService.autoTopUpThresholdCents(),
          autoTopupAmountCents: this.usageService.autoTopUpAmountCents(),
        });

        if (amountCents !== null) {
          await this.usageService.buyCredits(amountCents);
          this.logger.info('Credits purchased from billing card', { amountCents });
          this.analytics?.trackEvent(APP_EVENTS.AGENT_X_BILLING_CARD_PURCHASE_COMPLETED, {
            reason,
            amountCents,
          });
        }

        if (autoTopup !== null) {
          await this.usageService.configureAutoTopUp(autoTopup);
        }

        if (amountCents !== null || autoTopup !== null) {
          await this.haptics.notification('success');
          this.actionResolved.emit({ reason, completed: true });
          return;
        }

        this.actionResolved.emit({ reason, completed: false });
      } else {
        // B2B: Open Stripe Customer Portal
        await this.usageService.openBillingPortal();
        this.actionResolved.emit({ reason, completed: true });
      }
    } catch (err) {
      this.logger.error('Billing card action failed', err, { reason });
      await this.haptics.notification('error');
      this.actionResolved.emit({ reason, completed: false });
    }
  }

  /** Handle dismiss. */
  protected onDismiss(): void {
    const reason = this.payload().reason;
    this.logger.info('Billing card dismissed', { reason });
    this.breadcrumb.trackUserAction('agent-x-billing-card:dismissed', { reason });
    this.actionResolved.emit({ reason, completed: false });
  }

  /** Format cents into a dollars string (e.g. 1250 → "$12.50"). */
  protected formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }
}
