/**
 * @fileoverview Connected Accounts Modal Service — Adaptive Presentation
 * @module @nxt1/ui/components/connected-sources
 * @version 1.0.0
 *
 * Unified entry point for Connected Accounts that auto-selects
 * the best presentation based on platform:
 *
 * - **Mobile / Native / Touch < 768px**: Ionic bottom sheet (ConnectedAccountsSheetComponent)
 * - **Web Desktop >= 768px**: Pure Angular overlay (ConnectedAccountsWebModalComponent)
 *
 * Follows the same adaptive pattern as EditProfileModalService.
 *
 * @example
 * ```typescript
 * import { ConnectedAccountsModalService } from '@nxt1/ui/components/connected-sources';
 *
 * @Component({...})
 * export class SettingsComponent {
 *   private readonly connectedAccounts = inject(ConnectedAccountsModalService);
 *
 *   async onOpenConnectedAccounts(): Promise<void> {
 *     const result = await this.connectedAccounts.open({
 *       role: 'athlete',
 *       selectedSports: ['Football'],
 *       linkSourcesData: existingData,
 *     });
 *     if (result.saved && result.updatedLinks) {
 *       // Save updated links
 *     }
 *   }
 * }
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Injectable, inject, InjectionToken } from '@angular/core';
import { NxtPlatformService } from '../../services/platform';
import { NxtOverlayService } from '../overlay';
import { NxtLoggingService } from '../../services/logging';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtBottomSheetService, SHEET_PRESETS } from '../bottom-sheet';
import { ConnectedAccountsSheetComponent } from './connected-accounts-sheet.component';
import { ConnectedAccountsResyncService } from './connected-accounts-resync.service';
import {
  ConnectedAccountsWebModalComponent,
  type ConnectedAccountsModalCloseData,
} from './connected-accounts-web-modal.component';
import { FirecrawlSignInService } from './firecrawl-signin.service';
import type { LinkSourcesFormData, OnboardingUserType } from '@nxt1/core/api';

/**
 * Optional DI token providing a factory that returns the current Firebase user's
 * providerData. Injected by the app to enable OAuth (Google / Microsoft) connected
 * state detection inside the modal service.
 *
 * @example
 * // In app.config.ts:
 * {
 *   provide: CONNECTED_ACCOUNTS_FIREBASE_USER,
 *   useFactory: (auth: BrowserAuthService) => () => auth.firebaseUser()?.providerData ?? [],
 *   deps: [BrowserAuthService],
 * }
 */
export const CONNECTED_ACCOUNTS_FIREBASE_USER = new InjectionToken<
  () => ReadonlyArray<{ readonly providerId: string; readonly email?: string | null }>
>('CONNECTED_ACCOUNTS_FIREBASE_USER');

/**
 * Result returned by the CONNECTED_ACCOUNTS_OAUTH_HANDLER after a successful
 * OAuth connection. Carries the connected email so the sheet can display it
 * immediately without waiting for a full profile reload.
 */
export interface OAuthConnectResult {
  readonly success: boolean;
  /** The email address of the newly connected account, if available. */
  readonly connectedEmail?: string;
}

/**
 * Optional DI token providing a handler that launches the real OAuth account-picker
 * (Google / Microsoft) when the user taps those platforms in the "Signed In" tab
 * from the settings context (where the component is opened via overlay, not a template).
 *
 * The factory receives the platform ID and returns a Promise<OAuthConnectResult>.
 * The component updates `_latestLinkSources` with the connected email automatically
 * when the handler resolves with `success: true`.
 *
 * @example
 * // In app.config.ts:
 * {
 *   provide: CONNECTED_ACCOUNTS_OAUTH_HANDLER,
 *   useFactory: (emailSvc: WebEmailConnectionService, auth: IAuthService) =>
 *     (platform: 'google' | 'microsoft') =>
 *       emailSvc.connectForLinkedAccounts(platform, auth.user()?.uid ?? ''),
 *   deps: [WebEmailConnectionService, AUTH_SERVICE],
 * }
 */
