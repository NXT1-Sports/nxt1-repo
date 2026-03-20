/**
 * @fileoverview Connected Accounts Sheet Component
 * @module @nxt1/ui/components/connected-sources
 * @version 1.0.0
 *
 * Content component rendered inside a bottom sheet via NxtBottomSheetService.openSheet().
 * Displays the full list of connected data sources with edit capabilities.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { IonIcon, ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../bottom-sheet/sheet-header.component';
import { NxtIconComponent } from '../icon/icon.component';
import { NxtModalService } from '../../services/modal';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { LINK_SOURCES_TEST_IDS } from '@nxt1/core/testing';
import { INBOX_EMAIL_PROVIDERS, type InboxEmailProvider, type ConnectedEmail } from '@nxt1/core';
import {
  NxtConnectedSourcesComponent,
  type ConnectedSource,
  type ConnectedSourceTapEvent,
} from './connected-sources.component';

@Component({
  selector: 'nxt1-connected-accounts-sheet',
  standalone: true,
  imports: [NxtSheetHeaderComponent, NxtConnectedSourcesComponent, NxtIconComponent, IonIcon],
  template: `
    <nxt1-sheet-header
      title="Connected Accounts"
      closePosition="right"
      [centerTitle]="true"
      [showBorder]="true"
      (closeSheet)="dismiss()"
    >
      <button
        sheetHeaderAction
        type="button"
        class="nxt1-sheet-resync"
        [attr.data-testid]="testIds.RESYNC_BUTTON"
        (click)="requestResync()"
      >
        Re-sync
      </button>
      @if (hasChanges()) {
        <button sheetHeaderAction type="button" class="nxt1-sheet-done" (click)="dismiss()">
          Done
        </button>
      }
    </nxt1-sheet-header>

    <div class="nxt1-sheet-scroll">
      <div class="nxt1-sheet-body">
        <!-- Email provider connect buttons -->
        <div class="nxt1-sheet-providers">
          <p class="nxt1-sheet-providers__title">Email Accounts</p>
          @for (provider of emailProviders; track provider.id) {
            <button
              type="button"
              class="nxt1-sheet-provider-card"
              [class.nxt1-sheet-provider-card--connected]="isProviderConnected(provider.id)"
              (click)="onConnectProvider(provider)"
            >
              <nxt1-icon [name]="provider.icon" [size]="24" />
              <div class="nxt1-sheet-provider-info">
                <span class="nxt1-sheet-provider-name">{{ provider.name }}</span>
                @if (isProviderConnected(provider.id)) {
                  <span class="nxt1-sheet-provider-email">{{
                    getConnectedEmail(provider.id)
                  }}</span>
                } @else {
                  <span class="nxt1-sheet-provider-desc">{{ provider.description }}</span>
                }
              </div>
              @if (isProviderConnected(provider.id)) {
                <span class="nxt1-sheet-provider-badge">Connected</span>
              } @else {
                <ion-icon name="chevron-forward"></ion-icon>
              }
            </button>
          }
        </div>

        @for (group of groupedSources(); track group.key) {
          <nxt1-connected-sources
            [title]="group.label"
            [sources]="group.sources"
            [showModeToggle]="false"
            [collapsible]="!group.key.startsWith('recommended-')"
            [initialExpanded]="group.key.startsWith('recommended-') || group.key === 'signin'"
            (sourceTap)="onSourceTap($event)"
          />
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .nxt1-sheet-done {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        background: none;
        padding: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-sheet-resync {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        background: none;
        padding: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-sheet-scroll {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      .nxt1-sheet-body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4) var(--nxt1-spacing-8);
      }

      .nxt1-sheet-providers {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2);
      }

      .nxt1-sheet-providers__title {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 var(--nxt1-spacing-1);
      }

      .nxt1-sheet-provider-card {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-raised);
        border: 1px solid var(--nxt1-color-border);
        border-radius: var(--nxt1-radius-md);
        cursor: pointer;
        text-align: left;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-sheet-provider-card:active {
        opacity: 0.7;
      }

      .nxt1-sheet-provider-card--connected {
        border-color: var(--nxt1-color-success, #22c55e);
        background: color-mix(
          in srgb,
          var(--nxt1-color-success, #22c55e) 8%,
          var(--nxt1-color-surface-raised)
        );
      }

      .nxt1-sheet-provider-badge {
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-success, #22c55e);
        white-space: nowrap;
      }

      .nxt1-sheet-provider-email {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .nxt1-sheet-provider-info {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .nxt1-sheet-provider-name {
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .nxt1-sheet-provider-desc {
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-secondary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAccountsSheetComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);
  private readonly nxtModal = inject(NxtModalService);
  private readonly logger = inject(NxtLoggingService).child('ConnectedAccountsSheet');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  /** Injected via componentProps from the opener */
  platformGroups: readonly { key: string; label: string; sources: readonly ConnectedSource[] }[] =
    [];

  /** Optional callback for direct provider connection (bypasses modal dismiss chain) */
  connectProviderCallback?: (provider: InboxEmailProvider) => void;

  /** Connected email accounts — used to show connected/disconnected state */
  connectedEmails: readonly ConnectedEmail[] = [];

  /** Mutable groups — single source of truth for all rendering and saving */
  private readonly _groups = signal<
    readonly { key: string; label: string; sources: readonly ConnectedSource[] }[]
  >([]);
  private readonly _hasChanges = signal(false);

  protected readonly testIds = LINK_SOURCES_TEST_IDS;
  readonly hasChanges = computed(() => this._hasChanges());
  readonly groupedSources = computed(() => this._groups());
  protected readonly emailProviders = INBOX_EMAIL_PROVIDERS.filter((p) => p.id !== 'yahoo');

  protected isProviderConnected(providerId: string): boolean {
    return this.connectedEmails.some((e) => e.provider === providerId && e.isActive);
  }

  protected getConnectedEmail(providerId: string): string | undefined {
    return this.connectedEmails.find((e) => e.provider === providerId && e.isActive)?.email;
  }

  ngOnInit(): void {
    this._groups.set(this.platformGroups);
    this.breadcrumb.trackStateChange('connected-accounts-sheet:opened');
  }

  onSourceTap(event: ConnectedSourceTapEvent): void {
    void this.editSource(event.source);
  }

  async editSource(source: ConnectedSource): Promise<void> {
    const result = await this.nxtModal.prompt({
      title: source.label,
      placeholder:
        source.platform === 'hudl' || source.platform === 'youtube' ? 'Profile URL' : '@username',
      defaultValue: source.url ?? source.username ?? '',
      submitText: 'Done',
      preferNative: 'ionic',
    });

    if (!result.confirmed) return;

    const value = result.value.trim();

    const updateSource = (s: ConnectedSource): ConnectedSource =>
      s.platform === source.platform &&
      s.scopeType === source.scopeType &&
      s.scopeId === source.scopeId
        ? {
            ...s,
            connected: !!value,
            username: value && !value.startsWith('http') ? value : undefined,
            url: value || undefined,
          }
        : s;

    this._groups.update((groups) =>
      groups.map((group) => ({
        ...group,
        sources: group.sources.map(updateSource),
      }))
    );

    this._hasChanges.set(true);
    this.logger.info('Social link updated', { platform: source.platform, connected: !!value });
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'connected-accounts-sheet',
      socialPlatform: source.platform,
      action: value ? 'connected' : 'disconnected',
    });
  }

  dismiss(): void {
    if (this._hasChanges()) {
      const allSources = this._groups().flatMap((g) => g.sources);
      const updatedLinks = allSources
        .filter((s) => s.connected)
        .map((s, i) => ({
          platform: s.platform,
          url: s.url ?? s.username ?? '',
          username: s.username,
          scopeType: s.scopeType,
          scopeId: s.scopeId,
          displayOrder: i,
        }));

      this.breadcrumb.trackStateChange('connected-accounts-sheet:saved', {
        count: updatedLinks.length,
      });
      void this.modalCtrl.dismiss({ updatedLinks, sources: allSources }, 'save');
    } else {
      this.breadcrumb.trackStateChange('connected-accounts-sheet:cancelled');
      void this.modalCtrl.dismiss(null, 'cancel');
    }
  }

  async onConnectProvider(provider: InboxEmailProvider): Promise<void> {
    if (this.connectProviderCallback) {
      // Direct callback — no modal dismiss chain needed
      this.connectProviderCallback(provider);
      void this.modalCtrl.dismiss(null, 'cancel');
      return;
    }

    // Fallback: dismiss with data for handlers that rely on the dismiss chain
    console.log('[Sheet] Connect provider clicked:', provider.id);
    const modal = await this.modalCtrl.getTop();
    if (modal) {
      void modal.dismiss({ provider }, 'connectProvider');
    }
  }

  requestResync(): void {
    const allSources = this._groups().flatMap((g) => g.sources);
    this.logger.info('Connected accounts re-sync requested', {
      sourceCount: allSources.length,
      connectedCount: allSources.filter((s) => s.connected || !!s.url || !!s.username).length,
    });
    this.breadcrumb.trackStateChange('connected-accounts-sheet:resync-requested');
    void this.modalCtrl.dismiss({ sources: allSources }, 'resync');
  }
}
