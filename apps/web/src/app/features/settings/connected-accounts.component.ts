/**
 * @fileoverview Connected Accounts Settings Page
 * @module @nxt1/web/features/settings
 *
 * Route-level wrapper that renders ConnectedAccountsWebModalComponent
 * as a full page at `/settings/connected-accounts`.
 *
 * Exists so E2E tests and deep-links can navigate directly to this view
 * instead of requiring the modal-based entry point from the settings shell.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import type { LinkSourcesFormData } from '@nxt1/core/api';
import {
  ConnectedAccountsWebModalComponent,
  type ConnectedAccountsModalCloseData,
} from '@nxt1/ui/components/connected-sources';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { PlatformScope } from '@nxt1/core/api';
import { AUTH_SERVICE, type IAuthService } from '../../core/services/auth/auth.interface';
import { SeoService } from '../../core/services';
import { WebEmailConnectionService } from '../../core/services/web/email-connection.service';

@Component({
  selector: 'app-connected-accounts',
  standalone: true,
  imports: [ConnectedAccountsWebModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="connected-accounts-page" data-testid="settings-connected-accounts-page">
      <nxt1-connected-accounts-web-modal
        #webModal
        [role]="userRole()"
        [selectedSports]="userSports()"
        [linkSourcesData]="linkSourcesData()"
        scope="athlete"
        (close)="onModalClose($event)"
        (oauthConnectRequest)="onOAuthConnectRequest($event)"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .connected-accounts-page {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class ConnectedAccountsComponent implements OnInit {
  @ViewChild('webModal') private readonly webModal?: ConnectedAccountsWebModalComponent;

  private readonly router = inject(Router);
  private readonly auth = inject(AUTH_SERVICE) as IAuthService;
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ConnectedAccountsPage');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly emailConnectionService = inject(WebEmailConnectionService);

  protected readonly userRole = computed(() => this.auth.user?.()?.role ?? null);
  protected readonly userSports = computed(() => {
    const user = this.auth.user?.();
    return user?.selectedSports ?? [];
  });

  protected readonly linkSourcesData = computed<LinkSourcesFormData | null>(() => {
    const user = this.auth.user?.();
    if (!user) return null;

    const PROVIDER_ID_MAP: Record<string, string> = {
      'google.com': 'google',
      'microsoft.com': 'microsoft',
    };
    const EMAIL_PROVIDER_PLATFORM: Record<string, string> = {
      gmail: 'google',
      microsoft: 'microsoft',
    };

    const firebaseUser = this.auth.firebaseUser();
    const firebaseSigninLinks = (firebaseUser?.providerData ?? [])
      .filter((p) => PROVIDER_ID_MAP[p.providerId])
      .map((p) => ({
        platform: PROVIDER_ID_MAP[p.providerId]!,
        connected: true,
        connectionType: 'signin' as const,
        scopeType: 'global' as const,
      }));

    const firebasePlatforms = new Set(firebaseSigninLinks.map((l) => l.platform));
    const emailTokenLinks = (user.connectedEmails ?? [])
      .filter((e) => e.isActive !== false && EMAIL_PROVIDER_PLATFORM[e.provider])
      .filter((e) => !firebasePlatforms.has(EMAIL_PROVIDER_PLATFORM[e.provider]))
      .map((e) => ({
        platform: EMAIL_PROVIDER_PLATFORM[e.provider]!,
        connected: true,
        connectionType: 'signin' as const,
        scopeType: 'global' as const,
      }));

    const signinLinks = [...firebaseSigninLinks, ...emailTokenLinks];

    const linkedSources = (user.connectedSources ?? []).map((src) => ({
      platform: src.platform,
      connected: true,
      connectionType: 'link' as const,
      url: src.profileUrl,
      scopeType: src.scopeType ?? 'global',
      scopeId: src.scopeId,
    }));

    const allLinks = [...linkedSources, ...signinLinks];
    return allLinks.length ? { links: allLinks } : null;
  });

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Connected Accounts',
      description: 'Manage your connected platforms and sign-in sessions.',
      keywords: ['connected', 'accounts', 'platforms', 'settings'],
      noIndex: true,
    });
    this.breadcrumb.trackStateChange('connected-accounts-page: opened');
    this.analytics?.trackEvent(APP_EVENTS.SETTINGS_VIEWED, {
      section: 'connected-accounts',
      source: 'direct-navigation',
    });
    this.logger.info('Connected accounts page opened');
  }

  protected onModalClose(data: ConnectedAccountsModalCloseData): void {
    if (data.saved) {
      this.toast.success('Connected accounts updated');
      this.logger.info('Connected accounts saved from page', {
        linkCount: data.updatedLinks?.length ?? 0,
      });
    }
    this.router.navigate(['/settings']);
  }

  /**
   * Launches the real OAuth account-picker popup for Google or Microsoft.
   * Called when the user taps Google/Microsoft in the "Signed In" tab from settings.
   */
  protected async onOAuthConnectRequest(event: {
    platform: 'google' | 'microsoft';
    scopeType: PlatformScope;
    scopeId?: string;
  }): Promise<void> {
    const { platform, scopeType } = event;
    const userId = this.auth.user?.()?.uid;
    if (!userId) {
      this.toast.error('Not signed in. Please refresh and try again.');
      return;
    }

    this.logger.info('Launching OAuth flow for linked account', { platform });
    const success = await this.emailConnectionService.connectForLinkedAccounts(platform, userId);

    if (success) {
      this.analytics?.trackEvent(APP_EVENTS.LINK_SOURCE_CONNECTED, {
        source_platform: platform,
        connected: true,
        mode: 'signin',
        scopeType,
        source: 'settings-oauth',
      });
      // Navigate back — backend already saved the token, toast shown by the service
      this.router.navigate(['/settings']);
    }
  }
}