export const CONNECTED_ACCOUNTS_OAUTH_HANDLER = new InjectionToken<
  (platform: 'google' | 'microsoft') => Promise<OAuthConnectResult | boolean>
>('CONNECTED_ACCOUNTS_OAUTH_HANDLER');

/** Maps Firebase Auth provider IDs to the platform IDs used by connected accounts. */
const FIREBASE_PROVIDER_PLATFORM_MAP: Readonly<Record<string, string>> = {
  'google.com': 'google',
  'microsoft.com': 'microsoft',
} as const;

/** Options for opening the Connected Accounts modal. */
export interface ConnectedAccountsModalOptions {
  readonly role?: OnboardingUserType | null;
  readonly selectedSports?: readonly string[];
  readonly linkSourcesData?: LinkSourcesFormData | null;
  readonly scope?: 'athlete' | 'team';
  /**
   * When true in a browser context, always use the web overlay presentation
   * instead of adaptive bottom-sheet behavior on narrow/touch viewports.
   */
  readonly preferWebOverlayOnBrowser?: boolean;
}

/** Result returned when the Connected Accounts modal is dismissed. */
export interface ConnectedAccountsModalResult {
  readonly saved: boolean;
  readonly resync?: boolean;
  /**
   * True when the user just completed a Google / Microsoft OAuth connect flow.
   * The parent should call `authService.refreshUserProfile()` so the new
   * `connectedEmails` entry is reflected in the UI without requiring navigation.
   */
  readonly oauthConnected?: boolean;
  readonly updatedLinks?: readonly {
    platform: string;
    url: string;
    username?: string;
    scopeType?: string;
    scopeId?: string;
    displayOrder: number;
  }[];
  readonly linkSources?: LinkSourcesFormData;
  readonly sources?: readonly {
    platform: string;
    label: string;
    connected: boolean;
    username?: string;
    url?: string;
    connectionType?: string;
  }[];
  /** Sign-in providers that were disconnected during this session. */
  readonly disconnectedSignInProviders?: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class ConnectedAccountsModalService {
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly overlay = inject(NxtOverlayService);
  private readonly platform = inject(NxtPlatformService);
  private readonly logger = inject(NxtLoggingService).child('ConnectedAccountsModalService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly firebaseUserFn = inject(CONNECTED_ACCOUNTS_FIREBASE_USER, { optional: true });
  private readonly firecrawlSignIn = inject(FirecrawlSignInService);
  private readonly connectedAccountsResync = inject(ConnectedAccountsResyncService);

  /**
   * Opens Connected Accounts with adaptive presentation:
   * - Mobile/tablet: bottom sheet with drag handle (Ionic)
   * - Desktop: centered overlay (pure Angular)
   */
  async open(options: ConnectedAccountsModalOptions = {}): Promise<ConnectedAccountsModalResult> {
    // Enrich with Firebase OAuth state (Google/Microsoft) synchronously
    let enrichedOptions = this.enrichWithOAuthState(options);

    // Enrich with Firecrawl sign-in state (Hudl, X, MaxPreps) from backend
    enrichedOptions = await this.enrichWithFirecrawlState(enrichedOptions);

    const useBottomSheet = this.shouldUseBottomSheet(options);
    const presentation = useBottomSheet ? 'bottom-sheet' : 'web-overlay';

    this.logger.info('Opening connected accounts', { presentation });
    this.breadcrumb.trackUserAction('connected-accounts-open', { presentation });
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'connected-accounts-modal',
      presentation,
    });

    if (useBottomSheet) {
      return this.openBottomSheet(enrichedOptions);
    }

    return this.openWebOverlay(enrichedOptions);
  }

  // ============================================
  // BOTTOM SHEET (Mobile/Tablet — Ionic)
  // ============================================

