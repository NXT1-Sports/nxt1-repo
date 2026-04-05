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
import {
  ConnectedAccountsWebModalComponent,
  type ConnectedAccountsModalCloseData,
} from './connected-accounts-web-modal.component';
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
  () => ReadonlyArray<{ readonly providerId: string }>
>('CONNECTED_ACCOUNTS_FIREBASE_USER');

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
}

/** Result returned when the Connected Accounts modal is dismissed. */
export interface ConnectedAccountsModalResult {
  readonly saved: boolean;
  readonly resync?: boolean;
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
  }[];
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

  /**
   * Opens Connected Accounts with adaptive presentation:
   * - Mobile/tablet: bottom sheet with drag handle (Ionic)
   * - Desktop: centered overlay (pure Angular)
   */
  async open(options: ConnectedAccountsModalOptions = {}): Promise<ConnectedAccountsModalResult> {
    const enrichedOptions = this.enrichWithOAuthState(options);
    const presentation = this.shouldUseBottomSheet() ? 'bottom-sheet' : 'web-overlay';

    this.logger.info('Opening connected accounts', { presentation });
    this.breadcrumb.trackUserAction('connected-accounts-open', { presentation });
    this.analytics?.trackEvent(APP_EVENTS.PROFILE_EDITED, {
      source: 'connected-accounts-modal',
      presentation,
    });

    if (this.shouldUseBottomSheet()) {
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
    });

    if (result.role === 'resync') {
      return {
        saved: false,
        resync: true,
        sources: result.data?.sources,
      };
    }

    if (result.role === 'save' && result.data?.updatedLinks) {
      return {
        saved: true,
        updatedLinks: result.data.updatedLinks,
        linkSources: result.data.linkSources,
      };
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
        return {
          saved: false,
          resync: true,
          sources: data.sources,
        };
      }

      if (data.saved && data.updatedLinks) {
        return {
          saved: true,
          updatedLinks: data.updatedLinks,
          linkSources: data.linkSources,
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
   * Microsoft entries always reflect the user's actual sign-in state without
   * every call-site having to read Firebase Auth manually.
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
    // update them in-place (connected → true) rather than adding duplicates.
    const existingByPlatform = new Map(existingLinks.map((l) => [l.platform, l]));

    for (const provider of providerData) {
      const platformId = FIREBASE_PROVIDER_PLATFORM_MAP[provider.providerId];
      if (!platformId) continue;

      const existing = existingByPlatform.get(platformId);
      if (existing) {
        // Patch the existing entry — keep all other fields intact.
        existingByPlatform.set(platformId, {
          ...existing,
          connected: true,
          connectionType: 'signin',
        });
      } else {
        // Add a minimal connected entry so the modal shows the checkmark.
        existingByPlatform.set(platformId, {
          platform: platformId,
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
  }

  // ============================================
  // PLATFORM DETECTION
  // ============================================

  /** Same logic as EditProfileModalService — consistent platform detection. */
  private shouldUseBottomSheet(): boolean {
    if (this.platform.isNative()) {
      return true;
    }

    if (!this.platform.isBrowser()) {
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
