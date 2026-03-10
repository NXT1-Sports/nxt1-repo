/**
 * @fileoverview OnboardingLinkDropStepComponent - Connected Accounts Step
 * @module @nxt1/ui/onboarding
 * @version 5.0.0
 *
 * Onboarding step that lets users connect their accounts via two modes:
 *   - **Linked** — Paste a URL or username (MaxPreps, Hudl, Instagram, etc.)
 *   - **Signed In** — OAuth sign-in (Google, Microsoft, Yahoo)
 *
 * **Scoped architecture:**
 *   - **Global platforms** (social, sign-in) always appear.
 *   - **Sport-scoped platforms** (film, stats, recruiting) are filtered via
 *     a sport picker when the user has 2+ sports.
 *
 * Layout:
 *   1. Mode toggle: Linked / Signed In
 *   2. Sport filter: pill-style selector (only when 2+ sports, link mode)
 *   3. Flat list of platform groups (Recommended + Platforms)
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
  PlatformConnectionType,
  PlatformScope,
} from '@nxt1/core/api';
import {
  PLATFORM_REGISTRY,
  PLATFORM_CATEGORIES,
  getPlatformsForSports,
  getRecommendedPlatforms,
} from '@nxt1/core/api';
import type { ILogger } from '@nxt1/core/logging';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtLoggingService } from '../../services/logging';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb';
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

/** A display group (recommended, or all remaining) */
interface PlatformGroup {
  readonly key: string;
  readonly label: string;
  readonly sources: ConnectedSource[];
}