  private async openBottomSheet(
    options: ConnectedAccountsModalOptions
  ): Promise<ConnectedAccountsModalResult> {
    const result = await this.bottomSheet.openSheet<{
      sources?: readonly {
        platform: string;
        label: string;
        connected: boolean;
        username?: string;
        url?: string;
      }[];
      updatedLinks?: readonly {
        platform: string;
        url: string;
        username?: string;
        scopeType?: string;
        scopeId?: string;
        displayOrder: number;
      }[];
      linkSources?: LinkSourcesFormData;
      disconnectedSignInProviders?: readonly string[];
    }>({
      component: ConnectedAccountsSheetComponent,
      ...SHEET_PRESETS.FULL,
      componentProps: {
        _role: options.role ?? null,
        _selectedSports: options.selectedSports ?? [],
        _linkSourcesData: options.linkSourcesData ?? null,
        _scope: options.scope ?? 'athlete',
      },
      showHandle: true,
      // Prevent swipe-to-dismiss from bypassing the component's explicit save path.
      canDismiss: async (_data, role) => role !== 'gesture',
    });

    if (result.role === 'resync') {
      const hasPendingSave =
        result.data?.linkSources !== undefined && result.data?.updatedLinks !== undefined;

      if (!hasPendingSave) {
        await this.connectedAccountsResync.request(result.data?.sources ?? []);
        return { saved: false };
      }

      return {
        saved: false,
        resync: true,
        sources: result.data?.sources,
        updatedLinks: result.data?.updatedLinks,
        linkSources: result.data?.linkSources,
      };
    }

    if (result.role === 'save' && result.data?.updatedLinks) {
      return {
        saved: true,
        updatedLinks: result.data.updatedLinks,
        linkSources: result.data.linkSources,
        disconnectedSignInProviders: result.data.disconnectedSignInProviders,
      };
    }

    // OAuth connect completed (Google / Microsoft account-picker flow).
    // The sheet already called profileService.load() before dismissing.
    // Signal the parent to refresh so connected email appears in the UI.
    if (result.role === 'oauth-connected') {
      return { saved: false, oauthConnected: true };
    }

    return { saved: false };
  }

  // ============================================
  // WEB OVERLAY (Desktop — Pure Angular)
  // ============================================

  private async openWebOverlay(
    options: ConnectedAccountsModalOptions
  ): Promise<ConnectedAccountsModalResult> {
    try {
      const ref = this.overlay.open<
        ConnectedAccountsWebModalComponent,
        ConnectedAccountsModalCloseData
      >({
        component: ConnectedAccountsWebModalComponent,
        inputs: {
          role: options.role ?? null,
          selectedSports: options.selectedSports ?? [],
          linkSourcesData: options.linkSourcesData ?? null,
          scope: options.scope ?? 'athlete',
        },
        size: 'lg',
        // Match the shared web overlay behavior: backdrop and Escape cancel without saving.
        backdropDismiss: true,
        escDismiss: true,
        showCloseButton: false,
        ariaLabel: 'Connected Accounts',
        panelClass: 'nxt1-connected-accounts-overlay',
      });

      const result = await ref.closed;
      const data = result.data;

      if (!data) {
        return { saved: false };
      }

      if (data.resync) {
        const hasPendingSave = data.linkSources !== undefined && data.updatedLinks !== undefined;

        if (!hasPendingSave) {
          await this.connectedAccountsResync.request(data.sources ?? []);
          return { saved: false };
        }

        return {
          saved: false,
          resync: true,
          sources: data.sources,
          updatedLinks: data.updatedLinks,
          linkSources: data.linkSources,
        };
      }

      if (data.saved && data.updatedLinks) {
        return {
          saved: true,
          updatedLinks: data.updatedLinks,
          linkSources: data.linkSources,
          disconnectedSignInProviders: data.disconnectedSignInProviders,
        };
      }

      return { saved: false };
    } catch (err) {
      this.logger.error('Failed to open connected accounts overlay', err);
      return { saved: false };
    }
  }

  // ============================================
  // OAUTH STATE ENRICHMENT
  // ============================================

