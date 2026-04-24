/**
 * @fileoverview OnboardingLinkDropStepComponent - Connected Accounts Step
 * @module @nxt1/ui/onboarding
 * @version 5.0.0
 *
 * Onboarding step that lets users connect their accounts via two modes:
 *   - **Linked** — Paste a URL or username (MaxPreps, Hudl, Instagram, etc.)
 *   - **Signed In** — OAuth sign-in (Google, Microsoft)
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
  PLATFORM_FAVICON_DOMAINS,
  getRecommendedPlatforms,
  getPlatformFaviconUrl,
} from '@nxt1/core/api';
import type { ILogger } from '@nxt1/core/logging';
import { USER_ROLES } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtLoggingService } from '../../services/logging';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../services/breadcrumb';
import { NxtModalService } from '../../services/modal';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtPlatformService } from '../../services/platform';
import {
  NxtConnectedSourcesComponent,
  type ConnectionMode,
  type ConnectedSource,
  type ConnectedSourceTapEvent,
} from '../../components/connected-sources/connected-sources.component';

// ============================================
// TYPES
// ============================================

/** A display group (recommended, or all remaining) */
interface PlatformGroup {
  readonly key: string;
  readonly label: string;
  readonly sources: ConnectedSource[];
}

/** A user-defined custom link */
interface CustomLink {
  readonly id: string;
  readonly label: string;
  readonly url: string;
}

/** Internal connected-account state keyed by "platform" or "platform::scopeId" */
interface ConnectedState {
  connected: boolean;
  connectionType?: PlatformConnectionType;
  scopeType?: PlatformScope;
  scopeId?: string;
  username?: string;
  url?: string;
  /** Display name of the person who originally added this link */
  addedBy?: string;
  /** User ID of the person who originally added this link */
  addedById?: string;
  /** True when this source came from existing team data and cannot be modified in onboarding */
  locked?: boolean;
}

const CUSTOM_LINK_PREFIX = 'custom::';
const HANDLE_BASED_PLATFORMS = new Set(['instagram', 'twitter', 'tiktok']);
const HANDLE_BUILDABLE_URL_PLATFORMS = new Set(['instagram', 'twitter', 'tiktok', 'youtube']);
const SIGNIN_PRIORITY_ORDER = ['google', 'microsoft'] as const;
const RESERVED_HANDLE_SEGMENTS = new Set([
  'explore',
  'hashtag',
  'home',
  'i',
  'intent',
  'p',
  'reel',
  'reels',
  'search',
  'share',
  'shorts',
  'tv',
  'video',
  'videos',
  'watch',
]);

interface NormalizedPlatformValue {
  readonly username?: string;
  readonly url?: string;
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

function resolveConnectedState(
  platform: string,
  scopeType: PlatformScope,
  scopeId: string | undefined,
  connMap: Record<string, ConnectedState>
): ConnectedState | undefined {
  const exact = connMap[connKey(platform, scopeType, scopeId)];
  if (exact) {
    return exact;
  }

  // Team-scoped rows do not always know the canonical team identifier at render-time.
  // When there is a single persisted team connection for the platform, reuse it so the
  // visible row reflects the saved state and preserves the real scopeId for edits.
  if (scopeType !== 'team') {
    return undefined;
  }

  const teamMatches = Object.entries(connMap)
    .filter(
      ([key, entry]) =>
        key.startsWith(`${platform}::`) &&
        entry.scopeType === 'team' &&
        entry.connected &&
        !!entry.scopeId
    )
    .map(([, entry]) => entry);

  return teamMatches[0];
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

function isCustomPlatform(platform: string): boolean {
  return platform.startsWith(CUSTOM_LINK_PREFIX);
}

function customPlatformId(id: string): string {
  return `${CUSTOM_LINK_PREFIX}${id}`;
}

function extractCustomLinkId(platform: string): string {
  return platform.slice(CUSTOM_LINK_PREFIX.length);
}

function buildLockedSourceMessage(source: ConnectedSource): string {
  if (source.addedBy?.trim()) {
    return `${source.label} was already connected by ${source.addedBy}. You can add new links here, but you can't change this one during onboarding.`;
  }

  return `${source.label} is already connected for this team. You can add new links here, but you can't change this one during onboarding.`;
}

function normalizeCustomLinkUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function placeholderExpectsUrl(placeholder: string): boolean {
  return placeholder.toLowerCase().includes('url');
}

function looksLikeUrl(value: string): boolean {
  return /^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/i.test(value.trim());
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(normalizeCustomLinkUrl(value));
  } catch {
    return null;
  }
}

function normalizeUrl(value: string): string | null {
  const parsed = tryParseUrl(value);
  if (!parsed) return null;
  parsed.hash = '';
  return parsed.toString();
}

function canonicalizeUrlForComparison(value: string): string | null {
  const parsed = tryParseUrl(value);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '') || '/';
  return `${host}${path}${parsed.search}`;
}

