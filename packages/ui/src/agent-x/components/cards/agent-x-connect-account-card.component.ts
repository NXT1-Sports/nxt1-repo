import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { AgentXConnectAccountPayload, AgentXRichCard } from '@nxt1/core/ai';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { ConnectedAccountsModalService } from '../../../components/connected-sources';
import { ANALYTICS_ADAPTER } from '../../../services/analytics';
import { NxtBreadcrumbService } from '../../../services/breadcrumb';
import { HapticsService } from '../../../services/haptics';
import { NxtLoggingService } from '../../../services/logging';

export interface ConnectAccountCardActionEvent {
  readonly action: 'connect-account' | 'send-via-nxt1';
  readonly pendingTool?: string;
}

@Component({
  selector: 'nxt1-agent-x-connect-account-card',
  standalone: true,
  template: `
    <div class="connect-card" role="region" aria-label="Email account required">
      <div class="connect-card__header">Email account required</div>
      <p class="connect-card__message">{{ message() }}</p>
      <div class="connect-card__actions">
        <button
          type="button"
          class="connect-card__btn connect-card__btn--primary"
          (click)="onConnect()"
        >
          {{ connectLabel() }}
        </button>
        <button
          type="button"
          class="connect-card__btn connect-card__btn--secondary"
          (click)="onSendViaNxt1()"
        >
          {{ fallbackLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .connect-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        padding: 12px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      .connect-card__header {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .connect-card__message {
        margin: 8px 0 0;
        font-size: 0.8125rem;
        line-height: 1.45;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.72));
      }

      .connect-card__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .connect-card__btn {
        border-radius: 8px;
        border: 1px solid transparent;
        padding: 8px 10px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
      }

      .connect-card__btn--primary {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .connect-card__btn--secondary {
        background: transparent;
        border-color: var(--nxt1-color-border, rgba(255, 255, 255, 0.2));
        color: var(--nxt1-color-text-primary, #ffffff);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXConnectAccountCardComponent {
  readonly card = input.required<AgentXRichCard>();
  readonly actionSelected = output<ConnectAccountCardActionEvent>();

  private readonly connectedAccounts = inject(ConnectedAccountsModalService);
  private readonly logger = inject(NxtLoggingService).child('AgentXConnectAccountCard');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly haptics = inject(HapticsService);

  private readonly payload = computed(
    () => (this.card().payload ?? {}) as AgentXConnectAccountPayload
  );

  protected readonly message = computed(
    () =>
      this.payload().reason ||
      'Connect your Gmail or Outlook account to send from your address, or send via NXT1 instead.'
  );

  protected readonly connectLabel = computed(
    () => this.payload().connectLabel ?? 'Connect Gmail or Outlook'
  );

  protected readonly fallbackLabel = computed(
    () => this.payload().fallbackLabel ?? 'Send via NXT1 instead'
  );

  protected async onConnect(): Promise<void> {
    await this.haptics.impact('light');
    this.breadcrumb.trackUserAction('agent-x-connect-account-card-connect');
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_ACTION_CARD_EXECUTED, {
      action: 'connect-account',
      pendingTool: this.payload().pendingTool ?? undefined,
    });
    this.actionSelected.emit({
      action: 'connect-account',
      pendingTool: this.payload().pendingTool,
    });

    try {
      await this.connectedAccounts.open();
    } catch (error) {
      this.logger.error('Failed to open connected accounts modal from card action', error);
    }
  }

  protected async onSendViaNxt1(): Promise<void> {
    await this.haptics.impact('light');
    this.breadcrumb.trackUserAction('agent-x-connect-account-card-send-via-nxt1');
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_ACTION_CARD_EXECUTED, {
      action: 'send-via-nxt1',
      pendingTool: this.payload().pendingTool ?? undefined,
    });
    this.actionSelected.emit({
      action: 'send-via-nxt1',
      pendingTool: this.payload().pendingTool,
    });
  }
}
