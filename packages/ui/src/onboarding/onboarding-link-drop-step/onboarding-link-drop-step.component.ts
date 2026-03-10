/**
 * @fileoverview OnboardingLinkDropStepComponent - Connected Accounts Step
 * @module @nxt1/ui/onboarding
 * @version 3.0.0
 *
 * Onboarding step that lets users connect their accounts via two modes:
 *   - **Linked** — Paste a URL or username (MaxPreps, Hudl, Instagram, etc.)
 *   - **Signed In** — OAuth sign-in (Google, Microsoft, Yahoo)
 *
 * A segmented toggle at the top switches between the two modes.
 * Platforms are categorized by type and filtered by the user's selected sports.
 * Each mode shows a role-specific "Recommended" section at the top.
 *
 * Uses the shared NxtConnectedSourcesComponent for display and
 * NxtModalService for input prompts.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
  inject,
} from '@angular/core';
import type {
  LinkSourcesFormData,
  LinkSourceEntry,
  OnboardingUserType,
  PlatformDefinition,
  PlatformCategory,
  PlatformConnectionType,
} from '@nxt1/core/api';
import { getPlatformsForSports, getRecommendedPlatforms } from '@nxt1/core/api';
import type { ILogger } from '@nxt1/core/logging';
import { NxtLoggingService } from '../../services/logging';
import { NxtModalService } from '../../services/modal';
import {
  NxtConnectedSourcesComponent,
  type ConnectionMode,
  type ConnectedSource,
  type ConnectedSourceTapEvent,
} from '../../components/connected-sources';

// ============================================
// TYPES
// ============================================

/** A display group (recommended or categorized) */
interface PlatformGroup {
  readonly key: string;
  readonly label: string;
  readonly sources: ConnectedSource[];
}

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-link-drop-step',
  standalone: true,
  imports: [NxtConnectedSourcesComponent],
  template: `
    <div class="nxt1-link-drop-step">
      <!-- Mode toggle: Linked / Signed In -->
      <div class="nxt1-mode-toggle">
        <button
          type="button"
          class="nxt1-mode-btn"
          [class.nxt1-mode-btn--active]="activeMode() === 'link'"
          (click)="setMode('link')"
        >
          Linked
        </button>
        <button
          type="button"
          class="nxt1-mode-btn"
          [class.nxt1-mode-btn--active]="activeMode() === 'signin'"
          (click)="setMode('signin')"
        >
          Signed In
        </button>
      </div>

      <!-- Platform groups for active mode -->
      @for (group of platformGroups(); track group.key) {
        <nxt1-connected-sources
          [title]="group.label"
          [sources]="group.sources"
          (sourceTap)="onSourceTap($event)"
        />
      }

      @if (platformGroups().length === 0) {
        <div class="nxt1-empty-mode">
          <p class="nxt1-empty-mode-text">
            @if (activeMode() === 'signin') {
              No sign-in accounts available yet.
            } @else {
              No link accounts available for your sports.
            }
          </p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .nxt1-link-drop-step {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-6, 24px);
      }

      /* ============================================
         MODE TOGGLE (segmented control)
         ============================================ */
      .nxt1-mode-toggle {
        display: flex;
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-200);
        padding: var(--nxt1-spacing-0-5);
      }

      .nxt1-mode-btn {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        background: transparent;
        flex: 1;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-tertiary);
        border-radius: var(--nxt1-borderRadius-md);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-mode-btn--active {
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }

      /* ============================================
         EMPTY MODE STATE
         ============================================ */
      .nxt1-empty-mode {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-4);
      }

      .nxt1-empty-mode-text {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-tertiary);
        text-align: center;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingLinkDropStepComponent {
  private readonly logger: ILogger = inject(NxtLoggingService).child('OnboardingLinkDropStep');
  private readonly nxtModal = inject(NxtModalService);

  /** Existing link sources data (for restoring state) */
  readonly linkSourcesData = input<LinkSourcesFormData | null>(null);

  /** User's selected sports (display names, e.g. ["Football", "Basketball Mens"]) */
  readonly selectedSports = input<readonly string[]>([]);

  /** User's onboarding role (determines recommended platforms) */
  readonly role = input<OnboardingUserType | null>(null);

  /** Whether the step is disabled */
  readonly disabled = input(false);

  /** Emitted when the user connects/disconnects a source */
  readonly linkSourcesChange = output<LinkSourcesFormData>();

  /** Current active toggle mode: 'link' (Linked) or 'signin' (Signed In) */
  readonly activeMode = signal<ConnectionMode>('link');

  /** Internal state — tracks connected status per platform */
  private readonly _connectedMap = signal<
    Record<
      string,
      {
        connected: boolean;
        connectionType?: PlatformConnectionType;
        username?: string;
        url?: string;
      }
    >
  >({});

  /** All platform definitions (for placeholder lookup) */
  private readonly _allPlatformsMap = computed((): Map<string, PlatformDefinition> => {
    const sports = this.selectedSports();
    const role = this.role();
    const recommended = role ? getRecommendedPlatforms(role, sports) : [];
    const groups = getPlatformsForSports(sports);
    const map = new Map<string, PlatformDefinition>();
    for (const p of recommended) map.set(p.platform, p);
    for (const g of groups) {
      for (const p of g.platforms) map.set(p.platform, p);
    }
    return map;
  });

  /** Recommended + categorized platform groups filtered by sport AND active mode */
  readonly platformGroups = computed((): PlatformGroup[] => {
    const sports = this.selectedSports();
    const role = this.role();
    const connMap = this._connectedMap();
    const mode = this.activeMode();
    const result: PlatformGroup[] = [];

    // 1. Recommended section (role-specific, filtered by mode)
    if (role) {
      const recommended = getRecommendedPlatforms(role, sports, mode);
      if (recommended.length > 0) {
        result.push({
          key: 'recommended',
          label: 'Recommended',
          sources: recommended.map((p) => this.toConnectedSource(p, connMap[p.platform])),
        });
      }
    }

    // 2. Category sections (excluding recommended platforms, filtered by mode)
    const recommendedIds = role
      ? getRecommendedPlatforms(role, sports, mode).map((p) => p.platform)
      : [];
    const groups = getPlatformsForSports(sports, recommendedIds, mode);

    for (const g of groups) {
      result.push({
        key: g.category,
        label: g.label,
        sources: g.platforms.map((p) => this.toConnectedSource(p, connMap[p.platform])),
      });
    }

    return result;
  });

  constructor() {
    // Sync incoming data to internal state
    effect(() => {
      const data = this.linkSourcesData();
      if (!data?.links?.length) return;

      const map: Record<
        string,
        {
          connected: boolean;
          connectionType?: PlatformConnectionType;
          username?: string;
          url?: string;
        }
      > = {};
      for (const link of data.links) {
        if (link.connected) {
          map[link.platform] = {
            connected: true,
            connectionType: link.connectionType,
            username: link.username,
            url: link.url,
          };
        }
      }
      this._connectedMap.set(map);
    });
  }

  setMode(mode: ConnectionMode): void {
    this.activeMode.set(mode);
    this.logger.info('Connection mode switched', { mode });
  }

  async onSourceTap(event: ConnectedSourceTapEvent): Promise<void> {
    if (this.disabled()) return;

    const { source } = event;
    const platformDef = this._allPlatformsMap().get(source.platform);
    const placeholder = platformDef?.placeholder ?? '@username';
    const isSignIn = source.connectionType === 'signin';
    const isUrl = placeholder.toLowerCase().includes('url');

    // Clear modal title and message based on connection type
    const title = isSignIn ? `Sign in to ${source.label}` : `Link ${source.label}`;
    const message = isSignIn
      ? `Enter your ${source.label} credentials to connect your account.`
      : isUrl
        ? `Paste your ${source.label} profile URL to link your account.`
        : `Enter your ${source.label} username to link your account.`;

    const result = await this.nxtModal.prompt({
      title,
      message,
      placeholder,
      defaultValue: source.url ?? source.username ?? '',
      submitText: isSignIn ? 'Sign In' : 'Done',
      preferNative: 'ionic',
    });

    if (!result.confirmed) return;

    const value = result.value.trim();
    const mode = this.activeMode();

    this._connectedMap.update((map) => ({
      ...map,
      [source.platform]: {
        connected: !!value,
        connectionType: mode,
        username: value && !value.startsWith('http') ? value : undefined,
        url: value || undefined,
      },
    }));

    this.logger.info('Link source updated', {
      platform: source.platform,
      connected: !!value,
      mode,
    });
    this.emitChange();
  }

  private toConnectedSource(
    platform: PlatformDefinition,
    conn?: {
      connected: boolean;
      connectionType?: PlatformConnectionType;
      username?: string;
      url?: string;
    }
  ): ConnectedSource {
    return {
      platform: platform.platform,
      label: platform.label,
      icon: platform.icon as ConnectedSource['icon'],
      connectionType: platform.connectionType,
      connected: conn?.connected ?? false,
      username: conn?.username,
      url: conn?.url,
    };
  }

  private emitChange(): void {
    const connMap = this._connectedMap();
    const links: LinkSourceEntry[] = Object.entries(connMap).map(([platform, data]) => ({
      platform,
      connected: data.connected,
      connectionType: data.connectionType,
      username: data.username,
      url: data.url,
    }));

    this.linkSourcesChange.emit({ links });
  }
}
