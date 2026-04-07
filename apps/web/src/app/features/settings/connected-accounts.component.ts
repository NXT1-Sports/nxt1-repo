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

import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  ConnectedAccountsWebModalComponent,
  type ConnectedAccountsModalCloseData,
} from '@nxt1/ui/components/connected-sources';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AUTH_SERVICE, type IAuthService } from '../auth/services/auth.interface';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-connected-accounts',
  standalone: true,
  imports: [ConnectedAccountsWebModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="connected-accounts-page" data-testid="settings-connected-accounts-page">
      <nxt1-connected-accounts-web-modal
        [role]="userRole()"
        [selectedSports]="userSports()"
        [linkSourcesData]="null"
        scope="athlete"
        (close)="onModalClose($event)"
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
  private readonly router = inject(Router);
  private readonly auth = inject(AUTH_SERVICE) as IAuthService;
  private readonly seo = inject(SeoService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ConnectedAccountsPage');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  protected readonly userRole = computed(() => this.auth.user?.()?.role ?? null);
  protected readonly userSports = computed(() => {
    const user = this.auth.user?.();
    return user?.selectedSports ?? [];
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
}
