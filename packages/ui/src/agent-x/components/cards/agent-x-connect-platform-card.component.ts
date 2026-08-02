/**
 * @fileoverview Agent X Connect Platform Card
 * @module @nxt1/ui/agent-x/components/cards
 *
 * Rendered inline in the Agent X chat whenever the user asks to connect a
 * specific third-party platform (e.g. "connect Hudl", "link my Instagram")
 * and that platform isn't yet connected to their NXT1 profile.
 *
 * Generic across every entry in `PLATFORM_REGISTRY` — resolves the display
 * label, icon, and favicon automatically, and opens the shared Connected
 * Accounts modal focused on the requested platform when tapped.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import type { AgentXConnectPlatformPayload, AgentXRichCard } from '@nxt1/core/ai';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { getPlatformFaviconUrl, PLATFORM_REGISTRY } from '@nxt1/core/platforms';
import { ConnectedAccountsModalService } from '../../../components/connected-sources';
import { NxtPlatformIconComponent } from '../../../components/platform-icon';
import { ANALYTICS_ADAPTER } from '../../../services/analytics';
import { NxtBreadcrumbService } from '../../../services/breadcrumb';
import { HapticsService } from '../../../services/haptics';
import { NxtLoggingService } from '../../../services/logging';

/** Emitted when the user taps the Connect CTA on a connect-platform card. */
export interface ConnectPlatformCardActionEvent {
  readonly action: 'connect-platform';
  readonly platform: string;
  readonly pendingTool?: string;
}

@Component({
  selector: 'nxt1-agent-x-connect-platform-card',
  standalone: true,
  imports: [NxtPlatformIconComponent],
  template: `
    <div
      class="connect-platform-card"
      role="region"
      [attr.aria-label]="platformLabel() + ' connection required'"
    >
      <div class="connect-platform-card__header">
        <span class="connect-platform-card__icon">
          <nxt1-platform-icon
            [icon]="platformIconName()"
            [faviconUrl]="platformFaviconUrl()"
            [size]="22"
            [alt]="platformLabel()"
          />
        </span>
        <span class="connect-platform-card__title">Connect {{ platformLabel() }}</span>
      </div>
      <p class="connect-platform-card__message">{{ message() }}</p>
      <div class="connect-platform-card__actions">
        <button
          type="button"
          class="connect-platform-card__btn connect-platform-card__btn--primary"
          data-testid="agent-x-connect-platform-card-connect-button"
          (click)="onConnect()"
        >
          {{ connectLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .connect-platform-card {
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.1));
        border-radius: 12px;
        padding: 12px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      .connect-platform-card__header {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .connect-platform-card__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border-radius: 8px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
      }

      .connect-platform-card__title {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .connect-platform-card__message {
        margin: 8px 0 0;
        font-size: 0.8125rem;
        line-height: 1.45;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.72));
      }

      .connect-platform-card__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      .connect-platform-card__btn {
        border-radius: 8px;
        border: 1px solid transparent;
        padding: 8px 10px;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
      }

      .connect-platform-card__btn--primary {
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXConnectPlatformCardComponent {
  readonly card = input.required<AgentXRichCard>();
  readonly actionSelected = output<ConnectPlatformCardActionEvent>();

  private readonly connectedAccounts = inject(ConnectedAccountsModalService);
  private readonly logger = inject(NxtLoggingService).child('AgentXConnectPlatformCard');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly haptics = inject(HapticsService);

  private readonly payload = computed(
    () => (this.card().payload ?? {}) as AgentXConnectPlatformPayload
  );

  private readonly platformDefinition = computed(() =>
    PLATFORM_REGISTRY.find((def) => def.platform === this.payload().platform)
  );

  protected readonly platformLabel = computed(
    () => this.payload().platformLabel || this.platformDefinition()?.label || 'account'
  );

  protected readonly platformIconName = computed(() => this.platformDefinition()?.icon ?? 'link');

  protected readonly platformFaviconUrl = computed(() =>
    getPlatformFaviconUrl(this.payload().platform)
  );

  protected readonly message = computed(
    () =>
      this.payload().reason ||
      `Connect your ${this.platformLabel()} account so Agent X can sync your data and take action for you.`
  );

  protected readonly connectLabel = computed(
    () => this.payload().connectLabel ?? `Connect ${this.platformLabel()}`
  );

  constructor() {
    // Track card impression only in the browser (SSR-safe)
    afterNextRender(() => {
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_CONNECT_PLATFORM_CARD_VIEWED, {
        targetPlatform: this.payload().platform,
      });
    });
  }

  protected async onConnect(): Promise<void> {
    const platform = this.payload().platform;
    await this.haptics.impact('light');
    this.breadcrumb.trackUserAction('agent-x-connect-platform-card-connect', { platform });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_CONNECT_PLATFORM_CARD_CONNECT_TAPPED, {
      targetPlatform: platform,
      pendingTool: this.payload().pendingTool ?? undefined,
    });
    this.actionSelected.emit({
      action: 'connect-platform',
      platform,
      pendingTool: this.payload().pendingTool,
    });

    try {
      await this.connectedAccounts.open({ focusPlatform: platform });
    } catch (error) {
      this.logger.error(
        'Failed to open connected accounts modal from connect-platform card',
        error,
        { platform }
      );
    }
  }
}
