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
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { LINK_SOURCES_TEST_IDS } from '@nxt1/core/testing';
import type { LinkSourcesFormData, OnboardingUserType } from '@nxt1/core/api';
import { OnboardingLinkDropStepComponent } from '../../onboarding/onboarding-link-drop-step';
import { FirecrawlSignInService, type FirecrawlSignInRequest } from './firecrawl-signin.service';

@Component({
  selector: 'nxt1-connected-accounts-sheet',
  standalone: true,
  imports: [NxtSheetHeaderComponent, OnboardingLinkDropStepComponent],
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
        <!-- Shared connected accounts editor (same as onboarding) -->
        <nxt1-onboarding-link-drop-step
          [linkSourcesData]="_linkSourcesData()"
          [selectedSports]="_selectedSports()"
          [role]="_role()"
          [scope]="_scope()"
          (linkSourcesChange)="onLinkSourcesChange($event)"
          (firecrawlSigninRequest)="onFirecrawlSignin($event)"
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

  protected readonly testIds = LINK_SOURCES_TEST_IDS;
  readonly hasChanges = computed(() => this._hasChanges());

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

      this.breadcrumb.trackStateChange('connected-accounts-sheet:saved', {
        count: updatedLinks.length,
      });
      void this.modalCtrl.dismiss({ updatedLinks, linkSources }, 'save');
    } else {
      this.breadcrumb.trackStateChange('connected-accounts-sheet:cancelled');
      void this.modalCtrl.dismiss(null, 'cancel');
    }
  }

  async onFirecrawlSignin(request: FirecrawlSignInRequest): Promise<void> {
    this.logger.info('Firecrawl sign-in requested from sheet', { platform: request.platform });
    const success = await this.firecrawlSignIn.launchSignIn(request);
    if (success) {
      this._hasChanges.set(true);
    }
  }

  requestResync(): void {
    const linkSources = this._latestLinkSources() ?? this._linkSourcesData();
    const connectedLinks = linkSources?.links.filter((l) => l.connected) ?? [];
    this.logger.info('Connected accounts re-sync requested', {
      connectedCount: connectedLinks.length,
    });
    this.breadcrumb.trackStateChange('connected-accounts-sheet:resync-requested');
    void this.modalCtrl.dismiss(
      {
        sources: connectedLinks.map((l) => ({
          platform: l.platform,
          label: l.platform,
          connected: l.connected,
          username: l.username,
          url: l.url,
        })),
      },
      'resync'
    );
  }
}
