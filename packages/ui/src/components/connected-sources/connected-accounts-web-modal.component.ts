/**
 * @fileoverview Connected Accounts Web Modal Wrapper
 * @module @nxt1/ui/components/connected-sources
 * @version 1.0.0
 *
 * Thin wrapper around OnboardingLinkDropStepComponent for use inside
 * NxtOverlayService on desktop web.
 *
 * Why a wrapper?
 * - NxtOverlayService auto-subscribes to `close` output to dismiss.
 * - The sheet component uses Ionic ModalController for dismiss, which
 *   doesn't exist in the pure-Angular overlay context.
 * - This wrapper replaces NxtSheetHeaderComponent with NxtModalHeaderComponent
 *   and bridges save/cancel paths into a single `close` output.
 *
 * ⭐ WEB DESKTOP ONLY — Mobile uses ConnectedAccountsSheetComponent ⭐
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { NxtModalHeaderComponent } from '../overlay/modal-header.component';
import { NxtIconComponent } from '../icon/icon.component';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtToastService } from '../../services/toast/toast.service';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { LINK_SOURCES_TEST_IDS } from '@nxt1/core/testing';
import type { LinkSourcesFormData, OnboardingUserType, PlatformScope } from '@nxt1/core/api';
import { OnboardingLinkDropStepComponent } from '../../onboarding/onboarding-link-drop-step';
import {
  FirecrawlSignInService,
  type FirecrawlMonitorSummary,
  type FirecrawlSignInRequest,
} from './firecrawl-signin.service';
import { CONNECTED_ACCOUNTS_OAUTH_HANDLER } from './connected-accounts-modal.service';

/** Result data emitted when the modal is dismissed with changes. */
export interface ConnectedAccountsModalCloseData {
  readonly saved: boolean;
  readonly updatedLinks?: readonly {
    platform: string;
    url: string;
    username?: string;
    scopeType?: string;
    scopeId?: string;
    displayOrder: number;
  }[];
  readonly linkSources?: LinkSourcesFormData;
  readonly resync?: boolean;
  readonly sources?: readonly {
    platform: string;
    label: string;
    connected: boolean;
    username?: string;
    url?: string;
    connectionType?: string;
  }[];
  /** Sign-in providers (google/microsoft/yahoo) that were connected at modal open but
   * have been explicitly disconnected by the user during this session. Used by the
   * save handler to set `connectedEmails[].isActive = false` for those providers. */
  readonly disconnectedSignInProviders?: readonly string[];
}