  /**
   * Merges Firebase OAuth provider state into `linkSourcesData` so Google /
   * Microsoft entries can display the provider email without every call-site
   * having to read Firebase Auth manually.
   *
   * Only runs when `CONNECTED_ACCOUNTS_FIREBASE_USER` is provided (apps/web).
   * In mobile or SSR contexts where the token is absent, options are unchanged.
   */
  private enrichWithOAuthState(
    options: ConnectedAccountsModalOptions
  ): ConnectedAccountsModalOptions {
    if (!this.firebaseUserFn) {
      return options;
    }

    const providerData = this.firebaseUserFn();
    if (!providerData.length) {
      return options;
    }

    const existingLinks = options.linkSourcesData?.links ?? [];

    // Build a set of platforms already in the caller-supplied list so we can
    // enrich active backend-managed sign-in rows with providerData email.
    const existingByPlatform = new Map<string, LinkSourcesFormData['links'][number]>(
      existingLinks.map((l) => [l.platform, l])
    );

    for (const provider of providerData) {
      const platformId = FIREBASE_PROVIDER_PLATFORM_MAP[provider.providerId];
      if (!platformId) continue;

      const existing = existingByPlatform.get(platformId);
      const email = provider.email ?? undefined;
      if (existing) {
        // Patch the existing entry — keep backend-managed connected state intact.
        // IMPORTANT: prefer existing.username (from connectedEmails in Firestore) over
        // the Firebase providerData email, because the Firebase sign-in email is the
        // email used to log in to NXT1 (e.g. ngocsonxx98@gmail.com) which may differ
        // from the account actually connected for email sending (e.g. sonngoc.dev@gmail.com).
        existingByPlatform.set(platformId, {
          ...existing,
          username: existing.username ?? email,
        });
      }
    }

    return {
      ...options,
      linkSourcesData: {
        links: Array.from(existingByPlatform.values()),
      },
    };
  }

  // ============================================
  // FIRECRAWL SIGN-IN STATE ENRICHMENT
  // ============================================

  /**
   * Fetches the user's Firecrawl sign-in accounts from the backend and merges
   * them into `linkSourcesData` so Hudl, X, MaxPreps, etc. show "Signed In"
   * when the user has a saved persistent profile.
   *
   * Non-blocking: if the fetch fails, options are returned unchanged.
   */
  private async enrichWithFirecrawlState(
    options: ConnectedAccountsModalOptions
  ): Promise<ConnectedAccountsModalOptions> {
    try {
      const accounts = await this.firecrawlSignIn.fetchSignedInAccounts();
      const platforms = Object.keys(accounts);
      if (!platforms.length) {
        return options;
      }

      const existingLinks = options.linkSourcesData?.links ?? [];
      const existingByPlatform = new Map<string, LinkSourcesFormData['links'][number]>(
        existingLinks.map((l) => [l.platform, l])
      );

      for (const platform of platforms) {
        const existing = existingByPlatform.get(platform);
        if (existing) {
          existingByPlatform.set(platform, {
            ...existing,
            connected: true,
            connectionType: 'signin',
          });
        } else {
          existingByPlatform.set(platform, {
            platform,
            connected: true,
            connectionType: 'signin',
            scopeType: 'global',
            scopeId: undefined,
            url: '',
            username: undefined,
          });
        }
      }

      return {
        ...options,
        linkSourcesData: {
          links: Array.from(existingByPlatform.values()),
        },
      };
    } catch (err) {
      this.logger.warn('Failed to enrich with Firecrawl state', { error: err });
      return options;
    }
  }

  // ============================================
  // PLATFORM DETECTION
  // ============================================

  /** Same logic as EditProfileModalService — consistent platform detection. */
  private shouldUseBottomSheet(options: ConnectedAccountsModalOptions): boolean {
    if (this.platform.isNative()) {
      return true;
    }

    if (!this.platform.isBrowser()) {
      return false;
    }

    if (options.preferWebOverlayOnBrowser === true) {
      return false;
    }

    const viewportWidth = this.platform.viewport().width;
    if (viewportWidth < 768) {
      return true;
    }

    const hasTouch = this.platform.hasTouch();
    if (hasTouch && viewportWidth < 1024) {
      return true;
    }

    return false;
  }
}
