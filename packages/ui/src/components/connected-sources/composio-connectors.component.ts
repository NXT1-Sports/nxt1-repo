import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NxtIconComponent } from '../icon/icon.component';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBrowserService } from '../../services/browser/browser.service';
import { ComposioConnectorsService } from './composio-connectors.service';
import type { ConnectorDefinition, ConnectorId } from '@nxt1/core/connectors';

@Component({
  selector: 'nxt1-composio-connectors',
  standalone: true,
  imports: [NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nxt1-composio">
      <div class="nxt1-composio-heading">
        <div>
          <p class="nxt1-composio-eyebrow">Agent X Connectors</p>
          <h2>Give Agent X permission to work across your tools</h2>
          <p class="nxt1-composio-copy">
            Connect once, then approve actions before anything is sent, published, or changed.
          </p>
        </div>
        <button
          type="button"
          class="nxt1-composio-refresh"
          aria-label="Refresh connectors"
          (click)="reload()"
        >
          <nxt1-icon name="refresh" [size]="16" />
        </button>
      </div>

      @if (service.loading()) {
        <div class="nxt1-composio-state">Loading connectors...</div>
      } @else if (service.error() && !service.connectors().length) {
        <div class="nxt1-composio-state nxt1-composio-state--error">{{ service.error() }}</div>
      } @else {
        @for (group of groups; track group.key) {
          <div class="nxt1-composio-group">
            <h3>{{ group.label }}</h3>
            <div class="nxt1-composio-list">
              @for (connector of connectorsFor(group.key); track connector.id) {
                <div class="nxt1-composio-row">
                  <div class="nxt1-composio-info">
                    <span class="nxt1-composio-mark">{{ connector.label.slice(0, 1) }}</span>
                    <div>
                      <strong>{{ connector.label }}</strong>
                      <span>{{ connector.description }}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="nxt1-composio-action"
                    [class.nxt1-composio-action--connected]="isConnected(connector.id)"
                    [disabled]="busyId() === connector.id"
                    (click)="connect(connector)"
                  >
                    {{
                      busyId() === connector.id
                        ? 'Opening...'
                        : isConnected(connector.id)
                          ? 'Reconnect'
                          : 'Connect'
                    }}
                  </button>
                </div>
              }
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .nxt1-composio {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .nxt1-composio-heading {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }
      .nxt1-composio-eyebrow {
        margin: 0 0 4px;
        color: var(--nxt1-color-primary, #ccff00);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h2,
      h3,
      p {
        margin: 0;
      }
      h2 {
        color: var(--nxt1-color-text-primary, #fff);
        font-size: 18px;
        line-height: 1.2;
      }
      .nxt1-composio-copy {
        margin-top: 6px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
        font-size: 13px;
        line-height: 1.45;
      }
      .nxt1-composio-refresh {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        border-radius: 8px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .nxt1-composio-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      h3 {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .nxt1-composio-list {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        border-radius: 10px;
        overflow: hidden;
      }
      .nxt1-composio-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
      }
      .nxt1-composio-row + .nxt1-composio-row {
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
      }
      .nxt1-composio-info {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .nxt1-composio-info div {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }
      .nxt1-composio-info strong {
        color: var(--nxt1-color-text-primary, #fff);
        font-size: 14px;
      }
      .nxt1-composio-info span:last-child {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-size: 12px;
        line-height: 1.35;
      }
      .nxt1-composio-mark {
        display: grid;
        place-items: center;
        flex: 0 0 30px;
        width: 30px;
        height: 30px;
        border-radius: 7px;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        color: var(--nxt1-color-primary, #ccff00);
        font-weight: 700;
      }
      .nxt1-composio-action {
        flex: 0 0 auto;
        min-width: 80px;
        padding: 7px 10px;
        border: 1px solid var(--nxt1-color-primary, #ccff00);
        border-radius: 7px;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .nxt1-composio-action--connected {
        background: transparent;
        color: var(--nxt1-color-primary, #ccff00);
      }
      .nxt1-composio-action:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      .nxt1-composio-state {
        padding: 18px;
        border: 1px dashed var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.15));
        border-radius: 8px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
        font-size: 13px;
      }
      .nxt1-composio-state--error {
        color: var(--nxt1-color-danger, #fb7185);
      }
      @media (max-width: 540px) {
        .nxt1-composio-row {
          align-items: flex-start;
        }
        .nxt1-composio-action {
          min-width: 72px;
        }
      }
    `,
  ],
})
export class ComposioConnectorsComponent implements OnInit {
  protected readonly service = inject(ComposioConnectorsService);
  private readonly browser = inject(NxtBrowserService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ComposioConnectorsComponent');
  protected readonly busyId = signal<ConnectorId | null>(null);
  protected readonly groups = [
    { key: 'google' as const, label: 'Google Workspace' },
    { key: 'social' as const, label: 'Social & Publishing' },
    { key: 'productivity' as const, label: 'Productivity' },
  ];

  ngOnInit(): void {
    void this.service.load();
  }
  reload(): void {
    void this.service.load();
  }
  connectorsFor(group: ConnectorDefinition['group']): readonly ConnectorDefinition[] {
    return this.service.connectors().filter((connector) => connector.group === group);
  }
  isConnected(connectorId: ConnectorId): boolean {
    return this.service.accountFor(connectorId)?.status === 'connected';
  }
  async connect(connector: ConnectorDefinition): Promise<void> {
    this.busyId.set(connector.id);
    const authorizationUrl = await this.service.authorize(connector.id);
    if (authorizationUrl) {
      const result = await this.browser.open(authorizationUrl);
      if (!result.success) this.toast.error('Unable to open the connector authorization page.');
      else this.toast.success(`Finish connecting ${connector.label} in the secure browser.`);
    } else if (this.service.error()) {
      this.toast.error(this.service.error()!);
    }
    this.busyId.set(null);
    this.logger.info('Connector authorization launched', { connectorId: connector.id });
  }
}
