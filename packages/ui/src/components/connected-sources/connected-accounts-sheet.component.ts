/**
 * @fileoverview Connected Accounts Sheet Component
 * @module @nxt1/ui/components/connected-sources
 * @version 2.0.0
 *
 * Content component rendered inside a bottom sheet via NxtBottomSheetService.openSheet().
 * Embeds the shared OnboardingLinkDropStepComponent so the connected accounts UI
 * is identical in both onboarding and settings.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../bottom-sheet/sheet-header.component';
import { NxtIconComponent } from '../icon/icon.component';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { LINK_SOURCES_TEST_IDS } from '@nxt1/core/testing';
import type { LinkSourcesFormData, OnboardingUserType } from '@nxt1/core/api';
import { OnboardingLinkDropStepComponent } from '../../onboarding/onboarding-link-drop-step';
import { FirecrawlSignInService, type FirecrawlSignInRequest } from './firecrawl-signin.service';
import { CONNECTED_ACCOUNTS_OAUTH_HANDLER } from './connected-accounts-modal.service';

@Component({
  selector: 'nxt1-connected-accounts-sheet',
  standalone: true,
  imports: [NxtSheetHeaderComponent, OnboardingLinkDropStepComponent, NxtIconComponent],
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
        [class.nxt1-sheet-resync--active]="hasChanges()"
        [attr.data-testid]="testIds.RESYNC_BUTTON"
        (click)="requestResync()"
      >
        Re-sync
      </button>
    </nxt1-sheet-header>

    <div class="nxt1-sheet-scroll">
      @if (firecrawlLoading()) {
        <div class="nxt1-sheet-loading-overlay">
          <div class="nxt1-sheet-loading-content">
            <div class="nxt1-sheet-loading-spinner"></div>
            <p class="nxt1-sheet-loading-title">Launching secure browser…</p>
            <p class="nxt1-sheet-loading-sub">
              Sign in to {{ firecrawlPlatformLabel() }} so Agent X can sync your latest stats, film,
              and updates to work for you.
            </p>
            <div class="nxt1-sheet-loading-secure">
              <nxt1-icon name="shield-checkmark-outline" [size]="14" />
              <span>Your credentials stay private</span>
            </div>
          </div>
        </div>
      }
      <div class="nxt1-sheet-body" [class.nxt1-sheet-body--hidden]="firecrawlLoading()">
        <!-- Shared connected accounts editor (same as onboarding) -->
        <nxt1-onboarding-link-drop-step
          [linkSourcesData]="effectiveLinkSources()"
          [selectedSports]="_selectedSports()"
          [role]="_role()"
          [scope]="_scope()"
          [useOAuth]="true"
          (linkSourcesChange)="onLinkSourcesChange($event)"
          (firecrawlSigninRequest)="onFirecrawlSignin($event)"
          (oauthSigninRequest)="onOAuthSigninRequest($event)"
        />
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
        transition: color 0.15s ease;
      }

      .nxt1-sheet-resync--active {
        color: var(--nxt1-color-primary);
      }

      .nxt1-sheet-scroll {
        flex: 1;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        position: relative;
      }

      .nxt1-sheet-body {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4) var(--nxt1-spacing-8);
      }

      .nxt1-sheet-body--hidden {
        display: none;
      }

      /* ───── Firecrawl Loading Overlay ───── */

      .nxt1-sheet-loading-overlay {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-12, 48px) var(--nxt1-spacing-4, 16px);
      }

      .nxt1-sheet-loading-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
      }

      .nxt1-sheet-loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-top-color: var(--nxt1-color-primary, #ccff00);
        border-radius: 50%;
        animation: nxt1-sheet-spin 0.8s linear infinite;
      }

      @keyframes nxt1-sheet-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .nxt1-sheet-loading-title {
        font-size: 15px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #fff);
        text-align: center;
        margin: 0;
      }

      .nxt1-sheet-loading-sub {
        font-size: 13px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        text-align: center;
        margin: 0;
      }

      .nxt1-sheet-loading-secure {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: var(--nxt1-spacing-2, 8px);
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
      }

      .nxt1-sheet-loading-secure nxt1-icon {
        color: var(--nxt1-color-success, #10b981);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectedAccountsSheetComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);
  private readonly logger = inject(NxtLoggingService).child('ConnectedAccountsSheet');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly firecrawlSignIn = inject(FirecrawlSignInService);
  private readonly oauthHandler = inject(CONNECTED_ACCOUNTS_OAUTH_HANDLER, { optional: true });

  /** User role — passed through to link drop step for role-aware recommendations */
  readonly _role = input<OnboardingUserType | null>(null);

  /** Selected sports — passed through for sport-scoped platform filtering */
  readonly _selectedSports = input<readonly string[]>([]);

  /** Existing link sources data — pre-populates the link drop step */
  readonly _linkSourcesData = input<LinkSourcesFormData | null>(null);

  /** Scope — 'athlete' or 'team' */
  readonly _scope = input<'athlete' | 'team'>('athlete');

  /** Tracks the latest link sources from the embedded step */
  private readonly _latestLinkSources = signal<LinkSourcesFormData | null>(null);
  private readonly _hasChanges = signal(false);
  private readonly _firecrawlLabel = signal<string>('');

  protected readonly testIds = LINK_SOURCES_TEST_IDS;
  readonly hasChanges = computed(() => this._hasChanges());

  /**
   * Effective link sources: returns the latest child-emitted state if available,
   * falling back to the original input. After a Firecrawl sign-in, we push the
   * new connection into `_latestLinkSources` so the child's effect rebuilds its
   * connected map through the normal data flow.
   */
  protected readonly effectiveLinkSources = computed(
    () => this._latestLinkSources() ?? this._linkSourcesData()
  );

  protected readonly firecrawlLoading = this.firecrawlSignIn.loading;
  protected readonly firecrawlPlatformLabel = computed(
    () => this._firecrawlLabel() || 'this platform'
  );

  ngOnInit(): void {
    this.breadcrumb.trackStateChange('connected-accounts-sheet:opened');
  }

  onLinkSourcesChange(data: LinkSourcesFormData): void {
    this._latestLinkSources.set(data);
    this._hasChanges.set(true);
    this.logger.info('Connected accounts updated', {
      count: data.links.filter((l) => l.connected).length,
    });
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'connected-accounts-sheet',
      action: 'link-sources-updated',
    });
  }

  dismiss(): void {
    if (this._hasChanges()) {
      const data = this.buildCloseData();

      this.breadcrumb.trackStateChange('connected-accounts-sheet:saved', {
        count: data.updatedLinks.length,
      });
      void this.modalCtrl.dismiss(data, 'save');
    } else {
      this.breadcrumb.trackStateChange('connected-accounts-sheet:cancelled');
      void this.modalCtrl.dismiss(null, 'cancel');
    }
  }

  async onFirecrawlSignin(request: FirecrawlSignInRequest): Promise<void> {
    this.logger.info('Firecrawl sign-in requested from sheet', { platform: request.platform });
    this._firecrawlLabel.set(request.label);
    const success = await this.firecrawlSignIn.launchSignIn(request);
    this._firecrawlLabel.set('');
    if (success) {
      // Push the new connection into the data flowing to the child.
      // This triggers the child's linkSourcesData effect → rebuilds _connectedMap → UI updates.
      const currentData = this._latestLinkSources() ?? this._linkSourcesData();
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
    }
  }

  async onOAuthSigninRequest(event: {
    platform: 'google' | 'microsoft';
    scopeType: string;
    scopeId?: string;
  }): Promise<void> {
    this.logger.info('OAuth connect requested from sheet', { platform: event.platform });
    if (!this.oauthHandler) {
      this.logger.warn('No CONNECTED_ACCOUNTS_OAUTH_HANDLER provided — cannot launch OAuth');
      return;
    }
    const success = await this.oauthHandler(event.platform);
    if (success) {
      this._hasChanges.set(true);
      // Dismiss the sheet — backend already saved the token, toast shown by the service
      void this.modalCtrl.dismiss(null, 'oauth-connected');
    }
  }

  requestResync(): void {
    const data = this.buildCloseData();
    this.logger.info('Connected accounts re-sync requested', {
      connectedCount: data.sources.length,
    });
    this.breadcrumb.trackStateChange('connected-accounts-sheet:resync-requested');
    void this.modalCtrl.dismiss(data, 'resync');
  }

  private buildCloseData(): {
    readonly sources: readonly {
      platform: string;
      label: string;
      connected: boolean;
      username?: string;
      url?: string;
    }[];
    readonly updatedLinks: readonly {
      platform: string;
      url: string;
      username?: string;
      scopeType?: string;
      scopeId?: string;
      displayOrder: number;
    }[];
    readonly linkSources?: LinkSourcesFormData;
  } {
    const linkSources = this._latestLinkSources() ?? this._linkSourcesData() ?? undefined;
    const connectedLinks = linkSources?.links.filter((link) => link.connected) ?? [];

    return {
      sources: connectedLinks.map((link) => ({
        platform: link.platform,
        label: link.platform,
        connected: link.connected,
        username: link.username,
        url: link.url,
      })),
      updatedLinks: connectedLinks.map((link, index) => ({
        platform: link.platform,
        url: link.url ?? link.username ?? '',
        username: link.username,
        scopeType: link.scopeType,
        scopeId: link.scopeId,
        displayOrder: index,
      })),
      linkSources,
    };
  }
}