function normalizeHandle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  let handle = trimmed.replace(/^@+/, '').replace(/^\/+/, '').replace(/\/+$/, '').trim();

  if (handle.includes('/')) {
    const parts = handle.split('/').filter(Boolean);
    handle = parts[parts.length - 1] ?? handle;
  }

  return handle.replace(/^@+/, '').trim();
}

function buildProfileUrl(platformId: string, rawHandle: string): string | null {
  const handle = normalizeHandle(rawHandle);
  if (!handle || !HANDLE_BUILDABLE_URL_PLATFORMS.has(platformId)) return null;

  switch (platformId) {
    case 'instagram':
      return `https://instagram.com/${handle}`;
    case 'twitter':
      return `https://x.com/${handle}`;
    case 'tiktok':
      return `https://tiktok.com/@${handle}`;
    case 'youtube':
      return `https://youtube.com/@${handle}`;
    default:
      return null;
  }
}

function extractHandleFromUrl(platformId: string, value: string): string | null {
  const parsed = tryParseUrl(value);
  if (!parsed) return null;

  const knownDomain = PLATFORM_FAVICON_DOMAINS[platformId];
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (knownDomain && hostname !== knownDomain && !hostname.endsWith(`.${knownDomain}`)) {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  switch (platformId) {
    case 'instagram':
    case 'twitter': {
      const segment = segments.find((entry) => !RESERVED_HANDLE_SEGMENTS.has(entry.toLowerCase()));
      return segment ? normalizeHandle(segment) : null;
    }
    case 'tiktok': {
      const segment = segments.find((entry) => entry.startsWith('@')) ?? segments[0];
      return segment ? normalizeHandle(segment) : null;
    }
    case 'youtube': {
      if (segments[0]?.startsWith('@')) return normalizeHandle(segments[0]);
      if (['channel', 'c', 'user'].includes(segments[0]?.toLowerCase() ?? '') && segments[1]) {
        return normalizeHandle(segments[1]);
      }
      return null;
    }
    default:
      return null;
  }
}

function normalizePlatformConnectionValue(
  platform: PlatformDefinition,
  rawValue: string
): { readonly value?: NormalizedPlatformValue; readonly reason?: string } {
  const trimmed = rawValue.trim();
  if (!trimmed) return { value: {} };

  if (platform.connectionType === 'signin') {
    return { value: { url: trimmed } };
  }

  const expectsUrl = placeholderExpectsUrl(platform.placeholder);
  const parsedUrl = looksLikeUrl(trimmed) ? normalizeUrl(trimmed) : null;
  const extractedHandle = parsedUrl ? extractHandleFromUrl(platform.platform, parsedUrl) : null;

  if (HANDLE_BASED_PLATFORMS.has(platform.platform)) {
    if (extractedHandle) {
      return {
        value: {
          username: `@${extractedHandle}`,
          url: buildProfileUrl(platform.platform, extractedHandle) ?? parsedUrl ?? undefined,
        },
      };
    }

    if (parsedUrl) {
      return { value: { url: parsedUrl } };
    }

    const handle = normalizeHandle(trimmed);
    if (!handle) {
      return { reason: `Enter a valid ${platform.label} username.` };
    }

    return {
      value: {
        username: `@${handle}`,
        url: buildProfileUrl(platform.platform, handle) ?? undefined,
      },
    };
  }

  if (parsedUrl) {
    return {
      value: {
        username: extractedHandle ? `@${extractedHandle}` : undefined,
        url: extractedHandle
          ? (buildProfileUrl(platform.platform, extractedHandle) ?? parsedUrl)
          : parsedUrl,
      },
    };
  }

  if (expectsUrl) {
    const builtUrl = buildProfileUrl(platform.platform, trimmed);
    if (builtUrl) {
      const handle = normalizeHandle(trimmed);
      return {
        value: {
          username: handle ? `@${handle}` : undefined,
          url: builtUrl,
        },
      };
    }

    return { reason: `Enter a valid ${platform.label} URL.` };
  }

  const handle = normalizeHandle(trimmed);
  if (!handle) {
    return { reason: `Enter a valid ${platform.label} username.` };
  }

  return {
    value: {
      username: `@${handle}`,
      url: buildProfileUrl(platform.platform, handle) ?? undefined,
    },
  };
}

function sortPlatformsForDisplay(
  platforms: readonly PlatformDefinition[],
  mode: ConnectionMode
): PlatformDefinition[] {
  if (mode !== 'signin') {
    return [...platforms];
  }

  const priority = new Map<string, number>(
    SIGNIN_PRIORITY_ORDER.map((platform, index) => [platform, index])
  );

  return [...platforms].sort((left, right) => {
    const leftPriority = priority.get(left.platform) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = priority.get(right.platform) ?? Number.MAX_SAFE_INTEGER;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return 0;
  });
}

function isPinnedSigninPlatform(platformId: string): boolean {
  return SIGNIN_PRIORITY_ORDER.includes(platformId as (typeof SIGNIN_PRIORITY_ORDER)[number]);
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
      <!-- Mode toggle: Linked / Signed In (hidden during onboarding) -->
      @if (!hideSigninMode()) {
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
      }
      <p class="nxt1-mode-hint">
        @if (activeMode() === 'link') {
          Linking accounts automatically pulls your information and stats into NXT1.
        } @else {
          Signing in allows Agent X to do work directly on those platforms for you.
        }
      </p>

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

      <p class="nxt1-link-step-intro">
        @if (isTeamScope()) {
          Add the real sites that power your team profile across social, videos, recruiting,
          metrics, academics, schedule, and stats.
        } @else {
          Add the real sites that power your profile across social, videos, recruiting, metrics,
          academics, schedule, and stats.
        }
      </p>

      <!-- Team scope hint for coaches/directors -->
      @if (isTeamScope()) {
        <p class="nxt1-team-hint">
          Link your <strong>team/program</strong> accounts — not your personal pages.
        </p>
      }

      <!-- Platform groups with accordion -->
      @for (group of platformGroups(); track group.key) {
        <nxt1-connected-sources
          [title]="group.label"
          [sources]="group.sources"
          [collapsible]="isGroupCollapsible(group.key)"
          [initialExpanded]="isGroupExpanded(group.key)"
          [attr.data-testid]="testIds.GROUP"
          (sourceTap)="onSourceTap($event)"
        />
      }

      <!-- Add Custom Link — available in link mode for all roles -->
      @if (activeMode() === 'link') {
        <button
          type="button"
          class="nxt1-add-custom-link-btn"
          [attr.data-testid]="testIds.ADD_CUSTOM_LINK_BUTTON"
          [disabled]="disabled()"
          (click)="addCustomLink()"
        >
          <span class="nxt1-add-custom-link-btn__icon">+</span>
          Add Custom Link
        </button>
      }

      @if (platformGroups().length === 0) {
        <div class="nxt1-empty-mode" [attr.data-testid]="testIds.EMPTY_STATE">
          <p class="nxt1-empty-mode-text">
            @if (activeMode() === 'signin') {
              No sign-in accounts available yet.
            } @else {
              No link accounts available for your {{ scope() === 'team' ? 'team' : 'sports' }}.
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
        background: rgba(0, 0, 0, 0.08);
        padding: var(--nxt1-spacing-0-5);
      }

      :host-context([data-base-theme='dark']) .nxt1-mode-toggle,
      :host-context(.dark) .nxt1-mode-toggle {
        background: rgba(255, 255, 255, 0.08);
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
        background: var(--nxt1-color-bg-primary, #ffffff);
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
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

      .nxt1-link-step-intro {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
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

      /* ============================================
         ADD CUSTOM LINK BUTTON
         ============================================ */
      .nxt1-add-custom-link-btn {
        appearance: none;
        -webkit-appearance: none;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
        width: 100%;
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        background: transparent;
        border: 1.5px dashed var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-md);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-add-custom-link-btn:hover:not(:disabled) {
        border-color: var(--nxt1-color-text-primary);
        color: var(--nxt1-color-text-primary);
        background: var(--nxt1-color-surface-200);
      }

      .nxt1-add-custom-link-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .nxt1-add-custom-link-btn__icon {
        font-size: var(--nxt1-fontSize-base);
        line-height: 1;
      }

      /* ============================================
         TEAM HINT for coaches / directors
         ============================================ */
      .nxt1-team-hint {
        margin: 0;
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-style: italic;
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-borderRadius-md);
      }

      .nxt1-mode-hint {
        margin: calc(-1 * var(--nxt1-spacing-4, 16px)) 0 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        line-height: 1.4;
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
  private readonly toast = inject(NxtToastService);
  private readonly platform = inject(NxtPlatformService);

  /** Test IDs for interactive elements */
  protected readonly testIds = TEST_IDS.LINK_SOURCES;

  // ---- Inputs ----
  readonly linkSourcesData = input<LinkSourcesFormData | null>(null);
  readonly selectedSports = input<readonly string[]>([]);
  readonly role = input<OnboardingUserType | null>(null);
  readonly disabled = input(false);
  readonly scope = input<'athlete' | 'team'>('athlete');
  /** When true, hides the Signed In mode toggle (used during onboarding). */
  readonly hideSigninMode = input(false);
  /**
   * When true, tapping Google / Microsoft in sign-in mode emits `oauthSigninRequest`
   * so the parent can launch the real OAuth account-picker instead of the token-entry modal.
   * Defaults to false (onboarding uses manual token entry).
   */
  readonly useOAuth = input(false);

  // ---- Outputs ----
  readonly linkSourcesChange = output<LinkSourcesFormData>();

  /**
   * Emitted when the user manually enters tokens for a sign-in platform (Google / Microsoft).
   * The parent container is responsible for calling the backend connect endpoint and then
   * calling `markSigninConnected()` on success.
   */
  readonly signinTokenConnect = output<{
    platform: 'google' | 'microsoft';
    accessToken: string;
    refreshToken?: string;
    scopeType: PlatformScope;
    scopeId?: string;
  }>();

  /**
   * Emitted when useOAuth=true and the user taps Google or Microsoft in sign-in mode.
   * The parent should launch the real OAuth account-picker popup, call the backend,
   * then call `markSigninConnected()` on this component instance on success.
   */
  readonly oauthSigninRequest = output<{
    platform: 'google' | 'microsoft';
    scopeType: PlatformScope;
    scopeId?: string;
  }>();

  /**
   * Emitted when the user taps a Firecrawl-based sign-in platform (Hudl, X, MaxPreps, etc.).
   * The parent container is responsible for launching the Agent X interactive browser session
   * at the platform's `loginUrl` using Firecrawl Persistent Profiles.
   */
  readonly firecrawlSigninRequest = output<{
    platform: string;
    label: string;
    loginUrl: string;
  }>();

  // ---- State ----
  readonly activeMode = signal<ConnectionMode>('link');

  /** Currently selected sport for scoped platforms. Defaults to first sport. */
  readonly activeSport = signal<string | null>(null);

  /** Internal state — keyed by connKey(platform, scopeType, scopeId) */
  private readonly _connectedMap = signal<Record<string, ConnectedState>>({});

  /** User-defined custom links (all roles, link mode only) */
  private readonly _customLinks = signal<CustomLink[]>([]);

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

  /** Whether to show team-scope hint (coaches/directors) */
  protected readonly isTeamScope = computed(() => {
    const r = this.role();
    return r === USER_ROLES.COACH || r === USER_ROLES.DIRECTOR;
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
    const globalPlatforms = sortPlatformsForDisplay(
      PLATFORM_REGISTRY.filter((p) => p.scope === 'global' && p.connectionType === mode),
      mode
    );

    let sportPlatforms: PlatformDefinition[] = [];
    if (mode === 'link') {
      sportPlatforms = PLATFORM_REGISTRY.filter((p) => {
        if (p.scope !== 'sport') return false;
        if (p.connectionType !== 'link') return false;
        // When a sport is selected, filter to matching platforms; otherwise show all
        if (sportKey && p.sports.length > 0) {
          return p.sports.some((ps) => sportKey.startsWith(ps) || ps.startsWith(sportKey));
        }
        return true;
      });
    }

    const teamPlatforms =
      mode === 'link' && this.scope() === 'team'
        ? PLATFORM_REGISTRY.filter((p) => p.scope === 'team' && p.connectionType === 'link')
        : [];

    const allPlatforms = [...globalPlatforms, ...sportPlatforms, ...teamPlatforms];
    const pinnedSigninPlatforms =
      mode === 'signin'
        ? globalPlatforms.filter((platform) => isPinnedSigninPlatform(platform.platform))
        : [];
    const pinnedSigninPlatformIds = new Set(
      pinnedSigninPlatforms.map((platform) => platform.platform)
    );

    if (pinnedSigninPlatforms.length > 0) {
      groups.push({
        key: 'priority-signin',
        label: 'Sign-In Accounts',
        sources: pinnedSigninPlatforms.map((platform) =>
          this.toSourceForCurrentSport(platform, connMap, sportKey)
        ),
      });
    }

    // ---- 2. Recommended group ----
    const allIds = new Set(allPlatforms.map((p) => p.platform));
    if (role) {
      const sportList = sportName ? [sportName] : sports.length === 1 ? [sports[0]] : [];
      const recommended = getRecommendedPlatforms(role, sportList, mode);
      const filteredRecommended = recommended.filter(
        (p) => allIds.has(p.platform) && !pinnedSigninPlatformIds.has(p.platform)
      );

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

    // ---- 3. Platforms grouped by category ----
    // Keep recommended platforms in their native sections too.
    // Shared platform IDs ensure a single connection state appears everywhere.
    // Pinned Google/Microsoft sign-in providers are shown only once at the top.
    const remaining = allPlatforms.filter(
      (platform) => !pinnedSigninPlatformIds.has(platform.platform)
    );

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

    // ---- Custom links group (link mode only) ----
    if (mode === 'link') {
      const customs = this._customLinks();
      if (customs.length > 0) {
        groups.push({
          key: 'custom-links',
          label: 'Custom Links',
          sources: customs.map((cl) => ({
            platform: customPlatformId(cl.id),
            label: cl.label,
            icon: 'link' as const,
            connected: true,
            url: cl.url,
            connectionType: 'link' as const,
            scopeType: 'global' as const,
          })),
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
      if (!data?.links?.length) {
        this._connectedMap.set({});
        this._customLinks.set([]);
        return;
      }

      const map: Record<string, ConnectedState> = {};
      const customs: CustomLink[] = [];

      for (const link of data.links) {
        if (isCustomPlatform(link.platform)) {
          if (link.connected && link.url) {
            const id = extractCustomLinkId(link.platform);
            const label = link.username ?? link.url;
            customs.push({ id, label, url: link.url });
          }
          continue;
        }
        if (link.connected) {
          const key = connKey(link.platform, link.scopeType ?? 'global', link.scopeId);
          map[key] = {
            connected: true,
            connectionType: link.connectionType,
            scopeType: link.scopeType ?? 'global',
            scopeId: link.scopeId,
            username: link.username,
            url: link.url,
            addedBy: link.addedBy,
            addedById: link.addedById,
            locked: link.locked,
          };
        }
      }
      this._connectedMap.set(map);
      this._customLinks.set(customs);
    });
  }

  /**
   * Mark a sign-in platform as connected (called by the parent after a successful backend call).
   */
  markSigninConnected(platform: string, scopeType: PlatformScope, scopeId?: string): void {
    const key = connKey(platform, scopeType, scopeId);
    this._connectedMap.update((map) => ({
      ...map,
      [key]: {
        connected: true,
        connectionType: 'signin' as PlatformConnectionType,
        scopeType,
        scopeId,
      },
    }));
    this.emitChange();
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

    if (source.locked) {
      this.toast.info(buildLockedSourceMessage(source));
      this.logger.info('Locked onboarding source tap blocked', {
        platform: source.platform,
        scopeType: source.scopeType,
        scopeId: source.scopeId,
      });
      return;
    }

    // Handle custom link tap — prompt to edit or delete
    if (isCustomPlatform(source.platform)) {
      await this.editCustomLink(extractCustomLinkId(source.platform), source);
      return;
    }

    const platformDef = this._platformMap().get(source.platform);
    const placeholder = platformDef?.placeholder ?? '@username';
    const isSignIn = source.connectionType === 'signin';
    const isUrl = placeholder.toLowerCase().includes('url');

    if (this.isDesktopOnlySigninSource(source)) {
      this.toast.info(
        `${source.label} sign-in is desktop only right now. Use the desktop web app.`
      );
      this.logger.info('Desktop-only sign-in blocked on mobile context', {
        platform: source.platform,
      });
      return;
    }

    // ── Google / Microsoft: OAuth account-picker (settings) OR manual token entry (onboarding) ──
    if (isSignIn && (source.platform === 'google' || source.platform === 'microsoft')) {
      if (this.useOAuth()) {
        this.oauthSigninRequest.emit({
          platform: source.platform as 'google' | 'microsoft',
          scopeType: source.scopeType ?? 'global',
          scopeId: source.scopeId,
        });
      } else {
        await this._handleSigninTokenEntry(
          source as typeof source & { platform: 'google' | 'microsoft' }
        );
      }
      return;
    }

    // ── Firecrawl-based sign-in: delegate to parent for interactive browser session ──
    if (isSignIn && platformDef?.loginUrl) {
      // If already connected, offer to disconnect instead of re-opening the browser
      if (source.connected) {
        const confirmed = await this.nxtModal.confirm({
          title: `Disconnect ${source.label}?`,
          message: `Agent X will no longer be able to access your ${source.label} account.`,
          confirmText: 'Disconnect',
          cancelText: 'Cancel',
          preferNative: 'native',
        });
        if (confirmed) {
          const scopeType: PlatformScope = source.scopeType ?? 'global';
          const scopeId = source.scopeId;
          const key = connKey(source.platform, scopeType, scopeId);
          this._connectedMap.update((map) => {
            const next = { ...map };
            delete next[key];
            return next;
          });
          this.logger.info('Firecrawl sign-in disconnected', { platform: source.platform });
          this.emitChange();
        }
        return;
      }

      this.logger.info('Firecrawl sign-in requested', {
        platform: source.platform,
        label: source.label,
      });
      this.firecrawlSigninRequest.emit({
        platform: source.platform,
        label: source.label,
        loginUrl: platformDef.loginUrl,
      });
      return;
    }

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
      preferNative: 'native',
    });

    if (!result.confirmed) return;

    const rawValue = result.value.trim();
    const scopeType: PlatformScope = source.scopeType ?? 'global';
    const scopeId = source.scopeId;
    const key = connKey(source.platform, scopeType, scopeId);

    const normalized = platformDef
      ? normalizePlatformConnectionValue(platformDef, rawValue)
      : {
          value: isSignIn
            ? { url: rawValue }
            : isUrl
              ? { url: normalizeCustomLinkUrl(rawValue) }
              : { username: rawValue },
        };

    if (normalized.reason) {
      this.toast.warning(normalized.reason);
      return;
    }

    const nextValue = normalized.value ?? {};
    if (nextValue.url && this.isDuplicateUrl(nextValue.url, { ignoreConnectedKey: key })) {
      this.toast.warning("You've already added this link.");
      this.logger.info('Duplicate link blocked', { platform: source.platform, url: nextValue.url });
      return;
    }

    this._connectedMap.update((map) => ({
      ...map,
      [key]: {
        connected: !!(nextValue.url || nextValue.username),
        connectionType: this.activeMode(),
        scopeType,
        scopeId,
        username: nextValue.username,
        url: nextValue.url,
      },
    }));

    this.logger.info('Link source updated', {
      platform: source.platform,
      connected: !!(nextValue.url || nextValue.username),
      mode: this.activeMode(),
      scopeType,
      scopeId,
    });
    this.analytics?.trackEvent(APP_EVENTS.LINK_SOURCE_CONNECTED, {
      source_platform: source.platform,
      connected: !!(nextValue.url || nextValue.username),
      mode: this.activeMode(),
      scopeType,
    });
    this.breadcrumb.trackStateChange('link-sources source-updated', {
      source_platform: source.platform,
      connected: !!(nextValue.url || nextValue.username),
    });
    this.emitChange();
  }

  /**
   * Show sequential prompts to collect access/refresh tokens for Google or Microsoft,
   * then emit `signinTokenConnect` for the parent to handle the backend API call.
   */
  private async _handleSigninTokenEntry(
    source: ConnectedSource & { platform: 'google' | 'microsoft' }
  ): Promise<void> {
    const scopeType: PlatformScope = source.scopeType ?? 'global';
    const scopeId = source.scopeId;

    // Step 1: Access Token (both providers)
    const accessTokenRes = await this.nxtModal.prompt({
      title: `Connect ${source.label}`,
      message: `Paste your ${source.label} Access Token.`,
      placeholder: 'Access token…',
      defaultValue: '',
      submitText: source.platform === 'microsoft' ? 'Next' : 'Connect',
      preferNative: 'native',
    });
    if (!accessTokenRes.confirmed || !accessTokenRes.value.trim()) return;
    const accessToken = accessTokenRes.value.trim();

    // Step 2: Refresh Token (Microsoft only — optional but strongly recommended)
    let refreshToken: string | undefined;
    if (source.platform === 'microsoft') {
      const refreshTokenRes = await this.nxtModal.prompt({
        title: `Connect ${source.label}`,
        message: 'Paste your Microsoft Refresh Token (optional — enables long-term access).',
        placeholder: 'Refresh token (optional)…',
        defaultValue: '',
        submitText: 'Connect',
        preferNative: 'native',
      });
      if (!refreshTokenRes.confirmed) return;
      refreshToken = refreshTokenRes.value.trim() || undefined;
    }

    this.signinTokenConnect.emit({
      platform: source.platform,
      accessToken,
      refreshToken,
      scopeType,
      scopeId,
    });
  }

  /** Convert a platform def + connected state into a ConnectedSource, resolving scope from current sport */
  private toSourceForCurrentSport(
    platform: PlatformDefinition,
    connMap: Record<string, ConnectedState>,
    sportKey: string | null
  ): ConnectedSource {
    const scopeType: PlatformScope = platform.scope;
    const scopeId = scopeType === 'sport' ? (sportKey ?? undefined) : undefined;
    const conn = resolveConnectedState(platform.platform, scopeType, scopeId, connMap);

    return {
      platform: platform.platform,
      label: platform.label,
      icon: platform.icon as ConnectedSource['icon'],
      connectionType: platform.connectionType,
      actionLabel: this.getDisconnectedActionLabel(platform),
      scopeType,
      scopeId: conn?.scopeId ?? scopeId,
      connected: conn?.connected ?? false,
      username: conn?.username,
      url: conn?.url,
      faviconUrl: getPlatformFaviconUrl(platform.platform) ?? undefined,
      addedBy: conn?.addedBy,
      locked: conn?.locked,
    };
  }

  private getDisconnectedActionLabel(platform: PlatformDefinition): string | undefined {
    if (
      platform.connectionType === 'signin' &&
      platform.platform !== 'google' &&
      platform.platform !== 'microsoft' &&
      !this.supportsInteractiveDesktopSignin()
    ) {
      return 'Desktop Only';
    }

    return undefined;
  }

  private isDesktopOnlySigninSource(source: ConnectedSource): boolean {
    return source.connectionType === 'signin' && source.actionLabel === 'Desktop Only';
  }

  private supportsInteractiveDesktopSignin(): boolean {
    if (this.platform.isNative()) {
      return false;
    }

    if (!this.platform.isBrowser()) {
      return true;
    }

    const viewportWidth = this.platform.viewport().width;
    if (viewportWidth < 768) {
      return false;
    }

    if (this.platform.hasTouch() && viewportWidth < 1024) {
      return false;
    }

    return true;
  }

  /**
   * Called by the mobile quick-add bar when the user pastes a URL directly.
   *
   * - If the URL matches a known platform, it marks that platform as connected
   *   (global scope, no modal prompt required) and returns `kind: 'platform'`.
   * - Otherwise it adds the URL as a custom link using the hostname as the label
   *   and returns `kind: 'custom'`.
   *
   * Returns `{ added: false, reason }` when the input is unusable.
   */
  async quickAddLink(
    rawValue: string
  ): Promise<
    | { added: false; reason: string }
    | { added: true; kind: 'platform'; label: string }
    | { added: true; kind: 'custom'; label: string }
  > {
    if (this.disabled()) return { added: false, reason: 'Step is disabled.' };

    const url = normalizeCustomLinkUrl(rawValue);
    if (!url) return { added: false, reason: 'Please enter a valid URL.' };

    // Try to match against the platform registry by URL pattern
    let matchedPlatform: PlatformDefinition | undefined;
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      matchedPlatform = PLATFORM_REGISTRY.find((p) => {
        const domain = PLATFORM_FAVICON_DOMAINS[p.platform];
        if (!domain) return false;
        return hostname === domain || hostname.endsWith(`.${domain}`);
      });
    } catch {
      return { added: false, reason: "That doesn't look like a valid URL." };
    }

    if (matchedPlatform) {
      // Mark the platform connected at global scope
      const scopeType: PlatformScope = matchedPlatform.scope;
      const sportKey = this.activeSport() ? sportNameToKey(this.activeSport()!) : null;
      const scopeId = scopeType === 'sport' ? (sportKey ?? undefined) : undefined;
      const key = connKey(matchedPlatform.platform, scopeType, scopeId);
      const existing = this._connectedMap()[key];
      if (existing?.locked) {
        this.toast.info(
          buildLockedSourceMessage({
            platform: matchedPlatform.platform,
            label: matchedPlatform.label,
            icon: matchedPlatform.icon as ConnectedSource['icon'],
            connected: true,
            connectionType: matchedPlatform.connectionType,
            scopeType,
            scopeId,
            username: existing.username,
            url: existing.url,
            addedBy: existing.addedBy,
            locked: true,
          })
        );
        this.logger.info('Locked onboarding quick-add blocked', {
          platform: matchedPlatform.platform,
          scopeType,
          scopeId,
        });
        return { added: false, reason: 'This account is already connected for the team.' };
      }
      const normalized = normalizePlatformConnectionValue(matchedPlatform, url);
      if (normalized.reason || !normalized.value?.url) {
        return { added: false, reason: normalized.reason ?? 'Please enter a valid URL.' };
      }
      const nextValue = normalized.value!;
      const nextUrl = nextValue.url;
      if (!nextUrl) {
        return { added: false, reason: 'Please enter a valid URL.' };
      }
      if (this.isDuplicateUrl(nextUrl, { ignoreConnectedKey: key })) {
        this.toast.warning("You've already added this link.");
        this.logger.info('Duplicate quick-add blocked', {
          platform: matchedPlatform.platform,
          url: nextUrl,
        });
        return { added: false, reason: 'This link has already been added.' };
      }

      this._connectedMap.update((map) => ({
        ...map,
        [key]: {
          connected: true,
          connectionType: 'link',
          scopeType,
          scopeId,
          username: nextValue.username,
          url: nextUrl,
        },
      }));

      this.logger.info('Quick-add matched platform', {
        platform: matchedPlatform.platform,
        url: nextUrl,
      });
      this.analytics?.trackEvent(APP_EVENTS.LINK_SOURCE_CONNECTED, {
        source_platform: matchedPlatform.platform,
        connected: true,
        mode: 'link',
        scopeType,
      });
      this.breadcrumb.trackStateChange('link-sources quick-add-platform', {
        platform: matchedPlatform.platform,
      });
      this.emitChange();
      return { added: true, kind: 'platform', label: matchedPlatform.label };
    }

    // No match — add as a custom link using the hostname as the label
    let label: string;
    try {
      label = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      label = url;
    }

    if (this.isDuplicateUrl(url)) {
      this.toast.warning("You've already added this link.");
      this.logger.info('Duplicate custom quick-add blocked', { url });
      return { added: false, reason: 'This link has already been added.' };
    }

    const id = `${Date.now()}-${this._customLinks().length}`;
    this._customLinks.update((links) => [...links, { id, label, url }]);

    this.logger.info('Quick-add custom link', { id, label, url });
    this.analytics?.trackEvent(APP_EVENTS.LINK_SOURCE_CONNECTED, {
      source_platform: 'custom',
      connected: true,
      mode: 'link',
      scopeType: 'global',
    });
    this.breadcrumb.trackStateChange('link-sources quick-add-custom', { id });
    this.emitChange();
    return { added: true, kind: 'custom', label };
  }

  /** Open prompts to add a new custom link (label then URL) */
  async addCustomLink(): Promise<void> {
    if (this.disabled()) return;

    const labelResult = await this.nxtModal.prompt({
      title: 'Add Custom Link',
      message: 'Enter a label for this link (e.g. "My ESPN Profile")',
      placeholder: 'Label',
      submitText: 'Next',
      required: true,
      preferNative: 'native',
    });
    if (!labelResult.confirmed || !labelResult.value.trim()) return;

    const urlResult = await this.nxtModal.prompt({
      title: 'Add Custom Link',
      message: 'Enter the URL for this link',
      placeholder: 'https://',
      submitText: 'Add',
      required: true,
      preferNative: 'native',
    });
    if (!urlResult.confirmed || !urlResult.value.trim()) return;

    const id = `${Date.now()}-${this._customLinks().length}`;
    const url = normalizeCustomLinkUrl(urlResult.value);
    if (this.isDuplicateUrl(url)) {
      this.toast.warning("You've already added this link.");
      this.logger.info('Duplicate custom link blocked', { url });
      return;
    }
    this._customLinks.update((links) => [...links, { id, label: labelResult.value.trim(), url }]);
    this.logger.info('Custom link added', { id });
    this.analytics?.trackEvent(APP_EVENTS.LINK_SOURCE_CONNECTED, {
      source_platform: 'custom',
      connected: true,
      mode: 'link',
      scopeType: 'global',
    });
    this.breadcrumb.trackStateChange('link-sources custom-link-added', { id });
    this.emitChange();
  }

  /** Edit or delete an existing custom link */
  private async editCustomLink(id: string, source: ConnectedSource): Promise<void> {
    const labelResult = await this.nxtModal.prompt({
      title: 'Edit Custom Link',
      message: 'Update the link label',
      placeholder: 'Label',
      defaultValue: source.label,
      submitText: 'Next',
      required: true,
      preferNative: 'native',
    });
    if (!labelResult.confirmed || !labelResult.value.trim()) return;

    const result = await this.nxtModal.prompt({
      title: labelResult.value.trim(),
      message: 'Update this link, or clear it to remove.',
      placeholder: 'https://',
      defaultValue: source.url ?? '',
      submitText: 'Save',
      preferNative: 'native',
    });
    if (!result.confirmed) return;

    const newUrl = normalizeCustomLinkUrl(result.value);
    if (!newUrl) {
      this._customLinks.update((links) => links.filter((l) => l.id !== id));
      this.logger.info('Custom link removed', { id });
      this.breadcrumb.trackStateChange('link-sources custom-link-removed', { id });
    } else {
      if (this.isDuplicateUrl(newUrl, { ignoreCustomLinkId: id })) {
        this.toast.warning("You've already added this link.");
        this.logger.info('Duplicate custom link edit blocked', { id, url: newUrl });
        return;
      }
      this._customLinks.update((links) =>
        links.map((l) => (l.id === id ? { ...l, label: labelResult.value.trim(), url: newUrl } : l))
      );
      this.logger.info('Custom link updated', { id });
      this.breadcrumb.trackStateChange('link-sources custom-link-updated', { id });
    }
    this.emitChange();
  }

  /** Recommended and signin groups are always expanded and not collapsible */
  protected isGroupCollapsible(key: string): boolean {
    if (this.activeMode() === 'signin') return false;
    return !key.startsWith('recommended-') && key !== 'custom-links';
  }

  protected isGroupExpanded(_key: string): boolean {
    return true;
  }

  private isDuplicateUrl(
    url: string,
    options?: {
      readonly ignoreConnectedKey?: string;
      readonly ignoreCustomLinkId?: string;
    }
  ): boolean {
    const candidate = canonicalizeUrlForComparison(url);
    if (!candidate) return false;

    for (const [key, value] of Object.entries(this._connectedMap())) {
      if (key === options?.ignoreConnectedKey || !value.url) continue;
      if (canonicalizeUrlForComparison(value.url) === candidate) {
        return true;
      }
    }

    for (const link of this._customLinks()) {
      if (link.id === options?.ignoreCustomLinkId) continue;
      if (canonicalizeUrlForComparison(link.url) === candidate) {
        return true;
      }
    }

    return false;
  }

  private emitChange(): void {
    const connMap = this._connectedMap();
    const standardLinks: LinkSourceEntry[] = Object.entries(connMap).map(([key, data]) => ({
      platform: key.split('::')[0],
      connected: data.connected,
      connectionType: data.connectionType,
      scopeType: data.scopeType,
      scopeId: data.scopeId,
      username: data.username,
      url: data.url,
      addedBy: data.addedBy,
      addedById: data.addedById,
      locked: data.locked,
    }));

    const customLinks: LinkSourceEntry[] = this._customLinks().map((cl) => ({
      platform: customPlatformId(cl.id),
      connected: true,
      connectionType: 'link' as const,
      scopeType: 'global' as const,
      username: cl.label,
      url: cl.url,
    }));

    const links: LinkSourceEntry[] = [...standardLinks, ...customLinks];
    this.linkSourcesChange.emit({ links });
  }
}