/** Internal connected-account state keyed by "platform" or "platform::scopeId" */
interface ConnectedState {
  connected: boolean;
  connectionType?: PlatformConnectionType;
  scopeType?: PlatformScope;
  scopeId?: string;
  username?: string;
  url?: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Build a composite key for the connected-map.
 * Global platforms use just the platform name.
 * Sport/team-scoped platforms include the scope ID.
 */
function connKey(platform: string, scopeType?: PlatformScope, scopeId?: string): string {
  if (scopeType === 'sport' || scopeType === 'team') {
    return scopeId ? `${platform}::${scopeId}` : platform;
  }
  return platform;
}

/** Normalize sport display name → base key for platform matching */
function sportNameToKey(sportName: string): string {
  return sportName
    .toLowerCase()
    .replace(/\s*(mens|womens)$/i, '')
    .trim()
    .replace(/\s*&\s*/g, '_')
    .replace(/\s+/g, '_');
}

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-onboarding-link-drop-step',
  standalone: true,
  imports: [NxtConnectedSourcesComponent],
  template: `
    <div class="nxt1-link-drop-step" [attr.data-testid]="testIds.CONTAINER">
      <!-- Mode toggle: Linked / Signed In -->
      <div class="nxt1-mode-toggle" [attr.data-testid]="testIds.MODE_TOGGLE">
        <button
          type="button"
          class="nxt1-mode-btn"
          [class.nxt1-mode-btn--active]="activeMode() === 'link'"
          [attr.data-testid]="testIds.MODE_LINK_BTN"
          (click)="setMode('link')"
        >
          Linked
        </button>
        <button
          type="button"
          class="nxt1-mode-btn"
          [class.nxt1-mode-btn--active]="activeMode() === 'signin'"
          [attr.data-testid]="testIds.MODE_SIGNIN_BTN"
          (click)="setMode('signin')"
        >
          Signed In
        </button>
      </div>

      <!-- Sport filter: only when 2+ sports and link mode -->
      @if (showSportFilter()) {
        <div class="nxt1-sport-filter" [attr.data-testid]="testIds.SPORT_FILTER">
          @for (sport of selectedSports(); track sport) {
            <button
              type="button"
              class="nxt1-sport-pill"
              [class.nxt1-sport-pill--active]="activeSport() === sport"
              [attr.data-testid]="testIds.SPORT_PILL"
              (click)="setSport(sport)"
            >
              {{ sport }}
            </button>
          }
        </div>
      }

      <!-- Platform groups with accordion -->
      @for (group of platformGroups(); track group.key) {
        <nxt1-connected-sources
          [title]="group.label"
          [sources]="group.sources"
          [collapsible]="!group.key.startsWith('recommended')"
          [initialExpanded]="group.key.startsWith('recommended')"
          [attr.data-testid]="testIds.GROUP"
          (sourceTap)="onSourceTap($event)"
        />
      }

      @if (platformGroups().length === 0) {
        <div class="nxt1-empty-mode" [attr.data-testid]="testIds.EMPTY_STATE">
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
         SPORT FILTER (pill selector)
         ============================================ */
      .nxt1-sport-filter {
        display: flex;
        gap: var(--nxt1-spacing-2, 8px);
        flex-wrap: wrap;
      }

      .nxt1-sport-pill {
        appearance: none;
        -webkit-appearance: none;
        border: 1px solid var(--nxt1-color-border-subtle);
        background: transparent;
        padding: var(--nxt1-spacing-1-5, 6px) var(--nxt1-spacing-3, 12px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-sport-pill--active {
        background: var(--nxt1-color-text-primary);
        color: var(--nxt1-color-surface-100);
        border-color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
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
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly nxtModal = inject(NxtModalService);

  /** Test IDs for interactive elements */
  protected readonly testIds = TEST_IDS.LINK_SOURCES;

  // ---- Inputs ----
  readonly linkSourcesData = input<LinkSourcesFormData | null>(null);
  readonly selectedSports = input<readonly string[]>([]);
  readonly role = input<OnboardingUserType | null>(null);
  readonly disabled = input(false);

  // ---- Outputs ----
  readonly linkSourcesChange = output<LinkSourcesFormData>();

  // ---- State ----
  readonly activeMode = signal<ConnectionMode>('link');

  /** Currently selected sport for scoped platforms. Defaults to first sport. */
  readonly activeSport = signal<string | null>(null);

  /** Internal state — keyed by connKey(platform, scopeType, scopeId) */
  private readonly _connectedMap = signal<Record<string, ConnectedState>>({});

  /** Platform lookup map */
  private readonly _platformMap = computed((): Map<string, PlatformDefinition> => {
    const map = new Map<string, PlatformDefinition>();
    for (const p of PLATFORM_REGISTRY) map.set(p.platform, p);
    return map;
  });

  /** Show sport filter when 2+ sports and in link mode */
  protected readonly showSportFilter = computed(() => {
    return this.selectedSports().length >= 2 && this.activeMode() === 'link';
  });

  /** Currently active sport key (resolved from signal or first sport) */
  private readonly _activeSportKey = computed((): string | null => {
    const sports = this.selectedSports();
    if (sports.length === 0) return null;
    const active = this.activeSport();
    // Use active or default to first
    const sportName = active && sports.includes(active) ? active : sports[0];
    return sportNameToKey(sportName);
  });

  /** Active sport display name — for when we need the actual display name */
  private readonly _activeSportName = computed((): string | null => {
    const sports = this.selectedSports();
    if (sports.length === 0) return null;
    const active = this.activeSport();
    return active && sports.includes(active) ? active : sports[0];
  });

  /**
   * Build flat platform groups: global + scoped platforms for the selected sport.
   * Returns the same flat shape as v3, with scope context embedded in each source.
   */
  readonly platformGroups = computed((): PlatformGroup[] => {
    const sports = this.selectedSports();
    const role = this.role();
    const connMap = this._connectedMap();
    const mode = this.activeMode();
    const sportKey = this._activeSportKey();
    const sportName = this._activeSportName();
    const groups: PlatformGroup[] = [];

    // ---- 1. Collect all platforms for this view ----
    const globalPlatforms = PLATFORM_REGISTRY.filter(
      (p) => p.scope === 'global' && p.connectionType === mode
    );

    let sportPlatforms: PlatformDefinition[] = [];
    if (mode === 'link' && sportKey) {
      sportPlatforms = PLATFORM_REGISTRY.filter((p) => {
        if (p.scope !== 'sport') return false;
        if (p.connectionType !== 'link') return false;
        if (p.sports.length === 0) return true;
        return p.sports.some((ps) => sportKey.startsWith(ps) || ps.startsWith(sportKey));
      });
    }

    const allPlatforms = [...globalPlatforms, ...sportPlatforms];
    if (allPlatforms.length === 0) return groups;

    // ---- 2. Recommended group ----
    const allIds = new Set(allPlatforms.map((p) => p.platform));
    if (role) {
      const sportList = sportName ? [sportName] : sports.length === 1 ? [sports[0]] : [];
      const recommended = getRecommendedPlatforms(role, sportList, mode);
      const filteredRecommended = recommended.filter((p) => allIds.has(p.platform));

      if (filteredRecommended.length > 0) {
        groups.push({
          key: `recommended-${mode}-${sportKey ?? 'global'}`,
          label: 'Recommended',
          sources: filteredRecommended.map((p) =>
            this.toSourceForCurrentSport(p, connMap, sportKey)
          ),
        });
      }
    }

    // ---- 3. Remaining platforms grouped by category ----
    const recommendedIds = new Set(groups.flatMap((g) => g.sources.map((s) => s.platform)));
    const remaining = allPlatforms.filter((p) => !recommendedIds.has(p.platform));

    for (const cat of PLATFORM_CATEGORIES) {
      const catPlatforms = remaining.filter((p) => p.category === cat.category);
      if (catPlatforms.length > 0) {
        groups.push({
          key: `${cat.category}-${mode}-${sportKey ?? 'global'}`,
          label: cat.label,
          sources: catPlatforms.map((p) => this.toSourceForCurrentSport(p, connMap, sportKey)),
        });
      }
    }

    return groups;
  });

  constructor() {
    // Auto-select first sport when sports change
    effect(() => {
      const sports = this.selectedSports();
      const current = this.activeSport();
      if (sports.length > 0 && (!current || !sports.includes(current))) {
        this.activeSport.set(sports[0]);
      }
    });

    // Restore state from input data
    effect(() => {
      const data = this.linkSourcesData();
      if (!data?.links?.length) return;

      const map: Record<string, ConnectedState> = {};
      for (const link of data.links) {
        if (link.connected) {
          const key = connKey(link.platform, link.scopeType ?? 'global', link.scopeId);
          map[key] = {
            connected: true,
            connectionType: link.connectionType,
            scopeType: link.scopeType ?? 'global',
            scopeId: link.scopeId,
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
    this.analytics?.trackEvent(APP_EVENTS.LINK_SOURCES_MODE_SWITCHED, { mode });
    this.breadcrumb.trackStateChange('link-sources mode', { mode });
  }

  setSport(sport: string): void {
    this.activeSport.set(sport);
    this.logger.info('Sport filter changed', { sport });
    this.analytics?.trackEvent(APP_EVENTS.LINK_SOURCES_SPORT_FILTERED, { sport });
  }

  async onSourceTap(event: ConnectedSourceTapEvent): Promise<void> {
    if (this.disabled()) return;

    const { source } = event;
    const platformDef = this._platformMap().get(source.platform);
    const placeholder = platformDef?.placeholder ?? '@username';
    const isSignIn = source.connectionType === 'signin';
    const isUrl = placeholder.toLowerCase().includes('url');

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
    const scopeType: PlatformScope = source.scopeType ?? 'global';
    const scopeId = source.scopeId;
    const key = connKey(source.platform, scopeType, scopeId);

    this._connectedMap.update((map) => ({
      ...map,
      [key]: {
        connected: !!value,
        connectionType: this.activeMode(),
        scopeType,
        scopeId,
        username: value && !value.startsWith('http') ? value : undefined,
        url: value || undefined,
      },
    }));

    this.logger.info('Link source updated', {
      platform: source.platform,
      connected: !!value,
      mode: this.activeMode(),
      scopeType,
      scopeId,
    });
    this.analytics?.trackEvent(APP_EVENTS.LINK_SOURCE_CONNECTED, {
      source_platform: source.platform,
      connected: !!value,
      mode: this.activeMode(),
      scopeType,
    });
    this.breadcrumb.trackStateChange('link-sources source-updated', {
      source_platform: source.platform,
      connected: !!value,
    });
    this.emitChange();
  }

  /** Convert a platform def + connected state into a ConnectedSource, resolving scope from current sport */
  private toSourceForCurrentSport(
    platform: PlatformDefinition,
    connMap: Record<string, ConnectedState>,
    sportKey: string | null
  ): ConnectedSource {
    const scopeType: PlatformScope = platform.scope;
    const scopeId = scopeType === 'sport' ? (sportKey ?? undefined) : undefined;
    const key = connKey(platform.platform, scopeType, scopeId);
    const conn = connMap[key];

    return {
      platform: platform.platform,
      label: platform.label,
      icon: platform.icon as ConnectedSource['icon'],
      connectionType: platform.connectionType,
      scopeType,
      scopeId,
      connected: conn?.connected ?? false,
      username: conn?.username,
      url: conn?.url,
    };
  }

  private emitChange(): void {
    const connMap = this._connectedMap();
    const links: LinkSourceEntry[] = Object.entries(connMap).map(([key, data]) => ({
      platform: key.split('::')[0],
      connected: data.connected,
      connectionType: data.connectionType,
      scopeType: data.scopeType,
      scopeId: data.scopeId,
      username: data.username,
      url: data.url,
    }));

    this.linkSourcesChange.emit({ links });
  }
}