@Component({
  selector: 'nxt1-connected-accounts-web-modal',
  standalone: true,
  imports: [NxtModalHeaderComponent, NxtIconComponent, OnboardingLinkDropStepComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nxt1-ca-web-modal">
      <nxt1-modal-header
        title="Connectors"
        closePosition="left"
        [showBorder]="true"
        (closeModal)="onClose()"
      >
        <button
          modalHeaderAction
          type="button"
          class="nxt1-ca-resync-btn nxt1-ca-resync-btn--active"
          [attr.data-testid]="testIds.RESYNC_BUTTON"
          (click)="onResync()"
        >
          Re-sync
        </button>
      </nxt1-modal-header>

      <div class="nxt1-ca-scroll">
        @if (firecrawlLoading()) {
          <div class="nxt1-ca-loading-overlay">
            <div class="nxt1-ca-loading-content">
              <div class="nxt1-ca-loading-spinner"></div>
              <p class="nxt1-ca-loading-title">Launching secure browser…</p>
              <p class="nxt1-ca-loading-sub">
                Sign in to {{ firecrawlPlatformLabel() }} so Agent X can sync your latest stats,
                film, and updates to work for you.
              </p>
              <div class="nxt1-ca-loading-secure">
                <nxt1-icon name="shield-checkmark-outline" [size]="14" />
                <span>Your credentials stay private</span>
              </div>
            </div>
          </div>
        }
        <div class="nxt1-ca-body" [class.nxt1-ca-body--hidden]="firecrawlLoading()">
          <nxt1-onboarding-link-drop-step
            [linkSourcesData]="effectiveLinkSources()"
            [monitorStateByPlatform]="monitorStateByPlatform()"
            [monitorBusyPlatforms]="monitorBusyPlatforms()"
            [selectedSports]="selectedSports()"
            [role]="role()"
            [scope]="scope()"
            [useOAuth]="true"
            (linkSourcesChange)="onLinkSourcesChange($event)"
            (monitorToggleRequest)="onMonitorToggle($event)"
            (saveNow)="onSaveNow()"
            (firecrawlSigninRequest)="onFirecrawlSignin($event)"
            (oauthSigninRequest)="onOAuthSigninRequest($event)"
          />
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .nxt1-ca-web-modal {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      .nxt1-ca-scroll {
        flex: 1;
        overflow-y: auto;
      }

      .nxt1-ca-body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-4, 16px) var(--nxt1-spacing-8, 32px);
      }

      .nxt1-ca-resync-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 32px;
        padding: 0 var(--nxt1-spacing-4, 16px);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-radius-full, 9999px);
        background: transparent;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          border-color 0.15s ease;
        white-space: nowrap;
      }

      .nxt1-ca-resync-btn--active {
        background: var(--nxt1-color-primary, #ccff00);
        border-color: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-ca-resync-btn:hover:not(.nxt1-ca-resync-btn--active) {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #fff);
      }

      .nxt1-ca-resync-btn:hover.nxt1-ca-resync-btn--active {
        opacity: 0.9;
      }

      .nxt1-ca-resync-btn:active {
        transform: scale(0.97);
      }

      .nxt1-ca-resync-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      /* ============================================
         FIRECRAWL LOADING OVERLAY
         ============================================ */
      .nxt1-ca-loading-overlay {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8, 32px);
      }

      .nxt1-ca-loading-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        max-width: 320px;
        text-align: center;
      }

      .nxt1-ca-loading-spinner {
        width: 48px;
        height: 48px;
        border: 3px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-top-color: var(--nxt1-color-primary, #ccff00);
        border-radius: 50%;
        animation: nxt1-ca-spin 0.8s linear infinite;
      }

      @keyframes nxt1-ca-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .nxt1-ca-loading-title {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #fff);
      }

      .nxt1-ca-loading-sub {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        line-height: 1.5;
      }

      .nxt1-ca-loading-secure {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5, 6px);
        margin-top: var(--nxt1-spacing-2, 8px);
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-success, #10b981);
      }

      .nxt1-ca-body--hidden {
        display: none;
      }

      @media (prefers-reduced-motion: reduce) {
        .nxt1-ca-resync-btn {
          transition: none;
        }

        .nxt1-ca-resync-btn:active {
          transform: none;
        }

        .nxt1-ca-loading-spinner {
          animation: none;
          border-top-color: var(--nxt1-color-primary, #ccff00);
        }
      }
    `,
  ],
})
export class ConnectedAccountsWebModalComponent implements OnInit {
  @ViewChild('linkDropStep') private readonly linkDropStep?: OnboardingLinkDropStepComponent;

  readonly role = input<OnboardingUserType | null>(null);
  readonly selectedSports = input<readonly string[]>([]);
  readonly linkSourcesData = input<LinkSourcesFormData | null>(null);
  readonly scope = input<'athlete' | 'team'>('athlete');

  /** NxtOverlayService auto-subscribes to `close` output to dismiss. */
  readonly close = output<ConnectedAccountsModalCloseData>();

  /**
   * Emitted when the user taps Google or Microsoft in sign-in mode (settings context).
   * The parent (settings page) handles the OAuth account-picker popup, calls the backend,
   * then calls `notifyOAuthConnected()` on this component so the UI updates.
   */
  readonly oauthConnectRequest = output<{
    platform: 'google' | 'microsoft';
    scopeType: PlatformScope;
    scopeId?: string;
  }>();

  private readonly logger = inject(NxtLoggingService).child('ConnectedAccountsWebModal');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly toast = inject(NxtToastService);
  private readonly firecrawlSignIn = inject(FirecrawlSignInService);
  /** Injected by the app (via app.config.ts) to handle Google / Microsoft OAuth popups. */
  private readonly oauthHandler = inject(CONNECTED_ACCOUNTS_OAUTH_HANDLER, { optional: true });

  protected readonly testIds = LINK_SOURCES_TEST_IDS;

  private readonly _latestLinkSources = signal<LinkSourcesFormData | null>(null);
  private readonly _hasChanges = signal(false);
  readonly hasChanges = computed(() => this._hasChanges());
  /**
   * Incrementally accumulated sign-in providers disconnected during this session.
   * Updated in onLinkSourcesChange() by diffing incoming state against previous state,
   * so we never need to diff against the original linkSourcesData input.
   */
  private readonly _disconnectedSignInProviders = signal<readonly string[]>([]);
  private readonly _monitorStateByPlatform = signal<Record<string, FirecrawlMonitorSummary>>({});
  private readonly _monitorBusyPlatforms = signal<Record<string, boolean>>({});

  /**
   * Effective link sources: returns the latest child-emitted state if available,
   * falling back to the original input. After a Firecrawl sign-in, we push the
   * new connection into `_latestLinkSources` so the child's effect rebuilds its
   * connected map through the normal data flow — no viewChild needed.
   */
  protected readonly effectiveLinkSources = computed(
    () => this._latestLinkSources() ?? this.linkSourcesData()
  );
  protected readonly monitorStateByPlatform = computed(() => this._monitorStateByPlatform());
  protected readonly monitorBusyPlatforms = computed(() => this._monitorBusyPlatforms());

  /** Expose firecrawl loading state for the template */
  protected readonly firecrawlLoading = this.firecrawlSignIn.loading;
  private readonly _firecrawlLabel = signal<string>('');
  protected readonly firecrawlPlatformLabel = computed(
    () => this._firecrawlLabel() || 'this platform'
  );

  ngOnInit(): void {
    this.breadcrumb.trackStateChange('connected-accounts-modal:opened');
    void this.loadMonitorState();
  }

  onLinkSourcesChange(data: LinkSourcesFormData): void {
    // Detect sign-in disconnections by comparing incoming state against previous state.
    const previous = this._latestLinkSources() ?? this.linkSourcesData();
    const previousSignIns = new Set<string>(
      (previous?.links ?? [])
        .filter((l) => l.connected && l.connectionType === 'signin')
        .map((l) => l.platform)
    );
    const incomingSignIns = new Set<string>(
      data.links.filter((l) => l.connected && l.connectionType === 'signin').map((l) => l.platform)
    );
    const newlyDisconnected = Array.from(previousSignIns).filter((p) => !incomingSignIns.has(p));
    if (newlyDisconnected.length > 0) {
      this._disconnectedSignInProviders.update((prev) => [
        ...new Set([...prev, ...newlyDisconnected]),
      ]);
    }

    this._latestLinkSources.set(data);
    this._hasChanges.set(true);
    this.logger.info('Connected accounts updated', {
      count: data.links.filter((l) => l.connected).length,
    });
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'connected-accounts-modal',
      action: 'link-sources-updated',
    });
    void this.autoEnableMonitorsForNewConnections(previous, data);
    void this.pruneDisconnectedMonitors(data);
  }

  /**
   * Called when a platform is disconnected inside the link-drop step.
   * Immediately closes the modal with the current save data so the
   * change is persisted to the DB without requiring the user to close manually.
   */
  onSaveNow(): void {
    if (!this._hasChanges()) return;
    this.breadcrumb.trackStateChange('connected-accounts-modal:auto-saved-on-disconnect');
    this.onClose();
  }

  protected onClose(): void {
    if (this._hasChanges()) {
      const data = this.buildCloseData();

      // Detect any link-type accounts that were newly added in this session
      const originalConnectedPlatforms = new Set(
        (this.linkSourcesData() ?? { links: [] }).links
          .filter((l) => l.connected)
          .map((l) => l.platform)
      );
      const newLinkSources = data.sources.filter(
        (s) => s.connectionType === 'link' && !originalConnectedPlatforms.has(s.platform)
      );

      if (newLinkSources.length > 0) {
        // Save AND auto-resync for the newly added link accounts
        this.breadcrumb.trackStateChange('connected-accounts-modal:saved-with-resync', {
          count: data.updatedLinks.length,
          newLinkCount: newLinkSources.length,
        });
        this.close.emit({ saved: false, resync: true, ...data, sources: newLinkSources });
        return;
      }

      this.breadcrumb.trackStateChange('connected-accounts-modal:saved', {
        count: data.updatedLinks.length,
      });
      this.close.emit({ saved: true, ...data });
      return;
    }

    this.breadcrumb.trackStateChange('connected-accounts-modal:cancelled');
    this.close.emit({ saved: false });
  }

  protected async onFirecrawlSignin(request: FirecrawlSignInRequest): Promise<void> {
    this.logger.info('Firecrawl sign-in requested from web modal', { platform: request.platform });
    this._firecrawlLabel.set(request.label);
    const success = await this.firecrawlSignIn.launchSignIn(request);
    this._firecrawlLabel.set('');
    if (success) {
      // Push the new connection into the data flowing to the child.
      // This triggers the child's linkSourcesData effect → rebuilds _connectedMap → UI updates.
      const currentData = this._latestLinkSources() ?? this.linkSourcesData();
      const currentLinks = currentData?.links ?? [];
      this._latestLinkSources.set({
        links: [
          ...currentLinks.filter((l) => l.platform !== request.platform),
          {
            platform: request.platform,
            connected: true,
            connectionType: 'signin' as const,
            scopeType: 'global' as const,
          },
        ],
      });
      this._hasChanges.set(true);
      void this.loadMonitorState();
    }
  }

  protected async onMonitorToggle(event: {
    source: {
      platform: string;
      label: string;
    };
    enabled: boolean;
    targetUrl: string;
  }): Promise<void> {
    const existingMonitor = this._monitorStateByPlatform()[event.source.platform] ?? null;
    this.setMonitorBusy(event.source.platform, true);

    try {
      if (event.enabled) {
        const summary = await this.firecrawlSignIn.enableMonitor(
          event.source.platform,
          event.targetUrl,
          existingMonitor
        );
        if (!summary) {
          this.toast.error(`Failed to enable monitoring for ${event.source.label}.`);
          return;
        }

        this._monitorStateByPlatform.update((state) => ({
          ...state,
          [event.source.platform]: summary,
        }));
        this.toast.success(`${event.source.label} monitoring enabled`);
      } else {
        const success = await this.firecrawlSignIn.disableMonitor(event.source.platform);
        if (!success) {
          this.toast.error(`Failed to disable monitoring for ${event.source.label}.`);
          return;
        }

        this._monitorStateByPlatform.update((state) => {
          const next = { ...state };
          delete next[event.source.platform];
          return next;
        });
        this.toast.success(`${event.source.label} monitoring disabled`);
      }
    } finally {
      this.setMonitorBusy(event.source.platform, false);
    }
  }

  private async loadMonitorState(): Promise<void> {
    const monitors = await this.firecrawlSignIn.fetchMonitorSummaries();
    this._monitorStateByPlatform.set(monitors);
  }

  private async pruneDisconnectedMonitors(data: LinkSourcesFormData): Promise<void> {
    const connectedPlatforms = new Set(
      data.links.filter((link) => link.connected).map((link) => link.platform)
    );

    for (const platform of Object.keys(this._monitorStateByPlatform())) {
      if (connectedPlatforms.has(platform)) {
        continue;
      }

      const success = await this.firecrawlSignIn.disableMonitor(platform);
      if (!success) {
        continue;
      }

      this._monitorStateByPlatform.update((state) => {
        const next = { ...state };
        delete next[platform];
        return next;
      });
    }
  }

  private async autoEnableMonitorsForNewConnections(
    previous: LinkSourcesFormData | null | undefined,
    next: LinkSourcesFormData
  ): Promise<void> {
    const previouslyConnected = new Set(
      (previous?.links ?? []).filter((link) => link.connected).map((link) => link.platform)
    );

    const candidates = next.links.filter((link) => {
      if (!link.connected) return false;
      if (previouslyConnected.has(link.platform)) return false;
      if (link.platform === 'google' || link.platform === 'microsoft') return false;
      if (link.platform.startsWith('custom::')) return false;
      return typeof link.url === 'string' && link.url.trim().length > 0;
    });

    for (const link of candidates) {
      const targetUrl = link.url?.trim();
      if (!targetUrl) {
        continue;
      }

      const existingMonitor = this._monitorStateByPlatform()[link.platform] ?? null;
      this.setMonitorBusy(link.platform, true);

      try {
        const summary = await this.firecrawlSignIn.enableMonitor(
          link.platform,
          targetUrl,
          existingMonitor
        );
        if (!summary) {
          this.logger.warn('Connected account saved but monitor auto-enable failed', {
            platform: link.platform,
          });
          continue;
        }

        this._monitorStateByPlatform.update((state) => ({
          ...state,
          [link.platform]: summary,
        }));
      } finally {
        this.setMonitorBusy(link.platform, false);
      }
    }
  }

  private setMonitorBusy(platform: string, busy: boolean): void {
    this._monitorBusyPlatforms.update((state) => {
      const next = { ...state };
      if (busy) {
        next[platform] = true;
      } else {
        delete next[platform];
      }
      return next;
    });
  }

  /**
   * Called when the user taps Google or Microsoft in sign-in mode inside the settings context.
   *
   * When opened via NxtOverlayService (no template parent), uses the injected
   * `CONNECTED_ACCOUNTS_OAUTH_HANDLER` to launch the OAuth popup directly.
   * When rendered in a template, falls back to emitting `oauthConnectRequest`.
   */
  protected async onOAuthSigninRequest(event: {
    platform: 'google' | 'microsoft';
    scopeType: PlatformScope;
    scopeId?: string;
  }): Promise<void> {
    this.logger.info('OAuth sign-in requested from connected-accounts modal', {
      platform: event.platform,
    });

    if (this.oauthHandler) {
      // Overlay context: call the injected OAuth handler directly
      const success = await this.oauthHandler(event.platform);
      if (success) {
        this.linkDropStep?.markSigninConnected(event.platform, event.scopeType, event.scopeId);
        this._hasChanges.set(true);
        // Close the modal — backend already saved the token, toast is shown by the service
        this.close.emit({ saved: false });
      }
    } else {
      // Template context (ConnectedAccountsComponent): delegate to parent via output
      this.oauthConnectRequest.emit(event);
    }
  }

  /**
   * Called by the parent settings page after a successful OAuth flow.
   * Marks the platform as connected in the embedded link-drop step so the UI updates.
   */
  notifyOAuthConnected(
    platform: 'google' | 'microsoft',
    scopeType: PlatformScope,
    scopeId?: string
  ): void {
    this.linkDropStep?.markSigninConnected(platform, scopeType, scopeId);
    this._hasChanges.set(true);
  }

  protected onResync(): void {
    const data = this.buildCloseData();
    this.logger.info('Connected accounts re-sync requested', {
      connectedCount: data.sources.length,
    });
    this.breadcrumb.trackStateChange('connected-accounts-modal:resync-requested');
    this.close.emit(
      data.hasChanges
        ? {
            saved: false,
            resync: true,
            ...data,
          }
        : {
            saved: false,
            resync: true,
            sources: data.sources,
            disconnectedSignInProviders: data.disconnectedSignInProviders,
          }
    );
  }

  private buildCloseData(): {
    readonly hasChanges: boolean;
    readonly updatedLinks: readonly {
      platform: string;
      url: string;
      username?: string;
      scopeType?: string;
      scopeId?: string;
      displayOrder: number;
    }[];
    readonly linkSources?: LinkSourcesFormData;
    readonly sources: readonly {
      platform: string;
      label: string;
      connected: boolean;
      username?: string;
      url?: string;
      connectionType?: string;
    }[];
    readonly disconnectedSignInProviders: readonly string[];
  } {
    const linkSources = this._latestLinkSources() ?? this.linkSourcesData() ?? undefined;
    const connectedLinks = linkSources?.links.filter((link) => link.connected) ?? [];

    // Use the incrementally accumulated set of disconnected sign-in providers.
    const disconnectedSignInProviders = this._disconnectedSignInProviders();

    return {
      hasChanges: this._hasChanges(),
      updatedLinks: connectedLinks.map((link, index) => ({
        platform: link.platform,
        url: link.url ?? link.username ?? '',
        username: link.username,
        scopeType: link.scopeType,
        scopeId: link.scopeId,
        displayOrder: index,
      })),
      linkSources,
      sources: connectedLinks.map((link) => ({
        platform: link.platform,
        label: link.platform,
        connected: link.connected,
        username: link.username,
        url: link.url,
        scopeType: link.scopeType,
        scopeId: link.scopeId,
        connectionType: link.connectionType,
      })),
      disconnectedSignInProviders,
    };
  }
}
