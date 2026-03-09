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
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../bottom-sheet/sheet-header.component';
import { NxtIconComponent } from '../icon';
import { NxtModalService } from '../../services/modal';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { ConnectedSource } from './connected-sources.component';

@Component({
  selector: 'nxt1-connected-accounts-sheet',
  standalone: true,
  imports: [IonContent, NxtSheetHeaderComponent, NxtIconComponent],
  template: `
    <nxt1-sheet-header
      title="Connected Accounts"
      closePosition="right"
      [centerTitle]="true"
      [showBorder]="true"
      (closeSheet)="dismiss()"
    >
      @if (hasChanges()) {
        <button sheetHeaderAction type="button" class="nxt1-sheet-done" (click)="dismiss()">
          Done
        </button>
      }
    </nxt1-sheet-header>

    <ion-content [fullscreen]="true" class="nxt1-sheet-content">
      <div class="nxt1-sheet-body">
        @for (source of sources(); track source.platform) {
          <button type="button" class="nxt1-source-row" (click)="editSource(source)">
            <div class="nxt1-source-left">
              <div class="nxt1-source-icon" [class.nxt1-source-icon--connected]="source.connected">
                <nxt1-icon [name]="source.icon" [size]="18" />
              </div>
              <span class="nxt1-source-label">{{ source.label }}</span>
            </div>
            <div class="nxt1-source-right">
              @if (source.connected) {
                <span class="nxt1-source-value">{{ source.username || 'Connected' }}</span>
                <nxt1-icon name="checkmarkCircle" [size]="16" class="nxt1-source-check" />
              } @else {
                <span class="nxt1-source-placeholder">Connect</span>
                <nxt1-icon name="chevronForward" [size]="14" class="nxt1-source-chevron" />
              }
            </div>
          </button>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
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

      .nxt1-sheet-content {
        --background: transparent;
      }

      .nxt1-sheet-body {
        display: flex;
        flex-direction: column;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4) var(--nxt1-spacing-8);
      }

      /* ============================================
         SOURCE ROW (matches edit-profile list-row)
         ============================================ */
      .nxt1-source-row {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        text-align: left;
        transition: opacity var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-source-row:not(:last-child) {
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .nxt1-source-row:active {
        opacity: 0.7;
      }

      /* ============================================
         LEFT SIDE — Icon + Label
         ============================================ */
      .nxt1-source-left {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        min-width: 0;
      }

      .nxt1-source-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-8);
        height: var(--nxt1-spacing-8);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        flex-shrink: 0;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-source-icon--connected {
        background: color-mix(in srgb, var(--nxt1-color-primary) 15%, transparent);
        color: var(--nxt1-color-primary);
      }

      .nxt1-source-label {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
      }

      /* ============================================
         RIGHT SIDE — Status
         ============================================ */
      .nxt1-source-right {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5);
        min-width: 0;
        justify-content: flex-end;
        flex: 1;
      }

      .nxt1-source-value {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        color: var(--nxt1-color-text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 160px;
        text-align: right;
      }

      .nxt1-source-placeholder {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        color: var(--nxt1-color-text-tertiary);
      }

      .nxt1-source-check {
        color: var(--nxt1-color-success, #22c55e);
        flex-shrink: 0;
      }

      .nxt1-source-chevron {
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
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
  initialSources: readonly ConnectedSource[] = [];

  /** Single source of truth — mutable copy initialized from componentProps */
  private readonly _sources = signal<ConnectedSource[]>([]);
  private readonly _hasChanges = signal(false);

  readonly sources = computed(() => this._sources());
  readonly hasChanges = computed(() => this._hasChanges());

  ngOnInit(): void {
    this._sources.set([...this.initialSources]);
    this.breadcrumb.trackStateChange('connected-accounts-sheet:opened');
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

    this._sources.update((sources) =>
      sources.map((s) =>
        s.platform === source.platform
          ? {
              ...s,
              connected: !!value,
              username: value && !value.startsWith('http') ? value : undefined,
              url: value || undefined,
            }
          : s
      )
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
      const updatedLinks = this._sources()
        .filter((s) => s.connected)
        .map((s, i) => ({
          platform: s.platform,
          url: s.url ?? s.username ?? '',
          username: s.username,
          displayOrder: i,
        }));

      this.breadcrumb.trackStateChange('connected-accounts-sheet:saved', {
        count: updatedLinks.length,
      });
      void this.modalCtrl.dismiss({ updatedLinks, sources: this._sources() }, 'save');
    } else {
      this.breadcrumb.trackStateChange('connected-accounts-sheet:cancelled');
      void this.modalCtrl.dismiss(null, 'cancel');
    }
  }
}
