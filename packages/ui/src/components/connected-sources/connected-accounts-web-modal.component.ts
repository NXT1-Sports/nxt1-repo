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
} from '@angular/core';
import { NxtModalHeaderComponent } from '../overlay/modal-header.component';
import { NxtIconComponent } from '../icon/icon.component';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { LINK_SOURCES_TEST_IDS } from '@nxt1/core/testing';
import type { LinkSourcesFormData, OnboardingUserType } from '@nxt1/core/api';
import { OnboardingLinkDropStepComponent } from '../../onboarding/onboarding-link-drop-step';
import { FirecrawlSignInService, type FirecrawlSignInRequest } from './firecrawl-signin.service';

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
  }[];
}

@Component({
  selector: 'nxt1-connected-accounts-web-modal',
  standalone: true,
  imports: [NxtModalHeaderComponent, NxtIconComponent, OnboardingLinkDropStepComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nxt1-ca-web-modal">
      <nxt1-modal-header
        title="Connected Accounts"
        closePosition="left"
        [showBorder]="true"
        (closeModal)="onClose()"
      >
        <button
          modalHeaderAction
          type="button"
          class="nxt1-ca-resync-btn"
          [attr.data-testid]="testIds.RESYNC_BUTTON"
          (click)="onResync()"
        >
          Re-sync
        </button>
        <button
          modalHeaderAction
          type="button"
          class="nxt1-ca-done-btn"
          [class.nxt1-ca-done-btn--active]="hasChanges()"
          (click)="onDone()"
        >
          Done
        </button>
      </nxt1-modal-header>

      <div class="nxt1-ca-scroll">
        @if (firecrawlLoading()) {
          <div class="nxt1-ca-loading-overlay">
            <div class="nxt1-ca-loading-content">
              <div class="nxt1-ca-loading-spinner"></div>
              <p class="nxt1-ca-loading-title">Launching secure browser…</p>
              <p class="nxt1-ca-loading-sub">
                Setting up a private session for {{ firecrawlPlatformLabel() }}.
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
            [linkSourcesData]="linkSourcesData()"
            [selectedSports]="selectedSports()"
            [role]="role()"
            [scope]="scope()"
            (linkSourcesChange)="onLinkSourcesChange($event)"
            (firecrawlSigninRequest)="onFirecrawlSignin($event)"
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

      .nxt1-ca-done-btn {
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

      .nxt1-ca-done-btn--active {
        background: var(--nxt1-color-primary, #ccff00);
        border-color: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
      }

      .nxt1-ca-done-btn:hover:not(.nxt1-ca-done-btn--active) {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #fff);
      }

      .nxt1-ca-done-btn:hover.nxt1-ca-done-btn--active {
        opacity: 0.9;
      }

      .nxt1-ca-done-btn:active {
        transform: scale(0.97);
      }

      .nxt1-ca-done-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
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
          color 0.15s ease;
        white-space: nowrap;
      }

      .nxt1-ca-resync-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #fff);
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
        .nxt1-ca-done-btn,
        .nxt1-ca-resync-btn {
          transition: none;
        }

        .nxt1-ca-done-btn:active,
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
  readonly role = input<OnboardingUserType | null>(null);
  readonly selectedSports = input<readonly string[]>([]);
  readonly linkSourcesData = input<LinkSourcesFormData | null>(null);
  readonly scope = input<'athlete' | 'team'>('athlete');

  /** NxtOverlayService auto-subscribes to `close` output to dismiss. */
  readonly close = output<ConnectedAccountsModalCloseData>();

  private readonly logger = inject(NxtLoggingService).child('ConnectedAccountsWebModal');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly firecrawlSignIn = inject(FirecrawlSignInService);

  protected readonly testIds = LINK_SOURCES_TEST_IDS;

  private readonly _latestLinkSources = signal<LinkSourcesFormData | null>(null);
  private readonly _hasChanges = signal(false);
  readonly hasChanges = computed(() => this._hasChanges());

  /** Expose firecrawl loading state for the template */
  protected readonly firecrawlLoading = this.firecrawlSignIn.loading;
  private readonly _firecrawlLabel = signal<string>('');
  protected readonly firecrawlPlatformLabel = computed(
    () => this._firecrawlLabel() || 'this platform'
  );

  ngOnInit(): void {
    this.breadcrumb.trackStateChange('connected-accounts-modal:opened');
  }

  onLinkSourcesChange(data: LinkSourcesFormData): void {
    this._latestLinkSources.set(data);
    this._hasChanges.set(true);
    this.logger.info('Connected accounts updated', {
      count: data.links.filter((l) => l.connected).length,
    });
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'connected-accounts-modal',
      action: 'link-sources-updated',
    });
  }

  protected onDone(): void {
    if (this._hasChanges()) {
      const linkSources = this._latestLinkSources();
      const connectedLinks = linkSources?.links.filter((l) => l.connected) ?? [];
      const updatedLinks = connectedLinks.map((l, i) => ({
        platform: l.platform,
        url: l.url ?? l.username ?? '',
        username: l.username,
        scopeType: l.scopeType,
        scopeId: l.scopeId,
        displayOrder: i,
      }));

      this.breadcrumb.trackStateChange('connected-accounts-modal:saved', {
        count: updatedLinks.length,
      });
      this.close.emit({ saved: true, updatedLinks, linkSources: linkSources ?? undefined });
    } else {
      this.logger.info('Connected accounts modal closed (no changes)');
      this.close.emit({ saved: false });
    }
  }

  protected onClose(): void {
    this.breadcrumb.trackStateChange('connected-accounts-modal:cancelled');
    this.close.emit({ saved: false });
  }

  protected async onFirecrawlSignin(request: FirecrawlSignInRequest): Promise<void> {
    this.logger.info('Firecrawl sign-in requested from web modal', { platform: request.platform });
    this._firecrawlLabel.set(request.label);
    const success = await this.firecrawlSignIn.launchSignIn(request);
    this._firecrawlLabel.set('');
    if (success) {
      this._hasChanges.set(true);
    }
  }

  protected onResync(): void {
    const linkSources = this._latestLinkSources() ?? this.linkSourcesData();
    const connectedLinks = linkSources?.links.filter((l) => l.connected) ?? [];
    this.logger.info('Connected accounts re-sync requested', {
      connectedCount: connectedLinks.length,
    });
    this.breadcrumb.trackStateChange('connected-accounts-modal:resync-requested');
    this.close.emit({
      saved: false,
      resync: true,
      sources: connectedLinks.map((l) => ({
        platform: l.platform,
        label: l.platform,
        connected: l.connected,
        username: l.username,
        url: l.url,
      })),
    });
  }
}
