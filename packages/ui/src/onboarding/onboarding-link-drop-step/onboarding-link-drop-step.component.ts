/**
 * @fileoverview OnboardingLinkDropStepComponent - Connected Accounts Step
 * @module @nxt1/ui/onboarding
 * @version 2.0.0
 *
 * Onboarding step that lets users connect their social media, film,
 * recruiting, and stats platform links. Platforms are categorized by
 * type and filtered by the user's selected sports.
 *
 * Includes a role-specific "Recommended" section at the top showing
 * the most relevant platforms for the user's role.
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
} from '@nxt1/core/api';
import { getPlatformsForSports, getRecommendedPlatforms } from '@nxt1/core/api';
import type { ILogger } from '@nxt1/core/logging';
import { NxtLoggingService } from '../../services/logging';
import { NxtModalService } from '../../services/modal';
import {
  NxtConnectedSourcesComponent,
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
      @for (group of platformGroups(); track group.key) {
        <nxt1-connected-sources
          [title]="group.label"
          [sources]="group.sources"
          (sourceTap)="onSourceTap($event)"
        />
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

  /** Internal state — tracks connected status per platform */
  private readonly _connectedMap = signal<
    Record<string, { connected: boolean; username?: string; url?: string }>
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

  /** Recommended + categorized platform groups filtered by sport */
  readonly platformGroups = computed((): PlatformGroup[] => {
    const sports = this.selectedSports();
    const role = this.role();
    const connMap = this._connectedMap();
    const result: PlatformGroup[] = [];

    // 1. Recommended section (role-specific)
    if (role) {
      const recommended = getRecommendedPlatforms(role, sports);
      if (recommended.length > 0) {
        result.push({
          key: 'recommended',
          label: 'Recommended',
          sources: recommended.map((p) => this.toConnectedSource(p, connMap[p.platform])),
        });
      }
    }

    // 2. Category sections (excluding recommended platforms to avoid duplicates)
    const recommendedIds = role ? getRecommendedPlatforms(role, sports).map((p) => p.platform) : [];
    const groups = getPlatformsForSports(sports, recommendedIds);

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

      const map: Record<string, { connected: boolean; username?: string; url?: string }> = {};
      for (const link of data.links) {
        if (link.connected) {
          map[link.platform] = {
            connected: true,
            username: link.username,
            url: link.url,
          };
        }
      }
      this._connectedMap.set(map);
    });
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

    this._connectedMap.update((map) => ({
      ...map,
      [source.platform]: {
        connected: !!value,
        username: value && !value.startsWith('http') ? value : undefined,
        url: value || undefined,
      },
    }));

    this.logger.info('Link source updated', { platform: source.platform, connected: !!value });
    this.emitChange();
  }

  private toConnectedSource(
    platform: PlatformDefinition,
    conn?: { connected: boolean; username?: string; url?: string }
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
      username: data.username,
      url: data.url,
    }));

    this.linkSourcesChange.emit({ links });
  }
}
