/**
 * @fileoverview Usage Org Member Stub
 * @module @nxt1/ui/usage
 *
 * Shown to org-billed members who are NOT org or team admins.
 * Displays their usage summary for the current period with a clear message
 * that billing is managed by their organization.
 *
 * No payment history, no payment methods, no billing address — just
 * the user's own usage context and a "Switch to personal billing" CTA.
 */

import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { formatPrice } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { HapticsService } from '../services/haptics';
import { UsageService } from './usage.service';

@Component({
  selector: 'nxt1-usage-org-member-stub',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="org-member-stub" [attr.data-testid]="testIds.ORG_MEMBER_STUB">
      <!-- ── Billing mode banners ──────────────────────────────────────── -->
      @if (svc.orgWalletEmpty()) {
        <div class="billing-banner billing-banner--warning">
          <div class="banner-body">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span
              >Your organization's wallet is empty. Switch to personal billing to keep using Agent
              X.</span
            >
          </div>
          <button
            type="button"
            class="banner-btn"
            [attr.data-testid]="testIds.ORG_MEMBER_SWITCH_BILLING_BTN"
            (click)="onSwitchToPersonalBilling()"
          >
            Use personal wallet
          </button>
        </div>
      }

      @if (svc.billingMode() === 'personal') {
        <div class="billing-banner billing-banner--success">
          <div class="banner-body">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>You're currently using your personal wallet.</span>
          </div>
          @if (svc.orgWalletRefilled()) {
            <button
              type="button"
              class="banner-btn"
              [attr.data-testid]="testIds.ORG_MEMBER_SWITCH_BACK_BTN"
              (click)="onSwitchBackToOrg()"
            >
              Switch to org billing
            </button>
          }
        </div>
      }

      <!-- ── Section header ────────────────────────────────────────────── -->
      <div class="stub-header">
        <div class="stub-header-text">
          <h2 class="stub-title">Your Usage</h2>
          <p class="stub-description">
            Billing is managed by your organization. Contact your administrator for invoices or plan
            changes.
          </p>
        </div>
        <div class="stub-period">{{ periodLabel() }}</div>
      </div>

      <!-- ── Usage card ────────────────────────────────────────────────── -->
      @if (overview()) {
        <div class="stub-card">
          <div class="stub-card-row">
            <span class="stub-card-label">Spent this period</span>
            <span class="stub-card-value">{{ usageFormatted() }}</span>
          </div>

          @if (budgetLimit() > 0) {
            <div class="stub-budget">
              <div
                class="stub-progress-track"
                role="progressbar"
                [attr.aria-valuenow]="percentUsed()"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <div
                  class="stub-progress-fill"
                  [style.width.%]="progressWidth()"
                  [class.stub-progress-fill--warning]="percentUsed() >= 80"
                  [class.stub-progress-fill--danger]="percentUsed() >= 100"
                ></div>
              </div>
              <div class="stub-budget-meta">
                <span class="stub-budget-used">{{ percentUsed() }}% used</span>
                <span class="stub-budget-limit">of {{ budgetFormatted() }} team budget</span>
              </div>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .org-member-stub {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-8);
      }

      /* ── Billing banners (identical pattern to usage-overview) ────────── */
      .billing-banner {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-radius-lg, 12px);
        border: 1px solid transparent;
        font-size: var(--nxt1-fontSize-sm);
      }

      .billing-banner--warning {
        background: color-mix(in srgb, var(--nxt1-color-warning, #f59e0b) 10%, transparent);
        border-color: color-mix(in srgb, var(--nxt1-color-warning, #f59e0b) 35%, transparent);
        color: var(--nxt1-color-text-primary);
      }

      .billing-banner--success {
        background: color-mix(in srgb, var(--nxt1-color-success, #10b981) 10%, transparent);
        border-color: color-mix(in srgb, var(--nxt1-color-success, #10b981) 35%, transparent);
        color: var(--nxt1-color-text-primary);
      }

      .banner-body {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        flex: 1;
        font-size: var(--nxt1-fontSize-sm);
      }

      .banner-btn {
        flex-shrink: 0;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary) 25%, transparent);
        border-radius: var(--nxt1-radius-md, 8px);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        cursor: pointer;
        transition: background var(--nxt1-transition-fast);
        white-space: nowrap;

        &:hover {
          background: color-mix(in srgb, var(--nxt1-color-primary) 18%, transparent);
        }
      }

      /* ── Section header ───────────────────────────────────────────────── */
      .stub-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .stub-header-text {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-1);
      }

      .stub-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-tight);
      }

      .stub-description {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        line-height: var(--nxt1-lineHeight-normal);
      }

      .stub-period {
        flex-shrink: 0;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        padding-top: 3px;
      }

      /* ── Usage card ───────────────────────────────────────────────────── */
      .stub-card {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: var(--nxt1-spacing-5);
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      .stub-card-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .stub-card-label {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .stub-card-value {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-3xl, 30px);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        letter-spacing: -0.02em;
        line-height: 1;
      }

      /* ── Budget progress ──────────────────────────────────────────────── */
      .stub-budget {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .stub-progress-track {
        width: 100%;
        height: 6px;
        background: var(--nxt1-color-surface-300);
        border-radius: 999px;
        overflow: hidden;
      }

      .stub-progress-fill {
        height: 100%;
        background: var(--nxt1-color-primary);
        border-radius: 999px;
        transition: width 0.3s ease;
      }

      .stub-progress-fill--warning {
        background: var(--nxt1-color-warning, #f59e0b);
      }

      .stub-progress-fill--danger {
        background: var(--nxt1-color-error, #ef4444);
      }

      .stub-budget-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
      }

      .stub-budget-used {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-primary);
      }

      .stub-budget-limit {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
      }
    `,
  ],
})
export class UsageOrgMemberStubComponent {
  protected readonly svc = inject(UsageService);
  private readonly haptics = inject(HapticsService);
  protected readonly testIds = TEST_IDS.USAGE;

  protected readonly overview = computed(() => this.svc.overview());

  protected readonly usageFormatted = computed(() =>
    formatPrice(this.svc.overview()?.currentMeteredUsage ?? 0)
  );

  protected readonly periodLabel = computed(() => this.svc.overview()?.period.label ?? '');

  protected readonly budgetLimit = computed(() => this.svc.budgets()[0]?.budgetLimit ?? 0);

  protected readonly budgetFormatted = computed(() => formatPrice(this.budgetLimit()));

  protected readonly percentUsed = computed(() => this.svc.budgets()[0]?.percentUsed ?? 0);

  protected readonly progressWidth = computed(() => Math.min(100, this.percentUsed()));

  protected async onSwitchToPersonalBilling(): Promise<void> {
    await this.haptics.impact('medium');
    await this.svc.switchBillingMode('personal');
  }

  protected async onSwitchBackToOrg(): Promise<void> {
    await this.haptics.impact('light');
    await this.svc.switchBillingMode('organization');
  }
}
