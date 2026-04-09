/**
 * @fileoverview Live View Launcher — Native side-panel UI for starting live browser sessions.
 * @module @nxt1/ui/agent-x/web
 *
 * Renders inside the Agent X shell's expanded side panel instead of immediately
 * spinning up a Firecrawl container. Users pick a connected account or enter a
 * custom URL, *then* the session begins.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 */

import { Component, ChangeDetectionStrategy, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NxtIconComponent } from '../../components/icon';
import { NxtPlatformIconComponent } from '../../components/platform-icon';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TEST_IDS } from '@nxt1/core/testing';

/**
 * Quick-launch platform card shown in the launcher grid.
 */
export interface LauncherPlatform {
  readonly key: string;
  readonly label: string;
  readonly url: string;
  readonly icon: string;
  readonly faviconUrl?: string;
}

/**
 * Event emitted when the user chooses a destination from the launcher.
 */
export interface LiveViewLaunchEvent {
  /** The URL to open in the Firecrawl live-view session. */
  readonly url: string;
  /** Optional platform key (e.g. 'hudl') for analytics/profile lookup. */
  readonly platformKey?: string;
  /** How the user triggered the launch. */
  readonly source: 'account' | 'custom-url';
}

/** Default platforms shown in the launcher grid. */
const LAUNCHER_PLATFORMS: readonly LauncherPlatform[] = [
  {
    key: 'hudl',
    label: 'Hudl',
    url: 'https://www.hudl.com',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=hudl.com&sz=64',
  },
  {
    key: 'maxpreps',
    label: 'MaxPreps',
    url: 'https://www.maxpreps.com',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=maxpreps.com&sz=64',
  },
  {
    key: 'twitter',
    label: 'X / Twitter',
    url: 'https://x.com',
    icon: 'twitter',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=x.com&sz=64',
  },
  {
    key: '247sports',
    label: '247Sports',
    url: 'https://247sports.com',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=247sports.com&sz=64',
  },
  {
    key: 'rivals',
    label: 'Rivals',
    url: 'https://www.rivals.com',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=rivals.com&sz=64',
  },
  {
    key: 'on3',
    label: 'On3',
    url: 'https://www.on3.com',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=on3.com&sz=64',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    url: 'https://www.instagram.com',
    icon: 'instagram',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=64',
  },
  {
    key: 'ncsa',
    label: 'NCSA',
    url: 'https://www.ncsasports.org',
    icon: 'link',
    faviconUrl: 'https://www.google.com/s2/favicons?domain=ncsasports.org&sz=64',
  },
];

