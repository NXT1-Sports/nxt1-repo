/**
 * @fileoverview Manage Team - Integrations Section Component
 * @module @nxt1/ui/manage-team
 * @version 1.0.0
 *
 * External integrations management for MaxPreps, Hudl, and other providers.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect, IonInput } from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { addIcons } from 'ionicons';
import {
  linkOutline,
  addOutline,
  checkmarkCircle,
  closeCircle,
  syncOutline,
  trashOutline,
  openOutline,
  copyOutline,
  alertCircleOutline,
  informationCircleOutline,
  videocamOutline,
  statsChartOutline,
  calendarOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import type { TeamIntegration, IntegrationProvider, IntegrationActionEvent } from '@nxt1/core';
import { INTEGRATION_PROVIDERS } from '@nxt1/core';

@Component({
  selector: 'nxt1-manage-team-integrations-section',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, IonInput, FormsModule],
  template: `
    <div class="integrations-section">
      <!-- Header -->
      <div class="integrations-header">
        <div class="integrations-info">
          <ion-icon name="link-outline"></ion-icon>
          <span>{{ connectedCount() }} Connected</span>
        </div>

        <button type="button" class="add-btn" (click)="onAddIntegration()">
          <ion-ripple-effect></ion-ripple-effect>
          <ion-icon name="add-outline"></ion-icon>
          <span>Add</span>
        </button>
      </div>

      <!-- Description -->
      <p class="section-description">
        Connect your team's external profiles to automatically sync stats, schedules, and video.
      </p>

      <!-- Connected Integrations -->
      @if (connectedIntegrations().length > 0) {
        <div class="connected-list">
          <h4 class="list-title">Connected Services</h4>

          @for (integration of connectedIntegrations(); track integration.id) {
            <div class="integration-card connected">
              <ion-ripple-effect></ion-ripple-effect>

              <!-- Provider Logo -->
              <div
                class="provider-logo"
                [style.background]="getProviderConfig(integration.provider).color"
              >
                @switch (integration.provider) {
                  @case ('maxpreps') {
                    <span class="logo-text">MP</span>
                  }
                  @case ('hudl') {
                    <span class="logo-text">H</span>
                  }
                  @case ('gamechanger') {
                    <span class="logo-text">GC</span>
                  }
                  @default {
                    <ion-icon [name]="getProviderConfig(integration.provider).icon"></ion-icon>
                  }
                }
              </div>

              <!-- Info -->
              <div class="integration-info">
                <div class="integration-main">
                  <h5 class="provider-name">{{ getProviderConfig(integration.provider).name }}</h5>
                  <span class="sync-status" [class]="'status-' + integration.status">
                    <ion-icon
                      [name]="
                        integration.status === 'connected'
                          ? 'checkmark-circle'
                          : 'alert-circle-outline'
                      "
                    ></ion-icon>
                    <span>{{ integration.status === 'connected' ? 'Connected' : 'Error' }}</span>
                  </span>
                </div>

                @if (integration.lastSync) {
                  <span class="last-sync">
                    Last synced {{ formatLastSync(integration.lastSync) }}
                  </span>
                }

                <!-- Synced Types -->
                <div class="sync-types">
                  <span class="sync-badge">
                    <ion-icon [name]="getSyncTypeIcon(integration.type)"></ion-icon>
                    {{ getSyncTypeLabel(integration.type) }}
                  </span>
                </div>
              </div>

              <!-- Actions -->
              <div class="integration-actions">
                <button
                  type="button"
                  class="action-btn sync"
                  (click)="onSync(integration, $event)"
                  title="Sync Now"
                >
                  <ion-ripple-effect></ion-ripple-effect>
                  <ion-icon name="sync-outline"></ion-icon>
                </button>
                <button
                  type="button"
                  class="action-btn open"
                  (click)="onOpenExternal(integration, $event)"
                  title="View External"
                >
                  <ion-ripple-effect></ion-ripple-effect>
                  <ion-icon name="open-outline"></ion-icon>
                </button>
                <button
                  type="button"
                  class="action-btn delete"
                  (click)="onDisconnect(integration, $event)"
                  title="Disconnect"
                >
                  <ion-ripple-effect></ion-ripple-effect>
                  <ion-icon name="trash-outline"></ion-icon>
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Available Providers -->
      <div class="available-providers">
        <h4 class="list-title">Available Integrations</h4>

        <div class="providers-grid">
          @for (provider of availableProviders(); track provider.id) {
            <button type="button" class="provider-card" (click)="onConnectProvider(provider.id)">
              <ion-ripple-effect></ion-ripple-effect>

              <div class="provider-logo" [style.background]="provider.color">
                @switch (provider.id) {
                  @case ('maxpreps') {
                    <span class="logo-text">MP</span>
                  }
                  @case ('hudl') {
                    <span class="logo-text">H</span>
                  }
                  @case ('gamechanger') {
                    <span class="logo-text">GC</span>
                  }
                  @default {
                    <ion-icon [name]="provider.icon"></ion-icon>
                  }
                }
              </div>

              <div class="provider-info">
                <h5 class="provider-name">{{ provider.name }}</h5>
                <span class="provider-types">{{ provider.syncTypes.join(', ') }}</span>
              </div>

              <ion-icon name="chevron-forward-outline" class="arrow"></ion-icon>
            </button>
          }
        </div>
      </div>

      <!-- Manual Link Entry -->
      <div class="manual-link-section">
        <h4 class="list-title">Quick Link</h4>
        <p class="manual-description">
          Paste a link from MaxPreps, Hudl, or other sports platforms
        </p>

        <div class="link-input-wrapper">
          <ion-input
            type="url"
            placeholder="https://www.maxpreps.com/..."
            [value]="manualLink"
            (ionInput)="onManualLinkChange($event)"
            class="link-input"
          ></ion-input>
          <button
            type="button"
            class="connect-link-btn"
            [disabled]="!manualLink"
            (click)="onConnectManualLink()"
          >
            <ion-ripple-effect></ion-ripple-effect>
            Connect
          </button>
        </div>

        @if (linkError) {
          <div class="link-error">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <span>{{ linkError }}</span>
          </div>
        }
      </div>

      <!-- Info Note -->
      <div class="info-note">
        <ion-icon name="information-circle-outline"></ion-icon>
        <span>Integrations help keep your team profile up-to-date automatically</span>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       INTEGRATIONS SECTION - 2026 Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      .integrations-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
      }

      /* ============================================
         HEADER
         ============================================ */

      .integrations-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .integrations-info {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-color-secondary);
        }
      }

      .add-btn {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-full);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 16px;
        }

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-secondaryLight);
        }

        &:active {
          transform: scale(0.98);
        }
      }

      .section-description {
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      /* ============================================
         LIST TITLE
         ============================================ */

      .list-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-3);
      }

      /* ============================================
         CONNECTED INTEGRATIONS
         ============================================ */

      .connected-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .integration-card {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--nxt1-color-border-default);
        }

        &.connected {
          border-color: var(--nxt1-color-success);
        }
      }

      .provider-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: var(--nxt1-radius-lg);
        flex-shrink: 0;
        color: white;

        .logo-text {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: var(--nxt1-fontSize-lg);
          font-weight: 700;
        }

        ion-icon {
          font-size: 24px;
        }
      }

      .integration-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .integration-main {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        flex-wrap: wrap;
      }

      .provider-name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        margin: 0;
      }

      .sync-status {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;

        &.status-connected {
          color: var(--nxt1-color-success);
        }

        &.status-error {
          color: var(--nxt1-color-error);
        }

        ion-icon {
          font-size: 14px;
        }
      }

      .last-sync {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
      }

      .sync-types {
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-1);
      }

      .sync-badge {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-full);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);

        ion-icon {
          font-size: 12px;
        }
      }

      .integration-actions {
        display: flex;
        gap: var(--nxt1-spacing-1);
        flex-shrink: 0;
      }

      .action-btn {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: var(--nxt1-color-surface-200);
        border: none;
        border-radius: var(--nxt1-radius-full);
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);

        ion-icon {
          font-size: 18px;
        }

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-300);
          color: var(--nxt1-color-text-primary);
        }

        &.sync:hover {
          background: var(--nxt1-color-primary);
          color: var(--nxt1-color-text-onPrimary);
        }

        &.delete:hover {
          background: var(--nxt1-color-error);
          color: var(--nxt1-color-text-onPrimary);
        }
      }

      /* ============================================
         AVAILABLE PROVIDERS
         ============================================ */

      .available-providers {
        display: flex;
        flex-direction: column;
      }

      .providers-grid {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .provider-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border: 1px dashed var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-xl);
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);
        text-align: left;

        &:hover,
        &:focus-visible {
          background: var(--nxt1-color-surface-200);
          border-style: solid;
          border-color: var(--nxt1-color-primary);
        }

        .provider-logo {
          width: 40px;
          height: 40px;
        }

        .provider-info {
          flex: 1;
          min-width: 0;
        }

        .provider-name {
          font-size: var(--nxt1-fontSize-sm);
          margin: 0 0 2px;
        }

        .provider-types {
          font-size: var(--nxt1-fontSize-xs);
          color: var(--nxt1-color-text-tertiary);
          text-transform: capitalize;
        }

        .arrow {
          font-size: 18px;
          color: var(--nxt1-color-text-tertiary);
        }
      }

      /* ============================================
         MANUAL LINK ENTRY
         ============================================ */

      .manual-link-section {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .manual-description {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        margin: 0;
      }

      .link-input-wrapper {
        display: flex;
        gap: var(--nxt1-spacing-2);
      }

      .link-input {
        flex: 1;
        --background: var(--nxt1-color-surface-100);
        --border-radius: var(--nxt1-radius-lg);
        --padding-start: var(--nxt1-spacing-4);
        --padding-end: var(--nxt1-spacing-4);
        --color: var(--nxt1-color-text-primary);
        --placeholder-color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-body);
        font-size: var(--nxt1-fontSize-sm);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-lg);
        height: 44px;
      }

      .connect-link-btn {
        position: relative;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        background: var(--nxt1-color-secondary);
        color: var(--nxt1-color-text-onPrimary);
        border: none;
        border-radius: var(--nxt1-radius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        cursor: pointer;
        overflow: hidden;
        transition: all var(--nxt1-transition-fast);
        white-space: nowrap;

        &:hover:not(:disabled),
        &:focus-visible:not(:disabled) {
          background: var(--nxt1-color-secondaryLight);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .link-error {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-error);

        ion-icon {
          font-size: 14px;
        }
      }

      /* ============================================
         INFO NOTE
         ============================================ */

      .info-note {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border-radius: var(--nxt1-radius-lg);

        ion-icon {
          font-size: 18px;
          color: var(--nxt1-color-info);
          flex-shrink: 0;
        }

        span {
          font-size: var(--nxt1-fontSize-sm);
          color: var(--nxt1-color-text-secondary);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageTeamIntegrationsSectionComponent {
  constructor() {
    addIcons({
      linkOutline,
      addOutline,
      checkmarkCircle,
      closeCircle,
      syncOutline,
      trashOutline,
      openOutline,
      copyOutline,
      alertCircleOutline,
      informationCircleOutline,
      videocamOutline,
      statsChartOutline,
      calendarOutline,
      chevronForwardOutline,
    });
  }

  /** Integrations list */
  readonly integrations = input<readonly TeamIntegration[]>([]);

  /** Action event */
  readonly action = output<IntegrationActionEvent>();

  /** Manual link input */
  manualLink = '';

  /** Link error message */
  linkError = '';

  /** Connected integrations */
  readonly connectedIntegrations = computed(() =>
    this.integrations().filter((i) => i.status === 'connected' || i.status === 'error')
  );

  /** Connected count */
  readonly connectedCount = computed(
    () => this.integrations().filter((i) => i.status === 'connected').length
  );

  /** Available providers not yet connected */
  readonly availableProviders = computed(() => {
    const connectedProviders = new Set(this.integrations().map((i) => i.provider));
    return Object.entries(INTEGRATION_PROVIDERS)
      .filter(([key]) => !connectedProviders.has(key as IntegrationProvider))
      .map(([key, value]) => ({
        id: key as IntegrationProvider,
        name: value.name,
        color: this.getProviderColor(key as IntegrationProvider),
        icon: 'link-outline',
        syncTypes: value.supportedTypes,
      }));
  });

  getProviderColor(provider: IntegrationProvider): string {
    const colors: Record<string, string> = {
      maxpreps: '#003087',
      hudl: '#ff6b00',
      gamechanger: '#00c853',
    };
    return colors[provider] ?? 'var(--nxt1-color-surface-300)';
  }

  getProviderConfig(provider: IntegrationProvider): { name: string; color: string; icon: string } {
    const config = INTEGRATION_PROVIDERS[provider];
    return {
      name: config?.name ?? provider,
      color: this.getProviderColor(provider),
      icon: 'link-outline',
    };
  }

  getSyncTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      stats: 'stats-chart-outline',
      schedule: 'calendar-outline',
      video: 'videocam-outline',
    };
    return icons[type] ?? 'link-outline';
  }

  getSyncTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      stats: 'Stats',
      schedule: 'Schedule',
      video: 'Video',
    };
    return labels[type] ?? type;
  }

  formatLastSync(date: string): string {
    const syncDate = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - syncDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return syncDate.toLocaleDateString();
  }

  onAddIntegration(): void {
    this.action.emit({ action: 'connect' });
  }

  onConnectProvider(providerId: IntegrationProvider): void {
    this.action.emit({ action: 'connect', provider: providerId });
  }

  onSync(integration: TeamIntegration, event: Event): void {
    event.stopPropagation();
    this.action.emit({ action: 'sync', integration });
  }

  onOpenExternal(integration: TeamIntegration, event: Event): void {
    event.stopPropagation();
    if (integration.url) {
      window.open(integration.url, '_blank');
    }
  }

  onDisconnect(integration: TeamIntegration, event: Event): void {
    event.stopPropagation();
    this.action.emit({ action: 'disconnect', integration });
  }

  onManualLinkChange(event: CustomEvent): void {
    this.manualLink = event.detail.value ?? '';
    this.linkError = '';
  }

  onConnectManualLink(): void {
    if (!this.manualLink) return;

    // Detect provider from URL
    const url = this.manualLink.toLowerCase();
    let provider: IntegrationProvider | null = null;

    if (url.includes('maxpreps.com')) provider = 'maxpreps';
    else if (url.includes('hudl.com')) provider = 'hudl';
    else if (url.includes('gc.com') || url.includes('gamechanger')) provider = 'gamechanger';

    if (provider) {
      this.action.emit({ action: 'connect', provider });
      this.manualLink = '';
    } else {
      this.linkError = 'Unsupported link. Try MaxPreps, Hudl, or GameChanger URLs.';
    }
  }
}