@Component({
  selector: 'nxt1-live-view-launcher',
  standalone: true,
  imports: [FormsModule, NxtIconComponent, NxtPlatformIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="launcher" [attr.data-testid]="testIds.CONTAINER">
      <!-- ── Custom URL Section ── -->
      <section class="launcher__section" [attr.data-testid]="testIds.URL_SECTION">
        <h3 class="launcher__section-title">Browse Any Page</h3>
        <p class="launcher__section-desc">
          Enter a URL and Agent X will open it in a live browser session.
        </p>
        <form class="launcher__url-form" (ngSubmit)="onUrlSubmit()">
          <div class="launcher__url-input-wrap">
            <svg
              class="launcher__url-input-icon"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="url"
              class="launcher__url-input"
              placeholder="https://www.hudl.com/profile/12345"
              [(ngModel)]="customUrl"
              name="customUrl"
              autocomplete="url"
              [attr.data-testid]="testIds.URL_INPUT"
            />
          </div>
          <button
            type="submit"
            class="launcher__url-submit"
            [disabled]="!isValidUrl()"
            [attr.data-testid]="testIds.URL_SUBMIT_BUTTON"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </form>
      </section>

      <!-- ── Connected Accounts Grid ── -->
      <section class="launcher__section" [attr.data-testid]="testIds.ACCOUNTS_SECTION">
        <h3 class="launcher__section-title">Quick Launch</h3>
        <p class="launcher__section-desc">Jump straight into a platform with one tap.</p>
        <div class="launcher__grid">
          @for (platform of platforms; track platform.key) {
            <button
              type="button"
              class="launcher__card"
              (click)="onAccountSelect(platform)"
              [attr.data-testid]="testIds.ACCOUNT_CARD"
              [attr.data-platform]="platform.key"
            >
              <div class="launcher__card-icon">
                @if (platform.faviconUrl) {
                  <img
                    [src]="platform.faviconUrl"
                    [alt]="platform.label"
                    class="launcher__card-favicon"
                    width="24"
                    height="24"
                  />
                } @else {
                  <nxt1-icon [name]="platform.icon" [size]="22"></nxt1-icon>
                }
              </div>
              <span class="launcher__card-label">{{ platform.label }}</span>
            </button>
          }
        </div>
      </section>

      <!-- ── Tip / Hint ── -->
      <div class="launcher__tip">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>Agent X can also open live views automatically during conversations.</span>
      </div>
    </div>
  `,
  styles: `
    .launcher {
      display: flex;
      flex-direction: column;
      gap: var(--nxt1-spacing-5, 20px);
      padding: var(--nxt1-spacing-5, 20px);
      height: 100%;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    .launcher__section {
      display: flex;
      flex-direction: column;
      gap: var(--nxt1-spacing-2, 8px);
    }

    .launcher__section-title {
      font-size: 0.8125rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--agent-text-primary, #e2e8f0);
      margin: 0;
    }

    .launcher__section-desc {
      font-size: 0.8125rem;
      color: var(--agent-text-muted, #94a3b8);
      margin: 0 0 var(--nxt1-spacing-2, 8px);
      line-height: 1.4;
    }

    /* ── Custom URL Form ── */

    .launcher__url-form {
      display: flex;
      gap: var(--nxt1-spacing-2, 8px);
    }

    .launcher__url-input-wrap {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }

    .launcher__url-input-icon {
      position: absolute;
      left: 12px;
      color: var(--agent-text-muted, #94a3b8);
      pointer-events: none;
    }

    .launcher__url-input {
      width: 100%;
      padding: 10px 12px 10px 36px;
      font-size: 0.875rem;
      font-family: inherit;
      color: var(--agent-text-primary, #e2e8f0);
      background: var(--agent-surface, #1e293b);
      border: 1px solid var(--agent-border, #334155);
      border-radius: 10px;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .launcher__url-input::placeholder {
      color: var(--agent-text-muted, #64748b);
    }

    .launcher__url-input:focus {
      border-color: var(--nxt1-primary, #6366f1);
    }

    .launcher__url-submit {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      min-width: 40px;
      height: 40px;
      border: none;
      border-radius: 10px;
      background: var(--nxt1-primary, #6366f1);
      color: #fff;
      cursor: pointer;
      transition:
        opacity 0.15s ease,
        transform 0.1s ease;
    }

    .launcher__url-submit:hover:not(:disabled) {
      opacity: 0.9;
    }

    .launcher__url-submit:active:not(:disabled) {
      transform: scale(0.95);
    }

    .launcher__url-submit:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    /* ── Platform Grid ── */

    .launcher__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: var(--nxt1-spacing-2, 8px);
    }

    .launcher__card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--nxt1-spacing-2, 8px);
      padding: var(--nxt1-spacing-3, 12px) var(--nxt1-spacing-2, 8px);
      background: var(--agent-surface, #1e293b);
      border: 1px solid var(--agent-border, #334155);
      border-radius: 12px;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background-color 0.15s ease,
        transform 0.1s ease;
      color: var(--agent-text-primary, #e2e8f0);
      font-family: inherit;
    }

    .launcher__card:hover {
      border-color: var(--nxt1-primary, #6366f1);
      background: color-mix(
        in srgb,
        var(--nxt1-primary, #6366f1) 8%,
        var(--agent-surface, #1e293b)
      );
    }

    .launcher__card:active {
      transform: scale(0.97);
    }

    .launcher__card-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--agent-text-muted, #94a3b8) 10%, transparent);
    }

    .launcher__card-favicon {
      border-radius: 6px;
      object-fit: contain;
    }

    .launcher__card-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-align: center;
      line-height: 1.2;
      word-break: break-word;
    }

    /* ── Tip Banner ── */

    .launcher__tip {
      display: flex;
      align-items: center;
      gap: var(--nxt1-spacing-2, 8px);
      padding: var(--nxt1-spacing-3, 12px);
      font-size: 0.75rem;
      color: var(--agent-text-muted, #94a3b8);
      background: color-mix(in srgb, var(--agent-text-muted, #94a3b8) 6%, transparent);
      border-radius: 10px;
      line-height: 1.4;
      margin-top: auto;
    }

    .launcher__tip svg {
      flex-shrink: 0;
    }
  `,
})
export class LiveViewLauncherComponent {
  // ── Observability ──
  private readonly logger = inject(NxtLoggingService).child('LiveViewLauncher');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly haptics = inject(HapticsService);

  // ── Test IDs ──
  protected readonly testIds = TEST_IDS.LIVE_VIEW_LAUNCHER;

  // ── Outputs ──
  /** Emitted when the user commits to a destination (account or custom URL). */
  readonly launch = output<LiveViewLaunchEvent>();

  // ── State ──
  protected customUrl = '';
  protected readonly platforms = LAUNCHER_PLATFORMS;

  /** Simple URL validation — must start with http(s):// */
  protected isValidUrl(): boolean {
    const url = this.customUrl.trim();
    return url.length > 0 && /^https?:\/\/.+\..+/.test(url);
  }

  constructor() {
    this.logger.info('Launcher opened');
    this.breadcrumb.trackStateChange('live-view-launcher-opened');
    this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_LAUNCHER_OPENED);
  }

  /** User tapped a platform card. */
  protected async onAccountSelect(platform: LauncherPlatform): Promise<void> {
    await this.haptics.impact('light');
    this.logger.info('Account selected', { platform: platform.key });
    this.breadcrumb.trackStateChange('live-view-account-selected', { platformKey: platform.key });
    this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_LAUNCHER_ACCOUNT_SELECTED, {
      platformKey: platform.key,
    });

    this.launch.emit({
      url: platform.url,
      platformKey: platform.key,
      source: 'account',
    });
  }

  /** User submitted a custom URL. */
  protected async onUrlSubmit(): Promise<void> {
    const url = this.customUrl.trim();
    if (!url || !this.isValidUrl()) return;

    await this.haptics.impact('light');
    this.logger.info('Custom URL submitted', { url });
    this.breadcrumb.trackStateChange('live-view-url-submitted');
    this.analytics?.trackEvent(APP_EVENTS.LIVE_VIEW_LAUNCHER_URL_SUBMITTED);

    this.launch.emit({
      url,
      source: 'custom-url',
    });
  }
}
